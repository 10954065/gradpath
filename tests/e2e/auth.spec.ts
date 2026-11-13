import { expect, test } from '@playwright/test'
import { completeOnboarding, E2E_PASSWORD, uniqueEmail } from './support'

// These flows start signed out.
test.use({ storageState: { cookies: [], origins: [] } })

test('a new student can register, onboard, sign out and sign back in', async ({ page }) => {
  const email = uniqueEmail('register')
  await page.goto('/register')
  await page.locator('#fullName').fill('Kofi Boateng')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(E2E_PASSWORD)
  await page.locator('#confirm').fill(E2E_PASSWORD)
  await page.getByRole('checkbox', { name: /independent supplementary study platform/i }).check()
  await page.locator('button[type=submit]').click()

  await page.waitForURL(/\/onboarding/)
  await completeOnboarding(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kofi')

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()
  await page.waitForURL(/\/sign-in/)

  await page.locator('#email').fill(email)
  await page.locator('#password').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/)
})

test('protected pages redirect signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/courses')
  await page.waitForURL(/\/sign-in/)
  await expect(page.locator('#email')).toBeVisible()
})

test('wrong credentials show a clear error without signing in', async ({ page }) => {
  await page.goto('/sign-in')
  await page.locator('#email').fill(uniqueEmail('nobody'))
  await page.locator('#password').fill('Not-The-Right-Password-1')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText('The email or password is incorrect.')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in/)
})
