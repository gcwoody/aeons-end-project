import { test, expect } from '@playwright/test'

test('charge gains show a blue Mage status bubble', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('mist')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  const mist = saved.game.players.find((candidate: { mageType: string }) => candidate.mageType === 'mist')
  saved.game.currentTurn = mist.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  mist.bonusAether = 2
  mist.regularAetherSpent = 0
  mist.charge = 0
  saved.phase = 'main'
  saved.selectedPlayer = mist.id
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const mistButton = page.locator('.char-btn').filter({ has: page.locator('.cn', { hasText: 'mist' }) })
  await page.getByRole('button', { name: 'Charge', exact: true }).click()
  const bubble = mistButton.locator('.status-change-bubble--charge')
  await expect(bubble).toHaveText('+1')
  await expect(bubble).toHaveCSS('background-color', 'rgb(49, 87, 164)')
  await expect(bubble).toHaveCSS('color', 'rgb(255, 255, 255)')
})
