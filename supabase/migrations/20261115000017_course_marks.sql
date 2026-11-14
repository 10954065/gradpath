-- GradPath: a student's official marks. Each row is one assessed component of a course (a test, an assignment, the
-- end-of-semester examination) with its weight in the final course mark, as given in the course outline, and the
-- mark once released. Private to the student. Grades follow the University of Ghana Masters Regulations (July 2025),
-- section 3.24, Table 5; the app computes them, the database stores only what the student enters.

create table public.course_marks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id      uuid not null references public.courses (id) on delete cascade,
  title          text not null check (char_length(trim(title)) between 1 and 120),
  component      text not null check (component in ('coursework', 'examination')),
  -- Share of the final course mark, in percent.
  weight_percent numeric(5, 2) not null check (weight_percent > 0 and weight_percent <= 100),
  -- Null until the mark is released.
  score          numeric(7, 2) check (score is null or score >= 0),
  max_score      numeric(7, 2) not null default 100 check (max_score > 0),
  recorded_on    date check (recorded_on is null or recorded_on between date '2020-01-01' and date '2100-12-31'),
  note           text not null default '' check (char_length(note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (score is null or score <= max_score)
);
create index course_marks_user_course_idx on public.course_marks (user_id, course_id);

-- A course's components cannot add up to more than its whole mark.
create or replace function public.check_course_marks_weight()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(m.weight_percent), 0) + new.weight_percent into v_total
  from public.course_marks m
  where m.user_id = new.user_id and m.course_id = new.course_id and m.id <> new.id;
  if v_total > 100 then
    raise exception 'The weights for this course would add up to % percent; they cannot exceed 100.', rtrim(rtrim(v_total::text, '0'), '.')
      using errcode = 'P0001';
  end if;
  new.title := trim(new.title);
  new.updated_at := now();
  return new;
end;
$$;
create trigger course_marks_weight before insert or update on public.course_marks
  for each row execute function public.check_course_marks_weight();

alter table public.course_marks enable row level security;
create policy "course_marks: select own" on public.course_marks for select to authenticated using (user_id = (select auth.uid()));
create policy "course_marks: insert own" on public.course_marks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "course_marks: update own" on public.course_marks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "course_marks: delete own" on public.course_marks for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.course_marks from anon;
