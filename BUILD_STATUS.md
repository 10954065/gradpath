# GradPath — Build Status

_Last updated: 2026-11-12_

## Initial audit (Phase 1)

* The workspace `E:\onion\gradpath` was **empty**: no Vite/React setup, PWA or Netlify configuration,
  course data, icons or environment examples existed, so nothing needed to be preserved or migrated.
* The GitHub remote `https://github.com/10954065/gradpath.git` had no commits.
* Tooling available: Node 24, npm 11, git, GitHub CLI, Docker 29, Supabase CLI (npm package).
* No Supabase cloud project or Netlify credentials were provided. All database work is tested against a
  **local Supabase stack** (`npx supabase start`); cloud setup is documented for the owner.

## Phase progress

| Phase | Status | Notes |
|---|---|---|
| 1. Audit and foundation | Done | Toolchain, configs, content spec + validator, docs |
| 2. Database and security | Done | 5 migrations, RLS on every table, server-side scoring, seed generator, 25 integration tests passing |
| 3. Design system | Done | Tokens, light/dark themes, UI primitives, sidebar + mobile drawer + bottom nav, auth screens, onboarding, settings, PWA icons |
| 4. Curriculum engine | Done | All 7 courses authored: 159/159 lessons (~430k words), 1,161 practice questions, 919 flashcards, 76 resources; 225 URLs checked (196 reachable, 26 blocked automated checks, 3 unreachable). Course catalogue, course overview, lesson reader (TOC, progress, text size, dark reading, Mermaid), library, resources |
| 5. Learning progress | Done | Reading progress (scroll + visible time), explicit server-enforced completion, lesson and resource bookmarks, private notebook (search, link to course/lesson, tags, pin, export), offline outbox tests |
| 6. Assessments | Done | Assessments hub (module assessments, lesson quizzes, history), mock exams, quiz intro, timed runner (navigation, drafts, auto-submit, confirmation), results with breakdowns, explanations, rubrics, model answers and self-assessment; browser-verified end to end |
| 7. Productivity | Done | Study planner (week view from timetable, complete with actual minutes, skip, reschedule, one-off sessions, weekly/monthly totals vs target), timetable (recurring + one-off, provisional plan replace/restore), assignments (filters, sorting, attachments), revision centre (SM-2 spaced repetition, due/overdue/upcoming/mastered/weak/history), flashcards (curriculum + own, add to queue), notifications page |
| 8. Analytics | Done | Personalised dashboard (progress, weekly hours vs target, streak, revision due, recommendations, course progress, weekly study + course performance charts, next session, deadlines, results, weak topics, announcements), Academic Progress centre, rule-based explainable recommendations, announcements, global search; browser-verified with real data |
| 9. Administration | Done | Admin console (overview, content publish/edit/Markdown import, assessment settings + question-bank import, resources CRUD + server-side link check, announcements, private course-material uploads, platform settings); `/api/verify-link` Netlify Function (admin-only, SSRF-guarded, rate-limited); published materials shown on course pages via signed URLs |
| 10. PWA | Done | Installable manifest (standalone, 192/512/maskable icons); service worker precaches the app shell and all route chunks (97 entries, ~2.2 MB) while Mermaid renderers and non-Latin font subsets are cached on first use; offline reading, offline note writes via the outbox, sync on reconnect; offline fixes: queries run in `networkMode: 'always'`, Supabase requests fail fast when offline, profile cached per user, stale-session sign-out only on an explicit auth rejection |
| 11. QA | Pending | |
| 12. Deployment preparation | Pending | |

## Tests executed

| Date | Command | Result |
|---|---|---|
| 2026-11-12 | `npm run content:validate` | Validator runs; 0 errors, outline loads for 7 courses / 159 lessons |
| 2026-11-12 | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | Pass (6 unit tests) |
| 2026-11-12 | `npx supabase db reset` (5 migrations + generated seed) | Applies cleanly; seed loaded 7 courses, 56 modules, 112 lessons, 613 questions, 121 quizzes, 516 flashcards |
| 2026-11-12 | Browser check (Playwright MCP, dev server + local Supabase) | Registration → automatic sign-in → onboarding; courses load from the seeded database |
| 2026-11-12 | `npm run test:integration` (local Supabase, two student accounts + admin) | 25/25 pass: private-table isolation, read-only content, hidden drafts and answer keys, no self-admin, no forged attempts, storage isolation, scoring/mastery/revision queue, completion rules, duplicate-occurrence prevention |
| 2026-11-12 | `npm run typecheck`, `npm test`, `npm run build` (Phase 9) | Pass (40 unit tests); admin console builds as its own lazy chunk |
| 2026-11-12 | `npm run test:integration` (Phase 9, adds `admin.test.ts`) | 34/34 pass: is_admin, no self-grant, students cannot change lessons/quizzes/settings or post announcements, hidden lessons invisible to students, announcement fan-out notifies once, students cannot upload materials, unpublished files unreadable until published |
| 2026-11-12 | Browser check of admin console (Playwright MCP, local stack) | Overview counts; announcement create → publish; settings save; assessment edit; TXT material upload → publish → student opens it from the course page via signed URL; two-step delete; non-admin sees “Administrators only”. Test data removed afterwards |
| 2026-11-13 | `npm run build` + `npm run preview`, browser check (Playwright, Chromium offline emulation) | Service worker installs and controls the page; manifest valid. Saved lesson reloads offline in 0.9 s with its Mermaid diagram (was 21.6 s before the fail-fast fix, and before the auth fix an offline reload signed the student out). Dashboard opens offline. Note written offline shows “Offline · 1 pending” and reached the database after reconnecting |
| 2026-11-13 | `npm test`, `npm run typecheck`, `npm run lint` (Phase 10) | 42/42 unit tests pass (adds offline fetch tests); typecheck clean; lint 0 errors (29 react-refresh dev-only warnings) |

## Errors encountered

* First `supabase start` failed mid-download (Docker Desktop DNS lookups to ghcr.io/ECR failed). Retried
  successfully after disabling Studio, analytics, realtime and edge runtime (not needed by GradPath).

## Credentials still required (owner action)

* Supabase cloud project URL and anon key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
* Netlify site linked to the GitHub repository.

## Deployment readiness

Not ready — application build in progress.

## Continuation instructions

1. `npx supabase start` (Studio/analytics/realtime/edge runtime are disabled in config.toml), then
   `npx supabase db reset` to apply migrations and `supabase/seed.sql`.
2. Write `.env.local` from `npx supabase status -o json` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. `npm run dev`. Content changes: edit `content/`, run `npm run content:build`, then `npx supabase db reset`.
4. Remaining routes to build are listed in `src/routes/router.tsx` (`shellRoutes`): dashboard, planner,
   timetable, assignments, assessments (+ runner/results), mock exams, revision, flashcards, notes,
   progress, announcements, notifications, search, admin. Services for courses, progress, notes,
   assessments, notifications and offline sync already exist in `src/services/`.
5. Continue with the first phase above marked Pending.
