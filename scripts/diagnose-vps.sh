#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
APP_PORT="${APP_PORT:-3000}"

cd "$APP_DIR"

echo "==> PM2 status"
pm2 status || true

echo
echo "==> Last 40 lines: tradecoach"
pm2 logs tradecoach --lines 40 --nostream || true

echo
echo "==> Last 20 lines: tradecoach-api"
pm2 logs tradecoach-api --lines 20 --nostream || true

echo
echo "==> Build artifact check"
if [ -f .next/BUILD_ID ]; then
  echo "OK: .next/BUILD_ID exists ($(cat .next/BUILD_ID))"
else
  echo "MISSING: .next/BUILD_ID — you need npm run build:app"
fi

echo
echo "==> Port checks"
curl -sI "http://127.0.0.1:${APP_PORT}/" | head -n 1 || echo "Next.js not responding on :${APP_PORT}"
curl -sI "http://127.0.0.1:8000/" | head -n 1 || echo "API not responding on :8000"

echo
echo "If Next.js is down but BUILD_ID exists, try:"
echo "  pm2 start ecosystem.config.cjs --only tradecoach"
echo "If build is missing, try:"
echo "  bash scripts/deploy-vps.sh"
