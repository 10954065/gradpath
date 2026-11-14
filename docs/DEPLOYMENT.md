# Deploying GradPath

GradPath is a static React app hosted on Vercel and backed by Supabase (Postgres, Auth, Storage). One small Vercel
Function (`api/verify-link.ts`, served at `/api/verify-link`) checks resource links for administrators. No paid AI
service is used.

The current production site is https://gradpath-000-6c1c.vercel.app. Pushing to `main` redeploys it; apply new
migrations with `npx supabase db push --linked` before pushing code that depends on them.

This guide takes you from an empty Supabase account and an empty Vercel account to a working site.
Do the steps in order.

---

## 1. Prerequisites

* Node.js 20 or newer (`package.json` declares `"engines": { "node": ">=20" }`; Vercel uses a current LTS).
* The repository cloned locally and `npm ci` run once.
* A Supabase account and a Vercel account (sign in to Vercel with GitHub). The free plans are enough to start.
* The Supabase CLI runs through `npx supabase …` (installed as a dev dependency). You do **not** need Docker for a
  cloud-only deployment; Docker is only needed for the local stack and the integration/E2E tests.

---

## 2. Create the Supabase project

1. In the Supabase dashboard choose **New project**. Pick a region close to your students (for Ghana, a European
   region such as London or Frankfurt is usually the lowest-latency option — check the list Supabase offers).
2. Save the **database password** in your password manager. You need it for the CLI.
3. When the project is ready, open **Project Settings → API** and note:
   * **Project URL** → becomes `VITE_SUPABASE_URL`
   * **anon / publishable key** → becomes `VITE_SUPABASE_ANON_KEY`
   * The **service_role / secret key** is *not* needed by GradPath. Never put it in a `VITE_` variable, in
     Vercel's environment variables or in git.
4. Note the **project reference** (the `abcd1234…` part of the project URL).

## 3. Apply the database schema

From the repository root:

```bash
npx supabase login                       # opens the browser once
npx supabase link --project-ref <project-ref>
npx supabase db push                     # applies supabase/migrations/* in order
```

`db push` creates every table, Row Level Security policy, function, trigger and the three private storage buckets
(`avatars`, `assignment-files`, `course-materials`). Run it again after pulling new migrations.

## 4. Load the curriculum (seed data)

`supabase/seed.sql` is generated from `content/` by `npm run content:build`. It contains the eight Semester 1 courses, all
lessons, question banks (with answer keys in the server-only `question_keys` table), quizzes, flashcards and
resources. It uses deterministic IDs and upserts, so loading it again updates content without duplicating it and
without touching student data.

Load it with `psql` using the connection string from **Project Settings → Database → Connection string (URI)**:

```bash
npm run content:build                    # regenerate seed.sql from content/ (optional if unchanged)
psql "postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres" -f supabase/seed.sql
```

The file is about 7 MB; it takes under a minute. (If you prefer the CLI, recent versions support
`npx supabase db push --include-seed`; check `npx supabase db push --help` for your version.)

Check it worked in **Table Editor**: `courses` should have 7 rows and `lessons` 159.

## 5. Configure authentication

In **Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| Site URL | `https://<your-project>.vercel.app` (or your custom domain) |
| Redirect URLs | `https://<your-project>.vercel.app/**`, `https://<your-project>-*-<your-team>.vercel.app/**` (preview deployments) and, if you use one, `https://<custom-domain>/**` |

The app sends students to `/auth/callback` after email confirmation and to `/reset-password` from reset emails;
both are covered by the `/**` pattern. Add `http://localhost:5173/**` too if you develop against the cloud project.

In **Authentication → Providers → Email**:

* Keep **Confirm email** enabled for production. The app shows "Check your email" after registration and handles
  the confirmation link.
* Supabase's built-in email sender is rate-limited and intended for testing. Before inviting a full cohort,
  configure custom SMTP under **Authentication → Emails → SMTP Settings** (any transactional email provider works).
* Optionally raise the minimum password length (the app already requires 8 characters with letters and numbers).

## 6. Create the Vercel project

1. In Vercel choose **Add New… → Project**, import the `gradpath` GitHub repository and keep the root directory.
2. Vercel reads `vercel.json`, so the build settings are already correct:
   * Framework preset: **Vite**
   * Build command: `npm run build`
   * Output directory: `dist`
   * Functions: every file in `api/` (here only `api/verify-link.ts`, Node.js runtime)
3. Before the first deploy, open **Environment Variables** and add, for **Production** and **Preview**:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL from step 2 |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key from step 2 |
   | `VITE_SITE_URL` | `https://<your-project>.vercel.app` (optional; Production only) |

   `VITE_` variables are baked into the browser bundle at build time, so changing them needs a redeploy. The link
   checker reads the same URL and anon key at run time and forwards the administrator's own session token, so it needs
   no privileged key. (If you connect Supabase through the Vercel Marketplace integration instead, it creates its own
   variables; still add the two `VITE_` ones above, because the browser build only reads `VITE_`-prefixed names.)
4. Click **Deploy**. When it finishes, open the site: you should see the sign-in page. If you see
   "GradPath needs configuration", the `VITE_` variables were missing at build time — add them and redeploy
   (**Deployments → … → Redeploy**).

`vercel.json` sets the security headers (Content-Security-Policy, HSTS, `nosniff`, frame denial), long-term caching
for hashed assets, no caching for the service worker, the HTML shell and `/api/*`, and the single-page-app fallback
(every path except `/api/` serves `index.html`). Every push to `main` deploys to production; other branches and pull
requests get preview URLs. If you add a custom domain (**Settings → Domains**), add it to the Supabase Site URL and
Redirect URLs (step 5).

## 7. Create the first administrator

Administrators manage content, assessments, resources, announcements and uploaded course materials at `/admin`.
The role can only be granted from the database — never from the app.

1. Register on the live site with the administrator's email and confirm it.
2. In Supabase open **SQL Editor** and run:

   ```sql
   select public.grant_admin('admin@example.com');
   ```

3. Sign out and in again; **Admin console** is now available at `/admin`.

To remove the role: `select public.revoke_admin('admin@example.com');`

### Streak reminders (push notifications)

Every day at 18:00 Accra time (UTC) a `pg_cron` job runs `public.queue_streak_reminders()`. Students whose flame
is fading (a lesson yesterday, none yet today) get an in-app notification; those who turned on **Settings →
Preferences → Browser notifications** also get a push notification on each device, sent by the
`streak-reminders` Edge Function. Migration `20261113000010` creates the job and a random shared secret in Vault.
Then, once per project:

1. Create a VAPID key pair and store it as function secrets, without printing the private key, for example from a
   temporary env file you delete afterwards:
   `npx supabase secrets set --env-file keys.env` with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
   (your site URL).
2. Put the same public key in the app: `VITE_VAPID_PUBLIC_KEY` in Vercel, or the default in
   `src/services/notifications/push.ts`. Changing keys later re-subscribes devices automatically.
3. Deploy the function: `npx supabase functions deploy streak-reminders --use-api` (`verify_jwt` is off in
   `supabase/config.toml`; the function checks the Vault secret instead).
4. Tell the database where the function is:

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/streak-reminders', 'streak_reminders_url');
   ```

Without step 4 the in-app reminders still work and no push is attempted. Push works in Chrome, Edge, Firefox and
Android browsers; on iPhone and iPad (iOS 16.4+) only after the student adds GradPath to the Home Screen.
Responses from the function are kept briefly in `net._http_response` if you need to check a run.

## 8. Check that security is working

These checks take five minutes and confirm the database is protecting student data.

* **Automated (recommended):** the integration tests prove RLS against a local copy of the same migrations:

  ```bash
  npx supabase start && npx supabase db reset
  npm run test:integration       # 34 tests: isolation between students, admin-only writes, storage rules, scoring
  ```

* **On the live project:** register two test students. As student A, create a note and an assignment. Sign in as
  student B and confirm **My Notes** and **Assignments** are empty. In the Supabase **Table Editor**, confirm RLS
  shows as enabled on every table (the migrations enable it everywhere).
* Confirm `/admin` shows "Administrators only" for a normal student.
* In **Storage**, confirm all three buckets are **private**.

Delete the test accounts afterwards from **Authentication → Users**.

## 9. Uploading lecturer and institutional materials

Administrators upload PDF, DOCX, PPTX or TXT files (25 MB maximum) on **Admin console → Materials**, attach them to
a course, module or lesson and mark the source (lecturer, institutional or supplementary). Files start hidden.
Students only see a file after it is published, and they open it through a link that expires after five minutes.
Upload only material you have permission to share.

## 10. Updating content

1. Edit Markdown/YAML in `content/` (see `docs/CONTENT_AUTHORING.md`).
2. `npm run content:validate` — must report 0 errors.
3. `npm run content:build` — regenerates `supabase/seed.sql` and `CURRICULUM_STATUS.md`.
4. Commit, push (Vercel redeploys), then load the new seed into the cloud database with `psql … -f supabase/seed.sql`.

Small fixes (publishing, a single lesson, a question bank, links) can also be done in the Admin console without a
redeploy.

## 11. Free-tier limits to be aware of

Plans change, so confirm current limits on the Supabase and Vercel pricing pages before you rely on them.

* **Supabase free projects are paused after a period of inactivity** (about a week at the time of writing). A
  paused project returns errors until you restore it from the dashboard. GradPath prevents this with a daily Vercel
  cron (`vercel.json` → `/api/keep-alive`, 06:00 UTC) that makes one tiny database request. To restrict that
  endpoint to Vercel's cron, add a `CRON_SECRET` environment variable in Vercel (optional; the request uses only
  the public key, so it reveals nothing). If the project ever does pause, restore it from the Supabase dashboard.
* Database size, storage, bandwidth and monthly active users are capped on the free plan. GradPath's content is
  small (the seed is ~7 MB), so the main growth areas are uploaded course materials and assignment attachments.
* The built-in auth email sender is heavily rate-limited — use custom SMTP for real cohorts (step 5).
* Vercel's free **Hobby** plan is for personal, non-commercial projects and limits bandwidth, builds and function
  usage. The site is static; the functions are the admin link checker and the daily keep-alive, so normal
  student use costs almost no function invocations. If GradPath is run by an organisation or charges students, use a paid team plan.

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| "GradPath needs configuration" screen | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` were not set for the build. Add them and redeploy. |
| Confirmation or reset email link goes to localhost or shows an error | Set the Site URL and Redirect URLs in Supabase (step 5). |
| Courses page is empty | The seed was not loaded (step 4), or courses are hidden in the Admin console. |
| "Check link" says the checker only runs on the deployed site | Expected with `npm run dev`: the checker is a Vercel Function. It works on the deployed site, or locally with `npx vercel dev`. |
| Opening or refreshing a page such as `/courses` gives a 404 | `vercel.json` is missing from the deployment, or the project root directory is not the repository root. |
| Students see an old version | The app shows "A new version of GradPath is available — Reload". Closing all tabs also updates it. |
| Every request fails after a quiet period | The free Supabase project was paused; restore it in the dashboard. |
