import { test, expect } from '@playwright/test'

test('rejects selecting the same Mage twice', async ({ page }) => {
  await page.goto('/')
  const selectedMage = await page.getByLabel('Player 2 Mage').inputValue()
  const selectedWave = await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { selected: true }).textContent()
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: selectedWave?.trim() }).click()
  await page.getByLabel('Player 1 Mage').selectOption(selectedMage)
  await expect(page.getByText('This Mage has already been selected by another player.')).toBeVisible()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.getByText('Market', { exact: true })).toHaveCount(0)
})
