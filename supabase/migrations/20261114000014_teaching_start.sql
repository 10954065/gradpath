-- GradPath: the day teaching started for a timetable. Students' study weeks (planner, weekly totals, weekly pace)
-- start on that weekday and are numbered from it ("Semester week 1"). Only the grouping of dates into weeks changes;
-- no progress, attempt, session or streak record is touched.

alter table public.timetable_sources
  add column teaching_started_on date;

alter table public.timetable_sources
  add constraint timetable_sources_teaching_started_in_year check (
    teaching_started_on is null
    or extract(year from teaching_started_on)::int between split_part(academic_year, '/', 1)::int and split_part(academic_year, '/', 2)::int
  );

-- A revised version of a timetable keeps the teaching start of the version it replaces unless it gives its own.
create or replace function public.carry_teaching_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.teaching_started_on is null then
    select s.teaching_started_on into new.teaching_started_on
    from public.timetable_sources s
    where s.programme_code = new.programme_code
      and s.academic_year = new.academic_year
      and s.semester = new.semester
      and s.teaching_started_on is not null
    order by s.version desc
    limit 1;
  end if;
  return new;
end;
$$;

create trigger carry_teaching_start
  before insert on public.timetable_sources
  for each row execute function public.carry_teaching_start();

-- 2026/2027 Semester 1 ITB: teaching started on Friday 13 November 2026 (confirmed by the student on 2026-11-14).
-- On a fresh database the seed sets it; this covers databases where the timetable is already loaded.
update public.timetable_sources
set teaching_started_on = date '2026-11-13'
where slug = 'itb-2026-2027-semester-1' and teaching_started_on is null;
