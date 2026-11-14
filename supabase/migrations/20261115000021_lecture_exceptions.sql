-- GradPath: one-off changes to a single lecture. A student records that one week's lecture is cancelled, or moved
-- to another day, time or room. The record is private to the student. Reminders, the morning summary, check-in
-- prompts and the calendar subscription all follow it; the app's planner, next session and check-ins do the same.

create table public.lecture_exceptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id    uuid not null references public.timetable_entries (id) on delete cascade,
  -- The date the lecture would normally be held.
  held_on     date not null check (held_on between date '2020-01-01' and date '2100-12-31'),
  status      text not null check (status in ('cancelled', 'moved')),
  moved_date  date check (moved_date is null or moved_date between date '2020-01-01' and date '2100-12-31'),
  moved_start time,
  moved_end   time,
  moved_venue text not null default '' check (char_length(moved_venue) <= 120),
  note        text not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, entry_id, held_on)
);
create index lecture_exceptions_user_idx on public.lecture_exceptions (user_id, held_on);
create index lecture_exceptions_moved_idx on public.lecture_exceptions (moved_date) where status = 'moved';

create or replace function public.check_lecture_exception()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dow     smallint;
  v_started date;
begin
  select e.day_of_week, s.teaching_started_on into v_dow, v_started
  from public.timetable_entries e join public.timetable_sources s on s.id = e.source_id
  where e.id = new.entry_id;
  if v_dow is null then
    raise exception 'This lecture is not on the official timetable' using errcode = 'P0001';
  end if;
  if extract(dow from new.held_on)::smallint <> v_dow then
    raise exception 'This lecture is not held on that day' using errcode = 'P0001';
  end if;
  if v_started is not null and new.held_on < v_started then
    raise exception 'Lectures have not begun on that day' using errcode = 'P0001';
  end if;
  if new.status = 'cancelled' then
    new.moved_date := null;
    new.moved_start := null;
    new.moved_end := null;
    new.moved_venue := '';
  elsif new.moved_date is null or new.moved_start is null or new.moved_end is null then
    raise exception 'Give the new day, start and end time' using errcode = 'P0001';
  elsif new.moved_end <= new.moved_start then
    raise exception 'The new end time must be after the start time' using errcode = 'P0001';
  end if;
  new.moved_venue := trim(new.moved_venue);
  new.updated_at := now();
  return new;
end;
$$;
create trigger lecture_exceptions_check before insert or update on public.lecture_exceptions
  for each row execute function public.check_lecture_exception();

alter table public.lecture_exceptions enable row level security;
create policy "lecture_exceptions: select own" on public.lecture_exceptions for select to authenticated using (user_id = (select auth.uid()));
create policy "lecture_exceptions: insert own" on public.lecture_exceptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "lecture_exceptions: update own" on public.lecture_exceptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "lecture_exceptions: delete own" on public.lecture_exceptions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.lecture_exceptions from anon;

-- The lectures each student actually has on a day: their weekly sessions from the day teaching begins, less the
-- ones they cancelled or moved away, plus the ones moved to this day. held_on is the lecture's normal date.
create or replace function public.lecture_occurrences(p_day date, p_user uuid)
returns table (user_id uuid, entry_id uuid, held_on date, start_time time, end_time time, venue text, moved boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.user_id, e.id, p_day, e.start_time, e.end_time, e.venue, false
  from public.lecture_attendees(extract(dow from p_day)::smallint, p_user) t
  join public.timetable_entries e on e.id = t.entry_id
  join public.timetable_sources s on s.id = e.source_id and s.is_current
    and (s.teaching_started_on is null or p_day >= s.teaching_started_on)
  where e.status in ('scheduled', 'rescheduled')
    and not exists (
      select 1 from public.lecture_exceptions x where x.user_id = t.user_id and x.entry_id = e.id and x.held_on = p_day
    )
  union all
  select x.user_id, e.id, x.held_on, x.moved_start, x.moved_end, coalesce(nullif(x.moved_venue, ''), e.venue), true
  from public.lecture_exceptions x
  join public.timetable_entries e on e.id = x.entry_id and e.status in ('scheduled', 'rescheduled')
  join public.timetable_sources s on s.id = e.source_id and s.is_current
  where x.status = 'moved'
    and x.moved_date = p_day
    and (p_user is null or x.user_id = p_user)
    and not exists (
      select 1 from public.course_enrolments en where en.user_id = x.user_id and en.course_id = e.course_id and en.status = 'dropped'
    );
$$;
revoke all on function public.lecture_occurrences(date, uuid) from public, anon, authenticated;

-- Reminders, check-in prompts and the morning summary, now from the day's actual lectures.
create or replace function public.lecture_reminder_core(p_now timestamptz, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Africa/Accra';
  v_day   date := v_local::date;
  v_time  time := v_local::time;
  v_total integer := 0;
  v_count integer;
begin
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select o.user_id, 'lecture_reminder',
         c.code || ' lecture at ' || public.ghana_clock(o.start_time) || case when o.moved then ' (moved)' else '' end,
         c.title || ' · ' || coalesce(nullif(o.venue, ''), 'venue not given') || ' · '
           || public.ghana_clock(o.start_time) || ' to ' || public.ghana_clock(o.end_time) || ' Ghana time.',
         '/timetable/official',
         'lecture:' || o.entry_id || ':' || v_day
  from public.lecture_occurrences(v_day, p_user) o
  join public.timetable_entries e on e.id = o.entry_id
  join public.courses c on c.id = e.course_id
  left join public.timetable_preferences p on p.user_id = o.user_id
  where coalesce(p.lecture_reminders, true)
    and o.start_time > v_time
    and o.start_time <= v_time + make_interval(mins => coalesce(p.reminder_lead_minutes, 60))
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select o.user_id, 'lecture_reminder',
         'How did ' || c.code || ' go?',
         'Check in: did you attend, what did the lecture cover, and is there anything to review?',
         '/lectures',
         'checkin:' || o.entry_id || ':' || o.held_on
  from public.lecture_occurrences(v_day, p_user) o
  join public.timetable_entries e on e.id = o.entry_id
  join public.courses c on c.id = e.course_id
  left join public.timetable_preferences p on p.user_id = o.user_id
  where coalesce(p.lecture_reminders, true)
    and o.end_time <= v_time
    -- Elapsed time, not end_time + 3 hours: "time" wraps at midnight, which would shut out evening lectures.
    and v_time - o.end_time < interval '3 hours'
    and not exists (
      select 1 from public.lecture_logs g where g.user_id = o.user_id and g.entry_id = o.entry_id and g.held_on = o.held_on
    )
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  if v_time >= time '05:00' and v_time < time '12:00' then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select o.user_id, 'lecture_reminder',
           case when count(*) = 1 then 'You have 1 lecture today' else 'You have ' || count(*) || ' lectures today' end,
           string_agg(c.code || ' at ' || public.ghana_clock(o.start_time) || ' (' || coalesce(nullif(o.venue, ''), 'venue not given') || ')',
                      ', ' order by o.start_time) || '. Ghana time.',
           '/timetable/official',
           'lectures-today:' || v_day
    from public.lecture_occurrences(v_day, p_user) o
    join public.timetable_entries e on e.id = o.entry_id
    join public.courses c on c.id = e.course_id
    left join public.timetable_preferences p on p.user_id = o.user_id
    where coalesce(p.same_day_summary, true)
    group by o.user_id
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end if;
  return v_total;
end;
$$;
revoke all on function public.lecture_reminder_core(timestamptz, uuid) from public, anon, authenticated;

-- The calendar subscription also carries the student's one-off changes.
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
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'entry_id', x.entry_id, 'held_on', x.held_on, 'status', x.status, 'moved_date', x.moved_date,
               'moved_start', to_char(x.moved_start, 'HH24:MI'), 'moved_end', to_char(x.moved_end, 'HH24:MI'),
               'moved_venue', x.moved_venue, 'note', x.note))
      from public.lecture_exceptions x
      where x.user_id = v_user
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
