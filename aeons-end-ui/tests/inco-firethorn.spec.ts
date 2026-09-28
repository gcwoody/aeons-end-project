import { expect, test } from '@playwright/test'

test('Inco buys the revealed Firethorn by clicking its pile', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: 'Wave 9' }).click()
  await page.getByLabel('Player 1').selectOption('inco')
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { name: 'Wave 1' }).click()
  await page.getByLabel('Player 2').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const inco = debugState.game.players.find((player: { mageType: string }) => player.mageType === 'inco')
  inco.bonusAether = 5
  inco.regularAetherSpent = 0
  debugState.game.currentTurn = inco.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.game.nemesisResolution = null
  debugState.phase = 'main'
  debugState.selectedPlayer = inco.id
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const firethornPile = page.locator('.player-specific-deck-pile')
  await expect(firethornPile.locator('.specific-deck-gain-button')).toHaveCount(0)
  await expect(firethornPile.locator('.player-pile-count')).toHaveText('10')
  await firethornPile.click()
  await expect(firethornPile.locator('.player-pile-count')).toHaveText('9')
  await expect(page.locator('.pile-modal')).toHaveCount(0)
})

test('Inco reveals each player Deck and Discard Pile, including a skip-only empty choice', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: 'Wave 9' }).click()
  await page.getByLabel('Player 1').selectOption('inco')
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { name: 'Wave 1' }).click()
  await page.getByLabel('Player 2').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const inco = debugState.game.players.find((player: { mageType: string }) => player.mageType === 'inco')
  const jian = debugState.game.players.find((player: { mageType: string }) => player.mageType === 'jian')
  inco.charge = inco.chargeThreshold
  inco.breaches[0].prepSpells = ['spark']
  inco.breaches[0].preppedThisTurn = [false]
  inco.breaches[0].preppedSpellFaceDown = [false]
  inco.deck = ['arcing_firethorn', 'crystal']
  inco.discard = ['jade', 'blooming_firethorn']
  jian.deck = ['spark', 'crystal']
  jian.discard = ['jade']
  debugState.game.currentTurn = inco.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.phase = 'main'
  debugState.selectedPlayer = inco.id
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'Activate Ability' }).click()
  const highlightedSpell = page.locator('.breach-spell-card-frame.ability-prepped-spell')
  await expect(highlightedSpell).toHaveCount(1)
  await highlightedSpell.click()
  const decision = page.locator('.decision-modal')
  await expect(decision).toBeVisible()
  await expect(decision.locator('.decision-card-zone-label')).toHaveText(['DECK', 'DISCARD PILE'])
  await expect(decision.locator('.decision-card-choice')).toHaveCount(5)
  await expect(decision.locator('.decision-card-choice:disabled')).toHaveCount(3)
  await expect(decision.getByRole('button', { name: 'Confirm' })).toBeVisible()
  await decision.locator('.decision-card-choice').filter({ has: page.locator('img[alt="Arcing Firethorn"]') }).click()
  await decision.getByRole('button', { name: 'Confirm' }).click()

  await expect(decision).toBeVisible()
  await expect(decision.locator('.decision-card-zone-label')).toHaveText(['DECK', 'DISCARD PILE'])
  await expect(decision.locator('.decision-card-choice:disabled')).toHaveCount(3)
  await expect(decision.getByRole('button', { name: 'Confirm' })).toHaveCount(0)
  await expect(decision.getByRole('button', { name: 'Skip' })).toBeVisible()
  await decision.getByRole('button', { name: 'Skip' }).click()
  await expect(decision).toHaveCount(0)
})
