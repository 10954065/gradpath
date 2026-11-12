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
| 4. Curriculum engine | Pending | Content authoring in progress (see CURRICULUM_STATUS.md) |
| 5. Learning progress | Pending | |
| 6. Assessments | Pending | |
| 7. Productivity | Pending | |
| 8. Analytics | Pending | |
| 9. Administration | Pending | |
| 10. PWA | Pending | |
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

## Errors encountered

* First `supabase start` failed mid-download (Docker Desktop DNS lookups to ghcr.io/ECR failed). Retried
  successfully after disabling Studio, analytics, realtime and edge runtime (not needed by GradPath).

## Credentials still required (owner action)

* Supabase cloud project URL and anon key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
* Netlify site linked to the GitHub repository.

## Deployment readiness

Not ready — application build in progress.

## Continuation instructions

Start the local stack with `npx supabase start`, then continue with the first phase above marked
Pending.
