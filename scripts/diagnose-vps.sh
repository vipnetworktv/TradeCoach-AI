#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
APP_PORT="${APP_PORT:-3001}"
API_PORT="${API_PORT:-8001}"

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
if [ -f .next/BUILD_ID ] && [ -f .next/prerender-manifest.json ]; then
  echo "OK: production build exists ($(cat .next/BUILD_ID))"
else
  echo "MISSING: incomplete .next build — run: bash scripts/deploy-vps.sh"
fi

echo
echo "==> Port checks"
curl -s -o /dev/null -w "Next.js :${APP_PORT}/ → HTTP %{http_code}\n" "http://127.0.0.1:${APP_PORT}/" || echo "Next.js not responding on :${APP_PORT}"
curl -s -o /dev/null -w "API :${API_PORT}/health → HTTP %{http_code}\n" "http://127.0.0.1:${API_PORT}/health" || echo "API not responding on :${API_PORT}"

echo
echo "==> Memory / swap"
free -h || true

echo
echo "==> Recent OOM kills (if any)"
dmesg -T 2>/dev/null | grep -i "killed process" | tail -5 || true

echo
echo "If Next.js is down but BUILD_ID exists, try:"
echo "  bash scripts/fix-502.sh"
echo "If build is missing, try:"
echo "  bash scripts/deploy-vps.sh"
