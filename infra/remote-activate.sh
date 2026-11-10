#!/usr/bin/env bash
#
# Runs on the droplet as root. deploy.sh uploads and calls it; do not run it by hand.
# Installs a release, runs migrations, and restarts only kaamwala-api.
#
# Arguments: <release id> <upload directory> <run seed: 0 or 1>

set -euo pipefail

SERVICE="kaamwala-api"
APP_USER="kaamwala"
API_PORT="3002"
API_ROOT="/opt/kaamwala"
WEB_ROOT="/var/www/kaamwala"
ENV_FILE="/etc/kaamwala/api.env"
UNIT_FILE="/etc/systemd/system/${SERVICE}.service"
KEEP_RELEASES=5

die() {
  echo "ERROR: $*" >&2
  exit 1
}

step() {
  echo "--> $*"
}

[[ "$#" -eq 3 ]] || die "Usage: remote-activate.sh <release id> <upload dir> <run seed>"
RELEASE_ID="$1"
UPLOAD_DIR="$2"
RUN_SEED="$3"

[[ "${EUID}" -eq 0 ]] || die "Must run as root."
[[ "$RELEASE_ID" =~ ^[0-9]{14}-[0-9a-f]+(-dirty)?$ ]] || die "Unexpected release id: $RELEASE_ID"
[[ -d "$UPLOAD_DIR/api" && -d "$UPLOAD_DIR/web" ]] || die "Upload directory is incomplete: $UPLOAD_DIR"
[[ -f "$UNIT_FILE" ]] || die "$UNIT_FILE not found. Run: bash deploy.sh --setup"
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Run: bash deploy.sh --setup"

NODE_BIN="$(sed -n 's/^ExecStart=\([^ ]*\) .*/\1/p' "$UNIT_FILE")"
[[ -x "$NODE_BIN" ]] || die "Node binary from $UNIT_FILE is not executable: $NODE_BIN"
RUNTIME_PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin"

# Runs a command as the unprivileged service user, with the app's environment.
as_app() {
  (
    cd /tmp
    sudo -u "$APP_USER" -H env PATH="$RUNTIME_PATH" bash -c "set -euo pipefail; set -a; . '$ENV_FILE'; set +a; $1"
  )
}

swap_link() {
  local target="$1" link="$2"
  ln -s "$target" "${link}.new"
  mv -T "${link}.new" "$link"
}

api_is_healthy() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${API_PORT}/v1/categories"; then
      echo "Healthy after ${attempt} check(s)."
      return 0
    fi
    sleep 1
  done
  return 1
}

prune_releases() {
  local releases_dir="$1" current_link="$2" current name
  current="$(basename "$(readlink -f "$current_link")")"
  find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' |
    sort -r |
    tail -n +"$((KEEP_RELEASES + 1))" |
    while read -r name; do
      if [[ "$name" != "$current" ]]; then
        rm -rf -- "${releases_dir:?}/${name:?}"
      fi
    done
}

API_RELEASE="${API_ROOT}/releases/${RELEASE_ID}"
WEB_RELEASE="${WEB_ROOT}/releases/${RELEASE_ID}"

[[ ! -e "$API_RELEASE" ]] || die "Release already exists: $API_RELEASE"

step "Installing API release files"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$API_RELEASE"
cp -R "$UPLOAD_DIR/api/." "$API_RELEASE/"
chown -R "$APP_USER:$APP_USER" "$API_RELEASE"
chmod -R u=rwX,g=rX,o= "$API_RELEASE"

step "Installing API dependencies as $APP_USER"
as_app "cd '$API_RELEASE' && npm install --omit=dev --no-audit --no-fund --no-package-lock --cache '${API_ROOT}/.npm'"
as_app "cd '$API_RELEASE' && npx --no-install prisma generate"

step "Running database migrations"
# A failure here stops the deploy with the previous release still serving traffic.
as_app "cd '$API_RELEASE' && npx --no-install prisma migrate deploy"

if [[ "$RUN_SEED" == "1" ]]; then
  step "Loading demo seed data"
  [[ -f "$API_RELEASE/dist/seed/seed.js" ]] || die "Seed bundle is missing from this release."
  as_app "cd '$API_RELEASE' && node dist/seed/seed.js"
fi

step "Switching to the new API release"
PREVIOUS_API=""
if [[ -L "${API_ROOT}/current" ]]; then
  PREVIOUS_API="$(readlink -f "${API_ROOT}/current")"
fi
swap_link "$API_RELEASE" "${API_ROOT}/current"

step "Restarting $SERVICE (and nothing else)"
systemctl restart "$SERVICE"

step "Waiting for the API on 127.0.0.1:${API_PORT}"
if ! api_is_healthy; then
  echo "The new release did not become healthy. Recent logs:" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
  if [[ -n "$PREVIOUS_API" ]]; then
    echo "Rolling back to $(basename "$PREVIOUS_API")." >&2
    swap_link "$PREVIOUS_API" "${API_ROOT}/current"
    systemctl restart "$SERVICE"
    die "Deploy failed and the previous API release was restored. Database migrations are not rolled back."
  fi
  die "Deploy failed. There is no previous release to restore."
fi

# The web build goes live only after the API it depends on is healthy.
step "Publishing the web build"
install -d -o root -g root -m 755 "$WEB_RELEASE"
cp -R "$UPLOAD_DIR/web/." "$WEB_RELEASE/"
chown -R root:root "$WEB_RELEASE"
chmod -R u=rwX,go=rX "$WEB_RELEASE"
swap_link "$WEB_RELEASE" "${WEB_ROOT}/current"

step "Removing old releases (keeping the newest ${KEEP_RELEASES})"
prune_releases "${API_ROOT}/releases" "${API_ROOT}/current"
prune_releases "${WEB_ROOT}/releases" "${WEB_ROOT}/current"

step "Release $RELEASE_ID is live on the droplet"
