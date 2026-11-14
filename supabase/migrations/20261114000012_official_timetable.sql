-- Official University timetable.
--
-- The University's published lecture timetable is shared data, kept apart from each student's personal study
-- plan (timetable_events / study_sessions). Students can read it but never change it; only administrators add,
-- correct, cancel or remove published sessions, and every change is written to an audit trail. Which published
-- sessions a student actually attends is private to that student (timetable_attendance), because the published
-- document does not say whether repeated sessions are alternative groups or additional classes.
--
-- Times are local Ghana times (Africa/Accra, GMT all year) stored as "time" and repeat weekly; no semester start,
-- end, examination or holiday dates are stored because none are published in the source.

-- ---------------------------------------------------------------------------
-- Sources: one row per published version of a programme's timetable
-- ---------------------------------------------------------------------------
create table public.timetable_sources (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title           text not null check (char_length(title) between 1 and 200),
  institution     text not null default 'University of Ghana' check (char_length(institution) <= 120),
  department      text not null default 'Department of Computer Science' check (char_length(department) <= 120),
  programme       text not null default 'MSc IT for Business' check (char_length(programme) <= 120),
  programme_code  text not null default 'ITB' check (char_length(programme_code) between 1 and 20),
  academic_year   text not null check (academic_year ~ '^[0-9]{4}/[0-9]{4}$'),
  semester        text not null check (char_length(semester) between 1 and 40),
  -- Every stored time is Ghana local time.
  time_zone       text not null default 'Africa/Accra' check (time_zone = 'Africa/Accra'),
  source_url      text check (source_url is null or source_url ~ '^https://'),
  source_note     text not null default '' check (char_length(source_note) <= 2000),
  version         integer not null default 1 check (version >= 1),
  revision        integer not null default 0 check (revision >= 0),
  is_current      boolean not null default false,
  published_at    timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);
-- At most one current version per programme and semester.
create unique index timetable_sources_one_current on public.timetable_sources (programme_code, academic_year, semester) where is_current;

-- ---------------------------------------------------------------------------
-- Published sessions (weekly recurring, day_of_week 0 = Sunday … 6 = Saturday, as in timetable_events)
-- ---------------------------------------------------------------------------
create table public.timetable_entries (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.timetable_sources (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete restrict,
  day_of_week     smallint not null check (day_of_week between 0 and 6),
  start_time      time not null,
  end_time        time not null,
  venue           text not null default '' check (char_length(venue) <= 120),
  status          text not null default 'scheduled' check (status in ('scheduled', 'rescheduled', 'cancelled', 'removed')),
  -- Whether the department has said who attends this session. Unknown until it is officially confirmed.
  allocation      text not null default 'pending_confirmation' check (allocation in ('pending_confirmation', 'all_students', 'group_specific')),
  allocation_note text not null default '' check (char_length(allocation_note) <= 500),
  notes           text not null default '' check (char_length(notes) <= 1000),
  -- The reason given for the latest change; copied into the audit trail.
  change_reason   text not null default '' check (char_length(change_reason) <= 500),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null,
  check (end_time > start_time)
);
create index timetable_entries_source_idx on public.timetable_entries (source_id, day_of_week, start_time);
create index timetable_entries_course_idx on public.timetable_entries (course_id);

-- ---------------------------------------------------------------------------
-- Audit trail and publications
-- ---------------------------------------------------------------------------
create table public.timetable_publications (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.timetable_sources (id) on delete cascade,
  revision     integer not null check (revision >= 0),
  summary      text not null check (char_length(summary) between 1 and 1000),
  changes      integer not null default 0 check (changes >= 0),
  notified     integer not null default 0 check (notified >= 0),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now()
);
create index timetable_publications_source_idx on public.timetable_publications (source_id, published_at desc);

create table public.timetable_entry_changes (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.timetable_sources (id) on delete cascade,
  entry_id       uuid references public.timetable_entries (id) on delete set null,
  change_type    text not null check (change_type in ('imported', 'added', 'updated', 'rescheduled', 'cancelled', 'removed', 'restored')),
  before         jsonb,
  after          jsonb,
  reason         text not null default '' check (char_length(reason) <= 500),
  changed_by     uuid references auth.users (id) on delete set null,
  changed_at     timestamptz not null default now(),
  -- Null until an administrator publishes the change to students. Imported rows are the original publication.
  publication_id uuid references public.timetable_publications (id) on delete set null
);
create index timetable_entry_changes_source_idx on public.timetable_entry_changes (source_id, changed_at desc);
create index timetable_entry_changes_entry_idx on public.timetable_entry_changes (entry_id);
create index timetable_entry_changes_publication_idx on public.timetable_entry_changes (publication_id);

-- ---------------------------------------------------------------------------
-- Private: which sessions a student attends, and their timetable preferences
-- ---------------------------------------------------------------------------
create table public.timetable_attendance (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id   uuid not null references public.timetable_entries (id) on delete cascade,
  -- No row means "awaiting confirmation".
  status     text not null check (status in ('awaiting', 'confirmed', 'not_assigned', 'cancelled')),
  note       text not null default '' check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);
create index timetable_attendance_entry_idx on public.timetable_attendance (entry_id);

create table public.timetable_preferences (
  user_id               uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  lecture_reminders     boolean not null default true,
  reminder_lead_minutes integer not null default 60 check (reminder_lead_minutes between 5 and 240),
  same_day_summary      boolean not null default true,
  change_alerts         boolean not null default true,
  show_only_confirmed   boolean not null default false,
  updated_at            timestamptz not null default now()
);

create trigger timetable_sources_updated_at before update on public.timetable_sources for each row execute function public.set_updated_at();
create trigger timetable_attendance_updated_at before update on public.timetable_attendance for each row execute function public.set_updated_at();
create trigger timetable_preferences_updated_at before update on public.timetable_preferences for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Entry triggers: stamp who changed it, require a reason, and record every change
-- ---------------------------------------------------------------------------
create or replace function public.timetable_entry_snapshot(e public.timetable_entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'course_id', e.course_id, 'day_of_week', e.day_of_week,
    'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
    'venue', e.venue, 'status', e.status, 'allocation', e.allocation, 'allocation_note', e.allocation_note, 'notes', e.notes
  );
$$;

create or replace function public.stamp_timetable_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.source_id <> old.source_id then
    raise exception 'A session cannot move to another timetable version' using errcode = '22023';
  end if;
  -- An administrator's change must say why; imports and the seed run without a signed-in user. The reason is cleared
  -- once it is in the audit trail (a nested update, depth > 1), so every later change needs a reason of its own.
  if (select auth.uid()) is not null and pg_trigger_depth() = 1
     and coalesce(current_setting('gradpath.timetable_import', true), '') <> 'on'
     and char_length(trim(new.change_reason)) = 0 then
    raise exception 'Give a reason for this timetable change' using errcode = '22023';
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger timetable_entries_stamp before insert or update on public.timetable_entries
  for each row execute function public.stamp_timetable_entry();

create or replace function public.log_timetable_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb := public.timetable_entry_snapshot(new);
  v_type   text;
begin
  if tg_op = 'INSERT' then
    v_type := case
      when (select auth.uid()) is null or coalesce(current_setting('gradpath.timetable_import', true), '') = 'on' then 'imported'
      else 'added' end;
  else
    v_before := public.timetable_entry_snapshot(old);
    if v_before = v_after then
      return new;
    end if;
    v_type := case
      when new.status = 'removed' and old.status <> 'removed' then 'removed'
      when new.status = 'cancelled' and old.status <> 'cancelled' then 'cancelled'
      when new.status = 'rescheduled' and old.status <> 'rescheduled' then 'rescheduled'
      when new.status = 'scheduled' and old.status in ('cancelled', 'removed') then 'restored'
      else 'updated' end;
  end if;
  insert into public.timetable_entry_changes (source_id, entry_id, change_type, before, after, reason, changed_by)
  values (new.source_id, new.id, v_type, v_before, v_after, trim(new.change_reason), (select auth.uid()));
  -- The reason now lives in the audit trail; clear it on the row so it is never reused for the next change.
  if new.change_reason <> '' then
    update public.timetable_entries set change_reason = '' where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.log_timetable_entry_change() from public, anon, authenticated;
create trigger timetable_entries_audit after insert or update on public.timetable_entries
  for each row execute function public.log_timetable_entry_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.timetable_sources enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.timetable_publications enable row level security;
alter table public.timetable_entry_changes enable row level security;
alter table public.timetable_attendance enable row level security;
alter table public.timetable_preferences enable row level security;

-- Shared, read-only for students. No delete policies: sessions are removed by status so the history survives.
create policy "timetable_sources: read" on public.timetable_sources for select to authenticated using (true);
create policy "timetable_sources: admin insert" on public.timetable_sources for insert to authenticated with check ((select public.is_admin()));
create policy "timetable_sources: admin update" on public.timetable_sources for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "timetable_entries: read" on public.timetable_entries for select to authenticated
  using (status <> 'removed' or (select public.is_admin()));
create policy "timetable_entries: admin insert" on public.timetable_entries for insert to authenticated with check ((select public.is_admin()));
create policy "timetable_entries: admin update" on public.timetable_entries for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "timetable_publications: read" on public.timetable_publications for select to authenticated using (true);

-- Students see the original import and published changes; administrators also see changes awaiting publication.
create policy "timetable_entry_changes: read" on public.timetable_entry_changes for select to authenticated
  using (change_type = 'imported' or publication_id is not null or (select public.is_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['timetable_attendance', 'timetable_preferences'] loop
    execute format('create policy "%s: select own" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s: insert own" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s: update own" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s: delete own" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end;
$$;

-- The audit trail and publications are written only by the functions below.
revoke insert, update, delete on public.timetable_entry_changes, public.timetable_publications from anon, authenticated;
revoke insert, update, delete on public.timetable_sources, public.timetable_entries from anon;

-- ---------------------------------------------------------------------------
-- Notifications: lecture reminders and timetable changes
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'assignment_due', 'revision_due', 'study_reminder', 'assessment_result', 'announcement', 'system', 'lecture_reminder', 'timetable_change'
));

-- "19:30" -> "7:30 pm", the way the University publishes times.
create or replace function public.ghana_clock(p_time time)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(date '2000-01-01' + p_time, 'FMHH12:MI am');
$$;

-- Shared by the per-student and the scheduled versions. Only confirmed sessions trigger reminders: GradPath never
-- assumes a student attends a session they have not confirmed.
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
  select a.user_id, 'lecture_reminder',
         c.code || ' lecture at ' || public.ghana_clock(e.start_time),
         c.title || ' · ' || coalesce(nullif(e.venue, ''), 'venue not given') || ' · '
           || public.ghana_clock(e.start_time) || ' to ' || public.ghana_clock(e.end_time) || ' Ghana time.',
         '/timetable/official',
         'lecture:' || e.id || ':' || v_day
  from public.timetable_attendance a
  join public.timetable_entries e on e.id = a.entry_id
  join public.timetable_sources s on s.id = e.source_id and s.is_current
  join public.courses c on c.id = e.course_id
  left join public.timetable_preferences p on p.user_id = a.user_id
  where a.status = 'confirmed'
    and (p_user is null or a.user_id = p_user)
    and e.status in ('scheduled', 'rescheduled')
    and e.day_of_week = v_dow
    and coalesce(p.lecture_reminders, true)
    and e.start_time > v_time
    and e.start_time <= v_time + make_interval(mins => coalesce(p.reminder_lead_minutes, 60))
    and not exists (
      select 1 from public.course_enrolments en where en.user_id = a.user_id and en.course_id = e.course_id and en.status = 'dropped'
    )
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  -- One morning summary of the day's confirmed lectures.
  if v_time >= time '05:00' and v_time < time '12:00' then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select a.user_id, 'lecture_reminder',
           case when count(*) = 1 then 'You have 1 lecture today' else 'You have ' || count(*) || ' lectures today' end,
           string_agg(c.code || ' at ' || public.ghana_clock(e.start_time) || ' (' || coalesce(nullif(e.venue, ''), 'venue not given') || ')',
                      ', ' order by e.start_time) || '. Ghana time.',
           '/timetable/official',
           'lectures-today:' || v_day
    from public.timetable_attendance a
    join public.timetable_entries e on e.id = a.entry_id
    join public.timetable_sources s on s.id = e.source_id and s.is_current
    join public.courses c on c.id = e.course_id
    left join public.timetable_preferences p on p.user_id = a.user_id
    where a.status = 'confirmed'
      and (p_user is null or a.user_id = p_user)
      and e.status in ('scheduled', 'rescheduled')
      and e.day_of_week = v_dow
      and coalesce(p.same_day_summary, true)
      and not exists (
        select 1 from public.course_enrolments en where en.user_id = a.user_id and en.course_id = e.course_id and en.status = 'dropped'
      )
    group by a.user_id
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end if;
  return v_total;
end;
$$;
revoke all on function public.lecture_reminder_core(timestamptz, uuid) from public, anon, authenticated;

-- Called by the app when a student opens it: creates only their own reminders.
create or replace function public.generate_lecture_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return 0;
  end if;
  return public.lecture_reminder_core(p_now, (select auth.uid()));
end;
$$;
revoke all on function public.generate_lecture_notifications(timestamptz) from public, anon;
grant execute on function public.generate_lecture_notifications(timestamptz) to authenticated;

-- Ask the push Edge Function (if configured) to deliver timetable notifications created from p_since.
create or replace function public.push_timetable_notifications(p_since timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'streak_reminders_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'streak_reminders_secret';
  if v_url is not null and v_secret is not null then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('kind', 'timetable', 'since', p_since)
    );
  end if;
end;
$$;
revoke all on function public.push_timetable_notifications(timestamptz) from public, anon, authenticated;

-- Every 15 minutes: reminders for every student, then push to devices that allow browser notifications.
create or replace function public.queue_lecture_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now();
  v_count integer;
begin
  v_count := public.lecture_reminder_core(p_now, null);
  if v_count > 0 then
    perform public.push_timetable_notifications(v_since);
  end if;
  return v_count;
end;
$$;
revoke all on function public.queue_lecture_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_lecture_reminders(timestamptz) to service_role;

-- The Edge Function's view: unread timetable notifications created from p_since, one row per device.
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
  where n.kind in ('lecture_reminder', 'timetable_change')
    and n.created_at >= p_since
    and n.read_at is null
    and public.is_push_endpoint(s.endpoint);
$$;
revoke all on function public.timetable_push_targets(timestamptz) from public, anon, authenticated;
grant execute on function public.timetable_push_targets(timestamptz) to service_role;

select cron.schedule('gradpath-lecture-reminders', '*/15 * * * *', 'select public.queue_lecture_reminders()');

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
-- Publish the changes made since the last publication and notify the students who take an affected course
-- (respecting their "timetable change" preference). Returns the number of students notified.
create or replace function public.publish_timetable_changes(p_source_id uuid, p_summary text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_summary  text := trim(coalesce(p_summary, ''));
  v_changes  integer;
  v_courses  uuid[];
  v_revision integer;
  v_pub      uuid;
  v_notified integer;
begin
  if not public.is_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if char_length(v_summary) = 0 or char_length(v_summary) > 1000 then
    raise exception 'Describe the changes for students (up to 1000 characters)' using errcode = '22023';
  end if;

  select count(*) into v_changes
  from public.timetable_entry_changes
  where source_id = p_source_id and publication_id is null and change_type <> 'imported';
  if v_changes = 0 then
    raise exception 'There are no unpublished changes' using errcode = '22023';
  end if;

  select array_agg(distinct x.course_id) into v_courses
  from public.timetable_entry_changes c,
       lateral (values ((c.after ->> 'course_id')::uuid), ((c.before ->> 'course_id')::uuid)) as x(course_id)
  where c.source_id = p_source_id and c.publication_id is null and c.change_type <> 'imported' and x.course_id is not null;

  update public.timetable_sources
  set revision = revision + 1, last_updated_at = now(), updated_by = (select auth.uid())
  where id = p_source_id
  returning revision into v_revision;
  if v_revision is null then
    raise exception 'Timetable not found' using errcode = 'P0002';
  end if;

  insert into public.timetable_publications (source_id, revision, summary, changes, published_by)
  values (p_source_id, v_revision, v_summary, v_changes, (select auth.uid()))
  returning id into v_pub;

  update public.timetable_entry_changes
  set publication_id = v_pub
  where source_id = p_source_id and publication_id is null and change_type <> 'imported';

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select distinct e.user_id, 'timetable_change', 'Official timetable updated', left(v_summary, 1900), '/timetable/official',
         'timetable-change:' || v_pub
  from public.course_enrolments e
  left join public.timetable_preferences p on p.user_id = e.user_id
  where e.course_id = any (v_courses) and e.status <> 'dropped' and coalesce(p.change_alerts, true)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_notified = row_count;

  update public.timetable_publications set notified = v_notified where id = v_pub;
  if v_notified > 0 then
    perform public.push_timetable_notifications(now());
  end if;
  return v_notified;
end;
$$;
revoke all on function public.publish_timetable_changes(uuid, text) from public, anon;
grant execute on function public.publish_timetable_changes(uuid, text) to authenticated;

-- Import a revised official timetable as a new version. The previous version is kept (no longer current) with its
-- history; students' attendance choices stay on the old sessions, so they confirm the new ones again.
-- p_entries: [{"course_code": "CSIT 601", "day_of_week": 1, "start_time": "19:30", "end_time": "21:30", "venue": "..."}]
create or replace function public.import_timetable_version(p_source jsonb, p_entries jsonb, p_notify boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.timetable_sources;
  v_id       uuid;
  v_missing  text;
  v_count    integer;
begin
  if not public.is_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 or jsonb_array_length(p_entries) > 300 then
    raise exception 'Provide between 1 and 300 sessions' using errcode = '22023';
  end if;

  select string_agg(distinct x.course_code, ', ') into v_missing
  from jsonb_to_recordset(p_entries) as x(course_code text)
  where not exists (select 1 from public.courses c where c.code = x.course_code);
  if v_missing is not null then
    raise exception 'Unknown course code(s): %', v_missing using errcode = '22023';
  end if;

  select * into v_previous from public.timetable_sources
  where programme_code = coalesce(p_source ->> 'programme_code', 'ITB')
    and academic_year = p_source ->> 'academic_year'
    and semester = p_source ->> 'semester'
    and is_current;

  update public.timetable_sources set is_current = false where id = v_previous.id;

  insert into public.timetable_sources (slug, title, institution, department, programme, programme_code, academic_year, semester,
                                        source_url, source_note, version, is_current, updated_by)
  values (
    p_source ->> 'slug',
    p_source ->> 'title',
    coalesce(p_source ->> 'institution', v_previous.institution, 'University of Ghana'),
    coalesce(p_source ->> 'department', v_previous.department, 'Department of Computer Science'),
    coalesce(p_source ->> 'programme', v_previous.programme, 'MSc IT for Business'),
    coalesce(p_source ->> 'programme_code', 'ITB'),
    p_source ->> 'academic_year',
    p_source ->> 'semester',
    nullif(p_source ->> 'source_url', ''),
    coalesce(p_source ->> 'source_note', ''),
    coalesce(v_previous.version, 0) + 1,
    true,
    (select auth.uid())
  )
  returning id into v_id;

  perform set_config('gradpath.timetable_import', 'on', true);
  insert into public.timetable_entries (source_id, course_id, day_of_week, start_time, end_time, venue, sort_order, change_reason)
  select v_id, c.id, x.day_of_week, x.start_time, x.end_time, coalesce(x.venue, ''), x.ord::integer,
         'Imported with version ' || (coalesce(v_previous.version, 0) + 1)
  from jsonb_to_recordset(p_entries) with ordinality as x(course_code text, day_of_week smallint, start_time time, end_time time, venue text, ord bigint)
  join public.courses c on c.code = x.course_code;
  perform set_config('gradpath.timetable_import', 'off', true);

  if p_notify then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select distinct e.user_id, 'timetable_change', 'A revised official timetable is available',
           'Check your sessions and confirm the ones you attend again.', '/timetable/official', 'timetable-version:' || v_id
    from public.course_enrolments e
    join public.timetable_entries t on t.course_id = e.course_id and t.source_id = v_id
    left join public.timetable_preferences p on p.user_id = e.user_id
    where e.status <> 'dropped' and coalesce(p.change_alerts, true)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      perform public.push_timetable_notifications(now());
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.import_timetable_version(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.import_timetable_version(jsonb, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Provisional study plan, rearranged so no block falls inside (or within 30 minutes of) any published lecture
-- for the ITB Semester 1 courses. The app builds a fuller, lecture-aligned plan; this is the server fallback.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_timetable()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.timetable_events where user_id = v_user and is_provisional and kind <> 'lecture') then
    return 0;
  end if;

  insert into public.timetable_events (user_id, course_id, title, kind, recurrence, day_of_week, start_time, end_time, is_provisional, notes)
  select v_user, c.id, s.title, s.kind, 'weekly', s.dow, s.start_t::time, s.end_t::time, true,
         'Provisional study block, placed around the published lecture times. Adjust it to your confirmed sessions.'
  from (values
    ('CSIT 601', 'CSIT 601 Research Methods (preview before the lecture)', 'study', 1, '17:30', '19:00'),
    ('CSIT 617', 'CSIT 617 Professional & Ethical Issues in IT (preview)', 'study', 2, '17:30', '19:00'),
    ('CSIT 607', 'CSIT 607 AI for Business Systems (study)', 'study', 3, '05:30', '07:00'),
    ('CSIT 603', 'CSIT 603 Enterprise Systems & BPR (study)', 'study', 4, '05:30', '07:00'),
    ('CSIT 605', 'CSIT 605 Computer & Cybersecurity (study)', 'study', 5, '05:30', '07:00'),
    ('CSIT 613', 'CSIT 613 E-Business Platforms & FinTech (study)', 'study', 2, '05:30', '07:00'),
    ('CSIT 621', 'CSIT 621 Emerging Technologies (study and practical exercises)', 'study', 1, '05:30', '06:30'),
    ('CSIT 610', 'CSIT 610 Seminar (preparation and reading)', 'study', 6, '05:30', '06:30'),
    (null, 'General revision and mock examinations', 'revision', 0, '20:30', '22:00')
  ) as s(code, title, kind, dow, start_t, end_t)
  left join public.courses c on c.code = s.code
  where s.code is null or (
    c.id is not null and not exists (
      select 1 from public.course_enrolments e where e.user_id = v_user and e.course_id = c.id and e.status = 'dropped'
    )
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
