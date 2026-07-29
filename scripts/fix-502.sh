#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
APP_PORT="${APP_PORT:-3001}"
API_PORT="${API_PORT:-8001}"

cd "$APP_DIR"

echo "==> TradeCoach 502 recovery (does NOT edit vip2025.live nginx)"
echo

pm2_start_or_reload() {
  local process_name="$1"
  local only_target="$2"

  if pm2 describe "$process_name" >/dev/null 2>&1; then
    echo "==> Reloading ${process_name}"
    if ! pm2 reload "$process_name" --update-env; then
      echo "==> Reload failed for ${process_name} — starting fresh"
      pm2 delete "$process_name" 2>/dev/null || true
      pm2 start ecosystem.config.cjs --only "$only_target"
    fi
  else
    echo "==> Starting ${process_name}"
    pm2 start ecosystem.config.cjs --only "$only_target"
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempt=1

  while [ "$attempt" -le 20 ]; do
    if curl -sf -o /dev/null "$url"; then
      echo "OK: ${label}"
      return 0
    fi

    echo "   waiting for ${label} (${attempt}/20)..."
    attempt=$((attempt + 1))
    sleep 2
  done

  echo "FAILED: ${label} did not respond at ${url}"
  return 1
}

if [ ! -f .next/BUILD_ID ] || [ ! -f .next/prerender-manifest.json ]; then
  echo "Build missing — running full deploy..."
  exec bash scripts/deploy-vps.sh
fi

echo "==> Restarting TradeCoach PM2 processes"
pm2_start_or_reload tradecoach tradecoach
pm2_start_or_reload tradecoach-api tradecoach-api
pm2 save

echo
echo "==> Waiting for local services"
if ! wait_for_http "http://127.0.0.1:${APP_PORT}/api/health" "Next.js on :${APP_PORT}"; then
  pm2 logs tradecoach --lines 40 --nostream || true
  exit 1
fi

if ! wait_for_http "http://127.0.0.1:${API_PORT}/health" "FastAPI on :${API_PORT}/health"; then
  pm2 logs tradecoach-api --lines 40 --nostream || true
fi

echo
echo "==> Reloading nginx (tradecoach vhost only — vip2025.live config untouched)"
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx
fi

echo
echo "Done. Hard-refresh browser: Ctrl+Shift+R"
echo "  pm2 status"
echo "  bash scripts/diagnose-vps.sh"
