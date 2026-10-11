import { test, expect } from '@playwright/test'

async function startTestGame(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('jian')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
}

async function resolveStartupInterrupts(page: import('@playwright/test').Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = page.getByRole('button', { name: /^(Continue|Resolve Card|Skip|Confirm|Attack .+|Gravehold)$/ }).first()
    if (!(await next.isVisible().catch(() => false))) return
    if (!(await next.isEnabled().catch(() => false))) return
    await next.click()
  }
}

async function currentDiscardCount(page: import('@playwright/test').Page): Promise<number> {
  const count = page.locator('.player-discard-pile .player-pile-count')
  return await count.count() ? Number(await count.innerText()) : 0
}

function discardCountText(count: number): string {
  return count > 0 ? String(count) : 'Discard 0'
}

test('Swap and Played zones stay public when Swap is the only side zone', async ({ page }) => {
  await startTestGame(page)
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.game.hasSwapZone = true
  debugState.game.hasDevelopZone = false
  debugState.game.supplyMechanics = []
  debugState.game.developZone = []
  const owner = debugState.game.players[0]
  debugState.selectedPlayer = owner.id
  debugState.phase = 'main'
  debugState.game.currentTurn = owner.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  owner.swapZone = ['crystal']
  owner.playedThisTurn = ['spark']
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(page.locator('.played-zone-swap')).toBeVisible()
  await expect(page.locator('.played-zone-center')).toBeVisible()
  await expect(page.locator('.played-zone-develop')).toHaveCount(0)
  await expect(page.locator('.played-zone-swap')).toHaveCSS('background-color', 'rgb(32, 40, 58)')
  await expect(page.locator('.played-zone-swap')).toHaveCSS('border-style', 'none')
  const swapOnlyLayout = await page.evaluate(() => {
    const row = document.querySelector('.played-zones')!.getBoundingClientRect()
    const swap = document.querySelector('.played-zone-swap')!.getBoundingClientRect()
    const played = document.querySelector('.played-zone-center')!.getBoundingClientRect()
    const card = document.querySelector('.played-zone-center .card')!.getBoundingClientRect()
    const swapHeading = document.querySelector('.played-zone-heading-swap')!.getBoundingClientRect()
    const playedHeading = document.querySelector('.played-zone-heading-played')!.getBoundingClientRect()
    return {
      rowCenter: row.left + row.width / 2,
      cardCenter: card.left + card.width / 2,
      playedWidth: played.width,
      swapWidth: swap.width,
      swapCenter: swap.left + swap.width / 2,
      swapHeadingCenter: swapHeading.left + swapHeading.width / 2,
      playedHeadingCenter: playedHeading.left + playedHeading.width / 2,
      swapHeadingTop: swapHeading.top,
      playedHeadingTop: playedHeading.top,
    }
  })
  expect(swapOnlyLayout.playedWidth / swapOnlyLayout.swapWidth).toBeCloseTo(2, 1)
  expect(Math.abs(swapOnlyLayout.cardCenter - swapOnlyLayout.rowCenter)).toBeLessThan(2)
  expect(Math.abs(swapOnlyLayout.swapHeadingCenter - swapOnlyLayout.swapCenter)).toBeLessThan(2)
  expect(Math.abs(swapOnlyLayout.playedHeadingCenter - swapOnlyLayout.rowCenter)).toBeLessThan(2)
  expect(Math.abs(swapOnlyLayout.swapHeadingTop - swapOnlyLayout.playedHeadingTop)).toBeLessThan(1)
  const swapCards = page.locator('.played-zone-swap .card')
  await expect(swapCards.first()).toBeVisible()
  const swapCardCount = await swapCards.count()
  await expect(page.locator('.swap-zone-owner-label')).toHaveCount(0)

  await page.locator('.char-btn').nth(1).click()
  await expect(page.locator('.played-zone-swap')).toBeVisible()
  await expect(page.locator('.played-zone-center')).toBeVisible()
  await expect(page.locator('.played-zone-develop')).toHaveCount(0)
  await expect(swapCards).toHaveCount(swapCardCount)
  await expect(page.locator('.swap-zone-owner-label')).toHaveCount(0)
})

test('Develop and Played zones appear without Swap when the market enables Develop', async ({ page }) => {
  await startTestGame(page)
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.game.hasSwapZone = false
  debugState.game.hasDevelopZone = true
  debugState.game.supplyMechanics = ['develop']
  debugState.game.developZone = []
  for (const player of debugState.game.players) {
    player.swapZone = []
    player.playedThisTurn = ['spark']
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(page.locator('.played-zone-swap')).toHaveCount(0)
  await expect(page.locator('.played-zone-center')).toBeVisible()
  await expect(page.locator('.played-zone-develop')).toBeVisible()
  const layout = await page.evaluate(() => {
    const row = document.querySelector('.played-zones')!.getBoundingClientRect()
    const played = document.querySelector('.played-zone-center')!.getBoundingClientRect()
    const develop = document.querySelector('.played-zone-develop')!.getBoundingClientRect()
    const card = document.querySelector('.played-zone-center .card')!.getBoundingClientRect()
    const developHeading = document.querySelector('.played-zone-heading-develop')!.getBoundingClientRect()
    const playedHeading = document.querySelector('.played-zone-heading-played')!.getBoundingClientRect()
    return {
      rowCenter: row.left + row.width / 2,
      cardCenter: card.left + card.width / 2,
      playedWidth: played.width,
      developWidth: develop.width,
      developCenter: develop.left + develop.width / 2,
      developHeadingCenter: developHeading.left + developHeading.width / 2,
      playedHeadingCenter: playedHeading.left + playedHeading.width / 2,
      developHeadingTop: developHeading.top,
      playedHeadingTop: playedHeading.top,
    }
  })
  expect(layout.playedWidth / layout.developWidth).toBeCloseTo(2, 1)
  expect(Math.abs(layout.cardCenter - layout.rowCenter)).toBeLessThan(2)
  expect(Math.abs(layout.developHeadingCenter - layout.developCenter)).toBeLessThan(2)
  expect(Math.abs(layout.playedHeadingCenter - layout.rowCenter)).toBeLessThan(2)
  expect(Math.abs(layout.developHeadingTop - layout.playedHeadingTop)).toBeLessThan(1)

  await page.locator('.char-btn').nth(1).click()
  await expect(page.locator('.played-zone-develop')).toBeVisible()
  await expect(page.locator('.played-zone-swap')).toHaveCount(0)
})

test('Develop uses right-click from supply, both clicks from the shared zone, and stays public across Mage views', async ({ page }) => {
  await startTestGame(page)
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const game = debugState.game
  const activePlayer = game.players.find((candidate: { id: string }) => candidate.id === debugState.selectedPlayer)
  game.currentTurn = activePlayer.id
  game.currentPhase = 'main'
  game.pendingDecision = null
  game.pendingEffect = null
  debugState.phase = 'main'
  activePlayer.bonusAether = 11
  activePlayer.regularAetherSpent = 0
  activePlayer.conditionalAetherEarned = {}
  activePlayer.swapZone = ['crystal']
  let chromiaPileIndex = game.market.piles.findIndex((pile: { cardId: string }) => pile.cardId === 'chromia_sphere')
  if (chromiaPileIndex < 0) {
    chromiaPileIndex = 0
    game.market.piles[chromiaPileIndex] = { cardId: 'chromia_sphere', remaining: 7 }
  }
  game.supplyMechanics = ['develop']
  game.hasSwapZone = true
  game.hasDevelopZone = true
  game.developZone = []
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const chromiaPile = page.locator('.market-grid .pile').filter({
    has: page.locator('img[alt="Chromia Sphere"]'),
  }).first()
  await expect(chromiaPile.locator('.develop-cost-badge')).toHaveText('D 3')
  await chromiaPile.click({ button: 'right' })
  await expect(page.locator('.played-zone-develop .card')).toHaveCount(1)
  await expect(page.locator('.played-zone-develop .card').first()).toHaveAttribute('data-card-instance-id', /.+/)
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(chromiaPile.locator('.remaining')).toHaveText('6')

  // A left click on a developable Supply pile still performs the normal buy.
  const discardCountBeforeBuy = await currentDiscardCount(page)
  await chromiaPile.click()
  await expect(chromiaPile.locator('.remaining')).toHaveText('5')
  const discardBadge = page.locator('.player-discard-pile .player-pile-count, .player-discard-pile .player-empty-pile-label')
  await expect(discardBadge).toHaveText(discardCountText(discardCountBeforeBuy))
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(discardBadge).toHaveText(discardCountText(discardCountBeforeBuy + 1))
  await expect(page.locator('.played-zone-develop .card')).toHaveCount(1)

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const updatedState = JSON.parse(await stateField.inputValue())
  updatedState.game.currentTurn = updatedState.selectedPlayer
  updatedState.game.currentPhase = 'main'
  updatedState.game.pendingDecision = null
  updatedState.game.pendingEffect = null
  updatedState.phase = 'main'
  const updatedPlayer = updatedState.game.players.find((candidate: { id: string }) => candidate.id === updatedState.selectedPlayer)
  updatedState.game.developZone = ['chromia_sphere', 'chromia_sphere']
  updatedPlayer.bonusAether = 11
  updatedPlayer.regularAetherSpent = 0
  updatedPlayer.conditionalAetherEarned = {}
  await stateField.fill(JSON.stringify(updatedState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const developCards = page.locator('.played-zone-develop .card')
  await expect(developCards).toHaveCount(2)
  await expect(developCards.first()).toHaveClass(/develop-action-available/)
  const developFrame = await developCards.first().evaluate(element => {
    const style = getComputedStyle(element, '::after')
    return { borderTopWidth: style.borderTopWidth, borderTopStyle: style.borderTopStyle, borderTopColor: style.borderTopColor }
  })
  expect(developFrame.borderTopWidth).toBe('2px')
  expect(developFrame.borderTopStyle).toBe('solid')
  expect(developFrame.borderTopColor).toBe('rgb(158, 206, 106)')
  await expect(developCards.first().locator('img')).toHaveCSS('border-top-left-radius', '7px')
  await expect(developCards.first()).toHaveAttribute('data-card-instance-id', /.+/)
  const discardCountBeforeDevelopGain = await currentDiscardCount(page)
  await developCards.first().click()
  await expect(developCards).toHaveCount(1)
  await expect(discardBadge).toHaveText(discardCountText(discardCountBeforeDevelopGain))
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(discardBadge).toHaveText(discardCountText(discardCountBeforeDevelopGain + 1))
  await developCards.first().click({ button: 'right' })
  await expect(developCards).toHaveCount(0)
  await expect(page.locator('.player-discard-pile .player-discard-top-card')).toBeVisible()
  await expect(page.locator('.player-discard-pile .player-pile-count')).toHaveText('3')

  const swapCardCount = await page.locator('.played-zone-swap .card').count()
  await page.locator('.char-btn').nth(1).click()
  await expect(page.locator('.played-zone-swap')).toBeVisible()
  await expect(page.locator('.played-zone-develop')).toBeVisible()
  await expect(page.locator('.played-zone-swap .card')).toHaveCount(swapCardCount)
  await expect(page.locator('.swap-zone-owner-label')).toHaveCount(0)
})

test('Develop cards make room in the same frame as a new card arrives', async ({ page }) => {
  await startTestGame(page)
  await resolveStartupInterrupts(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addStyleTag({ content: ':root { --card-flight-duration: 900ms; --card-zone-reflow-duration: 900ms; }' })
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const state = JSON.parse(await stateField.inputValue())
  const player = state.game.players[0]
  state.selectedPlayer = player.id
  state.phase = 'main'
  state.game.currentTurn = player.id
  state.game.currentPhase = 'main'
  state.game.pendingDecision = null
  state.game.pendingEffect = null
  state.game.hasDevelopZone = true
  state.game.developZone = ['chromia_sphere']
  state.game.market.piles[0] = { cardId: 'chromia_sphere', remaining: 7 }
  player.bonusAether = 11
  player.regularAetherSpent = 0
  player.conditionalAetherEarned = {}
  await stateField.fill(JSON.stringify(state))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.evaluate(() => {
    const tracked = window as typeof window & { developSamples: Array<{ count: number; x: number }> }
    tracked.developSamples = []
    const started = performance.now()
    const sample = () => {
      const cards = document.querySelectorAll<HTMLElement>('.played-zone-develop [data-card-motion-key]')
      if (cards[0]) tracked.developSamples.push({ count: cards.length, x: cards[0].getBoundingClientRect().x })
      if (performance.now() - started < 1800) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.locator('.market-grid [data-supply-card-id="chromia_sphere"]').first().click({ button: 'right' })
  await expect(page.locator('.played-zone-develop [data-card-motion-key]')).toHaveCount(2)
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const samples = await page.evaluate(() => (window as typeof window & {
    developSamples: Array<{ count: number; x: number }>
  }).developSamples)
  const firstAdded = samples.find(sample => sample.count === 2)
  expect(firstAdded).toBeDefined()
  expect(Math.abs(firstAdded!.x - samples[0]!.x)).toBeLessThan(8)
  expect(Math.abs(samples[samples.length - 1]!.x - samples[0]!.x)).toBeGreaterThan(5)
})

test('market purchase and Develop affordances respect two available Aether', async ({ page }) => {
  await startTestGame(page)
  await resolveStartupInterrupts(page)
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const game = debugState.game
  const player = game.players[0]
  game.currentTurn = player.id
  game.currentPhase = 'main'
  game.pendingDecision = null
  game.pendingEffect = null
  game.hasDevelopZone = true
  game.supplyMechanics = ['develop']
  debugState.phase = 'main'
  debugState.selectedPlayer = player.id
  player.playerCardsInPlay = []
  player.playerCardSupplyTargets = []
  player.playerCardPowerTokens = []
  player.bonusAether = 1
  player.aetherTokens = 1
  player.regularAetherSpent = 0
  player.conditionalAetherEarned = {}
  let coiledPileIndex = game.market.piles.findIndex((pile: { cardId: string }) => pile.cardId === 'coiled_trillium')
  if (coiledPileIndex < 0) coiledPileIndex = 0
  game.market.piles[coiledPileIndex] = { cardId: 'coiled_trillium', remaining: 7 }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const coiledPile = page.locator('.market-grid .pile').filter({
    has: page.locator('img[alt="Coiled Trillium"]'),
  }).first()
  await expect(coiledPile).not.toHaveClass(/can-buy/)
  await expect(coiledPile).toHaveAttribute('aria-disabled', 'true')
  await expect(coiledPile.locator('.develop-cost-badge')).toHaveText('D 3')
  await expect(coiledPile.locator('.develop-cost-badge')).not.toHaveClass(/available/)
  await expect(coiledPile.locator('.remaining')).toHaveText('7')
  await expect(page.locator('.played-zone-develop .card')).toHaveCount(0)
})
