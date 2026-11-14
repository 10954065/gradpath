# GradPath — Implementation Plan

Phases follow the master build brief. Each phase ends with typecheck/lint/tests where applicable and a
commit. Progress is recorded in `BUILD_STATUS.md`; curriculum progress in `CURRICULUM_STATUS.md`.

| Phase | Scope | Exit criteria |
|---|---|---|
| 1. Audit and foundation | Toolchain (Vite, TS strict, Tailwind, ESLint, Vitest, Playwright), PWA and Netlify config, Supabase local config, content format and validator, documentation | `npm run typecheck`, `npm run build` succeed |
| 2. Database and security | Migrations for all entities, RLS, definer functions (roles, attempts, scoring, completion rules, revision, notifications), storage buckets, seed generator | Migrations apply on a clean local stack; RLS integration tests with two students pass |
| 3. Design system | Tokens, themes, UI primitives, app shell (sidebar, mobile nav, breadcrumbs), auth pages, onboarding | All navigation routes render; light/dark; responsive |
| 4. Curriculum engine | Course catalogue, course overview, module and lesson pages, lesson reader (TOC, progress, text size, Mermaid), resources library | Seeded courses browse end-to-end |
| 5. Learning progress | Reading progress, explicit completion with requirements, bookmarks, notes linked to lessons | Progress persists across sessions |
| 6. Assessments | Quiz/assessment/mock-exam runner, timer, navigation, server scoring, feedback, history, retakes, mastery | Attempt lifecycle verified end-to-end |
| 7. Productivity | Planner, recurring timetable with provisional schedule, assignments, flashcards, spaced repetition, notifications | CRUD + recurrence + reviews verified |
| 8. Analytics | Dashboard widgets, progress centre charts from real data, weak topics, recommendations | No fabricated data; empty states for new users |
| 9. Administration | Content CRUD, publishing, resources, quizzes/mock exams, announcements, uploads, content import, settings (mastery threshold) | Admin-only enforcement verified |
| 10. PWA | Install prompt, offline shell, offline content, outbox sync, conflict handling | Offline behaviour verified in a real browser |
| 11. QA | Full unit/integration/E2E runs, responsive checks, accessibility pass, security review | All suites executed; results recorded |
| 12. Deployment prep | README, deployment guide, Supabase guide, env docs, final status docs | Production build verified |

## Semester 1 curriculum update (2026-11-14)

| Step | Scope | Exit criteria |
|---|---|---|
| U1. Audit | Code, content and live database against the confirmed 8-course, 20-slot selection | Findings recorded in `BUILD_STATUS.md` |
| U2. Data model | Course classification and credit slots, personal enrolment rules, seminar tracker table, assessment types on deadlines, mixed revision tests, personalised mixed mock, CSIT 610 study block (migration 11) | Migrations apply from empty; integration tests for selection, slots, privacy |
| U3. Application | One source for "my courses" (`useMyCourses`) used by the dashboard, courses, planner, timetable, deadlines, notes, revision, flashcards, resources, library, assessments, mock exams, search and settings; onboarding elective choice; university timetable separate from the study plan | Typecheck, lint, browser tests for dashboard count, slots and planner picker |
| U4. Content | CSIT 610 Seminar course (11 lessons); gap lessons in 603, 605, 607, 613, 617 and 621 | Content validation 0 errors; seed rebuilt |
| U5. Release | Docs, cloud migration and seed, deployment | Live checks |

## Key decisions

1. **Scoring in PostgreSQL** rather than in a serverless function: one trust boundary (RLS), no service-role
   key needed anywhere, and works against any Supabase project.
2. **Content as files compiled to SQL**: reviewable in git, validated automatically, and still editable in
   the admin console afterwards.
3. **Unified attempt table**: lesson quizzes, module assessments and mock exams are all `quizzes` rows
   with a `kind`; `assessment_attempts` and `mock_exam_attempts` are security-invoker views over
   `quiz_attempts`, avoiding duplicated attempt logic while keeping the required entities.
4. **Per-user IndexedDB namespaces** cleared on sign-out for shared-device privacy.
5. **No paid AI dependency**: recommendations are rule-based and explainable.
6. **Shared curriculum, personal selection**: `courses` holds the programme (with classification and credit slots);
   `course_enrolments` holds each student's own selection. Compulsory courses enrol automatically and never
   overwrite a choice; electives are each student's decision, so one student's selection is never imposed on another.
