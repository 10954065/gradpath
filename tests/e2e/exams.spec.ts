import { expect, test } from '@playwright/test'

// Ghana time is GMT, so UTC dates are Ghana dates.
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

test('a student adds an examination, sees the countdown and plans revision back from it into the planner', async ({ page }) => {
  await page.goto('/exams')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Exam Countdown')
  await expect(page.getByText('No examination dates yet')).toBeVisible()

  await page.getByRole('button', { name: 'Add an examination' }).first().click()
  const add = page.getByRole('dialog', { name: 'Add an examination' })
  await add.getByRole('combobox', { name: 'Course' }).click()
  await page.getByRole('option', { name: /^CSIT 601/ }).click()
  await add.getByLabel('Date').fill(inDays(30))
  await add.getByLabel('Start time (Ghana time)').fill('09:00')
  await add.getByLabel('Venue').fill('Great Hall')
  await add.getByRole('button', { name: 'Add examination' }).click()
  await expect(add).toBeHidden()

  const card = page.getByTestId('exam-card').filter({ hasText: 'CSIT 601' })
  await expect(card.getByTestId('exam-days')).toHaveText('30')
  await expect(card).toContainText('In 30 days')
  await expect(card).toContainText('Great Hall')
  await expect(card.getByTestId('exam-plan')).toHaveText('No revision planned yet')

  await card.getByRole('button', { name: 'Plan revision' }).click()
  const plan = page.getByRole('dialog', { name: 'Revision plan · CSIT 601' })
  const sessions = plan.getByRole('list', { name: 'Planned revision sessions' }).getByRole('listitem')
  await expect(sessions).toHaveCount(14)
  await expect(sessions.last()).toContainText('CSIT 601 final review')
  await plan.getByRole('combobox', { name: 'Start revising' }).click()
  await page.getByRole('option', { name: '7 days before' }).click()
  await expect(sessions).toHaveCount(7)
  await plan.getByRole('button', { name: 'Add 7 sessions to my planner' }).click()
  await expect(plan).toBeHidden()
  await expect(card.getByTestId('exam-plan')).toHaveText('0 of 7 revision sessions done')

  // The revision sessions are in the planner in the week before the exam.
  await page.goto('/planner')
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page.getByText(/CSIT 601 (revision|final review)/).first()).toBeVisible()

  await page.goto('/dashboard')
  const countdown = page.getByTestId('exam-countdown')
  await expect(countdown).toContainText('CSIT 601')
  await expect(countdown).toContainText('In 30 days')

  await page.goto('/exams')
  await card.getByRole('button', { name: 'Remove plan' }).click()
  await card.getByRole('button', { name: 'Confirm remove' }).click()
  await expect(card.getByTestId('exam-plan')).toHaveText('No revision planned yet')

  // The examination is one of the student's deadlines; delete it so later tests start with an empty list.
  await page.goto('/assignments')
  await page.getByRole('button', { name: 'Delete CSIT 601 examination' }).click()
  await page.getByRole('dialog', { name: 'Delete this assignment?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('CSIT 601 examination')).toHaveCount(0)
})
