-- GradPath: a student's own study start, separate from the day official lectures begin. A student can start
-- studying before teaching does; their study weeks start on the weekday they began and are numbered from it.
-- Official lectures are never shown or reminded before the day teaching begins.

alter table public.profiles
  add column study_started_on date
  check (study_started_on is null or study_started_on between date '2020-01-01' and date '2100-12-31');

-- 2026/2027 Semester 1 ITB: official lectures begin on Monday 16 November 2026; the sessions of the weekend before
-- are not held (confirmed by the student on 2026-11-14). Corrects the Friday 13 November date set by migration 14,
-- which was the day the student's own studies started.
update public.timetable_sources
set teaching_started_on = date '2026-11-16'
where slug = 'itb-2026-2027-semester-1' and teaching_started_on = date '2026-11-13';

-- Reminders only from the day lectures begin.
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
