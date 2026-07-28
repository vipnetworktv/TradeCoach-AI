#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
cd "$APP_DIR"

echo "==> Quick 502 recovery for tradecoachai.org"
echo

if [ ! -f .next/BUILD_ID ] || [ ! -f .next/prerender-manifest.json ]; then
  echo "Build missing — running full deploy..."
  exec bash scripts/deploy-vps.sh
fi

echo "==> Restarting app processes"
pm2 delete tradecoach 2>/dev/null || true
pm2 delete tradecoach-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Waiting for Next.js..."
for i in $(seq 1 20); do
  if curl -sf -o /dev/null "http://127.0.0.1:3000/"; then
    echo "OK: Next.js responding on :3000"
    break
  fi
  sleep 2
  if [ "$i" -eq 20 ]; then
    echo "FAILED: Next.js still not responding. Run: bash scripts/deploy-vps.sh"
    pm2 logs tradecoach --lines 30 --nostream || true
    exit 1
  fi
done

if curl -sf -o /dev/null "http://127.0.0.1:8000/health"; then
  echo "OK: API responding on :8000/health"
else
  echo "WARN: API not responding — check: pm2 logs tradecoach-api --lines 30"
fi

echo
echo "==> Reloading nginx"
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx
fi

echo
echo "Done. Hard-refresh browser: Ctrl+Shift+R"
echo "  pm2 status"
echo "  bash scripts/diagnose-vps.sh"
