-- Assessment engine: question bank, protected answer keys, quizzes/assessments/mock exams, attempts.
--
-- Integrity model
--   * Students can read published questions but never `question_keys` (no student policy).
--   * Attempts and answers are created and scored only by SECURITY DEFINER functions; students have
--     read-only access to their own attempts, so scores cannot be forged from the browser.
--   * All seeded questions are supplementary practice questions (source = 'ai_practice').

create table public.quiz_questions (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses (id) on delete cascade,
  module_id        uuid references public.course_modules (id) on delete cascade,
  lesson_id        uuid references public.lessons (id) on delete cascade,
  external_ref     text unique,
  type             text not null check (type in ('mcq', 'true_false', 'short_answer', 'scenario', 'matching', 'essay', 'case_analysis')),
  bloom            text not null default 'understand' check (bloom in ('recall', 'understand', 'apply', 'analyse', 'evaluate')),
  difficulty       text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  objective        text not null default '' check (char_length(objective) <= 300),
  prompt           text not null check (char_length(prompt) between 3 and 5000),
  scenario         text check (scenario is null or char_length(scenario) <= 5000),
  case_text        text check (case_text is null or char_length(case_text) <= 12000),
  -- mcq/scenario: [{id, text}]; matching: {left: [{id, text}], right: [{id, text}]} (right side pre-shuffled)
  options          jsonb,
  marks            numeric(5, 2) not null default 1 check (marks > 0),
  answer_structure text[] not null default '{}',
  rubric           jsonb not null default '[]'::jsonb check (jsonb_typeof(rubric) = 'array'),
  source           text not null default 'ai_practice' check (source in ('lecturer', 'institutional', 'supplementary', 'ai_practice')),
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index quiz_questions_lesson_idx on public.quiz_questions (lesson_id);
create index quiz_questions_module_idx on public.quiz_questions (module_id);
create index quiz_questions_course_idx on public.quiz_questions (course_id);

-- mcq/scenario: {"option": "b"}; true_false: {"value": true}; short_answer: {"answers": [...]};
-- matching: {"pairs": {"l1": "r3", ...}}; essay/case_analysis: {}.
create table public.question_keys (
  question_id  uuid primary key references public.quiz_questions (id) on delete cascade,
  correct      jsonb not null default '{}'::jsonb check (jsonb_typeof(correct) = 'object'),
  explanation  text not null default '',
  model_answer text
);

create table public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('lesson_quiz', 'module_assessment', 'mock_exam')),
  title              text not null check (char_length(title) between 3 and 200),
  description        text not null default '',
  instructions       text not null default '',
  course_id          uuid references public.courses (id) on delete cascade,
  module_id          uuid references public.course_modules (id) on delete cascade,
  lesson_id          uuid references public.lessons (id) on delete cascade,
  scope_course_ids   uuid[] not null default '{}',
  question_count     integer check (question_count is null or question_count between 1 and 200),
  open_ended_count   integer not null default 0 check (open_ended_count between 0 and 10),
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 300),
  randomize          boolean not null default true,
  max_attempts       integer check (max_attempts is null or max_attempts >= 1),
  pass_mark          integer check (pass_mark is null or pass_mark between 1 and 100),
  reveal_answers     text not null default 'after_submit' check (reveal_answers in ('after_submit', 'never')),
  is_published       boolean not null default false,
  sort_order         integer not null default 0,
  external_ref       text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (
    (kind = 'lesson_quiz' and lesson_id is not null) or
    (kind = 'module_assessment' and module_id is not null) or
    (kind = 'mock_exam' and (course_id is not null or cardinality(scope_course_ids) > 0))
  )
);
create index quizzes_scope_idx on public.quizzes (kind, course_id, module_id, lesson_id);

create table public.quiz_attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  quiz_id             uuid not null references public.quizzes (id) on delete cascade,
  status              text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  question_ids        uuid[] not null,
  started_at          timestamptz not null default now(),
  deadline_at         timestamptz,
  submitted_at        timestamptz,
  score               numeric(7, 2),
  max_score           numeric(7, 2),
  percent             numeric(5, 2),
  mastery_threshold   integer,
  passed              boolean,
  is_late             boolean not null default false,
  objective_breakdown jsonb not null default '[]'::jsonb,
  lesson_breakdown    jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now()
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, started_at desc);
create unique index quiz_attempts_one_open on public.quiz_attempts (user_id, quiz_id) where status = 'in_progress';

create table public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.quiz_attempts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  response    jsonb,
  is_correct  boolean,
  points      numeric(7, 2) not null default 0,
  max_points  numeric(7, 2) not null default 0,
  self_marks  numeric(7, 2),
  created_at  timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index quiz_answers_user_idx on public.quiz_answers (user_id);

create trigger quiz_questions_updated_at before update on public.quiz_questions for each row execute function public.set_updated_at();
create trigger quizzes_updated_at before update on public.quizzes for each row execute function public.set_updated_at();

-- Required entities expressed as views over the unified tables (security_invoker keeps RLS in force).
create view public.module_assessments with (security_invoker = true) as
  select * from public.quizzes where kind = 'module_assessment';
create view public.mock_exams with (security_invoker = true) as
  select * from public.quizzes where kind = 'mock_exam';
create view public.assessment_attempts with (security_invoker = true) as
  select a.* from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id where q.kind = 'module_assessment';
create view public.mock_exam_attempts with (security_invoker = true) as
  select a.* from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id where q.kind = 'mock_exam';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.quiz_questions enable row level security;
alter table public.question_keys enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;

create policy "questions: read published" on public.quiz_questions
  for select to authenticated using (is_published or public.is_admin());
create policy "questions: admin insert" on public.quiz_questions
  for insert to authenticated with check (public.is_admin());
create policy "questions: admin update" on public.quiz_questions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "questions: admin delete" on public.quiz_questions
  for delete to authenticated using (public.is_admin());

-- Answer keys: administrators only.
create policy "keys: admin read" on public.question_keys
  for select to authenticated using (public.is_admin());
create policy "keys: admin insert" on public.question_keys
  for insert to authenticated with check (public.is_admin());
create policy "keys: admin update" on public.question_keys
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "keys: admin delete" on public.question_keys
  for delete to authenticated using (public.is_admin());

create policy "quizzes: read published" on public.quizzes
  for select to authenticated using (is_published or public.is_admin());
create policy "quizzes: admin insert" on public.quizzes
  for insert to authenticated with check (public.is_admin());
create policy "quizzes: admin update" on public.quizzes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "quizzes: admin delete" on public.quizzes
  for delete to authenticated using (public.is_admin());

create policy "attempts: read own" on public.quiz_attempts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "answers: read own" on public.quiz_answers
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Scoring helpers
-- ---------------------------------------------------------------------------
create or replace function public.normalise_answer(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^[:alnum:]]+', ' ', 'g'));
$$;

-- Public (key-free) representation of a question.
create or replace function public.question_public_json(q public.quiz_questions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'type', q.type, 'bloom', q.bloom, 'difficulty', q.difficulty, 'objective', q.objective,
    'prompt', q.prompt, 'scenario', q.scenario, 'case', q.case_text, 'options', q.options,
    'marks', q.marks, 'structure', to_jsonb(q.answer_structure), 'rubric', q.rubric,
    'lessonId', q.lesson_id, 'moduleId', q.module_id, 'courseId', q.course_id, 'source', q.source
  );
$$;

create or replace function public.quiz_public_json(z public.quizzes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', z.id, 'kind', z.kind, 'title', z.title, 'description', z.description, 'instructions', z.instructions,
    'courseId', z.course_id, 'moduleId', z.module_id, 'lessonId', z.lesson_id,
    'timeLimitMinutes', z.time_limit_minutes, 'maxAttempts', z.max_attempts,
    'passMark', coalesce(z.pass_mark, public.mastery_threshold()), 'revealAnswers', z.reveal_answers
  );
$$;

-- Full review of an attempt. Correct answers, explanations and model answers are included only once the
-- attempt has been submitted and the quiz allows answers to be revealed.
create or replace function public.attempt_review(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_attempt public.quiz_attempts;
  v_quiz public.quizzes;
  v_reveal boolean;
  v_questions jsonb;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if not found or v_attempt.user_id is distinct from (select auth.uid()) then
    raise exception 'Attempt not found' using errcode = 'P0002';
  end if;
  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;
  v_reveal := v_attempt.status = 'submitted' and v_quiz.reveal_answers = 'after_submit';

  select coalesce(jsonb_agg(
           public.question_public_json(q)
           || jsonb_build_object(
                'response', a.response, 'isCorrect', a.is_correct, 'points', a.points,
                'maxPoints', a.max_points, 'selfMarks', a.self_marks)
           || case when v_reveal then jsonb_build_object(
                'correct', k.correct, 'explanation', k.explanation, 'modelAnswer', k.model_answer)
              else '{}'::jsonb end
           order by u.ord), '[]'::jsonb)
  into v_questions
  from unnest(v_attempt.question_ids) with ordinality as u(qid, ord)
  join public.quiz_questions q on q.id = u.qid
  left join public.quiz_answers a on a.attempt_id = v_attempt.id and a.question_id = q.id
  left join public.question_keys k on k.question_id = q.id;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id, 'quizId', v_attempt.quiz_id, 'status', v_attempt.status,
      'startedAt', v_attempt.started_at, 'deadlineAt', v_attempt.deadline_at, 'submittedAt', v_attempt.submitted_at,
      'score', v_attempt.score, 'maxScore', v_attempt.max_score, 'percent', v_attempt.percent,
      'masteryThreshold', v_attempt.mastery_threshold, 'passed', v_attempt.passed, 'isLate', v_attempt.is_late,
      'objectiveBreakdown', v_attempt.objective_breakdown, 'lessonBreakdown', v_attempt.lesson_breakdown),
    'quiz', public.quiz_public_json(v_quiz),
    'answersRevealed', v_reveal,
    'questions', v_questions
  );
end;
$$;

-- Start (or resume) an attempt. Questions are chosen on the server and returned without answer keys.
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

  with scope as (
    select q.id, q.type, q.external_ref
    from public.quiz_questions q
    where q.is_published and (
      (v_quiz.kind = 'lesson_quiz' and q.lesson_id = v_quiz.lesson_id) or
      (v_quiz.kind = 'module_assessment' and q.module_id = v_quiz.module_id) or
      (v_quiz.kind = 'mock_exam' and (q.course_id = v_quiz.course_id or q.course_id = any (v_quiz.scope_course_ids)))
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

-- Submit answers, score objective questions on the server and record mastery. Idempotent: submitting an
-- already-submitted attempt returns the stored result (safe for offline retries).
create or replace function public.submit_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_attempt public.quiz_attempts;
  v_quiz public.quizzes;
  v_grace integer;
  v_threshold integer;
  rec record;
  v_resp jsonb;
  v_points numeric;
  v_max numeric;
  v_correct boolean;
  v_hits integer;
  v_pairs integer;
  v_self numeric;
  v_score numeric := 0;
  v_total numeric := 0;
  v_percent numeric;
  v_passed boolean;
  v_objectives jsonb;
  v_lessons jsonb;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id for update;
  if not found or v_attempt.user_id <> v_user then
    raise exception 'Attempt not found' using errcode = 'P0002';
  end if;
  if v_attempt.status = 'submitted' then
    return public.attempt_review(p_attempt_id);
  end if;
  p_answers := coalesce(p_answers, '{}'::jsonb);
  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be a JSON object keyed by question id' using errcode = '22023';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;
  select coalesce(s.attempt_grace_seconds, 120) into v_grace from public.platform_settings s where s.id;
  v_threshold := coalesce(v_quiz.pass_mark, public.mastery_threshold());

  for rec in
    select q.id, q.type, q.marks, k.correct
    from unnest(v_attempt.question_ids) with ordinality as u(qid, ord)
    join public.quiz_questions q on q.id = u.qid
    left join public.question_keys k on k.question_id = q.id
    order by u.ord
  loop
    v_resp := p_answers -> rec.id::text;
    v_correct := null;
    v_points := 0;
    v_max := rec.marks;
    v_self := null;

    case rec.type
      when 'mcq', 'scenario' then
        v_correct := coalesce((v_resp ->> 'option') = (rec.correct ->> 'option'), false);
      when 'true_false' then
        v_correct := coalesce(jsonb_typeof(v_resp -> 'value') = 'boolean' and (v_resp -> 'value') = (rec.correct -> 'value'), false);
      when 'short_answer' then
        v_correct := public.normalise_answer(v_resp ->> 'text') <> '' and exists (
          select 1 from jsonb_array_elements_text(coalesce(rec.correct -> 'answers', '[]'::jsonb)) as acc(val)
          where public.normalise_answer(acc.val) = public.normalise_answer(v_resp ->> 'text')
        );
      when 'matching' then
        select count(*) filter (where (v_resp -> 'pairs' ->> e.key) = e.value), count(*)
        into v_hits, v_pairs
        from jsonb_each_text(coalesce(rec.correct -> 'pairs', '{}'::jsonb)) as e(key, value);
        v_points := case when v_pairs > 0 then round(rec.marks * v_hits / v_pairs, 2) else 0 end;
        v_correct := v_pairs > 0 and v_hits = v_pairs;
      else
        -- essay / case analysis: self-assessed against the rubric, excluded from the objective score.
        v_max := 0;
        if jsonb_typeof(v_resp -> 'selfMarks') = 'number' then
          v_self := least(greatest((v_resp ->> 'selfMarks')::numeric, 0), rec.marks);
        end if;
    end case;

    if rec.type in ('mcq', 'scenario', 'true_false', 'short_answer') then
      v_points := case when v_correct then rec.marks else 0 end;
    end if;

    insert into public.quiz_answers (attempt_id, user_id, question_id, response, is_correct, points, max_points, self_marks)
    values (p_attempt_id, v_user, rec.id, v_resp, v_correct, v_points, v_max, v_self)
    on conflict (attempt_id, question_id) do update
      set response = excluded.response, is_correct = excluded.is_correct, points = excluded.points,
          max_points = excluded.max_points, self_marks = excluded.self_marks;

    v_score := v_score + v_points;
    v_total := v_total + v_max;
  end loop;

  v_percent := case when v_total > 0 then round(100 * v_score / v_total, 2) end;
  v_passed := v_percent is not null and v_percent >= v_threshold;

  select coalesce(jsonb_agg(x.obj order by x.pct, x.objective), '[]'::jsonb) into v_objectives
  from (
    select q.objective, round(100 * sum(a.points) / nullif(sum(a.max_points), 0), 1) as pct,
           jsonb_build_object('objective', q.objective, 'lessonId', q.lesson_id, 'earned', sum(a.points),
                              'possible', sum(a.max_points),
                              'percent', round(100 * sum(a.points) / nullif(sum(a.max_points), 0), 1)) as obj
    from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    where a.attempt_id = p_attempt_id and a.max_points > 0
    group by q.objective, q.lesson_id
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.pct), '[]'::jsonb) into v_lessons
  from (
    select round(100 * sum(a.points) / nullif(sum(a.max_points), 0), 1) as pct,
           jsonb_build_object('lessonId', q.lesson_id, 'lessonTitle', l.title, 'earned', sum(a.points),
                              'possible', sum(a.max_points),
                              'percent', round(100 * sum(a.points) / nullif(sum(a.max_points), 0), 1)) as obj
    from public.quiz_answers a
    join public.quiz_questions q on q.id = a.question_id
    join public.lessons l on l.id = q.lesson_id
    where a.attempt_id = p_attempt_id and a.max_points > 0
    group by q.lesson_id, l.title
  ) x;

  update public.quiz_attempts set
    status = 'submitted',
    submitted_at = now(),
    score = v_score,
    max_score = v_total,
    percent = v_percent,
    mastery_threshold = v_threshold,
    passed = v_passed,
    is_late = deadline_at is not null and now() > deadline_at + make_interval(secs => v_grace),
    objective_breakdown = v_objectives,
    lesson_breakdown = v_lessons
  where id = p_attempt_id;

  -- Weak lessons (below the mastery threshold) are queued for revision immediately.
  insert into public.revision_items (user_id, item_type, course_id, lesson_id, reason, due_at, status)
  select v_user, 'lesson', m.course_id, lb.lesson_id,
         format('Scored %s%% on "%s" (target %s%%).', lb.pct, left(v_quiz.title, 120), v_threshold),
         now(), 'learning'
  from (
    select q.lesson_id, round(100 * sum(a.points) / nullif(sum(a.max_points), 0), 1) as pct
    from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    where a.attempt_id = p_attempt_id and a.max_points > 0 and q.lesson_id is not null
    group by q.lesson_id
  ) lb
  join public.lessons l on l.id = lb.lesson_id
  join public.course_modules m on m.id = l.module_id
  where lb.pct < v_threshold
  on conflict (user_id, lesson_id) do update set
    due_at = least(public.revision_items.due_at, now()),
    reason = excluded.reason,
    status = case when public.revision_items.status in ('mastered', 'suspended') then 'review' else public.revision_items.status end;

  if v_quiz.kind = 'lesson_quiz' and v_percent is not null then
    insert into public.lesson_progress (user_id, lesson_id, status, quiz_best_percent, mastered_at)
    values (v_user, v_quiz.lesson_id, 'in_progress', v_percent, case when v_passed then now() end)
    on conflict (user_id, lesson_id) do update set
      quiz_best_percent = greatest(coalesce(public.lesson_progress.quiz_best_percent, 0), excluded.quiz_best_percent),
      mastered_at = coalesce(public.lesson_progress.mastered_at, excluded.mastered_at);
  end if;

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (
    v_user, 'assessment_result',
    left(v_quiz.title, 150) || case when v_percent is null then ': submitted' else ': ' || v_percent || '%' end,
    case
      when v_percent is null then 'Compare your written answers with the rubric and model answer guidance.'
      when v_passed then 'Mastery achieved. This is a practice result, not an official university grade.'
      else format('Below the %s%% mastery target. Weak topics were added to your revision queue.', v_threshold)
    end,
    '/assessments/attempts/' || p_attempt_id,
    'attempt:' || p_attempt_id
  )
  on conflict (user_id, dedupe_key) do nothing;

  return public.attempt_review(p_attempt_id);
end;
$$;

-- Record a student's self-assessment of an essay/case answer against the rubric (never an official mark).
create or replace function public.record_self_assessment(p_attempt_id uuid, p_question_id uuid, p_marks numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marks numeric;
begin
  select q.marks into v_marks
  from public.quiz_answers a
  join public.quiz_attempts t on t.id = a.attempt_id
  join public.quiz_questions q on q.id = a.question_id
  where a.attempt_id = p_attempt_id and a.question_id = p_question_id
    and t.user_id = (select auth.uid()) and t.status = 'submitted'
    and q.type in ('essay', 'case_analysis');
  if v_marks is null then
    raise exception 'Answer not found' using errcode = 'P0002';
  end if;
  update public.quiz_answers
  set self_marks = least(greatest(p_marks, 0), v_marks)
  where attempt_id = p_attempt_id and question_id = p_question_id;
end;
$$;

revoke all on function public.attempt_review(uuid) from public, anon;
revoke all on function public.start_attempt(uuid) from public, anon;
revoke all on function public.submit_attempt(uuid, jsonb) from public, anon;
revoke all on function public.record_self_assessment(uuid, uuid, numeric) from public, anon;
grant execute on function public.attempt_review(uuid) to authenticated;
grant execute on function public.start_attempt(uuid) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
grant execute on function public.record_self_assessment(uuid, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Global search (runs under the caller's RLS; notes and assignments are the caller's own)
-- ---------------------------------------------------------------------------
create or replace function public.search_content(p_query text, p_limit integer default 30)
returns table (kind text, item_id uuid, title text, snippet text, course_code text, url text, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select websearch_to_tsquery('english'::regconfig, coalesce(p_query, '')) as tsq,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', ''), '%', ''), '_', '') || '%' as pat
  ),
  results as (
    select 'course'::text as kind, c.id as item_id, c.code || ' ' || c.title as title,
           left(c.description, 220) as snippet, c.code as course_code, '/courses/' || c.slug as url,
           (case when c.title ilike q.pat or c.code ilike q.pat then 2 else 0.5 end)::real as rank
    from public.courses c, q
    where c.title ilike q.pat or c.code ilike q.pat or c.description ilike q.pat
    union all
    select 'module', m.id, m.title, left(m.description, 220), c.code, '/courses/' || c.slug || '?module=' || m.slug,
           (case when m.title ilike q.pat then 1.5 else 0.4 end)::real
    from public.course_modules m join public.courses c on c.id = m.course_id, q
    where m.title ilike q.pat or m.description ilike q.pat
    union all
    select 'lesson', l.id, l.title, left(l.summary, 220), c.code, '/courses/' || c.slug || '/lessons/' || l.slug,
           (ts_rank(l.search, q.tsq) + case when l.title ilike q.pat then 1.5 when array_to_string(l.topics, ' ') ilike q.pat then 1 else 0 end)::real
    from public.lessons l
    join public.course_modules m on m.id = l.module_id
    join public.courses c on c.id = m.course_id, q
    where l.search @@ q.tsq or l.title ilike q.pat or array_to_string(l.topics, ' ') ilike q.pat
    union all
    select 'resource', r.id, r.title, left(r.description, 220), c.code, '/resources?q=' || r.title,
           (ts_rank(r.search, q.tsq) + case when r.title ilike q.pat then 1 else 0 end)::real
    from public.lesson_resources r join public.courses c on c.id = r.course_id, q
    where r.search @@ q.tsq or r.title ilike q.pat
    union all
    select 'note', n.id, coalesce(nullif(n.title, ''), 'Untitled note'), left(n.body, 220), null, '/notes?note=' || n.id,
           (ts_rank(n.search, q.tsq) + case when n.title ilike q.pat then 1 else 0 end)::real
    from public.student_notes n, q
    where n.user_id = (select auth.uid()) and (n.search @@ q.tsq or n.title ilike q.pat or n.body ilike q.pat)
    union all
    select 'assignment', a.id, a.title, left(a.description, 220), null, '/assignments?assignment=' || a.id,
           (case when a.title ilike q.pat then 1 else 0.3 end)::real
    from public.assignments a, q
    where a.user_id = (select auth.uid()) and (a.title ilike q.pat or a.description ilike q.pat)
  )
  select r.kind, r.item_id, r.title, r.snippet, r.course_code, r.url, r.rank
  from results r
  where char_length(btrim(coalesce(p_query, ''))) >= 2
  order by r.rank desc, r.title
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
