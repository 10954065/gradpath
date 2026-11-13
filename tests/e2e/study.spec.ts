import { expect, test } from '@playwright/test'

test('a student takes a lesson quiz and gets a server-scored result', async ({ page }) => {
  await page.goto('/courses/csit-601/lessons/meaning-purpose-and-characteristics')
  await page.getByRole('link', { name: 'Take the quiz' }).click()
  await expect(page.getByText(/supplementary/i).first()).toBeVisible()
  await page.getByRole('button', { name: /^(Start|Retake)$/ }).click()
  await page.waitForURL(/\/assessments\/attempts\/[^/]+\/take/)

  // Answer whatever is answerable on each question (first option / a short written answer), then submit.
  for (let i = 0; i < 40; i += 1) {
    const radio = page.locator('main input[type=radio]').first()
    if (await radio.isVisible().catch(() => false)) await radio.check()
    const written = page.getByLabel('Your answer').first()
    if (await written.isVisible().catch(() => false)) await written.fill('Systematic enquiry')
    const next = page.getByRole('button', { name: /^Next/ })
    if (!(await next.isVisible().catch(() => false))) break
    await next.click()
  }
  await page.getByRole('button', { name: /^Submit/ }).first().click()
  await page.getByRole('button', { name: 'Submit now' }).click()

  await page.waitForURL(/\/assessments\/attempts\/[^/]+$/)
  await expect(page.getByText(/^\d{1,3}%$|^—$/).first()).toBeVisible()
  await expect(page.getByText(/Mastery achieved|Below the \d+% mastery target/)).toBeVisible()
})

test('the timetable shows the provisional schedule added during onboarding', async ({ page }) => {
  await page.goto('/timetable')
  await expect(page.getByText(/provisional/i).first()).toBeVisible()
  await page.goto('/planner')
  await expect(page.getByRole('heading', { name: 'Study Planner' })).toBeVisible()
  await expect(page.getByLabel('Weekly target progress')).toBeVisible()
})

test('a student adds an assignment with a due date', async ({ page }) => {
  const title = `Research proposal draft ${Date.now()}`
  await page.goto('/assignments')
  await page.getByRole('button', { name: 'Add assignment' }).first().click()
  await page.locator('#a-title').fill(title)
  await page.locator('#a-course').click()
  await page.getByRole('option', { name: /CSIT 601/ }).click()
  await expect(page.locator('#a-course')).toContainText('CSIT 601')
  await page.locator('#a-priority').click()
  await page.getByRole('option', { name: 'High' }).click()
  const due = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  const local = new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  await page.locator('#a-due').fill(local)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Assignment saved')).toBeVisible()
  await expect(page.getByText(title)).toBeVisible()
})

test('students cannot open the admin console', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByText('Administrators only')).toBeVisible()
})
