-- TradeCoach AI notification setup
-- Paste this entire file into Supabase → SQL Editor → Run once.

create table if not exists public.user_notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  daily_report_enabled boolean not null default true,
  weekly_report_enabled boolean not null default true,
  monthly_report_enabled boolean not null default true,
  trade_sync_alerts_enabled boolean not null default true,
  product_updates_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_notification_settings_email_idx
  on public.user_notification_settings (email);

alter table public.user_notification_settings enable row level security;

drop policy if exists "Users can read their notification settings"
  on public.user_notification_settings;

create policy "Users can read their notification settings"
  on public.user_notification_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their notification settings"
  on public.user_notification_settings;

create policy "Users can insert their notification settings"
  on public.user_notification_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their notification settings"
  on public.user_notification_settings;

create policy "Users can update their notification settings"
  on public.user_notification_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_user_notification_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_user_notification_settings_updated_at
  on public.user_notification_settings;

create trigger set_user_notification_settings_updated_at
  before update on public.user_notification_settings
  for each row
  execute function public.set_user_notification_settings_updated_at();

create table if not exists public.notification_send_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  period_key text not null,
  sent_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists notification_send_log_unique_idx
  on public.notification_send_log (user_id, notification_type, period_key);

create index if not exists notification_send_log_user_id_idx
  on public.notification_send_log (user_id);

alter table public.notification_send_log enable row level security;

drop policy if exists "Users can read their notification send log"
  on public.notification_send_log;

create policy "Users can read their notification send log"
  on public.notification_send_log
  for select
  to authenticated
  using (auth.uid() = user_id);
