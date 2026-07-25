#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach/tradecoach}"

echo "==> Using app directory: $APP_DIR"
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22+ is required. Current: $(node -v)"
  echo "Run: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "Missing .env.local in $APP_DIR"
  exit 1
fi

echo "==> Installing dependencies"
if [ -f package-lock.json ]; then
  npm install
else
  npm install
fi

echo "==> Building Next.js app"
npm run build

echo "==> Restarting PM2 process"
if pm2 describe tradecoach >/dev/null 2>&1; then
  pm2 restart tradecoach
else
  pm2 start npm --name tradecoach -- start
fi

pm2 save

echo "Done. Check: pm2 status && pm2 logs tradecoach --lines 50"
