-- Plain punctuation in the provisional timetable labels ("CSIT 601 Research Methods (study)" instead of a dash).
-- Same function as in 20261112000003_learning.sql apart from the titles; existing grants are kept by
-- "create or replace". Existing provisional rows are renamed to match.

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
    ('CSIT 601', 'CSIT 601 Research Methods (study)', 'study', 1, '14:00', '16:00'),
    ('CSIT 603', 'CSIT 603 Enterprise Systems & BPR (study)', 'study', 2, '14:00', '16:00'),
    ('CSIT 605', 'CSIT 605 Computer & Cybersecurity (study)', 'study', 3, '14:00', '16:00'),
    ('CSIT 607', 'CSIT 607 AI for Business Systems (study)', 'study', 4, '14:00', '16:00'),
    ('CSIT 613', 'CSIT 613 E-Business Platforms & FinTech (study)', 'study', 5, '13:00', '14:30'),
    ('CSIT 617', 'CSIT 617 Professional & Ethical Issues in IT (study)', 'study', 5, '14:30', '16:00'),
    ('CSIT 621', 'CSIT 621 Emerging Technologies (study and practical exercises)', 'study', 6, '09:00', '12:00'),
    (null, 'General revision and mock examinations', 'revision', 0, '15:00', '17:00')
  ) as s(code, title, kind, dow, start_t, end_t)
  left join public.courses c on c.code = s.code;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

update public.timetable_events
set title = regexp_replace(title, ' — (study.*)$', ' (\1)')
where is_provisional and title like '% — study%';
