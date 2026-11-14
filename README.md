# GradPath

**Learn with purpose. Master every course. Graduate with excellence.**

GradPath is a study platform for students on the **MSc Information Technology for Business** programme at the
University of Ghana, Legon (Semester 1). It combines structured postgraduate lessons, mastery-based practice
assessments, timed mock examinations, a study planner, spaced-repetition revision and progress analytics — and it
keeps working offline.

> GradPath is an independent **supplementary** study platform. It is not official University of Ghana material,
> does not replace lecturers' instructions, and practice results are not official grades. The official lecture
> timetable is a transcription of the University's published ITB timetable that has not been independently compared
> with the original; personal study plans are suggestions.

## What's inside

| Area | Highlights |
|---|---|
| Courses | The 8 Semester 1 courses (20 credit slots): CSIT 601, 603, 605, 607 and 617 (core, 3 slots each), CSIT 610 Seminar (required, 1 slot), CSIT 613 (elective, 3 slots) and CSIT 621 (special topic, 1 slot). 62 modules, 180 lessons (~495,000 words) in a consistent format: objectives, key terms, worked explanations, Ghanaian and international cases, misconceptions, exam mistakes, critical questions, exercises, revision summary, further reading. Each student records their own elective; their dashboard, planner, progress and assessments use only the courses they take. CSIT 610 has a personal seminar tracker. |
| Assessment | 1,325 supplementary practice questions (7 question types), lesson quizzes, module assessments, mixed revision tests, course and mixed mock exams (the mixed paper uses only the courses a student takes). Attempt history shows course, attempt number, time spent and score. Scoring happens on the server; answer keys are never sent to the browser before submission. Mastery threshold 80% (configurable). |
| Official timetable | The University of Ghana, Department of Computer Science 2026/2027 Semester 1 ITB postgraduate timetable (20 published sessions, Ghana time) in week, day and list views, filtered to the courses each student takes, linked to course pages, with venues, credit slots and the next session per course. All sessions are kept, and the allocation is confirmed for all ITB students (the student confirmed all 20 sessions on 14 November 2026), so every session counts as attended unless a student privately marks it otherwise. Lecture reminders (confirmed sessions only, following each student's preferences) and published change notices. |
| Study weeks | Official lectures begin on Monday 16 November 2026 (none shown or reminded before then). Each student can record when their own studies started (Settings), for example Friday 13 November 2026 to get ahead; their study weeks then run Friday to Thursday and are numbered "Study week N" on the dashboard and planner. |
| Lecture check-ins | After each lecture (prompted when it ends): attended, missed or cancelled, which lessons it covered, which to review (added to the Revision Centre) and a private note. Each course then shows whether you are ahead of the lectures, level or behind (with the lessons to catch up on) and what to read before the next lecture; before lectures begin, completed lessons count as a head start. |
| My Grades | Official marks as they are released: each test, assignment and examination with its weight from the course outline. Each course shows the grade so far or the final grade, and what the remaining marks need on average for A, B+, B and C. Grade point average (final and projected), weighted by credits, against the University of Ghana Masters Regulations (July 2025): grading Table 5 (3.24), final GPA of 2.50 or better (3.23.4), no more than three grades of C or lower (3.23.1). |
| Exam Countdown | Examinations (added here or as deadlines of type examination) with the days left in Ghana time, the share of the course completed and a revision plan worked back from each exam: every module, then the least finished ones again, a weakest-topics session and a final review with a mock exam, one session a day at the student's preferred time, moved around lectures, their own planner blocks and other examinations, and put in the planner as one-off revision blocks that can be re-planned or removed together. The next examinations also show on the dashboard. |
| Focus Timer | Focus for 25, 50 or 90 minutes, then a break. Focused minutes (pauses left out) are logged in the planner as completed study when the time is up or when you stop early, optionally completing a block planned for today. The timer keeps running across pages and reloads, with a countdown in the top bar; a system notification is shown only if notifications are already allowed. |
| Phone calendar | A private subscription link (Settings, Preferences) for Google, Apple or Outlook Calendar with the official lectures the student attends (weekly from the day teaching begins, with venues), their planner blocks and their examinations (with a reminder the day before). The calendar app refreshes it itself; the link can be replaced or turned off. |
| Weekly Review | Each study week in one page: study time against the weekly target, lessons completed, quizzes and their average, lecture check-ins, what is due in the following seven days and suggestions for next week; earlier weeks too. A summary notification arrives at 9 pm on the last day of the student's study week (Thursday for a week that starts on Friday), also as a push notification where allowed; it can be turned off in Settings. |
| Study tools | A personal study plan built around the lectures (a preview before and a review after each course's lecture, deep study to the weekly target, mixed revision; never within 30 minutes of a lecture) and counted separately from lecture hours, weekly planner showing official lectures read-only, missed-session tracking, deadlines typed as assignment, test, examination, presentation or project, private notes and bookmarks, SM-2 spaced repetition and 1,050 flashcards, search, notifications, rule-based study recommendations. |
| Progress | Dashboard, a daily lesson streak shown as a flame (lit, fading or out), today's lessons guided by the timetable, time studied, course and module mastery, weak-topic detection. |
| Admin | Publish/hide content, edit completion rules and assessment settings, import lessons (Markdown) and question banks (YAML), manage resources (with a server-side link checker), announcements and private lecturer/institutional uploads, and the official timetable (add, correct, cancel or remove sessions with a reason, publish changes and notify students, view the history, import a revised timetable as a new version). |
| Offline | Installable PWA. Lessons you open are saved on your device; notes, progress and planner changes made offline are queued and synced when you reconnect. |

Curriculum coverage per module: [CURRICULUM_STATUS.md](CURRICULUM_STATUS.md).

## Tech stack

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS 4 · Radix UI · TanStack Query · React Router 7 ·
Supabase (Postgres, Auth, Row Level Security, Storage) · vite-plugin-pwa / Workbox · IndexedDB · Vercel (+ one
Vercel Function) · Vitest · Playwright.

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
api/                Vercel Function: server-side link checker for administrators
content/            Course content as Markdown + YAML (the source of truth for the curriculum)
docs/               Content authoring spec and deployment guide
scripts/            Content build/validation, link verification, icon generation
src/                React application (pages, components, services, offline layer, algorithms)
supabase/           Migrations (schema, RLS, functions, storage) and the generated seed
tests/              unit/, integration/ (local Supabase), e2e/ (Playwright)
```

More detail: [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) · [docs/CONTENT_AUTHORING.md](docs/CONTENT_AUTHORING.md) ·
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · [BUILD_STATUS.md](BUILD_STATUS.md)

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the step-by-step guide: Supabase project, migrations, seed,
auth redirect URLs, Vercel environment variables, creating the first administrator, security checks and free-tier
limits.

## Security and privacy

* Every table uses Row Level Security; students can only read and change their own records. Content is read-only
  for students, and only administrators (granted from the database) can change it.
* Assessment answer keys live in a table students cannot read; attempts are scored by database functions.
* Only the public Supabase URL and anon key reach the browser. No service-role key is used by the app.
* Lesson and note content is sanitised before rendering; a strict Content-Security-Policy is set in `vercel.json`.
* Offline data is stored per student on the device and removed on sign-out.

## Content accuracy

Lessons and practice questions were written for GradPath as supplementary material and are labelled as such.
Web resources and further-reading links were checked automatically, and each shows its verification status and
date to students. Nothing in GradPath states University policy, official dates or assessment weightings. Confirm
official information with your department and lecturers, and check any citation against the original source
before relying on it in assessed work.
