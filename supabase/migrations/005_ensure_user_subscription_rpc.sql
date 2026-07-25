-- Creates or returns the current user's subscription row without needing the
-- service role key in the Next.js app.

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
