-- Private learning records. Each row belongs to exactly one student (user_id) and is visible only to them.
-- Client-generated UUIDs are accepted on insert so that offline writes can be replayed idempotently.
-- Administrators have no policy on these tables: they cannot read students' private records.

-- ---------------------------------------------------------------------------
-- Lesson progress
-- ---------------------------------------------------------------------------
create table public.lesson_progress (
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id          uuid not null references public.lessons (id) on delete cascade,
  status             text not null default 'in_progress' check (status in ('not_started', 'in_progress', 'completed')),
  reading_percent    integer not null default 0 check (reading_percent between 0 and 100),
  time_spent_seconds integer not null default 0 check (time_spent_seconds >= 0),
  last_section       text check (last_section is null or char_length(last_section) <= 200),
  quiz_best_percent  numeric(5, 2),
  mastered_at        timestamptz,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_user_idx on public.lesson_progress (user_id, updated_at desc);

-- Enforces the completion rules on the server: opening a lesson never completes it, and completion
-- requires the configured reading progress (and a passing quiz when the lesson requires one).
-- quiz_best_percent and mastered_at are system-managed (written only by submit_attempt).
create or replace function public.enforce_lesson_progress()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_min_reading integer;
  v_requires_quiz boolean;
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.quiz_best_percent := null;
      new.mastered_at := null;
    end if;
    new.reading_percent := least(greatest(new.reading_percent, 0), 100);
  else
    if current_user = 'authenticated' then
      new.quiz_best_percent := old.quiz_best_percent;
      new.mastered_at := old.mastered_at;
      new.started_at := old.started_at;
    end if;
    new.reading_percent := greatest(old.reading_percent, least(new.reading_percent, 100));
    new.time_spent_seconds := greatest(old.time_spent_seconds, new.time_spent_seconds);
  end if;

  if new.status = 'not_started' and new.reading_percent > 0 then
    new.status := 'in_progress';
  end if;

  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    select l.min_reading_percent, l.requires_quiz_pass into v_min_reading, v_requires_quiz
    from public.lessons l where l.id = new.lesson_id;
    if new.reading_percent < v_min_reading then
      raise exception 'Read at least % percent of the lesson before marking it complete (currently % percent).',
        v_min_reading, new.reading_percent using errcode = 'P0001';
    end if;
    if v_requires_quiz and coalesce(new.quiz_best_percent, 0) < public.mastery_threshold() then
      raise exception 'Pass the lesson quiz (% percent or higher) before marking this lesson complete.',
        public.mastery_threshold() using errcode = 'P0001';
    end if;
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
create trigger lesson_progress_enforce before insert or update on public.lesson_progress
  for each row execute function public.enforce_lesson_progress();

-- ---------------------------------------------------------------------------
-- Notes and bookmarks
-- ---------------------------------------------------------------------------
create table public.student_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id  uuid references public.courses (id) on delete set null,
  module_id  uuid references public.course_modules (id) on delete set null,
  lesson_id  uuid references public.lessons (id) on delete set null,
  title      text not null default '' check (char_length(title) <= 200),
  body       text not null default '' check (char_length(body) <= 100000),
  tags       text[] not null default '{}',
  is_pinned  boolean not null default false,
  search     tsvector generated always as (
               to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(body, ''))
             ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index student_notes_user_idx on public.student_notes (user_id, updated_at desc);
create index student_notes_lesson_idx on public.student_notes (user_id, lesson_id);
create index student_notes_search_idx on public.student_notes using gin (search);

create table public.bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id   uuid references public.lessons (id) on delete cascade,
  resource_id uuid references public.lesson_resources (id) on delete cascade,
  note        text not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(lesson_id, resource_id) = 1),
  unique (user_id, lesson_id),
  unique (user_id, resource_id)
);
create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------
create table public.assignments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id        uuid references public.courses (id) on delete set null,
  title            text not null check (char_length(title) between 1 and 200),
  description      text not null default '' check (char_length(description) <= 20000),
  due_at           timestamptz,
  priority         text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status           text not null default 'not_started'
                   check (status in ('not_started', 'in_progress', 'submitted', 'completed')),
  notes            text not null default '' check (char_length(notes) <= 20000),
  attachment_paths text[] not null default '{}',
  submitted_at     timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index assignments_user_due_idx on public.assignments (user_id, due_at);

create or replace function public.stamp_assignment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'submitted' and new.submitted_at is null then new.submitted_at := now(); end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status in ('not_started', 'in_progress') then
    new.submitted_at := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger assignments_status_stamp before insert or update on public.assignments
  for each row execute function public.stamp_assignment_status();

-- ---------------------------------------------------------------------------
-- Timetable and study sessions
-- ---------------------------------------------------------------------------
-- Recurring weekly events (day_of_week 0 = Sunday … 6 = Saturday) or one-off events (event_date).
create table public.timetable_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id      uuid references public.courses (id) on delete set null,
  title          text not null check (char_length(title) between 1 and 200),
  kind           text not null default 'study' check (kind in ('study', 'lecture', 'revision', 'other')),
  recurrence     text not null default 'weekly' check (recurrence in ('weekly', 'once')),
  day_of_week    smallint check (day_of_week between 0 and 6),
  event_date     date,
  start_time     time not null,
  end_time       time not null,
  starts_on      date,
  ends_on        date,
  location       text not null default '' check (char_length(location) <= 200),
  notes          text not null default '' check (char_length(notes) <= 2000),
  is_provisional boolean not null default false,
  time_zone      text not null default 'Africa/Accra',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_time > start_time),
  check ((recurrence = 'weekly' and day_of_week is not null) or (recurrence = 'once' and event_date is not null)),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index timetable_events_user_idx on public.timetable_events (user_id);

-- A concrete study session. Sessions linked to a timetable occurrence are unique per (event, date),
-- which prevents duplicates when offline changes are synchronised more than once.
create table public.study_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id          uuid references public.courses (id) on delete set null,
  timetable_event_id uuid references public.timetable_events (id) on delete set null,
  occurrence_date    date,
  title              text not null check (char_length(title) between 1 and 200),
  planned_start      timestamptz not null,
  planned_end        timestamptz not null,
  status             text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'cancelled')),
  actual_minutes     integer check (actual_minutes is null or actual_minutes between 0 and 1440),
  completed_at       timestamptz,
  notes              text not null default '' check (char_length(notes) <= 5000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (planned_end > planned_start),
  check (timetable_event_id is null or occurrence_date is not null),
  unique (timetable_event_id, occurrence_date)
);
create index study_sessions_user_start_idx on public.study_sessions (user_id, planned_start);

create or replace function public.stamp_study_session()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if new.completed_at is null then new.completed_at := now(); end if;
    if new.actual_minutes is null then
      new.actual_minutes := greatest(0, round(extract(epoch from (new.planned_end - new.planned_start)) / 60)::integer);
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger study_sessions_stamp before insert or update on public.study_sessions
  for each row execute function public.stamp_study_session();

-- ---------------------------------------------------------------------------
-- Flashcards and spaced repetition
-- ---------------------------------------------------------------------------
-- user_id null = curriculum card (shared, admin-managed); otherwise a student's own card.
create table public.flashcards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,
  course_id    uuid references public.courses (id) on delete cascade,
  module_id    uuid references public.course_modules (id) on delete set null,
  lesson_id    uuid references public.lessons (id) on delete set null,
  front        text not null check (char_length(front) between 1 and 2000),
  back         text not null check (char_length(back) between 1 and 4000),
  source       text not null default 'student' check (source in ('lecturer', 'institutional', 'supplementary', 'ai_practice', 'student')),
  external_ref text unique,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (user_id is not null or course_id is not null)
);
create index flashcards_user_idx on public.flashcards (user_id);
create index flashcards_lesson_idx on public.flashcards (lesson_id);
create index flashcards_course_idx on public.flashcards (course_id);

-- A revision item is something the student is scheduled to revisit: a lesson, a flashcard or a free topic.
create table public.revision_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type        text not null check (item_type in ('lesson', 'flashcard', 'topic')),
  course_id        uuid references public.courses (id) on delete cascade,
  lesson_id        uuid references public.lessons (id) on delete cascade,
  flashcard_id     uuid references public.flashcards (id) on delete cascade,
  topic            text check (topic is null or char_length(topic) <= 200),
  reason           text not null default '' check (char_length(reason) <= 500),
  ease_factor      numeric(4, 2) not null default 2.5 check (ease_factor between 1.3 and 3.5),
  interval_days    numeric(7, 2) not null default 0 check (interval_days >= 0),
  repetitions      integer not null default 0 check (repetitions >= 0),
  lapses           integer not null default 0 check (lapses >= 0),
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  status           text not null default 'learning' check (status in ('learning', 'review', 'mastered', 'suspended')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (
    (item_type = 'lesson' and lesson_id is not null) or
    (item_type = 'flashcard' and flashcard_id is not null) or
    (item_type = 'topic' and topic is not null)
  ),
  unique (user_id, lesson_id),
  unique (user_id, flashcard_id)
);
create index revision_items_due_idx on public.revision_items (user_id, status, due_at);

create table public.revision_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  revision_item_id  uuid not null references public.revision_items (id) on delete cascade,
  rating            text not null check (rating in ('again', 'hard', 'good', 'easy')),
  previous_interval numeric(7, 2) not null default 0,
  new_interval      numeric(7, 2) not null default 0,
  ease_factor       numeric(4, 2) not null default 2.5,
  reviewed_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index revision_reviews_user_idx on public.revision_reviews (user_id, reviewed_at desc);
create index revision_reviews_item_idx on public.revision_reviews (revision_item_id);

-- ---------------------------------------------------------------------------
-- Notifications (in-app)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('assignment_due', 'revision_due', 'study_reminder', 'assessment_result', 'announcement', 'system')),
  title      text not null check (char_length(title) between 1 and 200),
  body       text not null default '' check (char_length(body) <= 2000),
  link       text check (link is null or link ~ '^/'),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger student_notes_updated_at before update on public.student_notes for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments for each row execute function public.set_updated_at();
create trigger timetable_events_updated_at before update on public.timetable_events for each row execute function public.set_updated_at();
create trigger study_sessions_updated_at before update on public.study_sessions for each row execute function public.set_updated_at();
create trigger flashcards_updated_at before update on public.flashcards for each row execute function public.set_updated_at();
create trigger revision_items_updated_at before update on public.revision_items for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: owner-only access on every private table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'lesson_progress', 'student_notes', 'bookmarks', 'assignments', 'timetable_events',
    'study_sessions', 'revision_items', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: select own" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s: insert own" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s: update own" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s: delete own" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end;
$$;

-- Review history is append-only for the student.
alter table public.revision_reviews enable row level security;
create policy "revision_reviews: select own" on public.revision_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy "revision_reviews: insert own" on public.revision_reviews
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.revision_items i where i.id = revision_item_id and i.user_id = (select auth.uid()))
  );

-- Flashcards: students see published curriculum cards and their own cards; they manage only their own.
alter table public.flashcards enable row level security;
create policy "flashcards: read curriculum or own" on public.flashcards
  for select to authenticated using (
    user_id = (select auth.uid()) or (user_id is null and is_published) or (user_id is null and public.is_admin())
  );
create policy "flashcards: insert own or admin curriculum" on public.flashcards
  for insert to authenticated with check (
    (user_id = (select auth.uid()) and source = 'student') or (user_id is null and public.is_admin())
  );
create policy "flashcards: update own or admin curriculum" on public.flashcards
  for update to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and public.is_admin()))
  with check ((user_id = (select auth.uid()) and source = 'student') or (user_id is null and public.is_admin()));
create policy "flashcards: delete own or admin curriculum" on public.flashcards
  for delete to authenticated using (user_id = (select auth.uid()) or (user_id is null and public.is_admin()));

-- ---------------------------------------------------------------------------
-- Student-callable functions (SECURITY INVOKER: they run under the caller's RLS)
-- ---------------------------------------------------------------------------

-- Enrol the student in every published course; recommended electives start as pending confirmation.
create or replace function public.enrol_default_courses()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with inserted as (
    insert into public.course_enrolments (user_id, course_id, status)
    select (select auth.uid()), c.id,
           case when c.status = 'recommended_elective' then 'pending_confirmation' else 'enrolled' end
    from public.courses c
    where c.is_published
    on conflict (user_id, course_id) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$$;

-- Create the provisional weekly study timetable (not an official lecture timetable). Idempotent.
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
  if exists (select 1 from public.timetable_events where user_id = v_user and is_provisional) then
    return 0;
  end if;

  insert into public.timetable_events (user_id, course_id, title, kind, recurrence, day_of_week, start_time, end_time, is_provisional, notes)
  select v_user, c.id, s.title, s.kind, 'weekly', s.dow, s.start_t::time, s.end_t::time, true,
         'Provisional study block. Replace with your official lecture timetable when available.'
  from (values
    ('CSIT 601', 'CSIT 601 Research Methods — study', 'study', 1, '14:00', '16:00'),
    ('CSIT 603', 'CSIT 603 Enterprise Systems & BPR — study', 'study', 2, '14:00', '16:00'),
    ('CSIT 605', 'CSIT 605 Computer & Cybersecurity — study', 'study', 3, '14:00', '16:00'),
    ('CSIT 607', 'CSIT 607 AI for Business Systems — study', 'study', 4, '14:00', '16:00'),
    ('CSIT 613', 'CSIT 613 E-Business Platforms & FinTech — study', 'study', 5, '13:00', '14:30'),
    ('CSIT 617', 'CSIT 617 Professional & Ethical Issues in IT — study', 'study', 5, '14:30', '16:00'),
    ('CSIT 621', 'CSIT 621 Emerging Technologies — study and practical exercises', 'study', 6, '09:00', '12:00'),
    (null, 'General revision and mock examinations', 'revision', 0, '15:00', '17:00')
  ) as s(code, title, kind, dow, start_t, end_t)
  left join public.courses c on c.code = s.code;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Create in-app reminders for upcoming assignment deadlines and due revision. Idempotent via dedupe_key.
create or replace function public.generate_due_notifications()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_total integer := 0;
  v_count integer;
begin
  if v_user is null then
    return 0;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select v_user, 'assignment_due',
         'Assignment due soon: ' || left(a.title, 150),
         'Due ' || to_char(a.due_at at time zone 'Africa/Accra', 'Dy DD Mon, HH24:MI') || ' (Accra time).',
         '/assignments',
         'assignment-due:' || a.id || ':' || to_char(a.due_at, 'YYYYMMDD')
  from public.assignments a
  where a.user_id = v_user
    and a.status in ('not_started', 'in_progress')
    and a.due_at between now() and now() + interval '48 hours'
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select v_user, 'revision_due',
         count(*) || case when count(*) = 1 then ' revision item is due today' else ' revision items are due today' end,
         'Short, regular retrieval practice strengthens long-term memory.',
         '/revision',
         'revision-due:' || to_char(now() at time zone 'Africa/Accra', 'YYYYMMDD')
  from public.revision_items r
  where r.user_id = v_user and r.status <> 'suspended' and r.due_at <= now()
  having count(*) > 0
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

-- Dates (Accra time) on which the student did any recorded learning activity, for streaks and charts.
create or replace function public.activity_days(p_since date default (current_date - 120))
returns table (day date, activities integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select d::date as day, count(*)::integer as activities
  from (
    select (completed_at at time zone 'Africa/Accra')::date as d from public.study_sessions
      where user_id = (select auth.uid()) and status = 'completed' and completed_at is not null
    union all
    select (updated_at at time zone 'Africa/Accra')::date from public.lesson_progress
      where user_id = (select auth.uid())
    union all
    select (reviewed_at at time zone 'Africa/Accra')::date from public.revision_reviews
      where user_id = (select auth.uid())
  ) a
  where d >= p_since
  group by d
  order by d;
$$;

-- Fan out a notification to every student when an announcement is published.
create or replace function public.announce_to_students()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select p.id, 'announcement', left(new.title, 200), left(new.body, 280), '/announcements', 'announcement:' || new.id
    from public.profiles p
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger announcements_fan_out after insert or update of is_published on public.announcements
  for each row execute function public.announce_to_students();
