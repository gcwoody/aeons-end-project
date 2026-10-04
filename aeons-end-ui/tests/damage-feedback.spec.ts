import { test, expect, type Page } from '@playwright/test'

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
    return
  }
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

test('Play All Gems animates in sequence and waits for a card decision', async ({ page }) => {
  await startCleanGame(page)
  // Keep the travel long enough to assert the intermediate state rather than
  // racing the end of the animation on a fast test machine.
  await page.addStyleTag({ content: ':root { --card-flight-duration: 1200ms; }' })
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

  await expect(page.locator('.card-flight-clone')).toBeVisible()
  const destination = page.locator(`.player-discard-pile [data-discard-top-card="${cardId}"]`)
  await expect(destination).toBeHidden()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(destination).toBeVisible()
})

test('Discard Phase waits for each card flight before advancing the turn', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --card-flight-duration: 1200ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = []
    player.playedThisTurn = ['crystal', 'spark', 'emerald_shard']
    player.discard = ['vriswood_amber']
  })

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  await expect(page.locator('.controls .phase')).toHaveText('Discard Phase · Card Order')
  const previousTop = page.locator('.player-discard-pile [data-discard-top-card="vriswood_amber"]')
  await expect(previousTop).toBeVisible()
  await page.locator('.played-zone-center [data-discard-phase-card-index="0"]').click()

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
