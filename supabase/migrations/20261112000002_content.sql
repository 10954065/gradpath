-- Shared academic content. Authenticated students read published rows; only administrators write.

create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-Z]{3,5} [0-9]{3}$'),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (char_length(title) between 3 and 160),
  description  text not null default '',
  status       text not null default 'listed' check (status in ('listed', 'recommended_elective')),
  status_note  text not null default '',
  accent       text not null default 'indigo' check (accent ~ '^[a-z]+$'),
  outcomes     text[] not null default '{}',
  sort_order   integer not null default 0,
  source       text not null default 'supplementary'
               check (source in ('lecturer', 'institutional', 'supplementary', 'ai_practice', 'student')),
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.course_modules (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (char_length(title) between 3 and 160),
  description  text not null default '',
  sort_order   integer not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (course_id, slug)
);
create index course_modules_course_idx on public.course_modules (course_id, sort_order);

-- `content` holds the structured lesson (introduction, objectives, prerequisites, keyTerms, body[],
-- misconceptions, examMistakes, criticalQuestions, exercises, takeaways, furtherReading, videos,
-- revisionSummary). Rendering sanitises all Markdown in the browser.
create table public.lessons (
  id                  uuid primary key default gen_random_uuid(),
  module_id           uuid not null references public.course_modules (id) on delete cascade,
  slug                text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (char_length(title) between 3 and 200),
  summary             text not null default '',
  topics              text[] not null default '{}',
  estimated_minutes   integer not null default 30 check (estimated_minutes between 5 and 240),
  difficulty          text not null default 'intermediate' check (difficulty in ('introductory', 'intermediate', 'advanced')),
  source              text not null default 'supplementary'
                      check (source in ('lecturer', 'institutional', 'supplementary', 'ai_practice', 'student')),
  content             jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  word_count          integer not null default 0 check (word_count >= 0),
  min_reading_percent integer not null default 80 check (min_reading_percent between 0 and 100),
  requires_quiz_pass  boolean not null default false,
  sort_order          integer not null default 0,
  is_published        boolean not null default false,
  search              tsvector generated always as (
                        setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                        setweight(to_tsvector('english'::regconfig, coalesce(summary, '')), 'B') ||
                        setweight(to_tsvector('english'::regconfig, left(content::text, 200000)), 'C')
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (module_id, slug)
);
create index lessons_module_idx on public.lessons (module_id, sort_order);
create index lessons_search_idx on public.lessons using gin (search);

create table public.lesson_resources (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references public.courses (id) on delete cascade,
  module_id           uuid references public.course_modules (id) on delete set null,
  lesson_id           uuid references public.lessons (id) on delete set null,
  title               text not null check (char_length(title) between 2 and 200),
  description         text not null default '',
  provider            text not null default '',
  url                 text not null check (url ~ '^https://'),
  category            text not null default 'reference'
                      check (category in ('database', 'course', 'documentation', 'tool', 'guide', 'standard', 'organisation', 'video', 'reference')),
  difficulty          text not null default 'introductory' check (difficulty in ('introductory', 'intermediate', 'advanced')),
  stage               text not null default 'core' check (stage in ('foundation', 'core', 'advanced', 'revision')),
  access_type         text not null default 'unknown' check (access_type in ('free', 'freemium', 'paid', 'registration', 'unknown')),
  verification_status text not null default 'unverified' check (verification_status in ('verified', 'unverified', 'unreachable')),
  last_verified_at    timestamptz,
  verification_note   text not null default '',
  sort_order          integer not null default 0,
  is_published        boolean not null default false,
  search              tsvector generated always as (
                        to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(provider, ''))
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (course_id, url)
);
create index lesson_resources_course_idx on public.lesson_resources (course_id, sort_order);
create index lesson_resources_search_idx on public.lesson_resources using gin (search);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid references public.courses (id) on delete cascade,
  title        text not null check (char_length(title) between 3 and 200),
  body         text not null default '' check (char_length(body) <= 20000),
  is_pinned    boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index announcements_published_idx on public.announcements (is_published, published_at desc);

-- Files uploaded by administrators (lecturer-provided or institutional material).
-- Never public automatically: is_published defaults to false.
create table public.uploaded_course_materials (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  module_id    uuid references public.course_modules (id) on delete set null,
  lesson_id    uuid references public.lessons (id) on delete set null,
  title        text not null check (char_length(title) between 2 and 200),
  description  text not null default '',
  storage_path text not null unique check (storage_path ~ '^[a-z0-9-]+/[A-Za-z0-9._-]+$'),
  file_name    text not null check (char_length(file_name) <= 200),
  mime_type    text not null check (mime_type in (
                 'application/pdf',
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                 'text/plain')),
  size_bytes   bigint not null check (size_bytes between 1 and 26214400),
  source       text not null default 'lecturer' check (source in ('lecturer', 'institutional', 'supplementary')),
  is_published boolean not null default false,
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index uploaded_materials_course_idx on public.uploaded_course_materials (course_id);

-- Which courses a student is following. Created during onboarding; CSIT 613 starts as
-- 'pending_confirmation' because it is a recommended elective.
create table public.course_enrolments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id  uuid not null references public.courses (id) on delete cascade,
  status     text not null default 'enrolled' check (status in ('enrolled', 'pending_confirmation', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id)
);
create index course_enrolments_user_idx on public.course_enrolments (user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger course_modules_updated_at before update on public.course_modules for each row execute function public.set_updated_at();
create trigger lessons_updated_at before update on public.lessons for each row execute function public.set_updated_at();
create trigger lesson_resources_updated_at before update on public.lesson_resources for each row execute function public.set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger uploaded_materials_updated_at before update on public.uploaded_course_materials for each row execute function public.set_updated_at();
create trigger course_enrolments_updated_at before update on public.course_enrolments for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_resources enable row level security;
alter table public.announcements enable row level security;
alter table public.uploaded_course_materials enable row level security;
alter table public.course_enrolments enable row level security;

create policy "courses: read published" on public.courses
  for select to authenticated using (is_published or public.is_admin());
create policy "courses: admin insert" on public.courses
  for insert to authenticated with check (public.is_admin());
create policy "courses: admin update" on public.courses
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "courses: admin delete" on public.courses
  for delete to authenticated using (public.is_admin());

-- A module or lesson is visible only when it and every ancestor are published.
create policy "modules: read published" on public.course_modules
  for select to authenticated using (
    public.is_admin() or (
      is_published and exists (select 1 from public.courses c where c.id = course_id and c.is_published)
    )
  );
create policy "modules: admin insert" on public.course_modules
  for insert to authenticated with check (public.is_admin());
create policy "modules: admin update" on public.course_modules
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "modules: admin delete" on public.course_modules
  for delete to authenticated using (public.is_admin());

create policy "lessons: read published" on public.lessons
  for select to authenticated using (
    public.is_admin() or (
      is_published and exists (
        select 1 from public.course_modules m join public.courses c on c.id = m.course_id
        where m.id = module_id and m.is_published and c.is_published
      )
    )
  );
create policy "lessons: admin insert" on public.lessons
  for insert to authenticated with check (public.is_admin());
create policy "lessons: admin update" on public.lessons
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lessons: admin delete" on public.lessons
  for delete to authenticated using (public.is_admin());

create policy "resources: read published" on public.lesson_resources
  for select to authenticated using (
    public.is_admin() or (
      is_published and exists (select 1 from public.courses c where c.id = course_id and c.is_published)
    )
  );
create policy "resources: admin insert" on public.lesson_resources
  for insert to authenticated with check (public.is_admin());
create policy "resources: admin update" on public.lesson_resources
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "resources: admin delete" on public.lesson_resources
  for delete to authenticated using (public.is_admin());

create policy "announcements: read published" on public.announcements
  for select to authenticated using (is_published or public.is_admin());
create policy "announcements: admin insert" on public.announcements
  for insert to authenticated with check (public.is_admin());
create policy "announcements: admin update" on public.announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "announcements: admin delete" on public.announcements
  for delete to authenticated using (public.is_admin());

create policy "materials: read published" on public.uploaded_course_materials
  for select to authenticated using (is_published or public.is_admin());
create policy "materials: admin insert" on public.uploaded_course_materials
  for insert to authenticated with check (public.is_admin());
create policy "materials: admin update" on public.uploaded_course_materials
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "materials: admin delete" on public.uploaded_course_materials
  for delete to authenticated using (public.is_admin());

create policy "enrolments: read own" on public.course_enrolments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "enrolments: insert own" on public.course_enrolments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "enrolments: update own" on public.course_enrolments
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "enrolments: delete own" on public.course_enrolments
  for delete to authenticated using (user_id = (select auth.uid()));

-- Set published_at automatically for announcements.
create or replace function public.announcement_publish_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger announcements_publish_stamp before insert or update on public.announcements
  for each row execute function public.announcement_publish_stamp();
