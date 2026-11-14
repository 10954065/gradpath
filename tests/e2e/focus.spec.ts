import { expect, test } from '@playwright/test'

test('the focus timer logs focused minutes in the planner, stopping early or running to the end', async ({ page }) => {
  await page.clock.install()
  await page.goto('/focus')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Focus Timer')

  await page.getByRole('combobox', { name: 'Course' }).click()
  await page.getByRole('option', { name: /^CSIT 601/ }).click()
  await page.getByRole('button', { name: 'Start focusing' }).click()
  await expect(page.getByTestId('focus-clock')).toHaveText('25:00')
  await expect(page.getByTestId('focus-chip')).toContainText('Focus')

  // Twelve minutes in, stop early: twelve minutes are logged.
  await page.clock.fastForward('12:00')
  await expect(page.getByTestId('focus-clock')).toHaveText('13:00')
  await page.getByRole('button', { name: 'Stop and log 12 min' }).click()
  await expect(page.getByText('12 focused minutes logged in your planner.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeVisible()
  await expect(page.getByTestId('focus-chip')).toHaveCount(0)

  // A full session ends by itself, is logged, and the break starts; the timer keeps running on other pages.
  await page.getByRole('combobox', { name: 'Course' }).click()
  await page.getByRole('option', { name: /^CSIT 601/ }).click()
  await page.getByRole('button', { name: 'Start focusing' }).click()
  await page.goto('/dashboard')
  await expect(page.getByTestId('focus-chip')).toContainText('Focus')
  await page.clock.fastForward('25:01')
  await expect(page.getByText('25 focused minutes logged in your planner.')).toBeVisible()
  await expect(page.getByTestId('focus-chip')).toContainText('Break')
  await page.getByTestId('focus-chip').click()
  await page.getByRole('button', { name: 'End break' }).click()
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeVisible()

  await page.goto('/planner')
  await expect(page.getByText('Focus: CSIT 601')).toHaveCount(2)
})
