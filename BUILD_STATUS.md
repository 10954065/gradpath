# GradPath — Build Status

_Last updated: 2026-11-13_

> **Hosting:** switched from Netlify to Vercel on 2026-11-13 (`vercel.json`, function in `api/`). Earlier phase notes that
> mention Netlify describe what was built at the time.

## Semester 1 curriculum update: audit (2026-11-14)

Confirmed Semester 1 selection (owner's personal profile): **8 courses, 20 credit slots**: CSIT 601, 603, 605, 607,
617 (core, 3 slots each), CSIT 610 (required seminar, 1), CSIT 613 (selected elective, 3), CSIT 621 (special
topic, 1). CSIT 609 is an alternative elective the owner has not selected.

What the code and the live database showed before the update:

| Area | Finding |
|---|---|
| Courses | 7 courses (601, 603, 605, 607, 613, 617, 621). **CSIT 610 missing**; no classification or credit slots stored anywhere; 613 stored as "recommended elective, pending confirmation". |
| CSIT 609 | Not referenced anywhere (code, content, seed or database), so there is nothing to remove or exclude. |
| Enrolments | `course_enrolments` existed but onboarding enrolled every student in **every** published course; no screen filtered by enrolment. Dashboard, progress, planner, timetable, assessments, revision, flashcards, notes and resources all listed the whole catalogue. |
| Live account | Enrolled in 601, 603, 605, 607, 617, 621; 613 `pending_confirmation`; no 610. 4 quiz attempts, 0 study sessions. |
| Timetable | The provisional plan (8 weekly blocks) is labelled as personal **study** time and provisional; there are no lecture entries, so nothing is presented as an official lecture. It has **no CSIT 610 block**. The UI does not separate a university timetable from the personal study plan. |
| Content gaps vs the brief | No lesson on ERP architecture (603); Ghana cybersecurity/data-protection law only mentioned in passing (605); no lessons on recommendation systems or AI adoption/implementation strategy (607); FinTech regulation, customer experience/digital strategy and international FinTech only touched on (613); no IT governance lesson, technology law not its own lesson (617); Industry 4.0 one mention (621). |
| Assessments | Lesson quizzes, module assessments, course and mixed-course mock exams exist. **No mixed revision tests.** Attempts store score, percentage, start/submit times and per-lesson breakdown; attempt number and time spent are not shown. |
| Hosting | Vercel (the owner switched from Netlify on 2026-11-13); kept. |
| Baseline checks | typecheck clean; lint 0 errors (29 dev-only warnings); 52 unit tests pass; content validation 0 errors. |

## Semester 1 curriculum update: results (2026-11-14)

| Area | Done |
|---|---|
| Curriculum | 8 courses, 20 credit slots, stored with classification. CSIT 610 Seminar added (4 modules, 11 lessons, 84 questions, 68 flashcards, 9 resources). New lessons for every gap in the audit (603, 605, 607 x2, 613 module of 3, 617 module of 2, 621). Totals: 62 modules, 180 lessons (~495k words), 1,325 questions, 1,050 flashcards, 8 mixed revision tests. Content validation 0 errors, 0 warnings. |
| Personal selection | Compulsory courses enrol automatically (also for existing students on their next visit; a status the student set is never changed); electives are each student's choice, asked at onboarding and editable in Settings. Every screen uses `useMyCourses()`. CSIT 609 does not exist in the programme data and is never enrolled. |
| Dashboard | "8 enrolled courses · 20 credit slots" with 5 core, 1 required, 1 special topic, 1 elective (CSIT 613); prompt and separate slot count while an elective is unconfirmed; upcoming assessments and deadlines; course mastery. |
| Seminar | Private CSIT 610 tracker: topic, stage, date with a confirmed flag, 8-step preparation checklist, notes, feedback. |
| Planner and timetable | University lecture timetable separate from the personal study plan; lectures can be marked awaiting confirmation; courses without a study block are offered one; course pickers list only courses taken; missed sessions; deadlines and revision advice in the planner. |
| Assessments | Mixed revision tests; mixed mock uses only courses taken; history shows course, attempt number, time spent and raw score. |
| Hosting | Kept on Vercel (owner's earlier decision), not Netlify as the update brief assumed. |

| Date | Check | Result |
|---|---|---|
| 2026-11-14 | `npm run typecheck`, `npm run lint` | Clean; lint 0 errors (29 dev-only warnings, unchanged) |
| 2026-11-14 | `npm test` | 66/66 unit tests (adds selection 8 courses, 20 slots, 5 core, 1 required, 1 special topic, 613 selected, 609 excluded; attempts; missed sessions; seminar progress) |
| 2026-11-14 | `npx supabase db reset` then `npm run test:integration` | All 11 migrations and the new seed apply from empty; 54/54 integration tests (adds enrolment rules, 20 slots, classmate isolation, seminar privacy, revision tests, mixed mock, CSIT 610 study block) |
| 2026-11-14 | `npm run test:e2e` (production build) | 22/22 (adds dashboard count and slots, Settings total, planner picker shows exactly the 8 courses, seminar tracker, revision tests) |
| 2026-11-14 | Live | Migration 11 and the seed applied to Supabase (22 transactional chunks); live data checked (8 courses, 20 slots, 180 lessons); student records untouched; Vercel deployment `cc58c65` ready and serving the new pages |

Still open: the official title of CSIT 610, seminar format and dates, and whether CSIT 621 is compulsory for every
student are unconfirmed and labelled as such; lesson length runs above the 3,000-word guide for about 15 new lessons
(the validator enforces minimums only).

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
| 8. Analytics | Done | Personalised dashboard (progress, weekly hours vs target, lesson-streak flame logged per day in `lesson_days` with an 18:00 "flame is fading" reminder (in-app, plus Web Push through the `streak-reminders` Edge Function for students who allow it), today's lessons rotated by the timetable, revision due, recommendations, course progress, weekly study + course performance charts, next session, deadlines, results, weak topics, announcements), Academic Progress centre, rule-based explainable recommendations, announcements, global search; browser-verified with real data |
| 9. Administration | Done | Admin console (overview, content publish/edit/Markdown import, assessment settings + question-bank import, resources CRUD + server-side link check, announcements, private course-material uploads, platform settings); `/api/verify-link` Netlify Function (admin-only, SSRF-guarded, rate-limited); published materials shown on course pages via signed URLs |
| 10. PWA | Done | Installable manifest (standalone, 192/512/maskable icons); service worker precaches the app shell and all route chunks (97 entries, ~2.2 MB) while Mermaid renderers and non-Latin font subsets are cached on first use; offline reading, offline note writes via the outbox, sync on reconnect; offline fixes: queries run in `networkMode: 'always'`, Supabase requests fail fast when offline, profile cached per user, stale-session sign-out only on an explicit auth rejection |
| 11. Quality assurance | Done | Playwright E2E suite (16 tests: registration/onboarding, sign-in errors, route protection, catalogue, lesson completion, notes, search, quiz scoring, timetable/planner, assignments, admin denial, offline reading + outbox sync, phone layout); security review below |
| 12. Deployment preparation | Done | `README.md`, `docs/DEPLOYMENT.md` (Supabase project, migrations, seed, auth URLs, Netlify env vars, first admin, security checks, free-tier limits); curriculum status regenerated; final verification gate passed. Deployed on Vercel with a Supabase cloud project (see Deployment status below) |

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
| 2026-11-13 | `npm run test:e2e` (production build via `vite preview`, local Supabase; desktop Chrome + Pixel 7) | 16/16 pass, twice in a row (44 s, 39 s). Throwaway accounts are created through the admin API and deleted by the teardown project |
| 2026-11-13 | Full gate: typecheck, lint, unit, integration, content validation, build | Pass: 42 unit, 34 integration, 0 content errors/warnings, lint 0 errors (29 dev-only react-refresh warnings), production build OK |
| 2026-11-13 | Vercel switch: typecheck, lint, unit tests, production build, link-checker smoke test | Pass. `api/verify-link.ts` called directly: no token → 401, non-admin → 403, private address → 400, public URL → 200 `verified`. Not yet run on Vercel itself (no Vercel project connected) |

## Security review (2026-11-13)

* **Secrets:** no keys or tokens in tracked files; the service-role key is never referenced by browser code and
  does not appear in the built bundle. Tests read it from the running local stack at run time.
* **Authorisation:** every table has RLS; admin writes require `is_admin()`; `grant_admin` is not executable by
  `anon`/`authenticated`. Verified by integration tests (students cannot edit content, settings or quizzes, post
  announcements, upload materials, read hidden lessons/files, read answer keys or self-grant admin).
* **XSS:** all lesson/note Markdown is sanitised with DOMPurify (unit-tested); Mermaid runs with
  `securityLevel: 'strict'`; external links use `rel="noopener noreferrer"` and a URL scheme allow-list.
* **CSP and headers:** `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, HSTS, nosniff,
  referrer policy and permissions policy in `vercel.json` (moved from `netlify.toml` when hosting switched to Vercel).
* **Link checker (`/api/verify-link`):** admin token required (checked with `is_admin()`), http(s) only, every
  resolved address must be public (blocks private, loopback, link-local, CGNAT, multicast and IPv4-mapped IPv6),
  redirects are not followed, 15 s timeout, 30 checks per minute per token. Residual risk: DNS rebinding between
  the lookup and the fetch; mitigated by the admin-only access and no redirect following.
* **Offline data:** cached per user in IndexedDB and cleared on sign-out; a network failure no longer signs the
  student out (which previously wiped their saved data).
* **Dependencies (`npm audit --omit=dev`):** 0 vulnerabilities. Resolved by moving to `zod` 4.6.7 (the high
  advisory on oversized collections; zod only validates forms in the browser) and Mermaid 12.2.0, which brings a
  fixed `katex`. The dev-only test runner moved to Vitest 5.0.5, which drops the vulnerable `tinypool`.

## Errors encountered

* First `supabase start` failed mid-download (Docker Desktop DNS lookups to ghcr.io/ECR failed). Retried
  successfully after disabling Studio, analytics, realtime and edge runtime (not needed by GradPath).

## Credentials still required (owner action)

* A Supabase cloud project (URL and anon/publishable key) — see `docs/DEPLOYMENT.md` steps 2–5.
* A Vercel project importing `https://github.com/10954065/gradpath` with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` set for Production and Preview — step 6.
* Custom SMTP for auth emails before inviting a full cohort (Supabase's built-in sender is rate-limited).

## Deployment readiness

**Deployed.** Live at https://gradpath-000-6c1c.vercel.app (Vercel, Node.js 24, auto-deploys from `main`), backed by
a Supabase cloud project with all migrations applied and the curriculum seed loaded (7 courses, 159 lessons,
1,161 questions, 919 flashcards). Verified on the live site: pages, security headers, the `/api/verify-link`
function, and sign-up (a real account completed email confirmation). The production build, all
automated tests and the browser checks also pass against a local Supabase stack running the same migrations.

Known follow-ups (not blockers):
* 29 dev-only `react-refresh/only-export-components` lint warnings (no runtime effect).
* Of 225 checked links, 3 were unreachable and 26 could not be verified automatically (sites that block bots) at the
  last check; they are labelled for students and can be reviewed on Admin console → Resources.

## Continuation instructions

1. Local development: `npx supabase start`, `npx supabase db reset`, write `.env.local` from
   `npx supabase status -o json`, then `npm run dev` (details in `README.md`).
2. Before committing: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`,
   `npm run build`; for UI changes also `npm run test:e2e`.
3. Content changes: edit `content/`, `npm run content:validate`, `npm run content:build`, then reload the seed
   (locally `npx supabase db reset`; in the cloud `psql … -f supabase/seed.sql`).
4. Deployment: follow `docs/DEPLOYMENT.md`.
