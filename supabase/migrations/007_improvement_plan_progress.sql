create table if not exists public.improvement_plan_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_range text not null,
  plan_key text not null,
  completed_titles text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, analysis_range, plan_key)
);

create index if not exists improvement_plan_progress_user_idx
  on public.improvement_plan_progress (user_id, analysis_range);

alter table public.improvement_plan_progress enable row level security;

drop policy if exists "Users can read their improvement plan progress"
  on public.improvement_plan_progress;

create policy "Users can read their improvement plan progress"
  on public.improvement_plan_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their improvement plan progress"
  on public.improvement_plan_progress;

create policy "Users can insert their improvement plan progress"
  on public.improvement_plan_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their improvement plan progress"
  on public.improvement_plan_progress;

create policy "Users can update their improvement plan progress"
  on public.improvement_plan_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_improvement_plan_progress_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists improvement_plan_progress_set_updated_at
  on public.improvement_plan_progress;

create trigger improvement_plan_progress_set_updated_at
before update on public.improvement_plan_progress
for each row
execute function public.set_improvement_plan_progress_updated_at();
