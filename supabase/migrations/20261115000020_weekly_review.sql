-- GradPath: an end-of-week review. On the last evening of each student's study week (from 21:00 Ghana time) a short
-- summary arrives: hours studied against the weekly target, lessons completed, lectures checked in and the deadlines
-- of the coming week, linking to the Weekly Review page. The study week starts on the weekday the student's own
-- studies began, else the weekday lectures began, else Monday (as lib/semesterCalendar.ts).

alter table public.timetable_preferences add column weekly_review boolean not null default true;

-- "8.5", "15", "0": a number without trailing zeros.
create or replace function public.short_number(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_value = trunc(p_value) then trunc(p_value)::bigint::text else (round(p_value, 1))::text end;
$$;

-- The weekday (0 = Sunday) a student's study week starts on.
create or replace function public.study_week_start_dow(p_user uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select extract(dow from p.study_started_on)::smallint from public.profiles p where p.id = p_user and p.study_started_on is not null),
    (select extract(dow from s.teaching_started_on)::smallint from public.timetable_sources s
      where s.is_current and s.teaching_started_on is not null order by s.published_at desc limit 1),
    1::smallint
  );
$$;
revoke all on function public.study_week_start_dow(uuid) from public, anon, authenticated;

create or replace function public.weekly_review_core(p_now timestamptz, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Africa/Accra';
  v_day   date := v_local::date;
  v_dow   smallint := extract(dow from v_local)::smallint;
  v_count integer;
begin
  if v_local::time < time '21:00' then
    return 0;
  end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select p.id, 'study_reminder', 'Your week in review',
         'This week: ' || public.short_number(round(coalesce(m.minutes, 0) / 60.0, 1)) || ' of '
           || public.short_number(p.weekly_study_target_hours) || ' hours studied, '
           || l.lessons || case when l.lessons = 1 then ' lesson' else ' lessons' end || ' completed, '
           || g.checkins || case when g.checkins = 1 then ' lecture' else ' lectures' end || ' checked in. Coming up in the next 7 days: '
           || d.deadlines || case when d.deadlines = 1 then ' deadline.' else ' deadlines.' end,
         '/review',
         'weekly-review:' || (v_day - 6)
  from public.profiles p
  left join public.timetable_preferences tp on tp.user_id = p.id
  cross join lateral (
    select sum(s.actual_minutes) as minutes from public.study_sessions s
    where s.user_id = p.id and s.status = 'completed'
      and (s.planned_start at time zone 'Africa/Accra')::date between v_day - 6 and v_day
  ) m
  cross join lateral (
    select count(*) as lessons from public.lesson_progress lp
    where lp.user_id = p.id and lp.status = 'completed'
      and (lp.completed_at at time zone 'Africa/Accra')::date between v_day - 6 and v_day
  ) l
  cross join lateral (
    select count(*) as checkins from public.lecture_logs lg where lg.user_id = p.id and lg.held_on between v_day - 6 and v_day
  ) g
  cross join lateral (
    select count(*) as deadlines from public.assignments a
    where a.user_id = p.id and a.status not in ('submitted', 'completed') and a.due_at > p_now and a.due_at <= p_now + interval '7 days'
  ) d
  where p.onboarding_completed_at is not null
    and (p_user is null or p.id = p_user)
    and coalesce(tp.weekly_review, true)
    and v_dow = (public.study_week_start_dow(p.id) + 6) % 7
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.weekly_review_core(timestamptz, uuid) from public, anon, authenticated;

-- Called by the app when a student opens it: only their own review.
create or replace function public.generate_weekly_review(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return 0;
  end if;
  return public.weekly_review_core(p_now, (select auth.uid()));
end;
$$;
revoke all on function public.generate_weekly_review(timestamptz) from public, anon;
grant execute on function public.generate_weekly_review(timestamptz) to authenticated;

-- Every 15 minutes: reviews for every student whose week ends today, then push to devices that allow it.
create or replace function public.queue_weekly_reviews(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now();
  v_count integer;
begin
  v_count := public.weekly_review_core(p_now, null);
  if v_count > 0 then
    perform public.push_timetable_notifications(v_since);
  end if;
  return v_count;
end;
$$;
revoke all on function public.queue_weekly_reviews(timestamptz) from public, anon, authenticated;

-- Push delivery now includes the weekly review.
create or replace function public.timetable_push_targets(p_since timestamptz)
returns table (subscription_id uuid, endpoint text, p256dh text, auth text, title text, body text, link text, tag text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, n.title, n.body, coalesce(n.link, '/timetable/official'), n.dedupe_key
  from public.notifications n
  join public.student_preferences p on p.user_id = n.user_id and p.browser_notifications
  join public.push_subscriptions s on s.user_id = n.user_id
  where (n.kind in ('lecture_reminder', 'timetable_change') or (n.kind = 'study_reminder' and n.dedupe_key like 'weekly-review:%'))
    and n.created_at >= p_since
    and n.read_at is null
    and public.is_push_endpoint(s.endpoint);
$$;
revoke all on function public.timetable_push_targets(timestamptz) from public, anon, authenticated;
grant execute on function public.timetable_push_targets(timestamptz) to service_role;

select cron.schedule('gradpath-weekly-review', '*/15 * * * *', 'select public.queue_weekly_reviews()');
