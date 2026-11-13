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

test('the course catalogue lists all seven courses and flags the elective', async ({ page }) => {
  await page.goto('/courses')
  for (const code of ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 613', 'CSIT 617', 'CSIT 621']) {
    await expect(page.getByText(code, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByText(/recommended elective/i).first()).toBeVisible()
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
