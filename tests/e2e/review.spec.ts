import { expect, test } from '@playwright/test'

test('the weekly review shows the study week, suggestions for next week and earlier weeks', async ({ page }) => {
  await page.goto('/review')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Weekly Review')
  const week = page.getByTestId('review-week')
  await expect(week).toContainText(/ to /)
  // The label settles once the timetable (and with it the study calendar) has loaded, as the figures have.
  await expect(page.getByTestId('review-study')).toBeVisible()
  const thisWeek = await week.textContent()
  await expect(page.getByText(/^\d+% of your .* target$/)).toBeVisible()
  await expect(page.getByTestId('review-suggestions').getByRole('listitem').first()).toContainText(/hours?/)
  await expect(page.getByRole('button', { name: 'Next week' })).toBeDisabled()

  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(week).not.toHaveText(thisWeek ?? '')
  await page.getByRole('button', { name: 'This week' }).click()
  await expect(week).toHaveText(thisWeek ?? '')

  await page.goto('/settings?tab=preferences')
  await expect(page.getByText('End-of-week review')).toBeVisible()
})
