import { expect, test } from '@playwright/test'

const MY_COURSES = ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 613', 'CSIT 617', 'CSIT 621']

test('the dashboard shows eight enrolled courses worth twenty credit slots', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByTestId('selection-headline')).toHaveText('8 enrolled courses · 20 credit slots')
  const byClassification = page.getByRole('list', { name: 'Courses by classification' })
  await expect(byClassification.getByText('5 core')).toBeVisible()
  await expect(byClassification.getByText('1 required')).toBeVisible()
  await expect(byClassification.getByText('1 special topic')).toBeVisible()
  await expect(byClassification.getByText('1 elective (CSIT 613)')).toBeVisible()
  await expect(page.getByText('Confirm your elective')).toHaveCount(0)
  for (const code of MY_COURSES) {
    await expect(page.getByRole('link', { name: new RegExp(`^${code}`) }).first()).toBeVisible()
  }
})

test('Settings shows the same selection and its credit total', async ({ page }) => {
  await page.goto('/settings?tab=courses')
  await expect(page.getByTestId('registration-total')).toContainText('8 enrolled courses · 20 credit slots')
  await expect(page.getByText('Selected elective · 3 credit slots')).toBeVisible()
})

test('the study planner offers exactly the eight enrolled courses', async ({ page }) => {
  await page.goto('/planner')
  await page.getByRole('button', { name: 'Add session' }).click()
  await page.getByRole('combobox', { name: 'Course' }).click()
  const options = page.getByRole('option')
  await expect(options).toHaveCount(MY_COURSES.length + 1)
  for (const code of MY_COURSES) await expect(options.filter({ hasText: code })).toHaveCount(1)
  await expect(options.filter({ hasText: 'CSIT 609' })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('the CSIT 610 seminar tracker records a topic and preparation progress', async ({ page }) => {
  await page.goto('/courses/csit-610')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seminar')
  await page.getByRole('button', { name: 'Add seminar' }).click()
  await page.getByLabel('Topic', { exact: true }).fill('Mobile money interoperability in Ghana')
  await page.getByLabel('Topic chosen and scoped').check()
  await page.getByLabel('Focus question or argument written').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Mobile money interoperability in Ghana')).toBeVisible()
  await expect(page.getByText('25%')).toBeVisible()
  await expect(page.getByText('No date yet')).toBeVisible()
})

test('every enrolled course has a mixed revision test', async ({ page }) => {
  await page.goto('/assessments?tab=revision')
  for (const code of MY_COURSES) {
    await expect(page.getByRole('link', { name: new RegExp(`${code} mixed revision test`) })).toBeVisible()
  }
})
