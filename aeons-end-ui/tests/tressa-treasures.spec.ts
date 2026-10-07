import { expect, test, type Page } from '@playwright/test'

async function clearInitialNemesisDraw(page: Page) {
  let quietChecks = 0
  for (let attempt = 0; attempt < 40; attempt++) {
    const flight = page.locator('.nemesis-draw-flight-scene')
    if (await flight.isVisible().catch(() => false)) {
      await expect(flight).toHaveCount(0, { timeout: 5000 })
      quietChecks = 0
      continue
    }
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click({ position: { x: 12, y: 12 } })
      await expect(reveal).toHaveCount(0)
      quietChecks = 0
      continue
    }
    const shield = page.locator('.turn-transition-shield')
    if (await shield.isVisible().catch(() => false)) {
      await expect(shield).toBeHidden({ timeout: 5000 })
      quietChecks = 0
      continue
    }
    await page.waitForTimeout(100)
    if (++quietChecks >= 3) return
  }
}

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
  const revealedTreasures = decision.locator('.large-card-choice img')
  await expect(decision).toBeVisible()
  await expect(revealedTreasures).toHaveCount(2)
  await expect(decision.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(0)
  await expect.poll(() => revealedTreasures.evaluateAll(images =>
    images.every(image => image.complete && image.naturalWidth > 0),
  )).toBe(true)
  const revealedNames = await revealedTreasures.evaluateAll(images => images.map(image => image.alt))
  expect(revealedNames.every(name => name.endsWith(' Stance'))).toBe(true)

  await revealedTreasures.first().click()
  await expect(decision).toBeHidden()
  await clearInitialNemesisDraw(page)

  await page.locator('.char-btn').filter({ hasText: 'Tressa' }).click()
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
  await setupDecision.locator('.large-card-choice').first().click()
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
  await setupDecision.locator('.large-card-choice').first().click()
  await expect(setupDecision).toBeHidden()

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  const editState = async (edit: (saved: any) => void) => {
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const saved = JSON.parse(await stateField.inputValue())
    saved.game.pendingDecision = null
    saved.game.pendingEffect = null
    saved.game.pendingNemesisDiscard = null
    saved.game.nemesisResolution = null
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
    tressa.hand = []
  })
  const breachStance = page.locator('.player-in-play-card')
  await expect(breachStance).not.toHaveClass(/in-play-action/)
  await breachStance.click()
  await expect(page.locator('.decision-modal')).toHaveCount(0)

  await editState(saved => {
    const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
    tressa.hand = ['crystal']
  })
  await expect(breachStance).toHaveClass(/in-play-action/)
  await expect(breachStance).toHaveClass(/game-highlight--available/)
  await expect.poll(() => breachStance.evaluate(element =>
    getComputedStyle(element, '::after').borderTopColor,
  )).toBe('rgb(158, 206, 106)')

  await editState(saved => {
    const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
    tressa.playerCardsInPlay = ['breach_stance', 'creator_stance']
    tressa.playerCardSupplyTargets = [null, null]
    tressa.playerCardPowerTokens = [0, 0]
  })
  const stackedBreachStance = page.locator('.player-in-play-card').filter({
    has: page.locator('img[alt="Breach Stance"]'),
  })
  await expect(stackedBreachStance).toHaveClass(/in-play-action/)
  const activeCardStackIndex = Number(await stackedBreachStance.evaluate(element =>
    getComputedStyle(element.parentElement!).zIndex,
  ))
  const coveredCardStackIndex = Number(await page.locator('.player-in-play-card').filter({
    has: page.locator('img[alt="Creator Stance"]'),
  }).evaluate(element => getComputedStyle(element.parentElement!).zIndex))
  expect(activeCardStackIndex).toBeGreaterThan(coveredCardStackIndex)
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await stackedBreachStance.click()
  const inPlayPile = page.locator('.pile-modal')
  await expect(inPlayPile.locator('.player-card-in-play-action img[alt="Breach Stance"]')).toBeVisible()
  await inPlayPile.getByRole('button', { name: 'Close' }).click()

  await page.keyboard.press('Control+d')
  await editState(saved => {
    const tressa = saved.game.players.find((player: { mageType: string }) => player.mageType === 'tressa')
    tressa.breaches.filter((breach: { present?: boolean }) => breach.present !== false)
      .forEach((breach: { opened: boolean }) => { breach.opened = true })
  })
  await expect(stackedBreachStance).not.toHaveClass(/in-play-action/)
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
})
