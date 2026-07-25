-- Allow authenticated users to delete their own imported trades.

alter table public.broker_completed_trades enable row level security;

drop policy if exists "Users can delete their completed trades"
  on public.broker_completed_trades;

create policy "Users can delete their completed trades"
  on public.broker_completed_trades
  for delete
  to authenticated
  using (auth.uid() = user_id);
