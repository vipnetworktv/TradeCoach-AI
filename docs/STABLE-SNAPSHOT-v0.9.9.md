# Stable snapshot: TradeCoach trades (v0.9.9)

**Saved:** 2026-07-29  
**Git commit:** `c14e7b5e831e77042c224f3b7a0fc6b42574d698`  
**Git tag:** `stable-trades-v0.9.9`  
**Git branch:** `stable/trades-v0.9.9`  
**Extension version:** `0.9.9`

Use this snapshot to restore the known-good trade sync setup if future changes break anything.

## What works in this snapshot

- TradingView paper/live trades sync via extension (live broker fills only)
- No phantom trades from websocket scraping or old order replay
- Trades route to the **profile selected** in TradeCoach
- Each profile has its **own trade log** (survives page refresh)
- Dashboard and Trades page scoped to active profile
- VPS deploy scripts on ports 3001 / 8001

## Restore this exact code

```bash
git fetch origin
git checkout stable-trades-v0.9.9
# or
git checkout stable/trades-v0.9.9
```

On VPS:

```bash
cd /var/www/tradecoach
git fetch origin
git checkout stable-trades-v0.9.9
bash scripts/deploy-vps.sh
pm2 restart tradecoach-api
```

Extension: reload at `chrome://extensions` (must show **v0.9.9**).

## Required Supabase SQL (run once if not already)

1. `supabase/setup_trading_profiles.sql` — trading profiles table
2. `supabase/migrations/012_trading_profile_id_on_trades.sql` — link trades to profiles

## Key files (do not rewrite casually)

| Area | Files |
|------|-------|
| Extension bridge | `extension/page-bridge-tradingview.js` |
| Extension background | `extension/background.js` |
| App profile bridge | `extension/app-bridge.js` |
| Profile filter | `lib/trading-profiles.ts` |
| Profile API | `app/api/trading-profiles/route.ts` |
| Trade sync backend | `backend/sync_events.py` |
| Device status | `backend/main.py` |

## Commits included in this stable line

- `c14e7b5` Route synced trades to the profile selected in TradeCoach
- `846c414` Persist trades on active profile so they survive refresh
- `a94e52c` Stop phantom TradingView trades from websocket and order replay
- `2aefd42` Scope trade log and dashboard to active trading profile
- `caba046` Fix TradingView PnL sync, add trade wipe, and improve profile setup

## Daily use checklist

1. Open TradeCoach → select profile in dropdown
2. Confirm **“Syncing trades to [name]”**
3. Keep a TradeCoach tab open while trading
4. Reload extension after any extension code update
5. Fresh TradingView tab after extension updates
