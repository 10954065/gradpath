import { expect, test, type Page } from '@playwright/test'

const LESSON = '/courses/csit-601/lessons/meaning-purpose-and-characteristics'

/** Scroll through the whole article the way a reader would, so the reading tracker records progress. */
async function readToTheEnd(page: Page) {
  for (let i = 0; i < 80; i += 1) {
    const atBottom = await page.evaluate(() => {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8))
      return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
    })
    if (atBottom) break
    await page.waitForTimeout(120)
  }
}

test('My Courses lists the eight Semester 1 courses with CSIT 613 as the selected elective', async ({ page }) => {
  await page.goto('/courses')
  const mine = page.getByRole('list', { name: 'My courses' })
  for (const code of ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 613', 'CSIT 617', 'CSIT 621']) {
    await expect(mine.getByText(code, { exact: true })).toBeVisible()
  }
  await expect(mine.getByRole('listitem')).toHaveCount(8)
  await expect(mine.getByText('Selected elective · 3 credit slots')).toBeVisible()
  await expect(mine.getByText('Required · 1 credit slot')).toBeVisible()
  await expect(mine.getByText('Special topic · 1 credit slot')).toBeVisible()
  await expect(page.getByText(/^8 enrolled courses · 20 credit slots/)).toBeVisible()
  await expect(page.getByText('CSIT 609')).toHaveCount(0)
})

test('a student reads a lesson, marks it complete and sees progress', async ({ page }) => {
  await page.goto(LESSON)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Meaning, Purpose and Characteristics of Research')
  const complete = page.getByRole('button', { name: 'Mark as complete' })
  await expect(complete).toBeDisabled()

  await readToTheEnd(page)
  await expect(complete).toBeEnabled({ timeout: 15_000 })
  await complete.click()
  await expect(page.getByRole('button', { name: 'Mark as not complete' })).toBeVisible()

  await page.goto('/courses/csit-601')
  await expect(page.getByText(/^1\/\d+ lessons · \d+%$/)).toBeVisible()
  await expect(page.getByLabel('Completed').first()).toBeVisible()

  // Taking a lesson today lights the streak flame.
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: /^Study streak: 1 day\. Today’s lesson is done/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Flame lit/ }).first()).toBeVisible()
  await expect(page.getByText('Today’s lessons')).toBeVisible()
})

test('a private lesson note is saved and listed on My Notes', async ({ page }) => {
  const title = `Paradigm summary ${Date.now()}`
  await page.goto(LESSON)
  await page.getByLabel('Note title').fill(title)
  await page.getByLabel('Note', { exact: true }).fill('Positivism vs interpretivism — compare ontology and epistemology.')
  await page.getByLabel('Note', { exact: true }).locator('xpath=ancestor::form').getByRole('button').last().click()
  await expect(page.getByText('Note saved')).toBeVisible()

  await page.goto('/notes')
  await expect(page.getByText(title)).toBeVisible()
})

test('search finds lessons by topic', async ({ page }) => {
  await page.goto('/search?q=thematic%20analysis')
  await expect(page.getByRole('link').filter({ hasText: /thematic/i }).first()).toBeVisible()
})
