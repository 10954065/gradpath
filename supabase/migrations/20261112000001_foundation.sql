-- GradPath foundation: helpers, profiles, roles, preferences, platform settings.
-- Every table has Row Level Security enabled. Private rows are keyed by user_id = auth.uid().

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('student', 'admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);
alter table public.user_roles enable row level security;

-- Users may read their own roles. There are deliberately no insert/update/delete policies:
-- roles can only be changed by the database owner (see grant_admin below).
create policy "user_roles: read own" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

-- Server-side admin check used by RLS policies and storage rules.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Administrator provisioning. Executable only by the database owner / service role
-- (Supabase SQL editor), never by browser clients:  select public.grant_admin('person@example.com');
create or replace function public.grant_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No registered user with email %', p_email;
  end if;
  insert into public.user_roles (user_id, role) values (v_user, 'admin')
  on conflict (user_id, role) do nothing;
  return 'Administrator role granted to ' || p_email;
end;
$$;
revoke all on function public.grant_admin(text) from public, anon, authenticated;

create or replace function public.revoke_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_roles r
  using auth.users u
  where r.user_id = u.id and lower(u.email) = lower(trim(p_email)) and r.role = 'admin';
  return 'Administrator role revoked from ' || p_email;
end;
$$;
revoke all on function public.revoke_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  full_name                 text not null default '' check (char_length(full_name) <= 120),
  email                     text not null default '',
  avatar_path               text check (avatar_path is null or char_length(avatar_path) <= 300),
  programme                 text not null default 'MSc IT for Business' check (char_length(programme) <= 120),
  institution               text not null default 'University of Ghana' check (char_length(institution) <= 120),
  academic_year             text not null default '' check (char_length(academic_year) <= 20),
  semester                  text not null default 'Semester 1' check (char_length(semester) <= 40),
  weekly_study_target_hours numeric(4, 1) not null default 15 check (weekly_study_target_hours between 1 and 80),
  preferred_study_times     text[] not null default '{}',
  time_zone                 text not null default 'Africa/Accra' check (char_length(time_zone) <= 64),
  onboarding_completed_at   timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- The email column mirrors auth.users and cannot be changed by the client directly.
create or replace function public.protect_profile_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.email := old.email;
  end if;
  return new;
end;
$$;
create trigger profiles_protect_email before update on public.profiles
  for each row execute function public.protect_profile_email();

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------
create table public.student_preferences (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  theme                  text not null default 'system' check (theme in ('light', 'dark', 'system')),
  reader_font_scale      numeric(3, 2) not null default 1 check (reader_font_scale between 0.8 and 1.6),
  reader_dark_mode       boolean not null default false,
  browser_notifications  boolean not null default false,
  reminder_lead_minutes  integer not null default 30 check (reminder_lead_minutes between 0 and 1440),
  daily_review_limit     integer not null default 30 check (daily_review_limit between 5 and 500),
  offline_courses        uuid[] not null default '{}',
  updated_at             timestamptz not null default now()
);
alter table public.student_preferences enable row level security;

create policy "preferences: read own" on public.student_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "preferences: insert own" on public.student_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "preferences: update own" on public.student_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger student_preferences_updated_at before update on public.student_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Platform settings (singleton)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id                         boolean primary key default true check (id),
  mastery_threshold          integer not null default 80 check (mastery_threshold between 50 and 100),
  default_mock_exam_minutes  integer not null default 90 check (default_mock_exam_minutes between 10 and 300),
  attempt_grace_seconds      integer not null default 120 check (attempt_grace_seconds between 0 and 900),
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users (id) on delete set null
);
alter table public.platform_settings enable row level security;
insert into public.platform_settings (id) values (true);

create policy "settings: read" on public.platform_settings
  for select to authenticated using (true);
create policy "settings: admin update" on public.platform_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

create or replace function public.mastery_threshold()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select mastery_threshold from public.platform_settings where id), 80);
$$;
revoke all on function public.mastery_threshold() from public;
grant execute on function public.mastery_threshold() to authenticated;

-- ---------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role) values (new.id, 'student')
  on conflict do nothing;

  insert into public.student_preferences (user_id) values (new.id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when the user confirms an email change.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
