# GradPath

**Learn with purpose. Master every course. Graduate with excellence.**

GradPath is a study platform for students on the **MSc Information Technology for Business** programme at the
University of Ghana, Legon (Semester 1). It combines structured postgraduate lessons, mastery-based practice
assessments, timed mock examinations, a study planner, spaced-repetition revision and progress analytics — and it
keeps working offline.

> GradPath is an independent **supplementary** study platform. It is not official University of Ghana material,
> does not replace lecturers' instructions, and practice results are not official grades. Timetables are
> provisional study plans, not official lecture schedules.

## What's inside

| Area | Highlights |
|---|---|
| Courses | 7 courses, 56 modules, 159 lessons (~430,000 words) in a consistent format: objectives, key terms, worked explanations, misconceptions, exam mistakes, critical questions, exercises, revision summary, further reading. CSIT 613 is labelled a *recommended elective pending confirmation*. |
| Assessment | 1,161 supplementary practice questions (7 question types), lesson quizzes, module assessments, course and mixed mock exams. Scoring happens on the server; answer keys are never sent to the browser before submission. Mastery threshold 80% (configurable). |
| Study tools | Weekly planner and provisional timetable (Africa/Accra), assignments with attachments, private notes and bookmarks, SM-2 spaced repetition and 919 flashcards, search, notifications, rule-based study recommendations. |
| Progress | Dashboard, streaks, time studied, course and module mastery, weak-topic detection. |
| Admin | Publish/hide content, edit completion rules and assessment settings, import lessons (Markdown) and question banks (YAML), manage resources (with a server-side link checker), announcements and private lecturer/institutional uploads. |
| Offline | Installable PWA. Lessons you open are saved on your device; notes, progress and planner changes made offline are queued and synced when you reconnect. |

Curriculum coverage per module: [CURRICULUM_STATUS.md](CURRICULUM_STATUS.md).

## Tech stack

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS 4 · Radix UI · TanStack Query · React Router 7 ·
Supabase (Postgres, Auth, Row Level Security, Storage) · vite-plugin-pwa / Workbox · IndexedDB · Netlify (+ one
Netlify Function) · Vitest · Playwright.

No paid AI service is used. Recommendations and scheduling are deterministic, rule-based algorithms.

## Running it locally

Requirements: Node.js 20+, Docker Desktop (for the local Supabase stack).

```bash
npm ci
npx supabase start            # local Postgres/Auth/Storage (first run downloads images)
npx supabase db reset         # applies migrations and loads supabase/seed.sql
```

Create `.env.local` from `.env.example` using the values printed by `npx supabase status`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from `npx supabase status`>
```

```bash
npm run dev                   # http://localhost:5173
```

Register an account in the app (email confirmation is off locally). To make it an administrator:

```bash
docker exec supabase_db_gradpath psql -U postgres -c "select public.grant_admin('you@example.com');"
```

Local emails (password reset) are visible in Mailpit at http://127.0.0.1:54324.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm run preview` | Develop, build for production, serve the production build on :4173 |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests (parsers, Markdown sanitising, scoring, scheduling, offline outbox, recommendations) |
| `npm run test:integration` | Database tests against the local stack: RLS isolation, admin permissions, storage rules, scoring and mastery |
| `npm run test:e2e` | Playwright browser tests (desktop + phone) against the production build and the local stack |
| `npm run content:validate` | Validate every lesson, question bank and flashcard file in `content/` |
| `npm run content:build` | Regenerate `supabase/seed.sql` and `CURRICULUM_STATUS.md` from `content/` |
| `npm run content:verify-links` | Check every resource and further-reading URL and record the result |

## Project layout

```
content/            Course content as Markdown + YAML (the source of truth for the curriculum)
docs/               Content authoring spec and deployment guide
netlify/functions/  Server-side link checker for administrators
scripts/            Content build/validation, link verification, icon generation
src/                React application (pages, components, services, offline layer, algorithms)
supabase/           Migrations (schema, RLS, functions, storage) and the generated seed
tests/              unit/, integration/ (local Supabase), e2e/ (Playwright)
```

More detail: [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) · [docs/CONTENT_AUTHORING.md](docs/CONTENT_AUTHORING.md) ·
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · [BUILD_STATUS.md](BUILD_STATUS.md)

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the step-by-step guide: Supabase project, migrations, seed,
auth redirect URLs, Netlify environment variables, creating the first administrator, security checks and free-tier
limits.

## Security and privacy

* Every table uses Row Level Security; students can only read and change their own records. Content is read-only
  for students, and only administrators (granted from the database) can change it.
* Assessment answer keys live in a table students cannot read; attempts are scored by database functions.
* Only the public Supabase URL and anon key reach the browser. No service-role key is used by the app.
* Lesson and note content is sanitised before rendering; a strict Content-Security-Policy is set in `netlify.toml`.
* Offline data is stored per student on the device and removed on sign-out.

## Content accuracy

Lessons and practice questions were written for GradPath as supplementary material and are labelled as such.
Web resources and further-reading links were checked automatically, and each shows its verification status and
date to students. Nothing in GradPath states University policy, official dates or assessment weightings. Confirm
official information with your department and lecturers, and check any citation against the original source
before relying on it in assessed work.
