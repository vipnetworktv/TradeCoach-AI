#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/tradecoach}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
APP_PORT="${APP_PORT:-3001}"
API_PORT="${API_PORT:-8001}"

echo "==> TradeCoach permanent VPS setup"
echo "    (does NOT modify vip2025.live nginx files)"
echo

cd "$APP_DIR"

if [ ! -f .next/BUILD_ID ] || [ ! -f .next/prerender-manifest.json ]; then
  echo "==> No production build found — running deploy first"
  bash scripts/deploy-vps.sh
fi

if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

echo "==> Step 1: Add swap if missing (stops OOM kills on 2GB VPS)"
if swapon --show | grep -q swap; then
  echo "Swap already enabled:"
  swapon --show
else
  echo "Creating ${SWAP_SIZE_GB}G swap file..."
  $SUDO fallocate -l "${SWAP_SIZE_GB}G" /swapfile || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB * 1024)) status=progress
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile
  $SUDO swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab
  fi
  echo "Swap enabled:"
  swapon --show
fi

echo
echo "==> Step 2: Install TradeCoach nginx (ports ${APP_PORT}/${API_PORT})"
bash scripts/install-nginx.sh

echo
echo "==> Step 3: Start / restart PM2 processes on dedicated ports"
pm2 delete tradecoach 2>/dev/null || true
pm2 delete tradecoach-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo
echo "==> Step 4: PM2 auto-start on server reboot"
pm2 save
if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>&1 | tee /tmp/pm2-startup.txt || true
  if grep -q "sudo env PATH" /tmp/pm2-startup.txt; then
    echo "Run the sudo command shown above once, then: pm2 save"
  fi
fi

echo
echo "==> Step 5: Install watchdog (checks every 2 minutes)"
WATCH_CMD="*/2 * * * * cd ${APP_DIR} && bash scripts/watch-tradecoach.sh"
CRON_FILE="/etc/cron.d/tradecoach-watch"

echo "$WATCH_CMD" | $SUDO tee "$CRON_FILE" >/dev/null
$SUDO chmod 644 "$CRON_FILE"
echo "Installed ${CRON_FILE}"

echo
echo "==> Step 6: Wait for services"
for i in $(seq 1 20); do
  if curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}/" && \
     curl -sf -o /dev/null "http://127.0.0.1:${API_PORT}/health"; then
    echo "OK: TradeCoach is healthy"
    break
  fi
  sleep 2
  if [ "$i" -eq 20 ]; then
    echo "WARN: Services did not pass health check — run: bash scripts/diagnose-vps.sh"
  fi
done

echo
echo "==> Done. Permanent protections installed:"
echo "  - Dedicated ports ${APP_PORT} (web) and ${API_PORT} (api)"
echo "  - Swap file to prevent OOM kills"
echo "  - PM2 auto-restart + saved process list"
echo "  - Cron watchdog every 2 minutes"
echo
echo "Test:"
echo "  curl -sI https://tradecoachai.org/ | head -1"
echo "  curl -s https://api.tradecoachai.org/health"
