import { expect, test } from '@playwright/test'

test('Tressa setup reveals loaded level-three Treasure fronts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: 'Wave 9' }).click()
  await page.getByLabel('Player 1').selectOption('tressa')
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { name: 'Wave 1' }).click()
  await page.getByLabel('Player 2').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()

  const decision = page.locator('.decision-modal')
  const revealedTreasures = decision.locator('.card-selection-panel .decision-card-choice img')
  await expect(decision).toBeVisible()
  await expect(revealedTreasures).toHaveCount(2)
  await expect.poll(() => revealedTreasures.evaluateAll(images =>
    images.every(image => image.complete && image.naturalWidth > 0),
  )).toBe(true)
  const revealedNames = await revealedTreasures.evaluateAll(images => images.map(image => image.alt))
  expect(revealedNames.every(name => name.endsWith(' Stance'))).toBe(true)

  await revealedTreasures.first().click()
  await decision.getByRole('button', { name: 'Confirm' }).click()
  await expect(decision).toBeHidden()

  await page.locator('.player-specific-deck-pile').click()
  const vault = page.locator('.pile-modal')
  await expect(vault).toBeVisible()
  await expect(vault.locator('img[alt$=" Stance"]')).toHaveCount(2)
  await expect(vault.locator('img[alt="Tressa\'s Vault card back"]')).toHaveCount(2)
})

test('Reconnect Tissue switches to the ally card choice and returns to Tressa afterward', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: 'Wave 9' }).click()
  await page.getByLabel('Player 1').selectOption('tressa')
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { name: 'Wave 1' }).click()
  await page.getByLabel('Player 2').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()

  const setupDecision = page.locator('.decision-modal')
  await expect(setupDecision).toBeVisible()
  await setupDecision.locator('.decision-card-choice').first().click()
  await setupDecision.getByRole('button', { name: 'Confirm' }).click()
  await expect(setupDecision).toBeHidden()

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const saved = JSON.parse(await stateField.inputValue())
  const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
  const ally = saved.game.players.find((player: { mageType: string }) => player.mageType === 'jian')
  tressa.charge = tressa.chargeThreshold
  tressa.playerCardsInPlay = []
  tressa.playerCardSupplyTargets = []
  tressa.playerCardPowerTokens = []
  tressa.specificDeck = ['overload_stance']
  tressa.knownSpecificDeckCards = []
  ally.hand = ['crystal']
  ally.discard = ['jade']
  saved.game.currentTurn = tressa.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  saved.phase = 'main'
  saved.selectedPlayer = tressa.id
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'Activate Ability' }).click()
  const allyMageButton = page.locator('.char-btn').filter({ hasText: 'Jian' })
  await expect(allyMageButton).toHaveClass(/sel/)

  const destruction = page.locator('.decision-modal')
  await expect(destruction.getByRole('heading', { name: 'Destroy a card from your hand or discard pile?' })).toBeVisible()
  await expect(destruction.locator('.decision-card-zone')).toHaveCount(2)
  await expect(destruction.locator('.decision-card-zone-label')).toHaveText(['HAND', 'DISCARD PILE'])
  await expect(destruction.locator('.decision-card-choice')).toHaveCount(2)
  await destruction.getByRole('button', { name: 'Skip' }).click()

  const vaultDecision = page.locator('.decision-modal')
  await expect(vaultDecision.getByRole('heading', { name: /Put a level-3 Treasure in play/ })).toBeVisible()
  await expect(page.locator('.char-btn').filter({ hasText: 'Tressa' })).toHaveClass(/sel/)
})

test('Tressa Treasure action glow follows eligibility and the owning Mage turn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: 'Wave 9' }).click()
  await page.getByLabel('Player 1').selectOption('tressa')
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { name: 'Wave 1' }).click()
  await page.getByLabel('Player 2').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()

  const setupDecision = page.locator('.decision-modal')
  await expect(setupDecision).toBeVisible()
  await setupDecision.locator('.decision-card-choice').first().click()
  await setupDecision.getByRole('button', { name: 'Confirm' }).click()
  await expect(setupDecision).toBeHidden()

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  const editState = async (edit: (saved: any) => void) => {
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const saved = JSON.parse(await stateField.inputValue())
    edit(saved)
    await stateField.fill(JSON.stringify(saved))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
  }

  await editState(saved => {
    const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
    saved.selectedPlayer = tressa.id
    saved.phase = 'main'
    saved.game.currentTurn = tressa.id
    saved.game.currentPhase = 'main'
    tressa.hand = ['crystal']
    tressa.playerCardsInPlay = ['artifact_stance']
    tressa.playerCardSupplyTargets = [null]
    tressa.playerCardPowerTokens = [0]
  })
  const playerCard = page.locator('.player-in-play-card')
  await expect(playerCard).not.toHaveClass(/in-play-action/)

  await editState(saved => {
    const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
    tressa.hand = ['jade']
  })
  await expect(playerCard).toHaveClass(/in-play-action/)

  await editState(saved => {
    const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
    const ally = saved.game.players.find((player: { mageType: string }) => player.mageType === 'jian')
    saved.game.currentTurn = ally.id
    tressa.hand = ['crystal']
    tressa.playerCardsInPlay = ['breach_stance']
    tressa.playerCardSupplyTargets = [null]
    tressa.playerCardPowerTokens = [0]
  })
  await expect(page.locator('.player-in-play-card')).not.toHaveClass(/in-play-action/)

  await editState(saved => {
    const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
    saved.game.currentTurn = tressa.id
  })
  await expect(page.locator('.player-in-play-card')).toHaveClass(/in-play-action/)
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
})
