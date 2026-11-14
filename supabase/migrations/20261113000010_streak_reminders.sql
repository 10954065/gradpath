-- Streak reminders. Every evening at 18:00 Accra time (UTC), students whose flame is fading (a lesson
-- yesterday, none yet today) get an in-app notification, and those who turned on browser notifications also
-- get a Web Push notification on their devices, sent by the streak-reminders Edge Function.
--
-- One-off setup per hosted project, outside migrations (see docs/DEPLOYMENT.md):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/streak-reminders', 'streak_reminders_url');
-- Without it, the in-app reminders still work and no push is attempted.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Push subscriptions: one row per browser that allowed notifications.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) <= 1000),
  p256dh       text not null check (char_length(p256dh) <= 200),
  auth         text not null check (char_length(auth) <= 100),
  created_at   timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: select own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscriptions: delete own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
revoke insert, update on public.push_subscriptions from authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- The Edge Function posts to these endpoints, so only the browsers' real push services are accepted;
-- anything else could turn the function into a way to send requests to arbitrary servers.
create or replace function public.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(char_length(p_endpoint) <= 1000 and p_endpoint ~ ('^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com'
    || '|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'), false);
$$;

-- Save this browser's subscription for the signed-in student. A browser endpoint belongs to whoever subscribed
-- on it last, so a row left by another account on a shared device is replaced. At most 10 devices per student.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public.is_push_endpoint(p_endpoint) then
    raise exception 'This browser''s push service is not supported.' using errcode = 'P0001';
  end if;
  if coalesce(char_length(p_p256dh), 0) not between 1 and 200 or coalesce(char_length(p_auth), 0) not between 1 and 100 then
    raise exception 'Invalid push subscription keys.' using errcode = 'P0001';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (v_user, p_endpoint, p_p256dh, p_auth);
  delete from public.push_subscriptions
  where user_id = v_user
    and id not in (select id from public.push_subscriptions where user_id = v_user order by created_at desc limit 10);
end;
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Whose flame is fading on a given (Accra) day, and how long their streak is.
-- ---------------------------------------------------------------------------
create or replace function public.fading_streaks(p_today date)
returns table (user_id uuid, streak integer)
language sql
stable
set search_path = ''
as $$
  with days as (
    select distinct d.user_id, d.day
    from public.lesson_days d
    where d.day between p_today - 400 and p_today - 1
      and exists (select 1 from public.lesson_days y where y.user_id = d.user_id and y.day = p_today - 1)
      and not exists (select 1 from public.lesson_days t where t.user_id = d.user_id and t.day = p_today)
  ),
  runs as (
    select days.user_id, days.day, days.day - (row_number() over (partition by days.user_id order by days.day))::integer as grp
    from days
  ),
  last_run as (
    select runs.user_id, runs.grp from runs where runs.day = p_today - 1
  )
  select r.user_id, count(*)::integer
  from runs r
  join last_run l on l.user_id = r.user_id and l.grp = r.grp
  group by r.user_id;
$$;
revoke all on function public.fading_streaks(date) from public, anon, authenticated;
grant execute on function public.fading_streaks(date) to service_role;

-- Run by pg_cron. Creates the in-app reminders, then asks the Edge Function to send the push notifications.
create or replace function public.queue_streak_reminders(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := coalesce(p_today, (now() at time zone 'Africa/Accra')::date);
  v_count  integer;
  v_url    text;
  v_secret text;
begin
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select f.user_id, 'study_reminder', 'Your flame is fading',
         format('Take a lesson before midnight to keep your %s day streak alive.', f.streak),
         '/dashboard', 'streak:' || v_today
  from public.fading_streaks(v_today) f
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'streak_reminders_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'streak_reminders_secret';
  if v_count > 0 and v_url is not null and v_secret is not null then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('day', v_today)
    );
  end if;
  return v_count;
end;
$$;
revoke all on function public.queue_streak_reminders(date) from public, anon, authenticated;
grant execute on function public.queue_streak_reminders(date) to service_role;

-- The Edge Function's view: one row per device to notify, for students who allow browser notifications.
create or replace function public.streak_push_targets(p_today date)
returns table (subscription_id uuid, endpoint text, p256dh text, auth text, streak integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, f.streak
  from public.fading_streaks(p_today) f
  join public.student_preferences p on p.user_id = f.user_id and p.browser_notifications
  join public.push_subscriptions s on s.user_id = f.user_id
  where public.is_push_endpoint(s.endpoint);
$$;
revoke all on function public.streak_push_targets(date) from public, anon, authenticated;
grant execute on function public.streak_push_targets(date) to service_role;

-- The shared secret the cron sends to the Edge Function. Generated inside the database, never written anywhere.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'streak_reminders_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'streak_reminders_secret');
  end if;
end;
$$;

create or replace function public.streak_cron_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret <> '' and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'streak_reminders_secret'), false);
$$;
revoke all on function public.streak_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.streak_cron_secret_ok(text) to service_role;

select cron.schedule('gradpath-streak-reminders', '0 18 * * *', 'select public.queue_streak_reminders()');
