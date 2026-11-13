-- Daily lesson log behind the study streak. lesson_progress keeps one row per lesson, so its updated_at
-- cannot show which earlier days had lesson work. This table records each (student, Accra day, lesson)
-- with real progress: more of the lesson read, or the lesson completed. Opening a lesson without reading
-- does not count. Rows are written only by the trigger; students can read their own.

create table public.lesson_days (
  user_id   uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  primary key (user_id, day, lesson_id)
);
create index lesson_days_user_day_idx on public.lesson_days (user_id, day desc);

alter table public.lesson_days enable row level security;
create policy "lesson_days: select own" on public.lesson_days
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.lesson_days from anon, authenticated;
grant select on public.lesson_days to authenticated;
grant select, insert, update, delete on public.lesson_days to service_role;

create or replace function public.log_lesson_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and (new.reading_percent > 0 or new.status = 'completed'))
     or (tg_op = 'UPDATE' and (new.reading_percent > old.reading_percent
                               or (new.status = 'completed' and old.status <> 'completed'))) then
    insert into public.lesson_days (user_id, day, lesson_id)
    values (new.user_id, (now() at time zone 'Africa/Accra')::date, new.lesson_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.log_lesson_day() from public, anon, authenticated;

create trigger lesson_progress_log_day after insert or update on public.lesson_progress
  for each row execute function public.log_lesson_day();

-- Existing progress: the last day each lesson was touched is the only day still known.
insert into public.lesson_days (user_id, day, lesson_id)
select user_id, (updated_at at time zone 'Africa/Accra')::date, lesson_id
from public.lesson_progress
where reading_percent > 0 or status = 'completed'
on conflict do nothing;
