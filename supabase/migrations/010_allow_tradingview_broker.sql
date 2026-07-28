-- Allow broker = 'tradingview' in sync tables.
-- Older schemas only allowed tradovate / ninjatrader, which blocks extension sync.

alter table if exists public.broker_sync_events
  drop constraint if exists broker_sync_events_broker_check;

alter table if exists public.broker_completed_trades
  drop constraint if exists broker_completed_trades_broker_check;
