import { expect, test as setup } from '@playwright/test'
import { completeOnboarding, createAccount, E2E_PASSWORD, STUDENT_STATE } from './support'

/** Sign in a fresh student through the real UI, complete onboarding, and save the session for the other specs. */
setup('sign in and onboard a student', async ({ page }) => {
  const email = await createAccount('student', 'Ama Mensah')
  await page.goto('/sign-in')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/onboarding/)

  await completeOnboarding(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ama')
  await page.context().storageState({ path: STUDENT_STATE })
})
