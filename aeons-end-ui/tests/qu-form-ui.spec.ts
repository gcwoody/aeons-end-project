import { expect, test, type Page } from '@playwright/test'

async function startGame(page: Page, mage1: string, mage2 = 'jian') {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: 'Wave 9' }).click()
  await page.getByLabel('Player 1').selectOption(mage1)
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { name: 'Wave 1' }).click()
  await page.getByLabel('Player 2').selectOption(mage2)
  await page.getByRole('button', { name: 'Start Game' }).click()
  for (let attempt = 0; attempt < 20; attempt++) {
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click()
      continue
    }
    const resolveButton = page.getByRole('button', { name: 'Resolve Card', exact: true })
    if (await resolveButton.isVisible().catch(() => false)) {
      await resolveButton.click()
      continue
    }
    const skipButton = page.getByRole('button', { name: 'Skip', exact: true })
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click()
      continue
    }
    const confirmButton = page.getByRole('button', { name: 'Confirm', exact: true })
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
      continue
    }
    const damageTarget = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (await damageTarget.isVisible().catch(() => false)) {
      await damageTarget.click()
      continue
    }
    return
  }
}


test('Yan Magda is displayed as a spaced name during gameplay', async ({ page }) => {
  await startGame(page, 'yan_magda')

  await expect(page.locator('.char-btn').first()).toContainText('Yan Magda')
  await expect(page.locator('body')).not.toContainText('yan_magda')
})
