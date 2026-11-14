-- Semester 1 selection: course classification and credit slots, personal enrolment rules, the CSIT 610 seminar
-- tracker, assessment types on deadlines, mixed revision tests, and personalised mixed mock examinations.
--
-- Shared programme curriculum: public.courses (classification, credit_slots). Each student's own selection:
-- public.course_enrolments. Core, required and special-topic courses apply to every student; electives are
-- chosen by each student (enrolled, pending confirmation, or not taking).

-- ---------------------------------------------------------------------------
-- Courses: classification and credit slots
-- ---------------------------------------------------------------------------
alter table public.courses
  add column classification text not null default 'core'
    check (classification in ('core', 'required', 'special_topic', 'elective')),
  add column credit_slots integer not null default 3 check (credit_slots between 1 and 12);

update public.courses set classification = 'core', credit_slots = 3
  where code in ('CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 617');
update public.courses set classification = 'elective', credit_slots = 3, status = 'listed' where code = 'CSIT 613';
update public.courses set classification = 'special_topic', credit_slots = 1 where code = 'CSIT 621';

-- Compulsory courses are enrolled automatically; electives start as "pending confirmation" until the student
-- records their choice. Idempotent and never overwrites a status the student has already set, so it is safe to
-- call on every visit: a newly published compulsory course (such as CSIT 610) is added to each student's list.
create or replace function public.enrol_default_courses()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with inserted as (
    insert into public.course_enrolments (user_id, course_id, status)
    select (select auth.uid()), c.id,
           case when c.classification = 'elective' then 'pending_confirmation' else 'enrolled' end
    from public.courses c
    where c.is_published and (select auth.uid()) is not null
    on conflict (user_id, course_id) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$$;

-- ---------------------------------------------------------------------------
-- Seminar tracker (private). Students record their own topics, dates and feedback; GradPath sets none of them.
-- ---------------------------------------------------------------------------
create table public.seminar_presentations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id         uuid references public.courses (id) on delete set null,
  topic             text not null check (char_length(topic) between 3 and 300),
  status            text not null default 'exploring'
                    check (status in ('exploring', 'researching', 'drafting', 'rehearsing', 'presented')),
  presentation_date date,
  date_confirmed    boolean not null default false,
  checklist         text[] not null default '{}' check (cardinality(checklist) <= 20),
  feedback          text not null default '' check (char_length(feedback) <= 10000),
  notes             text not null default '' check (char_length(notes) <= 10000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index seminar_presentations_user_idx on public.seminar_presentations (user_id, presentation_date);
create trigger seminar_presentations_updated_at before update on public.seminar_presentations
  for each row execute function public.set_updated_at();

alter table public.seminar_presentations enable row level security;
create policy "seminar_presentations: select own" on public.seminar_presentations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "seminar_presentations: insert own" on public.seminar_presentations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "seminar_presentations: update own" on public.seminar_presentations
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "seminar_presentations: delete own" on public.seminar_presentations
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.seminar_presentations from anon;
grant select, insert, update, delete on public.seminar_presentations to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deadlines: what kind of assessment a dated item is (entered by the student from official information).
-- ---------------------------------------------------------------------------
alter table public.assignments
  add column kind text not null default 'assignment'
    check (kind in ('assignment', 'test', 'examination', 'presentation', 'project', 'other'));

-- ---------------------------------------------------------------------------
-- Mixed revision tests: short, untimed, randomised objective tests across a whole course.
-- ---------------------------------------------------------------------------
alter table public.quizzes drop constraint quizzes_kind_check;
alter table public.quizzes add constraint quizzes_kind_check
  check (kind in ('lesson_quiz', 'module_assessment', 'mock_exam', 'revision_test'));
alter table public.quizzes drop constraint quizzes_check;
alter table public.quizzes add constraint quizzes_check check (
  (kind = 'lesson_quiz' and lesson_id is not null) or
  (kind = 'module_assessment' and module_id is not null) or
  (kind = 'mock_exam' and (course_id is not null or cardinality(scope_course_ids) > 0)) or
  (kind = 'revision_test' and course_id is not null)
);

-- Start (or resume) an attempt. Same as before, plus: revision tests draw objective questions from the whole
-- course, and a mock examination that spans several courses only uses the courses the student is taking
-- (enrolled or pending confirmation), so a mixed mock never includes a course they do not take.
create or replace function public.start_attempt(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_quiz public.quizzes;
  v_attempt_id uuid;
  v_ids uuid[];
  v_submitted integer;
  v_scope uuid[];
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found or (not v_quiz.is_published and not public.is_admin()) then
    raise exception 'Assessment not found' using errcode = 'P0002';
  end if;

  select id into v_attempt_id from public.quiz_attempts
  where user_id = v_user and quiz_id = p_quiz_id and status = 'in_progress';
  if v_attempt_id is not null then
    return public.attempt_review(v_attempt_id) || jsonb_build_object('resumed', true);
  end if;

  select count(*) into v_submitted from public.quiz_attempts
  where user_id = v_user and quiz_id = p_quiz_id and status = 'submitted';
  if v_quiz.max_attempts is not null and v_submitted >= v_quiz.max_attempts then
    raise exception 'No attempts remaining for this assessment (% allowed).', v_quiz.max_attempts using errcode = 'P0001';
  end if;

  v_scope := v_quiz.scope_course_ids;
  if v_quiz.kind = 'mock_exam' and cardinality(v_scope) > 0
     and exists (select 1 from public.course_enrolments e where e.user_id = v_user) then
    select coalesce(array_agg(c), '{}') into v_scope
    from unnest(v_quiz.scope_course_ids) as c
    where exists (
      select 1 from public.course_enrolments e
      where e.user_id = v_user and e.course_id = c and e.status <> 'dropped'
    );
  end if;

  with scope as (
    select q.id, q.type, q.external_ref
    from public.quiz_questions q
    where q.is_published and (
      (v_quiz.kind = 'lesson_quiz' and q.lesson_id = v_quiz.lesson_id) or
      (v_quiz.kind = 'module_assessment' and q.module_id = v_quiz.module_id) or
      (v_quiz.kind = 'mock_exam' and (q.course_id = v_quiz.course_id or q.course_id = any (v_scope))) or
      (v_quiz.kind = 'revision_test' and q.course_id = v_quiz.course_id)
    )
  ),
  objective as (
    select s.id, row_number() over (order by case when v_quiz.randomize then random() end, s.external_ref, s.id) as rn
    from scope s
    where s.type in ('mcq', 'true_false', 'short_answer', 'scenario', 'matching')
  ),
  open_ended as (
    select s.id, row_number() over (order by random()) as rn
    from scope s
    where s.type in ('essay', 'case_analysis')
  ),
  chosen as (
    select o.id, o.rn as ord from objective o where v_quiz.question_count is null or o.rn <= v_quiz.question_count
    union all
    select e.id, 100000 + e.rn from open_ended e where e.rn <= v_quiz.open_ended_count
  )
  select array_agg(c.id order by c.ord) into v_ids from chosen c;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'This assessment has no published questions yet.' using errcode = 'P0001';
  end if;

  insert into public.quiz_attempts (user_id, quiz_id, question_ids, deadline_at)
  values (
    v_user, p_quiz_id, v_ids,
    case when v_quiz.time_limit_minutes is not null then now() + make_interval(mins => v_quiz.time_limit_minutes) end
  )
  returning id into v_attempt_id;

  return public.attempt_review(v_attempt_id) || jsonb_build_object('resumed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Provisional study plan: adds a CSIT 610 seminar preparation block and only creates blocks for courses the
-- student is taking. It is personal study time, never an official lecture timetable.
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
         'Provisional study block. Replace with your official lecture timetable when available.'
  from (values
    ('CSIT 601', 'CSIT 601 Research Methods (study)', 'study', 1, '14:00', '16:00'),
    ('CSIT 603', 'CSIT 603 Enterprise Systems & BPR (study)', 'study', 2, '14:00', '16:00'),
    ('CSIT 605', 'CSIT 605 Computer & Cybersecurity (study)', 'study', 3, '14:00', '16:00'),
    ('CSIT 607', 'CSIT 607 AI for Business Systems (study)', 'study', 4, '14:00', '16:00'),
    ('CSIT 613', 'CSIT 613 E-Business Platforms & FinTech (study)', 'study', 5, '13:00', '14:30'),
    ('CSIT 617', 'CSIT 617 Professional & Ethical Issues in IT (study)', 'study', 5, '14:30', '16:00'),
    ('CSIT 621', 'CSIT 621 Emerging Technologies (study and practical exercises)', 'study', 6, '09:00', '12:00'),
    ('CSIT 610', 'CSIT 610 Seminar (preparation and reading)', 'study', 6, '13:00', '14:00'),
    (null, 'General revision and mock examinations', 'revision', 0, '15:00', '17:00')
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
