-- Link completed trades to a trading profile so the log does not disappear on refresh.

alter table public.broker_completed_trades
  add column if not exists trading_profile_id uuid
  references public.trading_profiles (id) on delete set null;

create index if not exists broker_completed_trades_profile_idx
  on public.broker_completed_trades (user_id, trading_profile_id);

-- Backfill: assign each trade to the profile whose start time is latest but still <= trade time.
with trade_times as (
  select
    id,
    user_id,
    coalesce(exit_at, entry_at, created_at) as trade_time
  from public.broker_completed_trades
  where trading_profile_id is null
),
matches as (
  select
    tt.id as trade_id,
    tp.id as profile_id,
    row_number() over (
      partition by tt.id
      order by tp.stats_started_at desc
    ) as rn
  from trade_times tt
  join public.trading_profiles tp
    on tp.user_id = tt.user_id
   and tt.trade_time >= tp.stats_started_at
)
update public.broker_completed_trades t
set trading_profile_id = m.profile_id
from matches m
where t.id = m.trade_id
  and m.rn = 1;
