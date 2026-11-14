import { expect, test } from '@playwright/test'

test('a student creates, replaces and turns off a private calendar link in Settings', async ({ page }) => {
  await page.goto('/settings?tab=preferences')
  await expect(page.getByText('Phone calendar')).toBeVisible()
  await page.getByRole('button', { name: 'Create my calendar link' }).click()

  const link = page.getByRole('textbox', { name: 'Your calendar link' })
  await expect(link).toHaveValue(/\/api\/calendar\?token=[0-9a-f]{64}$/)
  const first = await link.inputValue()
  await expect(page.getByRole('link', { name: 'Open in my calendar app' })).toHaveAttribute('href', first.replace(/^https?:/, 'webcal:'))

  await page.getByRole('button', { name: 'Replace link' }).click()
  await page.getByRole('button', { name: 'Confirm: replace the link' }).click()
  await expect(page.getByText('New calendar link ready. The old link no longer works.')).toBeVisible()
  await expect(link).not.toHaveValue(first)
  await expect(link).toHaveValue(/token=[0-9a-f]{64}$/)

  await page.getByRole('button', { name: 'Turn off' }).click()
  await page.getByRole('button', { name: 'Confirm: turn off' }).click()
  await expect(page.getByRole('button', { name: 'Create my calendar link' })).toBeVisible()
})
