import { expect, test } from '@playwright/test'

// Official lectures begin on Monday 16 November 2026 (Ghana time is GMT). Before then nothing can be checked in,
// and every completed lesson counts as a head start; afterwards ended lectures wait for a check-in.
const LECTURES_BEGIN = Date.parse('2026-11-16T00:00:00Z')

test('lecture check-ins and pace: the page, the dashboard card and the course page', async ({ page }) => {
  const begun = Date.now() >= LECTURES_BEGIN
  await page.goto('/lectures')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lecture Check-ins')

  const paces = page.getByTestId('course-pace')
  await expect(paces).toHaveCount(8)
  for (const badge of await page.getByTestId('pace-status').all()) {
    await expect(badge).toHaveText(
      begun ? /ahead of the lectures|behind the lectures|Level with the lectures|Check in after a lecture to compare/ : /ahead before lectures begin|Lectures have not begun yet/,
    )
  }

  if (!begun) {
    await expect(page.getByText('Lectures have not begun yet').first()).toBeVisible()
    await expect(page.getByText(/Official lectures begin Monday 16 November 2026/)).toBeVisible()
    await expect(page.getByTestId('due-check-in')).toHaveCount(0)
  } else if (await page.getByTestId('due-check-in').count()) {
    const first = page.getByTestId('due-check-in').first()
    await first.getByRole('button', { name: /^Check in for/ }).click()
    const dialog = page.getByRole('dialog', { name: /check-in$/ })
    await dialog.getByRole('checkbox').first().check()
    await dialog.getByLabel('Notes from the lecture').fill('Checked in from the end-to-end test.')
    await dialog.getByRole('button', { name: 'Save check-in' }).click()
    await expect(page.getByText(/^Check-in saved/)).toBeVisible()
    await expect(page.getByTestId('check-in').filter({ hasText: 'Checked in from the end-to-end test.' })).toHaveCount(1)
  }

  await page.goto('/dashboard')
  const summary = page.getByTestId('lecture-summary')
  await expect(summary).toBeVisible()
  if (!begun) await expect(summary).toContainText('Lectures have not begun yet.')
  await expect(summary.getByRole('link', { name: /Lecture check-ins and pace/ })).toHaveAttribute('href', '/lectures')

  await page.goto('/courses/csit-601')
  await expect(page.getByRole('heading', { name: 'You and the lectures' })).toBeVisible()
  await expect(page.getByTestId('course-pace')).toHaveCount(1)
})
