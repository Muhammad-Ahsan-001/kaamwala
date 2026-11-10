#!/usr/bin/env bash
#
# KaamWala deploy. Run from Git Bash or any Linux/macOS shell:
#
#   bash deploy.sh --setup      prepare the one-time server setup (run this first, once)
#   bash deploy.sh --push-env   copy the Gemini and push keys from apps/api/.env to the server
#   bash deploy.sh              build, upload, migrate, restart kaamwala-api
#   bash deploy.sh --seed       same, and load the demo seed data as well
#
# The droplet also hosts other production apps. This script only ever changes
# kaamwala's own release directories and restarts only the kaamwala-api unit.
# It never touches other services, ports 3000/3001 or other Caddy site blocks.
# Caddy is only changed by --setup, and then only by adding KaamWala's own
# import, validated first and applied with a reload.

set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

step() {
  echo
  echo "==> $*"
}

usage() {
  sed -n '3,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

RUN_SETUP=0
RUN_SEED=0
RUN_PUSH_ENV=0
for arg in "$@"; do
  case "$arg" in
    --setup) RUN_SETUP=1 ;;
    --seed) RUN_SEED=1 ;;
    --push-env) RUN_PUSH_ENV=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "Unknown option: $arg (see --help)" ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE="infra/deploy.env"
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE. Copy infra/deploy.env.example to it and fill in the values."

# Strip carriage returns so a file saved by a Windows editor still loads cleanly.
set -a
# shellcheck source=/dev/null
. <(tr -d '\r' <"$ENV_FILE")
set +a

[[ -n "${DROPLET_HOST:-}" ]] || die "DROPLET_HOST is empty in $ENV_FILE"
[[ -n "${DROPLET_USER:-}" ]] || die "DROPLET_USER is empty in $ENV_FILE"
[[ -n "${DOMAIN:-}" ]] || die "DOMAIN is empty in $ENV_FILE"
[[ "$DOMAIN" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || die "DOMAIN must be lowercase, like yourdomain.com (got: $DOMAIN)"
[[ "$DOMAIN" != "example.com" ]] || die "DOMAIN is still the placeholder value"

SSH_PORT="${SSH_PORT:-22}"
CADDY_MAIN_FILE="${CADDY_MAIN_FILE:-/etc/caddy/Caddyfile}"

SSH_OPTS=(-p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15)
if [[ -n "${SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi
TARGET="${DROPLET_USER}@${DROPLET_HOST}"

remote() {
  # shellcheck disable=SC2029 # Arguments are meant to expand locally.
  ssh "${SSH_OPTS[@]}" "$TARGET" "$@"
}

if [[ "$DROPLET_USER" == "root" ]]; then
  REMOTE_SUDO=""
else
  REMOTE_SUDO="sudo -n"
fi
REMOTE_CTL="$REMOTE_SUDO /usr/local/sbin/kaamwala-ctl"

WEB_HOST="kaamwala.${DOMAIN}"
API_HOST="api.kaamwala.${DOMAIN}"

STAGE_DIR=""
REMOTE_TMP=""

cleanup() {
  if [[ -n "$STAGE_DIR" ]]; then
    rm -rf "$STAGE_DIR"
  fi
  if [[ -n "$REMOTE_TMP" ]]; then
    remote rm -rf "$REMOTE_TMP" || true
  fi
}
trap cleanup EXIT

step "Checking SSH access to $TARGET"
remote true || die "Cannot reach $TARGET over SSH with key authentication."

# ---------------------------------------------------------------------------
# One-time server setup
# ---------------------------------------------------------------------------
if [[ "$RUN_SETUP" -eq 1 ]]; then
  [[ "$RUN_SEED" -eq 0 ]] || die "Use --setup on its own, then deploy with --seed afterwards."

  step "Uploading setup files"
  SETUP_DIR="kaamwala-setup"
  remote "rm -rf '$SETUP_DIR' && mkdir -m 700 '$SETUP_DIR'"
  tar -czf - -C infra first-time-setup.sh remote-activate.sh kaamwala-ctl kaamwala-api.service Caddyfile.kaamwala |
    remote tar -xzf - --no-same-owner -C "$SETUP_DIR"

  SETUP_CMD="env DOMAIN=$DOMAIN CADDY_MAIN_FILE=$CADDY_MAIN_FILE bash $SETUP_DIR/first-time-setup.sh"
  if [[ "$DROPLET_USER" == "root" ]]; then
    step "Running first-time setup on the droplet"
    remote "$SETUP_CMD"
    echo
    echo "Setup finished. Next: bash deploy.sh --push-env, then bash deploy.sh --seed"
  else
    PORT_FLAG=""
    if [[ "$SSH_PORT" != "22" ]]; then
      PORT_FLAG="-p $SSH_PORT "
    fi
    echo
    echo "The setup files are on the droplet. Finish by running this once in a terminal."
    echo "It asks for the sudo password there, so the password is never stored or shared:"
    echo
    echo "  ssh -t ${PORT_FLAG}${TARGET} \"sudo $SETUP_CMD\""
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Copy API keys to the server
# ---------------------------------------------------------------------------
if [[ "$RUN_PUSH_ENV" -eq 1 ]]; then
  [[ "$RUN_SEED" -eq 0 ]] || die "Use --push-env on its own."
  [[ -f apps/api/.env ]] || die "Missing apps/api/.env"
  step "Copying the Gemini and push keys to the droplet"
  tr -d '\r' <apps/api/.env |
    grep -E '^(GEMINI_API_KEY|GEMINI_MODEL|GEMINI_FALLBACK_MODELS|VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)=' |
    remote "$REMOTE_CTL set-env"
  echo "Done. The values were not printed."
  exit 0
fi

step "Checking the droplet is set up"
INSTALLED_SHA="$(remote "$REMOTE_CTL activate-sha")" ||
  die "The one-time setup has not been done. Run: bash deploy.sh --setup"
LOCAL_SHA="$(tr -d '\r' <infra/remote-activate.sh | sha256sum | cut -d' ' -f1)"
[[ "$INSTALLED_SHA" == "$LOCAL_SHA" ]] ||
  die "infra/remote-activate.sh changed since the one-time setup. Run: bash deploy.sh --setup"

# ---------------------------------------------------------------------------
# Build locally
# ---------------------------------------------------------------------------
step "Installing dependencies"
pnpm install --frozen-lockfile

step "Checking the code"
pnpm --filter @kaamwala/api db:generate
pnpm --filter @kaamwala/api typecheck
pnpm --filter @kaamwala/jev test

step "Building the web app and API"
rm -rf apps/web/dist apps/api/dist

# Run these builds directly so Turborepo's strict environment mode cannot drop
# the VITE_ variables.
VITE_API_URL="https://${API_HOST}" VITE_WS_URL="wss://${API_HOST}" \
  pnpm --filter @kaamwala/web build
pnpm --filter @kaamwala/api build

if [[ "$RUN_SEED" -eq 1 ]]; then
  [[ -f apps/api/dist/seed/seed.js ]] || die "Seed bundle was not produced."
fi

[[ -f apps/web/dist/index.html ]] || die "Web build did not produce apps/web/dist/index.html."
[[ -f apps/api/dist/server.js ]] || die "API build did not produce apps/api/dist/server.js."
[[ -f apps/api/prisma/schema.prisma ]] || die "Missing apps/api/prisma/schema.prisma."
[[ -d apps/api/prisma/migrations ]] || die "Missing apps/api/prisma/migrations."

# ---------------------------------------------------------------------------
# Assemble the release
# ---------------------------------------------------------------------------
step "Assembling the release"
STAGE_DIR="$(mktemp -d)"
mkdir -p "$STAGE_DIR/api" "$STAGE_DIR/web"
cp -R apps/api/dist "$STAGE_DIR/api/dist"
cp -R apps/api/prisma "$STAGE_DIR/api/prisma"
cp -R apps/web/dist/. "$STAGE_DIR/web/"
node infra/make-release-package.mjs "$STAGE_DIR/api/package.json"

GIT_SHA="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Note: the working tree has uncommitted changes, and they are included in this release."
  GIT_SHA="${GIT_SHA}-dirty"
fi
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-${GIT_SHA}"
echo "$RELEASE_ID" >"$STAGE_DIR/api/RELEASE"

# ---------------------------------------------------------------------------
# Upload and activate
# ---------------------------------------------------------------------------
step "Uploading release $RELEASE_ID"
REMOTE_TMP="$(remote mktemp -d /tmp/kaamwala-deploy.XXXXXX)"
tar -czf - -C "$STAGE_DIR" . | remote tar -xzf - --no-same-owner -C "$REMOTE_TMP"

step "Migrating and restarting kaamwala-api on the droplet"
remote "$REMOTE_CTL activate '$RELEASE_ID' '$REMOTE_TMP' '$RUN_SEED'"

# ---------------------------------------------------------------------------
# Check it from outside
# ---------------------------------------------------------------------------
step "Checking the public URLs"
PUBLIC_OK=1
for url in "https://${API_HOST}/v1/categories" "https://${WEB_HOST}/"; do
  if curl -fsS -o /dev/null --max-time 20 "$url"; then
    echo "OK   $url"
  else
    echo "FAIL $url"
    PUBLIC_OK=0
  fi
done

echo
if [[ "$PUBLIC_OK" -eq 1 ]]; then
  echo "Deployed $RELEASE_ID to https://${WEB_HOST}"
else
  echo "Release $RELEASE_ID is running on the droplet, but a public URL did not respond."
  echo "If DNS was only just added, wait a few minutes for it and for Caddy's certificates."
  exit 1
fi
