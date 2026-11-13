import { expect, test } from '@playwright/test'
import { handleOfflineReadyNotice } from './support'

test.beforeEach(({ page }) => handleOfflineReadyNotice(page))

const LESSON = '/courses/csit-601/lessons/meaning-purpose-and-characteristics'

test('a lesson opened online can be re-opened offline, and an offline note syncs on reconnect', async ({ page, context }) => {
  // Install the service worker and let it take control of the page.
  await page.goto('/dashboard')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  // Read the lesson once while online (saves it to this student's IndexedDB).
  await page.goto(LESSON)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Meaning, Purpose and Characteristics of Research')
  await expect(page.locator('main svg[aria-roledescription]').first()).toBeVisible({ timeout: 20_000 })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('You are offline')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Meaning, Purpose and Characteristics of Research', { timeout: 10_000 })
  await expect(page.locator('main svg[aria-roledescription]').first()).toBeVisible({ timeout: 15_000 })

  const title = `Offline note ${Date.now()}`
  await page.getByLabel('Note title').fill(title)
  await page.getByLabel('Note', { exact: true }).fill('Written without a connection.')
  await page.getByLabel('Note', { exact: true }).locator('xpath=ancestor::form').getByRole('button').last().click()
  await expect(page.getByText(/Offline · 1 pending/)).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText(/1 pending/)).toBeHidden({ timeout: 20_000 })
  await page.goto('/notes')
  await expect(page.getByText(title)).toBeVisible()
})
