#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"

echo "==> Using app directory: $APP_DIR"
cd "$APP_DIR"

PARENT_DIR="$(dirname "$APP_DIR")"
if [ -f "$PARENT_DIR/package-lock.json" ] && [ ! -f "$PARENT_DIR/package.json" ]; then
  echo "==> Removing stray parent lockfile: $PARENT_DIR/package-lock.json"
  rm -f "$PARENT_DIR/package-lock.json"
fi

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

NESTED_CLONE="$APP_DIR/tradecoach"
if [ -f "$NESTED_CLONE/package.json" ] && [ "$NESTED_CLONE" != "$APP_DIR" ]; then
  echo "==> Removing duplicate nested clone: $NESTED_CLONE"
  rm -rf "$NESTED_CLONE"
fi

echo "==> Installing dependencies"
if [ -f package-lock.json ]; then
  npm install
else
  npm install
fi

echo "==> Building Next.js app (webpack — avoids Turbopack VPS hangs)"
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" npm run build

echo "==> Restarting PM2 processes"
pm2 delete tradecoach 2>/dev/null || true
pm2 delete tradecoach-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "Done. Check:"
echo "  pm2 status"
echo "  pm2 logs tradecoach-api --lines 50"
echo "  pm2 logs tradecoach --lines 50"
