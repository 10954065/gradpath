-- GradPath: a private calendar subscription. A student can create a secret link that calendar apps (Google, Apple,
-- Outlook) poll for their lectures, planner blocks and examinations. The link carries a random 64-character token;
-- anyone holding it can read that student's calendar and nothing else, so the student can replace or delete it.

create table public.calendar_feeds (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
create policy "calendar_feeds: select own" on public.calendar_feeds for select to authenticated using (user_id = (select auth.uid()));
-- Written only by the functions below.
revoke insert, update, delete on public.calendar_feeds from anon, authenticated;
revoke all on public.calendar_feeds from anon;

-- Creates the student's link, or replaces it (the old link stops working). 244 random bits from two v4 UUIDs.
create or replace function public.create_calendar_feed()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to create a calendar link' using errcode = 'P0001';
  end if;
  insert into public.calendar_feeds (user_id, token) values ((select auth.uid()), v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return v_token;
end;
$$;
revoke all on function public.create_calendar_feed() from public, anon;
grant execute on function public.create_calendar_feed() to authenticated;

create or replace function public.delete_calendar_feed()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.calendar_feeds where user_id = (select auth.uid());
$$;
revoke all on function public.delete_calendar_feed() from public, anon;
grant execute on function public.delete_calendar_feed() to authenticated;

-- The calendar behind a token: the official lectures the student attends, their own planner blocks and their upcoming
-- examinations. Null for an unknown or malformed token. Called by the calendar endpoint with the public key.
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select f.user_id into v_user from public.calendar_feeds f where f.token = p_token;
  if v_user is null then
    return null;
  end if;
  return jsonb_build_object(
    'lecturesStartOn', (
      select s.teaching_started_on from public.timetable_sources s where s.is_current order by s.published_at desc limit 1
    ),
    'lectures', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'code', c.code, 'title', c.title, 'day_of_week', e.day_of_week,
               'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'), 'venue', e.venue)
             order by e.day_of_week, e.start_time)
      from generate_series(0, 6) d
      cross join lateral public.lecture_attendees(d::smallint, v_user) t
      join public.timetable_entries e on e.id = t.entry_id
      join public.timetable_sources s on s.id = e.source_id and s.is_current
      join public.courses c on c.id = e.course_id
      where e.status in ('scheduled', 'rescheduled')
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ev.id, 'title', ev.title, 'kind', ev.kind, 'recurrence', ev.recurrence, 'day_of_week', ev.day_of_week,
               'event_date', ev.event_date, 'start_time', to_char(ev.start_time, 'HH24:MI'), 'end_time', to_char(ev.end_time, 'HH24:MI'),
               'starts_on', ev.starts_on, 'ends_on', ev.ends_on, 'created_on', (ev.created_at at time zone 'Africa/Accra')::date,
               'location', ev.location, 'notes', ev.notes))
      from public.timetable_events ev
      where ev.user_id = v_user
    ), '[]'::jsonb),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'due_at', a.due_at, 'description', a.description))
      from public.assignments a
      where a.user_id = v_user and a.kind = 'examination' and a.due_at is not null and a.status not in ('submitted', 'completed')
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
