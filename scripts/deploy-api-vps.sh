#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"

echo "==> Using app directory: $APP_DIR"
cd "$APP_DIR"

if [ ! -d backend/.venv ]; then
  echo "Missing backend/.venv in $APP_DIR"
  echo "Run the full deploy first: bash scripts/deploy-vps.sh"
  exit 1
fi

echo "==> Restarting TradeCoach API (tradingview sync support)"
pm2 restart tradecoach-api
pm2 save

echo "Done. Check API logs with:"
echo "  pm2 logs tradecoach-api --lines 50"
