-- Offline reading counts on the day it happened. Reading saved offline is uploaded later, so stamping the
-- streak day with now() credited the reconnection day instead. The app now sends last_read_at with each
-- reading save. It comes from the student's device, so it is only trusted within the last 7 days and never
-- in the future; anything else falls back to now(). A write that does not set it (completion, quiz scoring)
-- uses now(), never an older stored value.

alter table public.lesson_progress add column last_read_at timestamptz;

create or replace function public.log_lesson_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := now();
begin
  if (tg_op = 'INSERT' and (new.reading_percent > 0 or new.status = 'completed'))
     or (tg_op = 'UPDATE' and (new.reading_percent > old.reading_percent
                               or (new.status = 'completed' and old.status <> 'completed'))) then
    if new.last_read_at is not null
       and (tg_op = 'INSERT' or new.last_read_at is distinct from old.last_read_at)
       and new.last_read_at between now() - interval '7 days' and now() then
      v_at := new.last_read_at;
    end if;
    insert into public.lesson_days (user_id, day, lesson_id)
    values (new.user_id, (v_at at time zone 'Africa/Accra')::date, new.lesson_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.log_lesson_day() from public, anon, authenticated;
