#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
APP_PORT="${APP_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
HEALTH_PATH="${HEALTH_PATH:-/}"
MAX_HEALTH_ATTEMPTS="${MAX_HEALTH_ATTEMPTS:-30}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-2}"

echo "==> Using app directory: $APP_DIR"
cd "$APP_DIR"

PARENT_DIR="$(dirname "$APP_DIR")"
if [ -f "$PARENT_DIR/package-lock.json" ] && [ ! -f "$PARENT_DIR/package.json" ]; then
  echo "==> Removing stray parent lockfile: $PARENT_DIR/package-lock.json"
  rm -f "$PARENT_DIR/package-lock.json"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Build failed: Node.js is not installed."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Build failed: Node 22+ is required. Current: $(node -v)"
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "Build failed: Missing .env.local in $APP_DIR"
  exit 1
fi

NESTED_CLONE="$APP_DIR/tradecoach"
if [ -f "$NESTED_CLONE/package.json" ] && [ "$NESTED_CLONE" != "$APP_DIR" ]; then
  echo "==> Removing duplicate nested clone: $NESTED_CLONE"
  rm -rf "$NESTED_CLONE"
fi

wait_for_port() {
  local port="$1"
  local label="$2"
  local attempt=1

  while [ "$attempt" -le "$MAX_HEALTH_ATTEMPTS" ]; do
    if curl -sf -o /dev/null "http://127.0.0.1:${port}${HEALTH_PATH}"; then
      echo "==> ${label} is responding on port ${port}"
      return 0
    fi

    echo "   waiting for ${label} (${attempt}/${MAX_HEALTH_ATTEMPTS})..."
    attempt=$((attempt + 1))
    sleep "$HEALTH_SLEEP_SECONDS"
  done

  echo "Deploy failed: ${label} did not respond on port ${port}."
  return 1
}

pm2_start_or_reload() {
  local process_name="$1"
  local only_target="$2"

  if pm2 describe "$process_name" >/dev/null 2>&1; then
    echo "==> Reloading ${process_name}"
    pm2 reload "$process_name" --update-env
  else
    echo "==> Starting ${process_name}"
    pm2 start ecosystem.config.cjs --only "$only_target"
  fi
}

echo "==> Installing dependencies"
npm install

echo "==> Building Next.js app (webpack, no extension zip — saves VPS memory)"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
if ! npm run build:app; then
  echo
  echo "Build failed. PM2 was NOT restarted — the previous site version should still be running."
  echo "Fix the build error above, then run this script again."
  exit 1
fi

if [ ! -f .next/BUILD_ID ]; then
  echo "Build failed: .next/BUILD_ID missing. PM2 was NOT restarted."
  exit 1
fi

echo "==> Restarting PM2 processes (reload, not delete — avoids 502 gap)"
pm2_start_or_reload tradecoach tradecoach
pm2_start_or_reload tradecoach-api tradecoach-api
pm2 save

echo "==> Waiting for services to come back"
if ! wait_for_port "$APP_PORT" "Next.js app"; then
  echo
  echo "Recent app logs:"
  pm2 logs tradecoach --lines 40 --nostream || true
  exit 1
fi

if ! wait_for_port "$API_PORT" "FastAPI backend"; then
  echo "Warning: API did not respond — extension sync may be broken, but the website may still work."
  pm2 logs tradecoach-api --lines 40 --nostream || true
fi

echo
echo "Deploy complete."
echo "  pm2 status"
echo "  pm2 logs tradecoach --lines 50"
