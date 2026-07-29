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
curl -s -o /dev/null -w "127.0.0.1:3001 → HTTP %{http_code}\n" http://127.0.0.1:3001/api/health || echo "127.0.0.1:3001 failed"
curl -s -o /dev/null -w "127.0.0.1:8001/health → HTTP %{http_code}\n" http://127.0.0.1:8001/health || echo "127.0.0.1:8001 failed"

echo
echo "==> what localhost resolves to"
getent ahosts localhost || true

echo
echo "If 127.0.0.1:3001 fails, nginx must proxy to 127.0.0.1 (not localhost)."
