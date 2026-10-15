import { test, expect } from '@playwright/test'


test('end-of-turn draw to five does not show a Mage hand gain badge', async ({ page }) => {
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
  const brama = saved.game.players.find((candidate: { mageType: string }) => candidate.mageType === 'brama')
  mist.hand = []
  mist.deck = ['crystal', 'spark', 'crystal', 'spark', 'crystal']
  mist.discard = []
  mist.playedThisTurn = []
  saved.game.currentTurn = mist.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  saved.game.turnOrderDeck = [brama.id]
  saved.phase = 'main'
  saved.selectedPlayer = mist.id
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const mistButton = page.locator('.char-btn').filter({ has: page.locator('.cn', { hasText: 'mist' }) })
  const bramaButton = page.locator('.char-btn').filter({ has: page.locator('.cn', { hasText: 'brama' }) })
  await expect(mistButton.locator('.chand strong')).toHaveText('0')
  const endTurnButton = page.getByRole('button', { name: 'End Turn', exact: true })
  await endTurnButton.click()
  if (await page.locator('.end-turn-warning').isVisible()) await endTurnButton.click()

  await expect(bramaButton).toHaveClass(/sel/)
  await expect(mistButton.locator('.chand strong')).toHaveText('5')
  await expect(mistButton.locator('.chand-gain')).toHaveCount(0)
})
