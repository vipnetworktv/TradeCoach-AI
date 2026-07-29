#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
APP_PORT="${APP_PORT:-3001}"
API_PORT="${API_PORT:-8001}"
LOG_FILE="${LOG_FILE:-${APP_DIR}/logs/watch.log}"
mkdir -p "$(dirname "$LOG_FILE")"

cd "$APP_DIR"

log() {
  echo "$(date -Is) $*" | tee -a "$LOG_FILE"
}

recover_process() {
  local process_name="$1"

  if pm2 describe "$process_name" >/dev/null 2>&1; then
    log "Restarting ${process_name}"
    pm2 restart "$process_name" --update-env || pm2 start ecosystem.config.cjs --only "$process_name"
  else
    log "Starting missing process ${process_name}"
    pm2 start ecosystem.config.cjs --only "$process_name"
  fi
}

web_ok=0
api_ok=0

if curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}/api/health"; then
  web_ok=1
fi

if curl -sf -o /dev/null "http://127.0.0.1:${API_PORT}/health"; then
  api_ok=1
fi

if [ "$web_ok" -eq 1 ] && [ "$api_ok" -eq 1 ]; then
  exit 0
fi

if [ "$web_ok" -eq 0 ]; then
  log "Next.js unhealthy on :${APP_PORT}/api/health"
  recover_process tradecoach
fi

if [ "$api_ok" -eq 0 ]; then
  log "FastAPI unhealthy on :${API_PORT}/health"
  recover_process tradecoach-api
fi

pm2 save

sleep 3

if curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}/api/health"; then
  log "Recovery OK: Next.js is back"
else
  log "Recovery FAILED: Next.js still down — run bash scripts/fix-502.sh"
  exit 1
fi
