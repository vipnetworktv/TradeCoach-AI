-- New accounts must complete PayPal setup; no local no-card trial.

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
