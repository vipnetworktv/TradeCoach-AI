-- Allow authenticated users to import and update their own completed trades.

alter table public.broker_completed_trades enable row level security;

drop policy if exists "Users can insert their completed trades"
  on public.broker_completed_trades;

create policy "Users can insert their completed trades"
  on public.broker_completed_trades
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their completed trades"
  on public.broker_completed_trades;

create policy "Users can update their completed trades"
  on public.broker_completed_trades
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
