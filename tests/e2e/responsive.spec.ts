import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test('key screens fit a phone screen without sideways scrolling', async ({ page }) => {
  for (const path of ['/dashboard', '/courses', '/courses/csit-601/lessons/meaning-purpose-and-characteristics', '/planner', '/assessments', '/notes']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }
})

test('the navigation menu opens on a phone and links to My Courses', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  await page.getByRole('link', { name: 'My Courses' }).click()
  await page.waitForURL(/\/courses$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
