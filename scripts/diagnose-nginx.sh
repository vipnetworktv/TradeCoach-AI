#!/usr/bin/env bash
set -euo pipefail

echo "==> nginx config test"
sudo nginx -t

echo
echo "==> enabled sites"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true

echo
echo "==> tradecoach proxy_pass lines"
sudo grep -R "proxy_pass" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true

echo
echo "==> localhost vs 127.0.0.1 checks"
curl -s -o /dev/null -w "127.0.0.1:3000 → HTTP %{http_code}\n" http://127.0.0.1:3000/ || echo "127.0.0.1:3000 failed"
curl -s -o /dev/null -w "localhost:3000 → HTTP %{http_code}\n" http://localhost:3000/ || echo "localhost:3000 failed"

echo
echo "==> what localhost resolves to"
getent ahosts localhost || true

echo
echo "If localhost:3000 fails but 127.0.0.1:3000 works, nginx must use 127.0.0.1 in proxy_pass."
