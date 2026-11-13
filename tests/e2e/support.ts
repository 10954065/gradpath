import { execSync } from 'node:child_process'
import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * E2E tests run against the local Supabase stack (`npx supabase start` + `npx supabase db reset`).
 * The service key is read from the running stack (or SUPABASE_TEST_* variables) — never from the repository —
 * and is only used by the test runner to create and delete throwaway accounts, never by the browser.
 */
export const E2E_EMAIL_DOMAIN = 'e2e.gradpath.local'
export const E2E_PASSWORD = 'E2e-Study-Pass-2026!'
export const STUDENT_STATE = 'tests/e2e/.auth/student.json'

let admin: SupabaseClient | null = null

export function serviceClient(): SupabaseClient {
  if (admin) return admin
  let url = process.env.SUPABASE_TEST_URL
  let key = process.env.SUPABASE_TEST_SERVICE_KEY
  if (!url || !key) {
    const raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>
    url = status.API_URL
    key = status.SERVICE_ROLE_KEY
  }
  if (!url || !key) throw new Error('Local Supabase is not running. Run `npx supabase start`.')
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${E2E_EMAIL_DOMAIN}`
}

/** Create a confirmed account directly (skips the email step) and return its email. */
export async function createAccount(label: string, fullName: string): Promise<string> {
  const email = uniqueEmail(label)
  const { error } = await serviceClient().auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } })
  if (error) throw error
  return email
}

/** Remove every account created by the E2E suite (cascades to all of their data). */
export async function deleteE2eAccounts(): Promise<number> {
  const client = serviceClient()
  const ids: string[] = []
  // Collect first, then delete, so deletions do not shift the pages being listed.
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    ids.push(...data.users.filter((u) => u.email?.endsWith(`@${E2E_EMAIL_DOMAIN}`)).map((u) => u.id))
    if (data.users.length < 200) break
  }
  for (const id of ids) await client.auth.admin.deleteUser(id)
  return ids.length
}

/** Walk every onboarding step with the default choices (including the provisional timetable), then finish. */
export async function completeOnboarding(page: Page): Promise<void> {
  const next = page.getByRole('button', { name: /^(Continue|Finish and go to dashboard)$/ })
  for (let step = 0; step < 10; step += 1) {
    await expect(next).toHaveCount(1)
    const label = (await next.innerText()).trim()
    await next.click()
    if (label.startsWith('Finish')) break
  }
  await page.waitForURL(/\/dashboard/)
}

/** Dismiss the one-off "ready to work offline" notice whenever it would cover something a test clicks. */
export async function handleOfflineReadyNotice(page: Page): Promise<void> {
  await page.addLocatorHandler(page.getByText('GradPath is ready to work offline.'), async () => {
    await page.getByRole('button', { name: 'Dismiss' }).click()
  })
}
