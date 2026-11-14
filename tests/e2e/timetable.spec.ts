import { expect, test } from '@playwright/test'

const MY_COURSES = ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 613', 'CSIT 617', 'CSIT 621']

test('the official timetable shows its source and all twenty sessions for my eight courses', async ({ page }) => {
  await page.goto('/timetable/official')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Official University Timetable')
  const facts = page.getByRole('definition')
  await expect(facts.filter({ hasText: 'MSc IT for Business (ITB)' })).toBeVisible()
  await expect(facts.filter({ hasText: '2026/2027' })).toBeVisible()
  await expect(facts.filter({ hasText: 'Semester 1' })).toBeVisible()
  await expect(facts.filter({ hasText: 'Africa/Accra' })).toBeVisible()
  await expect(facts.filter({ hasText: 'Department of Computer Science' })).toBeVisible()
  await expect(page.getByTestId('attendance-status')).toHaveText('20 confirmed · 0 awaiting confirmation')
  await expect(page.getByText('Attendance allocation pending confirmation')).toHaveCount(0)
  await expect(page.getByText(/confirmed that all 20 sessions are correct/)).toBeVisible()

  const cards = page.getByTestId('course-timetable-card')
  await expect(cards).toHaveCount(8)
  for (const code of MY_COURSES) await expect(cards.filter({ hasText: code })).toHaveCount(1)
  await expect(page.getByTestId('week-session')).toHaveCount(20)
  await expect(page.getByText('CSIT 609')).toHaveCount(0)
})

test('the list view filters by venue, day and course', async ({ page }) => {
  await page.goto('/timetable/official')
  await page.getByRole('tab', { name: 'List' }).click()
  const rows = page.getByTestId('session-row')
  await expect(rows).toHaveCount(20)
  await expect(rows.filter({ hasText: 'Confirmed for all ITB students' })).toHaveCount(20)

  await page.getByRole('combobox', { name: 'Filter by venue' }).click()
  await page.getByRole('option', { name: 'Earth Science Room 2' }).click()
  await expect(rows).toHaveCount(3)
  for (const row of await rows.all()) await expect(row).toContainText('CSIT 613')
  await expect(rows.filter({ hasText: 'Wednesday' })).toContainText('7:30 pm – 9:30 pm')

  await page.getByRole('combobox', { name: 'Filter by venue' }).click()
  await page.getByRole('option', { name: 'All venues' }).click()
  await page.getByRole('combobox', { name: 'Filter by day' }).click()
  await page.getByRole('option', { name: 'Saturday' }).click()
  await expect(rows).toHaveCount(6)
  await page.getByRole('combobox', { name: 'Filter by day' }).click()
  await page.getByRole('option', { name: 'Sunday' }).click()
  await expect(rows).toHaveCount(6)
  await expect(rows.first()).toContainText('7:30 am – 9:30 am')
  await expect(rows.first()).toContainText('CSIT 607')
})

test('a session links to its course page', async ({ page }) => {
  await page.goto('/timetable/official')
  await page.getByRole('link', { name: /^CSIT 607 Wednesday 5:30 pm/ }).click()
  await expect(page).toHaveURL(/\/courses\/csit-607$/)
  await expect(page.getByRole('heading', { name: 'Lecture times' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Published lecture sessions' }).getByRole('listitem')).toHaveCount(3)
})

test('a student can opt out of a confirmed session, and confirmed sessions appear in the planner without counting as study', async ({ page }) => {
  await page.goto('/timetable/official')
  await page.getByRole('tab', { name: 'List' }).click()
  await page.getByRole('combobox', { name: 'My attendance for CSIT 601 Monday 7:30 pm – 9:30 pm' }).click()
  await page.getByRole('option', { name: 'Not assigned to my class' }).click()
  await expect(page.getByTestId('attendance-status')).toHaveText('19 confirmed · 0 awaiting confirmation')

  await page.getByRole('switch', { name: 'Only my confirmed sessions' }).click()
  await page.getByRole('tab', { name: 'Week' }).click()
  await expect(page.getByTestId('week-session')).toHaveCount(19)
  await page.reload()
  await expect(page.getByTestId('week-session')).toHaveCount(19)
  await page.getByRole('switch', { name: 'Only my confirmed sessions' }).click()
  await expect(page.getByTestId('week-session')).toHaveCount(20)
  await page.getByRole('tab', { name: 'List' }).click()
  await page.getByRole('combobox', { name: 'My attendance for CSIT 601 Monday 7:30 pm – 9:30 pm' }).click()
  await page.getByRole('option', { name: 'Confirmed for my class' }).click()
  await expect(page.getByTestId('attendance-status')).toHaveText('20 confirmed · 0 awaiting confirmation')

  await page.goto('/planner')
  // Lectures begin on Monday 16 November 2026: next week always has some, whatever today's date.
  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page.getByText('Official lecture').first()).toBeVisible()
  await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/of lectures not counted/)).toBeVisible()
})

test('the study plan is rebuilt around the lectures', async ({ page }) => {
  await page.goto('/timetable')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Study Plan')
  await page.getByRole('button', { name: 'Rebuild my study plan around my lectures' }).click()
  const dialog = page.getByRole('dialog', { name: 'Your lecture-aligned study plan' })
  await expect(dialog.getByText('CSIT 601 preview before the Monday lecture')).toBeVisible()
  await dialog.getByRole('button', { name: 'Replace my provisional blocks' }).click()
  await expect(page.getByText('Your study plan now fits around your lectures.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Monday' }).getByText('CSIT 601 preview before the Monday lecture')).toBeVisible()
  await expect(page.getByText(/clash with published lectures/)).toHaveCount(0)
})

test('lectures begin on Monday 16 November, and a student who started studying on Friday 13 November gets Friday-to-Thursday weeks everywhere', async ({ page }) => {
  await page.goto('/timetable/official')
  await expect(page.getByTestId('lectures-begin')).toHaveText('Monday 16 November 2026')
  await page.goto('/planner')
  await expect(page.getByTestId('planner-week')).toContainText(/ · Mon \d+ \w+ to Sun /)

  await page.goto('/settings')
  await page.getByLabel('My studies started on').fill('2026-11-13')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved')).toBeVisible()

  await page.goto('/')
  await expect(page.getByTestId('today')).toContainText(/Study week \d+|Before your studies started/)
  await page.goto('/planner')
  await expect(page.getByTestId('planner-week')).toHaveText(/^(Study week \d+|Before your studies started) · Fri \d+ \w+ to Thu \d+ \w+ \d{4}$/)
  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(page.getByTestId('planner-week')).toContainText(/ · Fri \d+ \w+ to Thu/)
  await page.goto('/timetable/official')
  await expect(page.getByRole('region', { name: 'Official weekly timetable' }).locator('div.border-b').nth(1)).toHaveText('Friday')
  await page.goto('/timetable')
  await expect(page.locator('section[aria-label]').first()).toHaveAttribute('aria-label', 'Friday')
})

test.describe('on a device set to another time zone', () => {
  test.use({ timezoneId: 'America/New_York' })

  test('times are still shown in Ghana time', async ({ page }) => {
    await page.goto('/timetable/official')
    await page.getByRole('tab', { name: 'List' }).click()
    const monday = page.getByTestId('session-row').filter({ hasText: 'Monday' })
    await expect(monday).toContainText('7:30 pm – 9:30 pm')
    await expect(monday).toContainText('CSIT 601')
    await expect(page.getByText('Africa/Accra (Ghana time, GMT)')).toBeVisible()
  })
})
