-- GradPath: revision sessions planned back from an examination. Each session is a one-off revision block in the
-- student's planner tagged with the examination it prepares for, so the plan can be redone or removed as a whole and
-- disappears with the examination. Examinations are the student's deadlines of kind 'examination'.

alter table public.timetable_events
  add column exam_id uuid references public.assignments (id) on delete cascade;
create index timetable_events_exam_idx on public.timetable_events (user_id, exam_id) where exam_id is not null;

-- A revision block may only point at the same student's own examination, and must be a dated revision block.
create or replace function public.check_exam_revision_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.exam_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.assignments a where a.id = new.exam_id and a.user_id = new.user_id and a.kind = 'examination'
  ) then
    raise exception 'Revision can only be planned for one of your own examinations' using errcode = 'P0001';
  end if;
  if new.kind <> 'revision' or new.recurrence <> 'once' then
    raise exception 'An examination revision session must be a one-off revision block' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger timetable_events_exam_check before insert or update on public.timetable_events
  for each row execute function public.check_exam_revision_event();
