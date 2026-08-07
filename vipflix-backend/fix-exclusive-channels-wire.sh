#!/usr/bin/env bash
# Fixes crash: ReferenceError: Cannot access 'app' before initialization
# Run on VPS:
#   cd ~/my-backend
#   curl -fsSL -o fix-exclusive-channels-wire.sh \
#     "https://raw.githubusercontent.com/vipnetworktv/TradeCoach-AI/cursor/admin-events-12h-reorder-6906/vipflix-backend/fix-exclusive-channels-wire.sh"
#   bash fix-exclusive-channels-wire.sh
set -euo pipefail
cd "$(dirname "$0")"

BRANCH_URL="https://raw.githubusercontent.com/vipnetworktv/TradeCoach-AI/cursor/admin-events-12h-reorder-6906/vipflix-backend"

echo "==> Refreshing channel modules"
curl -fsSL -o admin-channels.js "$BRANCH_URL/admin-channels.js"
curl -fsSL -o exclusive-channels-rail.js "$BRANCH_URL/exclusive-channels-rail.js"
curl -fsSL -o exclusive-live-labels.js "$BRANCH_URL/exclusive-live-labels.js"
node --check admin-channels.js
node --check exclusive-channels-rail.js

TARGET="index.js"
if [[ ! -f "$TARGET" ]]; then
  echo "ERROR: index.js not found in $(pwd)"
  exit 1
fi

echo "==> Cleaning bad early installExclusiveChannels block from $TARGET"
cp "$TARGET" "${TARGET}.bak.fix-channels-$(date +%s)"

node <<'NODE'
const fs = require('fs');
const target = 'index.js';
let src = fs.readFileSync(target, 'utf8');

// Remove ANY existing installExclusiveChannels wiring blocks (bad or good)
src = src.replace(
  /(?:const\s+path\s*=\s*require\(['"]path['"]\);\s*)?const\s+\{\s*installExclusiveChannels\s*\}\s*=\s*require\(['"]\.\/exclusive-channels-rail['"]\);\s*installExclusiveChannels\([\s\S]*?\);\s*/g,
  ''
);

if (!/const\s+app\s*=/.test(src) && !/let\s+app\s*=/.test(src) && !/var\s+app\s*=/.test(src)) {
  console.error('Could not find app = ... in index.js');
  process.exit(2);
}

const blockLines = [
  '',
  '// Exclusive Channels (Home row) — admin at /admin/channels',
  "const { installExclusiveChannels } = require('./exclusive-channels-rail');",
  'installExclusiveChannels(app, {',
  "  dataPath: require('path').join(__dirname, 'data', 'custom-channels.json')",
  '});',
  ''
];
const block = blockLines.join('\n');

let inserted = false;

// Prefer right before /admin/events routes (app already exists there)
const adminEventsIdx = src.search(/app\.get\(\s*['"]\/admin\/events['"]/);
if (adminEventsIdx !== -1) {
  src = src.slice(0, adminEventsIdx) + block + src.slice(adminEventsIdx);
  inserted = true;
  console.log('Inserted before /admin/events');
}

// Else after express.json()
if (!inserted) {
  const jsonIdx = src.search(/app\.use\(\s*express\.json\s*\(\s*\)\s*\)\s*;?/);
  if (jsonIdx !== -1) {
    const lineEnd = src.indexOf('\n', jsonIdx);
    const at = lineEnd === -1 ? src.length : lineEnd + 1;
    src = src.slice(0, at) + block + src.slice(at);
    inserted = true;
    console.log('Inserted after express.json()');
  }
}

// Else after const app = express()
if (!inserted) {
  const appMatch = src.match(/(?:const|let|var)\s+app\s*=\s*express\s*\(\s*\)\s*;?/);
  if (appMatch) {
    const appIdx = src.indexOf(appMatch[0]);
    const lineEnd = src.indexOf('\n', appIdx);
    const at = lineEnd === -1 ? src.length : lineEnd + 1;
    src = src.slice(0, at) + block + src.slice(at);
    inserted = true;
    console.log('Inserted after app = express()');
  }
}

if (!inserted) {
  console.error('Could not find a safe insertion point');
  process.exit(3);
}

fs.writeFileSync(target, src);
console.log('Wrote', target);
NODE

node --check index.js
mkdir -p data
[[ -f data/custom-channels.json ]] || echo '[]' > data/custom-channels.json

echo "==> Restarting vipflix-backend"
pm2 restart vipflix-backend --update-env || pm2 restart all --update-env
sleep 2
pm2 ls

echo "==> Smoke check"
curl -sS -o /tmp/admin-channels.html -w "admin/channels HTTP %{http_code}\n" http://127.0.0.1:3000/admin/channels || true
curl -sS -o /tmp/home.json -w "api/home HTTP %{http_code}\n" http://127.0.0.1:3000/api/home || true

if grep -q "Exclusive Channels" /tmp/admin-channels.html 2>/dev/null; then
  echo "OK: /admin/channels is live"
else
  echo "FAIL: still broken — showing error log"
  pm2 logs vipflix-backend --lines 40 --nostream || true
  exit 4
fi

if python3 - <<'PY'
import json
d=json.load(open('/tmp/home.json'))
rails=d.get('rails') or []
print('first rail:', rails[0]['title'] if rails else None)
raise SystemExit(0 if rails and rails[0].get('title')=='Exclusive Channels' else 1)
PY
then
  echo "OK: Exclusive Channels is first Home rail"
else
  echo "WARN: admin works but Home rail order unexpected — check /api/home"
fi

echo "Open: http://167.99.50.200:3000/admin/channels"
