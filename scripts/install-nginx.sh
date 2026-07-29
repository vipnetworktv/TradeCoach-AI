#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
CONF_SRC="$APP_DIR/scripts/nginx-tradecoach.conf"
CONF_DST="/etc/nginx/sites-available/tradecoach"

if [ ! -f "$CONF_SRC" ]; then
  echo "Missing $CONF_SRC — run git pull in $APP_DIR first."
  exit 1
fi

echo "==> Installing TradeCoach nginx site only (proxy to 127.0.0.1:3001 and :8001)"
sudo cp "$CONF_SRC" "$CONF_DST"
sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/tradecoach

echo "==> Test nginx config"
sudo nginx -t

echo "==> Reload nginx"
sudo systemctl reload nginx

echo
echo "Done. Test:"
echo "  curl -sI https://tradecoachai.org/ | head -1"
echo "  curl -s https://api.tradecoachai.org/health"
echo "  Hard refresh browser: Ctrl+Shift+R"
