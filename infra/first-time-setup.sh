#!/usr/bin/env bash
#
# One-time droplet setup for KaamWala. `bash deploy.sh --setup` uploads and runs
# this as root. It is safe to run again: anything already in place is left alone.
#
# It adds only KaamWala's own Postgres role and database, service user,
# directories, systemd unit and Caddy import. It does not modify or restart any
# other service, port or Caddy site block.

set -euo pipefail

APP_USER="kaamwala"
DB_NAME="kaamwala"
DB_ROLE="kaamwala"
API_PORT="3002"
SERVICE="kaamwala-api"

API_ROOT="/opt/kaamwala"
WEB_ROOT="/var/www/kaamwala"
DATA_ROOT="/var/lib/kaamwala"
CONFIG_ROOT="/etc/kaamwala"
ENV_FILE="${CONFIG_ROOT}/api.env"
UNIT_FILE="/etc/systemd/system/${SERVICE}.service"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

step() {
  echo "--> $*"
}

pg() {
  (
    cd /tmp
    sudo -u postgres psql -v ON_ERROR_STOP=1 -Atq "$@"
  )
}

# ---------------------------------------------------------------------------
# Check everything before changing anything
# ---------------------------------------------------------------------------
step "Checking prerequisites"
[[ "${EUID}" -eq 0 ]] || die "Must run as root."

DOMAIN="${DOMAIN:-}"
[[ "$DOMAIN" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || die "Set DOMAIN, for example DOMAIN=yourdomain.com"

CADDY_MAIN_FILE="${CADDY_MAIN_FILE:-/etc/caddy/Caddyfile}"
CADDY_SITE_FILE="$(dirname "$CADDY_MAIN_FILE")/kaamwala.caddy"
IMPORT_LINE="import ${CADDY_SITE_FILE}"
IMPORT_MARKER="# KaamWala site blocks (added by infra/first-time-setup.sh)"

for cmd in awk caddy cmp curl install openssl psql sed sha256sum ss sudo systemctl useradd visudo; do
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
done

for file in kaamwala-api.service Caddyfile.kaamwala remote-activate.sh kaamwala-ctl; do
  [[ -f "${SCRIPT_DIR}/${file}" ]] || die "Missing ${SCRIPT_DIR}/${file}"
done

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
[[ -n "$NODE_BIN" ]] || die "Node.js was not found on PATH. Set NODE_BIN to its full path."
NODE_BIN="$(readlink -f "$NODE_BIN")"
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 24 ]] || die "Node.js 24 or newer is required (found major version $NODE_MAJOR)."

[[ -f "$CADDY_MAIN_FILE" ]] || die "Caddyfile not found at $CADDY_MAIN_FILE. Set CADDY_MAIN_FILE in infra/deploy.env."
systemctl is-active --quiet caddy || die "Caddy is not running. Nothing was changed."
pg -c 'SELECT 1' >/dev/null || die "Cannot connect to PostgreSQL as the postgres user."

LISTENERS="$(ss -ltnpH "sport = :${API_PORT}" || true)"
if [[ -n "$LISTENERS" ]]; then
  MAIN_PID="$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null || echo 0)"
  if [[ "$MAIN_PID" != "0" && "$LISTENERS" == *"pid=${MAIN_PID},"* ]]; then
    echo "Port ${API_PORT} is already held by ${SERVICE}, which is expected on a re-run."
  else
    echo "$LISTENERS" >&2
    die "Port ${API_PORT} is already in use by another process. Nothing was changed. Free it or choose another port before continuing."
  fi
fi

if grep -Fq "kaamwala.${DOMAIN}" "$CADDY_MAIN_FILE"; then
  die "$CADDY_MAIN_FILE already mentions kaamwala.${DOMAIN} directly. Nothing was changed; remove that block first."
fi

caddy validate --config "$CADDY_MAIN_FILE" --adapter caddyfile >/dev/null 2>&1 ||
  die "The existing Caddy configuration does not validate. Nothing was changed; fix it first."

ROLE_EXISTS="$(pg -c "SELECT 1 FROM pg_roles WHERE rolname = '${DB_ROLE}'")"
if [[ "$ROLE_EXISTS" == "1" && ! -f "$ENV_FILE" ]]; then
  die "Postgres role '${DB_ROLE}' exists but ${ENV_FILE} does not. Not changing a role this script did not create."
fi

# ---------------------------------------------------------------------------
# Service user and directories
# ---------------------------------------------------------------------------
step "Creating the service user and directories"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$API_ROOT" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$API_ROOT" "${API_ROOT}/releases" "${API_ROOT}/.npm"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_ROOT" "${DATA_ROOT}/uploads"
install -d -o root -g root -m 755 "$WEB_ROOT" "${WEB_ROOT}/releases"
install -d -o root -g "$APP_USER" -m 750 "$CONFIG_ROOT"

sudo -u "$APP_USER" -H "$NODE_BIN" --version >/dev/null ||
  die "The ${APP_USER} user cannot run ${NODE_BIN}. Node must be installed system-wide, not in a personal directory."

# ---------------------------------------------------------------------------
# Environment file (never overwritten, so real keys survive a re-run)
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  step "Keeping the existing ${ENV_FILE}"
  DB_PASSWORD="$(sed -n "s#^DATABASE_URL=postgresql://${DB_ROLE}:\([^@]*\)@.*#\1#p" "$ENV_FILE")"
else
  step "Creating ${ENV_FILE} with generated secrets"
  DB_PASSWORD="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 48)"
  CNIC_SALT="$(openssl rand -hex 48)"
  PG_PORT="$(pg -c 'SHOW port')"
  ENV_TMP="$(mktemp)"
  cat >"$ENV_TMP" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=${API_PORT}
PUBLIC_API_URL=https://api.kaamwala.${DOMAIN}
WEB_ORIGIN=https://kaamwala.${DOMAIN}
DATABASE_URL=postgresql://${DB_ROLE}:${DB_PASSWORD}@localhost:${PG_PORT}/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
CNIC_SALT=${CNIC_SALT}
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.1-flash-lite
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@${DOMAIN}
UPLOAD_DIR=${DATA_ROOT}/uploads
EOF
  install -o root -g "$APP_USER" -m 640 "$ENV_TMP" "$ENV_FILE"
  rm -f "$ENV_TMP"
fi

[[ "$DB_PASSWORD" =~ ^[A-Za-z0-9]+$ ]] || die "Could not read a valid database password from ${ENV_FILE}."

# ---------------------------------------------------------------------------
# PostgreSQL: only the kaamwala role and database
# ---------------------------------------------------------------------------
step "Creating the Postgres role and database if needed"
if [[ "$ROLE_EXISTS" != "1" ]]; then
  # Sent on stdin so the password never appears in the process list.
  pg <<SQL
CREATE ROLE ${DB_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${DB_PASSWORD}';
SQL
fi

DB_EXISTS="$(pg -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")"
if [[ "$DB_EXISTS" != "1" ]]; then
  pg -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_ROLE}"
fi

# ---------------------------------------------------------------------------
# systemd unit: installed and enabled, started by the first deploy
# ---------------------------------------------------------------------------
step "Installing the ${SERVICE} systemd unit"
UNIT_TMP="$(mktemp)"
sed "s#^ExecStart=/usr/bin/node #ExecStart=${NODE_BIN} #" "${SCRIPT_DIR}/kaamwala-api.service" >"$UNIT_TMP"
if [[ ! -f "$UNIT_FILE" ]] || ! cmp -s "$UNIT_TMP" "$UNIT_FILE"; then
  install -o root -g root -m 644 "$UNIT_TMP" "$UNIT_FILE"
  systemctl daemon-reload
fi
rm -f "$UNIT_TMP"
systemctl enable --quiet "$SERVICE"

# ---------------------------------------------------------------------------
# Caddy: own import file, validated first, applied with reload only
# ---------------------------------------------------------------------------
step "Adding the KaamWala Caddy site blocks"
SITE_TMP="$(mktemp)"
sed "s/__DOMAIN__/${DOMAIN}/g" "${SCRIPT_DIR}/Caddyfile.kaamwala" >"$SITE_TMP"

CADDY_CHANGED=0
SITE_EXISTED=0
SITE_BACKUP=""
MAIN_BACKUP=""

restore_caddy() {
  if [[ -n "$MAIN_BACKUP" ]]; then
    cp -p "$MAIN_BACKUP" "$CADDY_MAIN_FILE"
  fi
  if [[ -n "$SITE_BACKUP" ]]; then
    cp -p "$SITE_BACKUP" "$CADDY_SITE_FILE"
  elif [[ "$SITE_EXISTED" -eq 0 ]]; then
    rm -f "$CADDY_SITE_FILE"
  fi
}

if [[ -f "$CADDY_SITE_FILE" ]]; then
  SITE_EXISTED=1
fi

if [[ "$SITE_EXISTED" -eq 0 ]] || ! cmp -s "$SITE_TMP" "$CADDY_SITE_FILE"; then
  if [[ "$SITE_EXISTED" -eq 1 ]]; then
    SITE_BACKUP="${CONFIG_ROOT}/kaamwala.caddy.previous"
    cp -p "$CADDY_SITE_FILE" "$SITE_BACKUP"
  fi
  install -o root -g root -m 644 "$SITE_TMP" "$CADDY_SITE_FILE"
  CADDY_CHANGED=1
fi
rm -f "$SITE_TMP"

if ! grep -Fxq "$IMPORT_LINE" "$CADDY_MAIN_FILE"; then
  # Kept outside the Caddy directory so a wildcard import can never load it.
  MAIN_BACKUP="${CONFIG_ROOT}/Caddyfile.before-kaamwala-$(date -u +%Y%m%d%H%M%S)"
  cp -p "$CADDY_MAIN_FILE" "$MAIN_BACKUP"
  printf '\n%s\n%s\n' "$IMPORT_MARKER" "$IMPORT_LINE" >>"$CADDY_MAIN_FILE"
  CADDY_CHANGED=1
fi

if [[ "$CADDY_CHANGED" -eq 1 ]]; then
  if ! caddy validate --config "$CADDY_MAIN_FILE" --adapter caddyfile; then
    restore_caddy
    die "The new Caddy configuration did not validate. The previous files were restored and Caddy was not reloaded."
  fi
  if ! systemctl reload caddy; then
    restore_caddy
    die "Caddy refused the reload. The previous files were restored; Caddy keeps serving its running configuration."
  fi
  echo "Caddy reloaded with the KaamWala site blocks."
else
  echo "Caddy already has the KaamWala site blocks."
fi

# ---------------------------------------------------------------------------
# Deploy access: one fixed, root-owned command and nothing else
# ---------------------------------------------------------------------------
step "Installing the kaamwala-ctl deploy command"
install -d -o root -g root -m 755 /usr/local/lib/kaamwala
install -o root -g root -m 755 "${SCRIPT_DIR}/remote-activate.sh" /usr/local/lib/kaamwala/remote-activate.sh
install -o root -g root -m 755 "${SCRIPT_DIR}/kaamwala-ctl" /usr/local/sbin/kaamwala-ctl

DEPLOY_USER="${SUDO_USER:-}"
if [[ -n "$DEPLOY_USER" && "$DEPLOY_USER" != "root" ]]; then
  [[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "Unexpected user name: $DEPLOY_USER"
  SUDOERS_FILE="/etc/sudoers.d/kaamwala-deploy"
  SUDOERS_TMP="$(mktemp)"
  printf '# Installed by KaamWala first-time-setup.sh. Allows only this one command without a password.\n%s ALL=(root) NOPASSWD: /usr/local/sbin/kaamwala-ctl\n' "$DEPLOY_USER" >"$SUDOERS_TMP"
  visudo -cqf "$SUDOERS_TMP" || die "The sudoers rule did not validate. Nothing was installed."
  install -o root -g root -m 440 "$SUDOERS_TMP" "$SUDOERS_FILE"
  rm -f "$SUDOERS_TMP"
  if ! visudo -cq; then
    rm -f "$SUDOERS_FILE"
    die "The sudoers configuration did not validate with the new rule, so the rule was removed."
  fi
  echo "${DEPLOY_USER} can now run only /usr/local/sbin/kaamwala-ctl without a password."
fi

step "Setup complete"
