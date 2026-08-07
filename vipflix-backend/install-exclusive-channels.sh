#!/usr/bin/env bash
# Prefer fix-exclusive-channels-wire.sh if index.js was already broken.
# Fresh install:
#   cd ~/my-backend
#   curl -fsSL -o fix-exclusive-channels-wire.sh \
#     "https://raw.githubusercontent.com/vipnetworktv/TradeCoach-AI/cursor/admin-events-12h-reorder-6906/vipflix-backend/fix-exclusive-channels-wire.sh"
#   bash fix-exclusive-channels-wire.sh
set -euo pipefail
cd "$(dirname "$0")"
curl -fsSL -o fix-exclusive-channels-wire.sh \
  "https://raw.githubusercontent.com/vipnetworktv/TradeCoach-AI/cursor/admin-events-12h-reorder-6906/vipflix-backend/fix-exclusive-channels-wire.sh"
bash fix-exclusive-channels-wire.sh
