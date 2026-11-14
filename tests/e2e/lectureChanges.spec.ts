import { expect, test } from '@playwright/test'

test('a student cancels one week of a lecture, the planner leaves it out, and the change can be removed', async ({ page }) => {
  // CSIT 601 lectures in this planner week and the next: the first Monday lecture that can be changed is in one of
  // them, whichever weekday the student's study week starts on.
  const csit601 = page.getByText(/^CSIT 601 lecture · /)
  const lecturesInTwoWeeks = async () => {
    await page.goto('/planner')
    await page.waitForLoadState('networkidle')
    const thisWeek = await csit601.count()
    const heading = await page.getByTestId('planner-week').textContent()
    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(page.getByTestId('planner-week')).not.toHaveText(heading ?? '')
    await page.waitForLoadState('networkidle')
    return thisWeek + (await csit601.count())
  }
  const before = await lecturesInTwoWeeks()
  expect(before).toBeGreaterThan(0)

  await page.goto('/lectures')
  await page.getByRole('button', { name: 'Cancel or move a lecture' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel or move one lecture' })
  await dialog.getByRole('combobox', { name: 'Lecture' }).click()
  await page.getByRole('option', { name: 'CSIT 601 Monday 7:30 pm – 9:30 pm' }).click()
  await dialog.getByRole('combobox', { name: 'Which week' }).click()
  await page.getByRole('option').first().click()
  await dialog.getByRole('button', { name: 'Save change' }).click()
  await expect(page.getByText('Change saved. Your reminders, planner and calendar follow it.')).toBeVisible()
  const change = page.getByTestId('lecture-change')
  await expect(change).toHaveCount(1)
  await expect(change).toContainText('CSIT 601 · Monday')
  await expect(change).toContainText('Cancelled')

  expect(await lecturesInTwoWeeks()).toBe(before - 1)

  await page.goto('/lectures')
  await change.getByRole('button', { name: 'Remove' }).click()
  await expect(change).toHaveCount(0)
})
