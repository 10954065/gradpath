-- GradPath: after-lecture check-ins. After each official lecture a student records whether they attended, which
-- lessons the lecture covered and which of them they want to review. The records are private to the student; the
-- lessons covered show how far the lectures have gone, so the app can tell the student whether they are ahead of
-- them or behind. A check-in prompt is sent when a lecture ends, until the student checks in.

create table public.lecture_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id           uuid not null references public.timetable_entries (id) on delete cascade,
  -- Copied from the session by the trigger below; never taken from the client.
  course_id          uuid not null references public.courses (id) on delete cascade,
  held_on            date not null check (held_on between date '2020-01-01' and date '2100-12-31'),
  attendance         text not null check (attendance in ('attended', 'missed', 'cancelled')),
  covered_lesson_ids uuid[] not null default '{}' check (cardinality(covered_lesson_ids) <= 40),
  -- Lessons the student found unclear; always a subset of the lessons covered.
  review_lesson_ids  uuid[] not null default '{}' check (cardinality(review_lesson_ids) <= 40),
  note               text not null default '' check (char_length(note) <= 5000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, entry_id, held_on)
);
create index lecture_logs_user_course_idx on public.lecture_logs (user_id, course_id, held_on desc);
create index lecture_logs_entry_idx on public.lecture_logs (entry_id);

-- Keeps a check-in consistent with the published session: the right course, a day the session is held on and not
-- before lectures began, and lessons from that course only.
create or replace function public.check_lecture_log()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_course   uuid;
  v_dow      smallint;
  v_started  date;
begin
  select e.course_id, e.day_of_week, s.teaching_started_on into v_course, v_dow, v_started
  from public.timetable_entries e
  join public.timetable_sources s on s.id = e.source_id
  where e.id = new.entry_id;
  if v_course is null then
    raise exception 'This lecture is not on the official timetable' using errcode = '22023';
  end if;
  if extract(dow from new.held_on)::smallint <> v_dow then
    raise exception 'This lecture is not held on that day' using errcode = '22023';
  end if;
  if v_started is not null and new.held_on < v_started then
    raise exception 'Lectures had not begun on that day' using errcode = '22023';
  end if;

  new.course_id := v_course;
  if new.attendance = 'cancelled' then
    new.covered_lesson_ids := '{}';
    new.review_lesson_ids := '{}';
  end if;
  new.covered_lesson_ids := array(select distinct x from unnest(new.covered_lesson_ids) x);
  new.review_lesson_ids := array(select distinct x from unnest(new.review_lesson_ids) x);
  if not new.review_lesson_ids <@ new.covered_lesson_ids then
    raise exception 'Only lessons the lecture covered can be marked for review' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(new.covered_lesson_ids) x
    where not exists (
      select 1 from public.lessons l join public.course_modules m on m.id = l.module_id where l.id = x and m.course_id = v_course
    )
  ) then
    raise exception 'Choose lessons from this course only' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger lecture_logs_check before insert or update on public.lecture_logs
  for each row execute function public.check_lecture_log();

alter table public.lecture_logs enable row level security;
create policy "lecture_logs: select own" on public.lecture_logs for select to authenticated using (user_id = (select auth.uid()));
create policy "lecture_logs: insert own" on public.lecture_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "lecture_logs: update own" on public.lecture_logs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "lecture_logs: delete own" on public.lecture_logs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.lecture_logs from anon;

-- Lecture reminders as before, plus a check-in prompt in the three hours after each lecture ends, until the
-- student has checked in for it.
create or replace function public.lecture_reminder_core(p_now timestamptz, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Africa/Accra';
  v_day   date := v_local::date;
  v_dow   smallint := extract(dow from v_local)::smallint;
  v_time  time := v_local::time;
  v_total integer := 0;
  v_count integer;
begin
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select t.user_id, 'lecture_reminder',
         c.code || ' lecture at ' || public.ghana_clock(e.start_time),
         c.title || ' · ' || coalesce(nullif(e.venue, ''), 'venue not given') || ' · '
           || public.ghana_clock(e.start_time) || ' to ' || public.ghana_clock(e.end_time) || ' Ghana time.',
         '/timetable/official',
         'lecture:' || e.id || ':' || v_day
  from public.lecture_attendees(v_dow, p_user) t
  join public.timetable_entries e on e.id = t.entry_id
  join public.timetable_sources s on s.id = e.source_id and s.is_current
    and (s.teaching_started_on is null or v_day >= s.teaching_started_on)
  join public.courses c on c.id = e.course_id
  left join public.timetable_preferences p on p.user_id = t.user_id
  where e.status in ('scheduled', 'rescheduled')
    and coalesce(p.lecture_reminders, true)
    and e.start_time > v_time
    and e.start_time <= v_time + make_interval(mins => coalesce(p.reminder_lead_minutes, 60))
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  -- After the lecture: ask what it covered.
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select t.user_id, 'lecture_reminder',
         'How did ' || c.code || ' go?',
         'Check in: did you attend, what did the lecture cover, and is there anything to review?',
         '/lectures',
         'checkin:' || e.id || ':' || v_day
  from public.lecture_attendees(v_dow, p_user) t
  join public.timetable_entries e on e.id = t.entry_id
  join public.timetable_sources s on s.id = e.source_id and s.is_current
    and (s.teaching_started_on is null or v_day >= s.teaching_started_on)
  join public.courses c on c.id = e.course_id
  left join public.timetable_preferences p on p.user_id = t.user_id
  where e.status in ('scheduled', 'rescheduled')
    and coalesce(p.lecture_reminders, true)
    and e.end_time <= v_time
    -- Elapsed time, not end_time + 3 hours: "time" wraps at midnight, which would shut out evening lectures.
    and v_time - e.end_time < interval '3 hours'
    and not exists (
      select 1 from public.lecture_logs g where g.user_id = t.user_id and g.entry_id = e.id and g.held_on = v_day
    )
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  -- One morning summary of the day's confirmed lectures.
  if v_time >= time '05:00' and v_time < time '12:00' then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select t.user_id, 'lecture_reminder',
           case when count(*) = 1 then 'You have 1 lecture today' else 'You have ' || count(*) || ' lectures today' end,
           string_agg(c.code || ' at ' || public.ghana_clock(e.start_time) || ' (' || coalesce(nullif(e.venue, ''), 'venue not given') || ')',
                      ', ' order by e.start_time) || '. Ghana time.',
           '/timetable/official',
           'lectures-today:' || v_day
    from public.lecture_attendees(v_dow, p_user) t
    join public.timetable_entries e on e.id = t.entry_id
    join public.timetable_sources s on s.id = e.source_id and s.is_current
      and (s.teaching_started_on is null or v_day >= s.teaching_started_on)
    join public.courses c on c.id = e.course_id
    left join public.timetable_preferences p on p.user_id = t.user_id
    where e.status in ('scheduled', 'rescheduled')
      and coalesce(p.same_day_summary, true)
    group by t.user_id
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end if;
  return v_total;
end;
$$;
revoke all on function public.lecture_reminder_core(timestamptz, uuid) from public, anon, authenticated;
