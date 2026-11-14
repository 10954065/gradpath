import { expect, test, type Page } from '@playwright/test'

// Compare against the layout width (clientWidth): under mobile emulation window.innerWidth grows with the content,
// which would hide exactly the overflow this test is meant to catch.
async function expectNoHorizontalOverflow(page: Page, path: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
}

test('key screens fit a phone screen without sideways scrolling', async ({ page }) => {
  const paths = [
    '/dashboard',
    '/courses',
    '/courses/csit-601',
    '/courses/csit-601/lessons/meaning-purpose-and-characteristics',
    '/planner',
    '/timetable',
    '/timetable/official',
    '/assignments',
    '/assessments',
    '/notes',
    '/resources',
    '/settings',
  ]
  for (const path of paths) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoHorizontalOverflow(page, path)
  }
})

test('dropdowns open as designed lists and fit the phone screen', async ({ page }) => {
  await page.goto('/assignments')
  const sort = page.getByRole('combobox', { name: 'Sort' })
  await sort.click()
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible()
  const box = await list.boundingBox()
  const width = await page.evaluate(() => document.documentElement.clientWidth)
  expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true)
  await page.getByRole('option', { name: 'Sort by priority' }).click()
  await expect(sort).toHaveText('Sort by priority')
})

test('the navigation menu opens on a phone and links to My Courses', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  await page.getByRole('link', { name: 'My Courses' }).click()
  await page.waitForURL(/\/courses$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('the official timetable becomes a daily agenda on a phone', async ({ page }) => {
  await page.goto('/timetable/official')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Official University Timetable')
  await expect(page.getByTestId('week-session').first()).toBeHidden()
  await page.getByRole('tab', { name: /^Sat/ }).click()
  const agenda = page.getByRole('list', { name: 'Saturday sessions' })
  await expect(agenda.getByRole('article')).toHaveCount(6)
  await expect(agenda.getByRole('article').first()).toContainText('7:30 am – 9:30 am')
  await expectNoHorizontalOverflow(page, '/timetable/official (Saturday)')
})
