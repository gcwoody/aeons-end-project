import { expect, test } from '@playwright/test'

test('Indira casting an ally spell twice keeps her discard queue off the ally board', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('indira')
  await page.getByLabel('Player 2 Mage').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  const indira = saved.game.players[0]
  const jian = saved.game.players[1]
  const playedCards = ['wave9_crystal', 'fused_opal']
  indira.playedThisTurn = [...playedCards]
  indira.hand = []
  indira.charge = indira.chargeThreshold
  jian.hand = ['spark']
  jian.playedThisTurn = []
  saved.game.currentTurn = indira.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  saved.game.nemesis.playArea = []
  saved.phase = 'main'
  saved.selectedPlayer = indira.id
  saved.discardRemaining = []
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const playedZoneCards = page.locator('.played-zone-center .zone-card-track .card')
  const mageButtons = page.locator('.char-btn')
  await expect(playedZoneCards).toHaveCount(2)
  await page.getByRole('button', { name: 'Activate Ability' }).click()
  await page.getByRole('button', { name: "Cast a spell from an ally's hand twice without discarding it" }).click()
  await expect(page.locator('.char-btn.sel .cn')).toHaveText('jian')
  await page.locator('.hand .card.pending-board-card').click()

  await expect(page.locator('.controls-status .phase')).toContainText('Discard Phase')
  await expect(playedZoneCards).toHaveCount(0)
  await mageButtons.filter({ has: page.locator('.cn', { hasText: 'indira' }) }).click()
  await expect(playedZoneCards).toHaveCount(2)
})
