-- Allow authenticated users to create their own subscription row when the
-- service role key is not available in the app server.

create policy "Users can insert their own subscription"
  on public.user_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own subscription checkout fields"
  on public.user_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
