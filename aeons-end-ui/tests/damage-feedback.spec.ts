import { test, expect, type Page } from '@playwright/test'

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

async function startCleanGame(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1' }).first().click()
  await page.getByRole('tab', { name: 'Wave 1' }).last().click()
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  for (let attempt = 0; attempt < 20; attempt++) {
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click()
      continue
    }
    const resolveCard = page.getByRole('button', { name: 'Resolve Card', exact: true })
    if (await resolveCard.isVisible().catch(() => false)) {
      await resolveCard.click()
      continue
    }
    const skip = page.getByRole('button', { name: 'Skip', exact: true })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      continue
    }
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true })
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click()
      continue
    }
    break
  }
  await clearInitialNemesisDraw(page)
}

async function applyMainPhaseState(page: Page, update: (game: any, player: any) => void) {
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  update(debugState.game, player)
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

test('casting a damaging spell shows localized damage feedback on the target', async ({ page }) => {
  await startCleanGame(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'casting'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'casting'
  for (const breach of player.breaches) breach.prepSpells = []
  player.breaches[0].opened = true
  player.breaches[0].prepSpells = ['spark']
  debugState.game.nemesis.playArea = []
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const hp = page.locator('.nemesis-info-nemesis .hp-num b')
  await expect(hp).toHaveText('70')
  await page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame').click()

  await expect(hp).toHaveText('69')
  await expect(page.locator('.damage-impact-nemesis .damage-impact-number')).toHaveText('−1')
  await expect(page.locator('.damage-impact-aura')).toBeVisible()
})

test('Tressa Overload Stance shows feedback when the last spell auto-enters Main Phase', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (game, player) => {
    player.mageType = 'tressa'
    player.playerCardsInPlay = ['overload_stance']
    player.playerCardSupplyTargets = [null]
    player.playerCardPowerTokens = [0]
    player.spellsCastThisTurn = 0
    for (const breach of player.breaches) {
      breach.prepSpells = []
      breach.preppedThisTurn = []
      breach.preppedSpellFaceDown = []
    }
    player.breaches[0].opened = true
    player.breaches[0].prepSpells = ['spark']
    player.breaches[0].preppedThisTurn = [false]
    player.breaches[0].preppedSpellFaceDown = [false]
    game.nemesis.hp = 70
    game.nemesis.playArea = []
    game.currentPhase = 'casting'
  })

  // The helper sets Main Phase for its standard fixtures; put the UI back in
  // Casting Phase so the final Spark drives the same automatic transition.
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'casting'
  debugState.game.currentPhase = 'casting'
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame').click()
  await expect(page.locator('.nemesis-info-nemesis .hp-num b')).toHaveText('68')
  const bubbles = page.locator('.damage-impact-nemesis .damage-impact-number')
  await expect(bubbles).toHaveCount(2)
  await expect(bubbles.nth(0)).toHaveText('−1')
  await expect(bubbles.nth(1)).toHaveText('−1')
})

test('damage to a Minion from a resolved effect gets a localized damage bubble', async ({ page }) => {
  await startCleanGame(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'casting'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'casting'
  for (const breach of player.breaches) breach.prepSpells = []
  player.breaches[0].opened = true
  player.breaches[0].prepSpells = ['spark']
  debugState.game.nemesis.playArea = [{
    cardId: 'haze_spewer', cardType: 'minion', placedAt: 123456,
    instanceId: 'haze-spewer-damage-feedback-test', enteredOnNemesisTurn: 0, lifeTokens: 5,
  }]
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame').click()
  const minion = page.locator('[data-damage-target="minion:123456"]')
  await expect(minion).toBeVisible()
  await minion.click()
  await expect(page.locator('.damage-impact-minion .damage-impact-number')).toHaveText('−1')
})

test('a resolved healing effect shows a green health feedback bubble', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (game, player) => {
    game.gravehold.hp = 27
    player.hand = ['focusing_orb']
    player.playedThisTurn = []
  })

  await page.locator('[data-hand-card-index="0"]').click()
  await page.getByRole('button', { name: 'Destroy this to let Gravehold gain 3 life' }).click()

  await expect(page.locator('.nemesis-info-gravehold .hp-num b')).toHaveText('30')
  const bubble = page.locator('.damage-impact-gravehold .damage-impact-number')
  await expect(bubble).toHaveText('+3')
  await expect(page.locator('.damage-impact-gravehold')).toHaveClass(/damage-impact--healing/)
})

test('Play All Gems animates in sequence and waits for a card decision', async ({ page }) => {
  await startCleanGame(page)
  // Keep the travel long enough to assert the intermediate state rather than
  // racing the end of the animation on a fast test machine.
  await page.addStyleTag({ content: ':root { --hand-to-play-zone-flight-duration: 1200ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = ['crystal', 'emerald_shard']
    player.playedThisTurn = []
  })

  await page.getByRole('button', { name: 'Play All Gems' }).click()
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(page.locator('.app')).toHaveClass(/card-motion-batch-active/)
  await expect(page.locator('.card-motion-shield')).toBeVisible()
  const decision = page.locator('.app .decision-overlay')
  await expect(decision).toHaveCount(1)
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(page.locator('.app')).toHaveClass(/card-motion-batch-active/)
  await expect(page.locator('.card-motion-shield')).toBeVisible()
  await expect(decision).toBeHidden()
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toBeVisible()
  await expect(page.locator('.played-zone-center [data-played-card-id="emerald_shard"]')).toBeHidden()
  await expect(decision).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.played-zone-center [data-played-card-id="emerald_shard"]')).toBeVisible()
})

test('buying a supply card animates it into the top of the discard pile', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (_game, player) => {
    player.bonusAether = 50
    player.regularAetherSpent = 0
    player.conditionalAetherEarned = {}
    player.condAetherSpent = {}
  })

  const supply = page.locator('.market-grid [data-supply-card-id]').first()
  const cardId = await supply.getAttribute('data-supply-card-id')
  expect(cardId).toBeTruthy()
  await supply.click()

  const flight = page.locator('.card-flight-clone')
  await expect(flight).toBeVisible()
  await expect(flight).not.toHaveClass(/can-buy|develop-action-available/)
  await expect(flight.locator('.remaining, .develop-cost-badge')).toHaveCount(0)
  const destination = page.locator(`.player-discard-pile [data-discard-top-card="${cardId}"]`)
  await expect(destination).toBeVisible()
  await expect(page.locator('.player-discard-pile')).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(destination).toBeVisible()
})

test('Discard Phase waits for each card flight before advancing the turn', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --discard-phase-flight-duration: 1200ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = []
    player.playedThisTurn = ['crystal', 'spark', 'emerald_shard']
    player.discard = ['vriswood_amber']
  })

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  await expect(page.locator('.controls .phase')).toHaveText('Discard Phase · Card Order')
  const playedHeading = page.locator('.played-zone-heading-played')
  const firstPlayedCard = page.locator('.played-zone-center [data-discard-phase-card-index="0"]')
  await firstPlayedCard.hover()
  const headingLayout = await page.evaluate(() => {
    const heading = document.querySelector('.played-zone-heading-played')!
    const zone = document.querySelector('.played-zone-center')!
    return {
      headingTop: heading.getBoundingClientRect().top,
      zoneTop: zone.getBoundingClientRect().top,
      headingLayer: Number.parseInt(getComputedStyle(heading.parentElement!).zIndex, 10),
      hoveredZoneLayer: Number.parseInt(getComputedStyle(zone).zIndex, 10),
    }
  })
  await expect(playedHeading).toBeVisible()
  expect(headingLayout.headingTop - headingLayout.zoneTop).toBeCloseTo(5, 0)
  expect(headingLayout.headingLayer).toBeGreaterThan(headingLayout.hoveredZoneLayer)
  const previousTop = page.locator('.player-discard-pile [data-discard-top-card="vriswood_amber"]')
  await expect(previousTop).toBeVisible()
  await firstPlayedCard.click()

  const crystalDestination = page.locator('.player-discard-pile [data-discard-top-card="crystal"]')
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(previousTop).toBeVisible()
  await expect(crystalDestination).toHaveCount(0)
  await expect(page.locator('.controls .phase')).toHaveText('Discard Phase · Card Order')
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(crystalDestination).toBeVisible()
  await expect(page.locator('.controls .phase')).toHaveText('Discard Phase · Card Order')
  await page.locator('.played-zone-center [data-discard-phase-card-index="0"]').click()
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(crystalDestination).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.controls .phase')).not.toHaveText('Discard Phase · Card Order')

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const resolved = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  expect(resolved.game.players[0].discard).toEqual(expect.arrayContaining(['crystal', 'spark', 'emerald_shard', 'vriswood_amber']))
})

test('Undo after the next Mage starts returns to the beginning of Discard Phase', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (game, player) => {
    player.hand = []
    player.playedThisTurn = ['crystal', 'spark', 'emerald_shard']
    player.pendingEndTurnCardIds = []
    player.discard = ['vriswood_amber']
    game.turnOrderDiscard = [player.id]
    game.turnOrderDeck = [game.players[1].id, 'nemesis', player.id]
  })

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  const discardPhase = page.getByText('Discard Phase · Card Order', { exact: true })
  if (await page.getByText('Actions remain. End turn anyway?', { exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  }
  await expect(discardPhase).toBeVisible()

  await page.locator('.played-zone-center [data-discard-phase-card-index="0"]').click()
  await page.locator('.played-zone-center [data-discard-phase-card-index="0"]').click()
  await expect(page.locator('.controls .phase')).not.toHaveText('Discard Phase · Card Order')
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const nextTurn = JSON.parse(await stateField.inputValue())
  expect(nextTurn.game.currentTurn).toBe(nextTurn.game.players[1].id)
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.keyboard.press('Control+z')
  await expect(discardPhase).toBeVisible()
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const undone = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  expect(undone.phase).toBe('discard_order')
  expect(undone.discardRemaining).toEqual(['crystal', 'spark', 'emerald_shard'])
  expect(undone.game.players[0].playedThisTurn).toEqual(['crystal', 'spark', 'emerald_shard'])
  expect(undone.game.players[0].discard).toEqual(['vriswood_amber'])
})
