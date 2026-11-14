-- GradPath: a session whose allocation is confirmed for all students counts as confirmed for every student who
-- takes the course, unless the student has recorded a different choice. Matches effectiveAttendance() in the app.

-- The sessions on a given day that each student attends: their own confirmation, or a confirmed allocation they
-- have not overridden. Dropped courses never count.
create or replace function public.lecture_attendees(p_dow smallint, p_user uuid)
returns table (user_id uuid, entry_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select x.user_id, x.entry_id
  from (
    select a.user_id, a.entry_id
    from public.timetable_attendance a
    where a.status = 'confirmed'
    union
    select en.user_id, e.id
    from public.course_enrolments en
    join public.timetable_entries e on e.course_id = en.course_id and e.allocation = 'all_students'
    where not exists (select 1 from public.timetable_attendance a where a.user_id = en.user_id and a.entry_id = e.id)
  ) x
  join public.timetable_entries e on e.id = x.entry_id
  where e.day_of_week = p_dow
    and (p_user is null or x.user_id = p_user)
    and not exists (
      select 1 from public.course_enrolments en where en.user_id = x.user_id and en.course_id = e.course_id and en.status = 'dropped'
    );
$$;
revoke all on function public.lecture_attendees(smallint, uuid) from public, anon, authenticated;

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
  join public.courses c on c.id = e.course_id
  left join public.timetable_preferences p on p.user_id = t.user_id
  where e.status in ('scheduled', 'rescheduled')
    and coalesce(p.lecture_reminders, true)
    and e.start_time > v_time
    and e.start_time <= v_time + make_interval(mins => coalesce(p.reminder_lead_minutes, 60))
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
