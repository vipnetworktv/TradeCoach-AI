#!/usr/bin/env bash
# Run on the VPS:
#   cd ~/my-backend
#   curl -fsSL -o install-exclusive-channels.sh \
#     "https://raw.githubusercontent.com/vipnetworktv/TradeCoach-AI/cursor/admin-events-12h-reorder-6906/vipflix-backend/install-exclusive-channels.sh"
#   bash install-exclusive-channels.sh
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
BRANCH_URL="https://raw.githubusercontent.com/vipnetworktv/TradeCoach-AI/cursor/admin-events-12h-reorder-6906/vipflix-backend"

echo "==> Downloading Exclusive Channels files into $ROOT"
curl -fsSL -o admin-channels.js "$BRANCH_URL/admin-channels.js"
curl -fsSL -o exclusive-channels-rail.js "$BRANCH_URL/exclusive-channels-rail.js"
curl -fsSL -o exclusive-live-labels.js "$BRANCH_URL/exclusive-live-labels.js"
node --check admin-channels.js
node --check exclusive-channels-rail.js
node --check exclusive-live-labels.js

echo "==> Finding Express server file"
TARGET=""
for candidate in server.js index.js app.js main.js backend.js; do
  if [[ -f "$candidate" ]] && grep -qE "admin/events|admin-events|custom-events|renderAdminEventsPage|app\.listen" "$candidate"; then
    TARGET="$candidate"
    break
  fi
done
if [[ -z "$TARGET" ]]; then
  TARGET="$(grep -R --include='*.js' -lE "admin/events|admin-events|custom-events|renderAdminEventsPage" . 2>/dev/null | head -1 || true)"
fi
if [[ -z "$TARGET" || ! -f "$TARGET" ]]; then
  echo "ERROR: Could not find your Express server file."
  echo "Files here:"
  ls -la *.js 2>/dev/null || true
  exit 1
fi
echo "    Using: $TARGET"

if grep -q "installExclusiveChannels" "$TARGET"; then
  echo "==> Already wired in $TARGET"
else
  echo "==> Inserting installExclusiveChannels into $TARGET"
  cp "$TARGET" "${TARGET}.bak.exclusive-channels"
  TARGET_FILE="$TARGET" node <<'NODE'
const fs = require('fs');
const target = process.env.TARGET_FILE;
let src = fs.readFileSync(target, 'utf8');

let block = [
  "const path = require('path');",
  "const { installExclusiveChannels } = require('./exclusive-channels-rail');",
  "installExclusiveChannels(app, {",
  "  dataPath: path.join(__dirname, 'data', 'custom-channels.json')",
  "});",
  ""
].join('\n');

if (/\b(?:const|let|var)\s+path\s*=\s*require\(\s*['"]path['"]\s*\)/.test(src)) {
  block = block.replace("const path = require('path');\n", '');
}

let inserted = false;

const afterAdminEvents = src.match(/require\(['"]\.\/admin-events['"]\)[^\n]*\n/);
if (afterAdminEvents) {
  const idx = src.indexOf(afterAdminEvents[0]) + afterAdminEvents[0].length;
  src = src.slice(0, idx) + '\n' + block + src.slice(idx);
  inserted = true;
}

if (!inserted) {
  const homeIdx = src.search(/app\.(get|use)\(\s*['"]\/api\/home['"]/);
  if (homeIdx !== -1) {
    src = src.slice(0, homeIdx) + block + '\n' + src.slice(homeIdx);
    inserted = true;
  }
}

if (!inserted) {
  const appMatch = src.match(/const\s+app\s*=\s*express\s*\(\s*\)\s*;?/);
  if (appMatch) {
    const appIdx = src.indexOf(appMatch[0]);
    const lineEnd = src.indexOf('\n', appIdx);
    const at = lineEnd === -1 ? src.length : lineEnd + 1;
    src = src.slice(0, at) + '\n' + block + src.slice(at);
    inserted = true;
  }
}

if (!inserted) {
  console.error('Could not auto-insert. Add this manually before /api/home in ' + target + ':');
  console.error(block);
  process.exit(2);
}

fs.writeFileSync(target, src);
console.log('Inserted into', target);
NODE
  node --check "$TARGET"
fi

mkdir -p data
if [[ ! -f data/custom-channels.json ]]; then
  echo '[]' > data/custom-channels.json
fi

echo "==> Restarting with pm2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart all || true
  sleep 1
  pm2 ls || true
else
  echo "pm2 not found — restart your node process manually"
fi

echo "==> Smoke check"
sleep 1
curl -sS -o /tmp/admin-channels.html -w "admin/channels HTTP %{http_code}\n" http://127.0.0.1:3000/admin/channels || true
curl -sS -o /tmp/home.json -w "api/home HTTP %{http_code}\n" http://127.0.0.1:3000/api/home || true
if grep -q "Exclusive Channels" /tmp/admin-channels.html 2>/dev/null; then
  echo "OK: /admin/channels is live"
else
  echo "WARN: /admin/channels did not return the admin page — check pm2 logs"
  pm2 logs --lines 30 --nostream || true
fi

echo "Open: http://167.99.50.200:3000/admin/channels"
