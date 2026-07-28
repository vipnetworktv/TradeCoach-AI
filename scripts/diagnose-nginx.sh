#!/usr/bin/env bash
set -euo pipefail

echo "==> nginx config test"
sudo nginx -t

echo
echo "==> enabled sites"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true

echo
echo "==> tradecoach proxy_pass lines"
sudo grep -R "proxy_pass\|server_name\|location " /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true

echo
echo "==> localhost vs 127.0.0.1 checks (app must bind IPv4)"
curl -s -o /dev/null -w "127.0.0.1:3000 → HTTP %{http_code}\n" http://127.0.0.1:3000/ || echo "127.0.0.1:3000 failed"
curl -s -o /dev/null -w "localhost:3000 → HTTP %{http_code}\n" http://localhost:3000/ || echo "localhost:3000 failed"
curl -s -o /dev/null -w "127.0.0.1:8000/health → HTTP %{http_code}\n" http://127.0.0.1:8000/health || echo "127.0.0.1:8000 failed"

echo
echo "==> what localhost resolves to"
getent ahosts localhost || true

echo
echo "==> public routing checks"
APP_DEVICES=$(curl -s -o /tmp/tc-devices.json -w "%{http_code}" --max-time 10 https://tradecoachai.org/api/sync/devices || echo "000")
APP_BODY=$(cat /tmp/tc-devices.json 2>/dev/null || true)
API_HEALTH=$(curl -s -o /tmp/tc-api-health.json -w "%{http_code}" --max-time 10 https://api.tradecoachai.org/health || echo "000")
API_BODY=$(cat /tmp/tc-api-health.json 2>/dev/null || true)

echo "tradecoachai.org/api/sync/devices → HTTP ${APP_DEVICES}"
echo "  body: ${APP_BODY:0:120}"
echo "api.tradecoachai.org/health → HTTP ${API_HEALTH}"
echo "  body: ${API_BODY:0:120}"

echo
if echo "$APP_BODY" | grep -q '"detail":"Not Found"'; then
  echo "FAIL: App /api/sync/devices is hitting FastAPI (nginx /api/sync/ hijack)."
  echo "      Fix: bash scripts/install-nginx.sh"
  exit 1
fi

if [ "$APP_DEVICES" = "401" ] || [ "$APP_DEVICES" = "403" ] || echo "$APP_BODY" | grep -qi 'logged in\|subscription\|Unauthorized'; then
  echo "OK: App sync routes are served by Next.js (auth required)."
elif [ "$APP_DEVICES" = "200" ]; then
  echo "OK: App sync routes responded via Next.js."
else
  echo "WARN: Unexpected app sync response — expected Next.js 401/403 when logged out."
fi

if [ "$API_HEALTH" = "200" ] && echo "$API_BODY" | grep -q healthy; then
  echo "OK: api.tradecoachai.org reaches FastAPI."
else
  echo "FAIL: api.tradecoachai.org/health did not return healthy."
  echo "      Ensure API server block exists and SSL cert is issued for api.tradecoachai.org."
  exit 1
fi

echo
echo "If localhost:3000 fails but 127.0.0.1:3000 works, nginx must use 127.0.0.1 in proxy_pass."
