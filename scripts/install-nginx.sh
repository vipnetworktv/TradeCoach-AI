#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
CONF_SRC="$APP_DIR/scripts/nginx-tradecoach.conf"
CONF_DST="/etc/nginx/sites-available/tradecoach"

if [ ! -f "$CONF_SRC" ]; then
  echo "Missing $CONF_SRC — run git pull in $APP_DIR first."
  exit 1
fi

echo "==> Installing nginx site config"
echo "    App domain  → 127.0.0.1:3000 (Next.js, all paths)"
echo "    API domain  → 127.0.0.1:8000 (FastAPI on api.tradecoachai.org)"
echo "    (never proxy_pass localhost — IPv6 ::1 breaks)"

sudo cp "$CONF_SRC" "$CONF_DST"
sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/tradecoach

echo "==> Disable default site if it conflicts"
sudo rm -f /etc/nginx/sites-enabled/default

# Older installs may have a separate api site; keep one source of truth.
if [ -e /etc/nginx/sites-enabled/tradecoach-api ] || [ -e /etc/nginx/sites-available/tradecoach-api ]; then
  echo "==> Removing legacy separate tradecoach-api site (now in tradecoach conf)"
  sudo rm -f /etc/nginx/sites-enabled/tradecoach-api
fi

echo "==> Ensure TLS cert exists for api.tradecoachai.org"
if [ ! -f /etc/letsencrypt/live/api.tradecoachai.org/fullchain.pem ]; then
  echo "WARN: Missing /etc/letsencrypt/live/api.tradecoachai.org/fullchain.pem"
  echo "      Issue one (HTTP-01) before reload, e.g.:"
  echo "      sudo certbot certonly --nginx -d api.tradecoachai.org"
  if ! sudo nginx -t 2>/dev/null; then
    echo "nginx -t failed (likely missing API cert). Aborting reload."
    exit 1
  fi
fi

echo "==> Test nginx config"
sudo nginx -t

echo "==> Reload nginx"
sudo systemctl reload nginx

echo
echo "Done. Verify routing:"
echo "  bash scripts/diagnose-nginx.sh"
echo "  curl -s https://tradecoachai.org/api/sync/devices"
echo "    → should be Next.js auth error, NOT {\"detail\":\"Not Found\"}"
echo "  curl -s https://api.tradecoachai.org/health"
echo "    → should include \"healthy\""
echo "  Hard refresh browser: Ctrl+Shift+R"
