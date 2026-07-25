-- PayPal billing fields and one-trial-per-email enforcement.

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

create policy "Users can read their own trial claim"
  on public.subscription_trial_claims
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
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
      timezone('utc', now()),
      timezone('utc', now())
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
    billing_email,
    trial_used
  )
  values (
    new.id,
    normalized,
    false
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
