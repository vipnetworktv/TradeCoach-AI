-- TradeCoach AI billing setup
-- Paste this entire file into Supabase → SQL Editor → Run once.

-- 001: user_subscriptions table + signup trigger
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'canceled', 'expired', 'past_due')),
  plan_name text not null default 'TradeCoach AI Pro',
  trial_started_at timestamptz not null default timezone('utc', now()),
  trial_ends_at timestamptz not null default (timezone('utc', now()) + interval '7 days'),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions (status);

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can read their own subscription" on public.user_subscriptions;

create policy "Users can read their own subscription"
  on public.user_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_user_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_user_subscriptions_updated_at on public.user_subscriptions;

create trigger set_user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row
  execute function public.set_user_subscriptions_updated_at();

-- 002: PayPal fields + trial claims
alter table public.user_subscriptions
  add column if not exists trial_used boolean not null default false,
  add column if not exists billing_email text,
  add column if not exists paypal_subscription_id text,
  add column if not exists paypal_payer_id text,
  add column if not exists paypal_plan_id text;

alter table public.user_subscriptions
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;

create unique index if not exists user_subscriptions_paypal_subscription_id_idx
  on public.user_subscriptions (paypal_subscription_id)
  where paypal_subscription_id is not null;

create unique index if not exists user_subscriptions_paypal_payer_id_idx
  on public.user_subscriptions (paypal_payer_id)
  where paypal_payer_id is not null;

create table if not exists public.subscription_trial_claims (
  normalized_email text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default timezone('utc', now())
);

create index if not exists subscription_trial_claims_user_id_idx
  on public.subscription_trial_claims (user_id);

alter table public.subscription_trial_claims enable row level security;

drop policy if exists "Users can read their own trial claim" on public.subscription_trial_claims;

create policy "Users can read their own trial claim"
  on public.subscription_trial_claims
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 003: PayPal-first signup (no local no-card trial)
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  now_ts timestamptz := timezone('utc', now());
begin
  normalized := lower(trim(coalesce(new.email, '')));

  if normalized = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.subscription_trial_claims
    where normalized_email = normalized
      and user_id <> new.id
  ) then
    insert into public.user_subscriptions (
      user_id,
      status,
      trial_used,
      billing_email,
      trial_started_at,
      trial_ends_at
    )
    values (
      new.id,
      'expired',
      true,
      normalized,
      now_ts,
      now_ts
    )
    on conflict (user_id) do update
      set status = 'expired',
          trial_used = true,
          billing_email = excluded.billing_email,
          updated_at = timezone('utc', now());

    return new;
  end if;

  insert into public.subscription_trial_claims (normalized_email, user_id)
  values (normalized, new.id)
  on conflict (normalized_email) do nothing;

  insert into public.user_subscriptions (
    user_id,
    status,
    trial_used,
    billing_email,
    trial_started_at,
    trial_ends_at
  )
  values (
    new.id,
    'expired',
    false,
    normalized,
    now_ts,
    now_ts
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;

create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row
  execute function public.handle_new_user_subscription();

-- 004: RLS insert/update for authenticated users
drop policy if exists "Users can insert their own subscription" on public.user_subscriptions;

create policy "Users can insert their own subscription"
  on public.user_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own subscription checkout fields" on public.user_subscriptions;

create policy "Users can update their own subscription checkout fields"
  on public.user_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 005: ensure_user_subscription RPC
create or replace function public.ensure_user_subscription()
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  existing public.user_subscriptions;
begin
  select *
  into existing
  from public.user_subscriptions
  where user_id = auth.uid();

  if found then
    return existing;
  end if;

  normalized := lower(trim(coalesce(auth.jwt()->>'email', '')));

  if normalized <> '' and to_regclass('public.subscription_trial_claims') is not null then
    if exists (
      select 1
      from public.subscription_trial_claims
      where normalized_email = normalized
        and user_id <> auth.uid()
    ) then
      insert into public.user_subscriptions (
        user_id,
        status,
        trial_used,
        billing_email,
        trial_started_at,
        trial_ends_at
      )
      values (
        auth.uid(),
        'expired',
        true,
        normalized,
        timezone('utc', now()),
        timezone('utc', now())
      )
      returning * into existing;

      return existing;
    end if;

    insert into public.subscription_trial_claims (normalized_email, user_id)
    values (normalized, auth.uid())
    on conflict (normalized_email) do nothing;
  end if;

  insert into public.user_subscriptions (
    user_id,
    status,
    trial_used,
    billing_email,
    trial_started_at,
    trial_ends_at
  )
  values (
    auth.uid(),
    'expired',
    false,
    nullif(normalized, ''),
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning * into existing;

  return existing;
end;
$$;

revoke all on function public.ensure_user_subscription() from public;
grant execute on function public.ensure_user_subscription() to authenticated;

-- Backfill subscription rows for existing auth users
insert into public.user_subscriptions (
  user_id,
  status,
  trial_used,
  billing_email,
  trial_started_at,
  trial_ends_at
)
select
  u.id,
  'expired',
  false,
  lower(trim(u.email)),
  timezone('utc', now()),
  timezone('utc', now())
from auth.users u
where coalesce(u.email, '') <> ''
on conflict (user_id) do nothing;

insert into public.subscription_trial_claims (normalized_email, user_id)
select lower(trim(u.email)), u.id
from auth.users u
where coalesce(u.email, '') <> ''
on conflict (normalized_email) do nothing;
