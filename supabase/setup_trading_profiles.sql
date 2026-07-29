-- Run once in Supabase → SQL Editor if trading profiles fail to create.
-- Fixes: "Could not find the table public.trading_profiles" / profile errors.

create table if not exists public.trading_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  stats_started_at timestamptz not null default timezone('utc', now()),
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists trading_profiles_user_idx
  on public.trading_profiles (user_id, stats_started_at);

create unique index if not exists trading_profiles_one_active_per_user_idx
  on public.trading_profiles (user_id)
  where is_active = true;

alter table public.trading_profiles enable row level security;

drop policy if exists "Users can read their trading profiles"
  on public.trading_profiles;

create policy "Users can read their trading profiles"
  on public.trading_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their trading profiles"
  on public.trading_profiles;

create policy "Users can insert their trading profiles"
  on public.trading_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their trading profiles"
  on public.trading_profiles;

create policy "Users can update their trading profiles"
  on public.trading_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their trading profiles"
  on public.trading_profiles;

create policy "Users can delete their trading profiles"
  on public.trading_profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);
