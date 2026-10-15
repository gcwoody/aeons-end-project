import { test, expect } from '@playwright/test'

const defaultMarketPiles = [
  ['vriswood_amber', 7], ['diamond_cluster', 4], ['burning_opal', 5],
  ['flexing_dagger', 2], ['bottled_vortex', 3],
  ['lava_tendril', 5], ['essence_theft', 5], ['planar_insight', 6], ['arcane_nexus', 7],
]

function useDefaultMarket(game: any) {
  game.market.piles = defaultMarketPiles.map(([cardId, remaining]) => ({ cardId, remaining }))
}


test('Dark Conclusion set beside the Turn Order deck appears in the first Nemesis play row', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()

  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.game.nemesis.playArea = []
  debugState.game.nemesis.turnOrderDeckResetCardId = 'dark_conclusion'
  debugState.game.nemesis.turnOrderDeckResetCardInstanceId = 'dark-conclusion:stationed'
  debugState.game.nemesis.setAsideCards = [{
    cardId: 'dark_conclusion', cardType: 'power', placedAt: 1,
    instanceId: 'dark-conclusion:stationed', powerTokens: 0,
  }]
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const stationedCard = page.locator('.nemesis-play-top .nemesis-stationed-card img[alt="Dark Conclusion"]')
  await expect(stationedCard).toBeVisible()
  await expect(page.locator('.nemesis-play-row .nemesis-play-card')).toHaveCount(0)
})


test('Space confirms the red-highlighted Nemesis Main Phase card in order', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.phase = 'nemesis_main'
  debugState.selectedPlayer = player.id
  debugState.game.currentTurn = 'nemesis'
  debugState.game.currentPhase = 'nemesis_main'
  debugState.game.pendingEffect = null
  debugState.game.nemesis.nemesisTurnNumber = 1
  debugState.game.nemesis.playArea = [
    { instanceId: 'needle:1', cardId: 'needlemaw', cardType: 'minion', placedAt: 1, lifeTokens: 11 },
    { instanceId: 'needle:2', cardId: 'needlemaw', cardType: 'minion', placedAt: 2, lifeTokens: 11 },
  ]
  debugState.game.nemesisResolution = {
    step: 'main', mainQueue: ['needle:1', 'needle:2'], mainIndex: 0,
    activeCardInstanceId: 'needle:1', activeCardId: 'needlemaw', activeTrigger: 'persistent',
    mainEffectConfirmed: false,
  }
  debugState.game.pendingDecision = {
    id: 'needle-effect-1', prompt: 'Resolve Persistent: Needlemaw', kind: 'confirm_nemesis_effect',
    cardId: 'needlemaw', instanceId: 'needle:1', trigger: 'persistent',
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(page.locator('.nemesis-play-card.effect-target')).toHaveCount(1)
  const graveholdHp = page.locator('.nemesis-info-gravehold .hp-num b')
  await expect(graveholdHp).toHaveText('30')
  await page.keyboard.press('Space')
  await expect(graveholdHp).toHaveText('28')
  await expect(page.locator('.damage-impact-gravehold .damage-impact-number')).toHaveText('−2')
  await expect(page.locator('.nemesis-play-card.effect-target')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(page.getByText('Nemesis Draw Phase', { exact: true })).toBeVisible()
})


test('a payable Power is highlighted and its To Discard action starts by clicking the card', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.game.pendingNemesisDiscard = null
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'main'
  debugState.game.players[0].hand = []
  debugState.game.nemesis.playArea = [
    { instanceId: 'woven-sky:preview-test', cardId: 'woven_sky', cardType: 'power', placedAt: 1, powerTokens: 2 },
    { instanceId: 'haze-spewer:counter-test', cardId: 'haze_spewer', cardType: 'minion', placedAt: 2, lifeTokens: 5 },
  ]
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const powerCard = page.locator('.nemesis-play-card').first()
  await expect(powerCard).not.toHaveClass(/discardable/)
  await expect(powerCard.getByRole('button', { name: 'To Discard' })).toHaveCount(0)
  await powerCard.click()
  await expect(page.locator('.decision-modal')).toHaveCount(0)

  const counters = page.locator('.nemesis-card-counter')
  await expect(counters).toHaveCount(2)
  const counterBounds = await counters.evaluateAll(elements => elements.map(element => {
    const { height, bottom } = element.getBoundingClientRect()
    return { height, bottom }
  }))
  expect(counterBounds[0]!.height).toBe(counterBounds[1]!.height)
  expect(counterBounds[0]!.bottom).toBe(counterBounds[1]!.bottom)

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const updatedState = JSON.parse(await stateField.inputValue())
  updatedState.game.players[0].hand = ['crystal', 'vriswood_amber', 'diamond_cluster']
  await stateField.fill(JSON.stringify(updatedState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(powerCard).toHaveClass(/discardable/)
  await expect(powerCard.getByRole('button', { name: 'To Discard' })).toHaveCount(0)
  await powerCard.click()
  await expect(page.locator('.nemesis-play-card')).toHaveCount(1)
})

test('Minions that track Nemesis tokens show the count at the upper-left corner', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'main'
  debugState.game.nemesis.playArea = [
    { instanceId: 'stinger:token-ui', cardId: 'glinting_stinger', cardType: 'minion', placedAt: 1, lifeTokens: 6, nemesisTokens: 0 },
    { instanceId: 'haze:token-ui', cardId: 'haze_spewer', cardType: 'minion', placedAt: 2, lifeTokens: 5 },
  ]
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const stinger = page.locator('.nemesis-play-card').first()
  const tokenCounter = stinger.locator('.nemesis-card-token-counter')
  await expect(tokenCounter).toHaveText('Token 0')
  await expect(page.locator('.nemesis-play-card').nth(1).locator('.nemesis-card-token-counter')).toHaveCount(0)
  const geometry = await page.evaluate(() => {
    const card = document.querySelector('.nemesis-play-card')!.getBoundingClientRect()
    const badge = document.querySelector('.nemesis-card-token-counter')!.getBoundingClientRect()
    return { cardLeft: card.left, cardTop: card.top, badgeLeft: badge.left, badgeTop: badge.top }
  })
  expect(geometry.badgeLeft - geometry.cardLeft).toBeCloseTo(5, 0)
  expect(geometry.badgeTop - geometry.cardTop).toBeCloseTo(5, 0)
})

test('Space confirms a To Discard card choice after the Power card is clicked', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.phase = 'main'
  debugState.selectedPlayer = player.id
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.game.pendingNemesisDiscard = null
  player.hand = ['crystal', 'crystal', 'crystal', 'spark', 'spark']
  debugState.game.nemesis.playArea = [{
    instanceId: 'woven-sky:space-confirm-test', cardId: 'woven_sky', cardType: 'power', placedAt: 1, powerTokens: 2,
  }]
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const powerCard = page.locator('.nemesis-play-card').first()
  await expect(powerCard).toHaveClass(/discardable/)
  await expect(powerCard.getByRole('button', { name: 'To Discard' })).toHaveCount(0)
  await powerCard.click()
  await expect(page.getByText('Choose 3 card(s) to discard the Power', { exact: true })).toBeVisible()
  await expect(page.locator('.pending-board-card')).toHaveCount(5)
  for (let index = 0; index < 2; index++) {
    await page.locator('.pending-board-card').nth(index).click()
  }
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
  await page.keyboard.press('Space')
  await expect(page.getByText('Choose 3 card(s) to discard the Power', { exact: true })).toBeVisible()

  await page.locator('.pending-board-card').nth(2).click()
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled()
  await page.keyboard.press('Space')

  await expect(page.locator('.nemesis-play-card')).toHaveCount(0)
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const resolvedState = JSON.parse(await stateField.inputValue())
  expect(resolvedState.game.nemesis.discard[0]).toBe('woven_sky')
  expect(resolvedState.game.pendingNemesisDiscard).toBeNull()
})


test('an Attack stays in the Nemesis Area while its effect decision is pending', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  const [firstPlayer, secondPlayer] = debugState.game.players
  debugState.phase = 'nemesis_draw'
  debugState.selectedPlayer = firstPlayer.id
  debugState.game.currentTurn = 'nemesis'
  debugState.game.currentPhase = 'nemesis_draw'
  debugState.game.nemesis.discard = []
  debugState.game.nemesis.playArea = [
    { instanceId: 'skewer:99', cardId: 'skewer', cardType: 'attack', placedAt: 99 },
  ]
  debugState.game.nemesisResolution = {
    step: 'draw', mainQueue: [], mainIndex: 0,
    drawnCardId: 'skewer', drawnCardRevealed: true, drawnCardProcessed: true,
    drawnCardResponseHandled: true, activeCardInstanceId: 'skewer:99',
    activeCardId: 'skewer', activeCardPendingDiscard: true,
  }
  debugState.game.pendingDecision = {
    id: 'skewer-target', prompt: 'Choose a player to suffer damage', kind: 'select_player_target',
    targets: [{ playerId: firstPlayer.id }, { playerId: secondPlayer.id }],
  }
  debugState.game.pendingEffect = {
    sourceCardId: 'skewer', remainingEffects: [],
    awaiting: { kind: 'deal_player_damage', amount: 3, target: 'any_player' },
    nemesisResume: true,
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const attackCard = page.locator('.nemesis-play-card.nemesis-attack')
  await expect(attackCard).toBeVisible()
  await attackCard.hover()
  await expect(page.locator('.card-hover-preview img[alt="Skewer"]')).toBeVisible()
})

test('Prince of Gluttons displays and sells the top Devoured card directly', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByLabel('Nemesis', { exact: true }).selectOption('prince_of_gluttons')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByRole('img', { name: 'Prince of Gluttons mat' })).toBeVisible()
  await expect(page.getByLabel('Devoured Pile', { exact: true })).toBeVisible()
  await expect(page.locator('.nemesis-specific-pile')).toBeVisible()
  await expect(page.locator('.nemesis-specific-pile img')).toHaveCount(1)
  await expect(page.locator('.pile-modal')).toHaveCount(0)

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.selectedPlayer = debugState.game.players[0].id
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'main'
  debugState.game.players[0].bonusAether = 3
  useDefaultMarket(debugState.game)
  debugState.game.nemesis.strikeDeck = ['vriswood_amber', 'diamond_cluster', 'burning_opal']
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.nemesis-specific-pile').click()
  await expect(page.locator('.pile-modal')).toBeVisible()
  await expect.poll(async () => (await page.locator('.pile-modal').boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(440)
  await expect(page.locator('.pile-modal h3')).toContainText('Devoured Pile')
  await expect(page.locator('.pile-modal .pile-row')).toHaveCount(1)
  expect(await page.locator('.pile-modal .pile-card img').evaluateAll(images => images.map(image => image.alt)))
    .toEqual(["V'riswood Amber", 'Diamond Cluster', 'Burning Opal'])
  await page.locator('.pile-modal').getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: "Buy V'riswood Amber from the Devoured Pile" }).click()
  await expect(page.locator('.nemesis-specific-pile img')).toHaveAttribute('alt', 'Diamond Cluster')
})

test('Setup passes the selected increased Nemesis difficulty into Prince of Gluttons setup', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByLabel('Nemesis', { exact: true }).selectOption('prince_of_gluttons')
  await page.getByLabel('Nemesis Difficulty').selectOption('increased')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByText('Choose a supply pile to Devour (9 remaining)', { exact: true })).toBeVisible()
  await expect(page.locator('.pile.decision-market-choice')).toHaveCount(9)
  for (let remaining = 9; remaining > 0; remaining--) {
    await page.locator('.pile.decision-market-choice').first().click()
    if (remaining > 1) {
      await expect(page.getByText(`Choose a supply pile to Devour (${remaining - 1} remaining)`, { exact: true })).toBeVisible()
    }
  }

  await expect(page.getByRole('heading', { name: /^Choose a supply pile to Devour/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Nemesis Mainboard' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Prince of Gluttons mat' })).toBeVisible()
})

test('Lobotomize highlights spell supply piles after its Devour option is chosen', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByLabel('Nemesis', { exact: true }).selectOption('prince_of_gluttons')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  const playerId = debugState.game.players[0].id
  debugState.phase = 'nemesis_draw'
  debugState.selectedPlayer = playerId
  debugState.game.currentTurn = 'nemesis'
  debugState.game.currentPhase = 'nemesis_draw'
  debugState.game.nemesisResolution = null
  debugState.game.pendingDecision = {
    id: 'lobotomize-effect', playerId, prompt: 'Choose the Lobotomize effect', kind: 'choose_one',
    options: [
      { id: 'damage', label: 'Any player suffers 3 damage' },
      { id: 'devour', label: 'Devour three cards from a spell supply pile' },
    ],
  }
  debugState.game.pendingEffect = {
    playerId, sourceCardId: 'lobotomize', remainingEffects: [],
    awaiting: {
      kind: 'choose_one', prompt: 'Choose the Lobotomize effect', options: [
        { id: 'damage', label: 'Any player suffers 3 damage', effects: [] },
        {
          id: 'devour', label: 'Devour three cards from a spell supply pile', effects: [
            { kind: 'devour_market_cards', amount: 3, pile: 'choose', cardType: 'spell' },
          ],
        },
      ],
    },
  }
  useDefaultMarket(debugState.game)
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'Devour three cards from a spell supply pile', exact: true }).click()
  await expect(page.getByText('Select a highlighted supply pile directly in the Market.', { exact: true })).toBeVisible()
  await expect(page.locator('.pile.decision-market-choice')).toHaveCount(4)
  await expect(page.locator('.decision-options')).toHaveCount(0)
  await page.locator('.pile.decision-market-choice').filter({ has: page.getByRole('img', { name: 'Lava Tendril' }) }).click()
  await expect(page.locator('.pile.decision-market-choice')).toHaveCount(0)
  await expect(page.locator('.nemesis-specific-pile img')).toHaveAttribute('alt', 'Lava Tendril')
})

test('collective hand-card decisions use direct board selection', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.selectedPlayer = debugState.game.players[0].id
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'main'
  debugState.game.players[0].hand = ['crystal', 'crystal']
  debugState.game.players[1].hand = ['crystal']
  debugState.game.pendingDecision = {
    id: 'collective-card-selection',
    playerId: debugState.game.players[0].id,
    prompt: 'Discard up to 3 gem(s) to reduce Gravehold damage?',
    kind: 'select_collective_cards',
    min: 0,
    max: 3,
    candidates: [
      { playerId: debugState.game.players[0].id, choice: { zone: 'hand', index: 0, cardId: 'crystal', cardName: 'Crystal' } },
      { playerId: debugState.game.players[0].id, choice: { zone: 'hand', index: 1, cardId: 'crystal', cardName: 'Crystal' } },
      { playerId: debugState.game.players[1].id, choice: { zone: 'hand', index: 0, cardId: 'crystal', cardName: 'Crystal' } },
    ],
  }
  debugState.game.pendingEffect = {
    playerId: debugState.game.players[0].id, remainingEffects: [],
    awaiting: { kind: 'deal_gravehold_damage_with_gem_discard', amount: 9, maxGems: 3, reductionPerGem: 3 },
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(page.getByText('Discard up to 3 gem(s) to reduce Gravehold damage?', { exact: true })).toBeVisible()
  await expect(page.getByText('0 / 3 selected', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible()
  await expect(page.locator('.pending-board-card')).toHaveCount(2)
  await expect(page.locator('.decision-card-choice')).toHaveCount(0)
  await expect.poll(() => page.locator('.pending-board-card').first().evaluate(element =>
    getComputedStyle(element, '::after').borderTopColor)).toBe('rgb(242, 153, 74)')
  await page.locator('.pending-board-card').first().click()
  await expect(page.locator('.pending-board-card-selected')).toHaveCount(1)
  await expect(page.locator('.pending-board-card-selected')).toHaveClass(/game-highlight--selected/)
  await expect.poll(() => page.locator('.pending-board-card-selected').evaluate(element =>
    getComputedStyle(element, '::after').borderTopColor)).toBe('rgb(224, 82, 82)')
  await expect(page.getByText('1 / 3 selected', { exact: true })).toBeVisible()
  await page.locator('.char-btn').nth(1).click()
  await expect(page.locator('.pending-board-card')).toHaveCount(1)
  await page.locator('.pending-board-card').click()
  await expect(page.getByText('2 / 3 selected', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.locator('.pending-board-card')).toHaveCount(0)
})

test('a multi-row discard selection shows one vertically centered source label', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  const playerId = debugState.game.players[0].id
  debugState.phase = 'main'
  debugState.selectedPlayer = playerId
  debugState.game.currentTurn = playerId
  debugState.game.currentPhase = 'main'
  debugState.game.players[0].discard = Array.from({ length: 7 }, () => 'crystal')
  debugState.game.pendingDecision = {
    id: 'multi-row-hand-selection',
    playerId,
    prompt: 'Choose cards from your discard pile',
    kind: 'select_cards',
    source: 'discard',
    min: 1,
    max: 7,
    candidates: Array.from({ length: 7 }, (_, index) => ({
      zone: 'discard', index, cardId: 'crystal', cardName: 'Crystal',
    })),
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(page.locator('.decision-card-zone-label')).toHaveText('DISCARD PILE')
  await expect(page.locator('.decision-card-row')).toHaveCount(2)
  await expect(page.locator('.decision-card-choice')).toHaveCount(7)
  await expect.poll(() => page.evaluate(() => {
    const zone = document.querySelector('.decision-card-zone')!.getBoundingClientRect()
    const label = document.querySelector('.decision-card-zone-label')!.getBoundingClientRect()
    return Math.abs((zone.top + zone.height / 2) - (label.top + label.height / 2)) < 2
  })).toBe(true)
})


test('a Venomite effect decision returns to the center after another modal was dragged', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'nemesis_main'
  debugState.selectedPlayer = debugState.game.players[0].id
  debugState.game.currentTurn = 'nemesis'
  debugState.game.currentPhase = 'nemesis_main'
  debugState.game.pendingDecision = {
    id: 'previous-prepped-decision', playerId: debugState.game.players[0].id,
    prompt: 'Choose a prepped spell', kind: 'select_prepped_spells', min: 0, max: 1,
    candidates: [],
  }
  debugState.game.pendingEffect = {
    playerId: debugState.game.players[0].id, remainingEffects: [],
    awaiting: { kind: 'discard_prepped_spells', amount: 1, target: 'any_player' },
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const previousModal = page.locator('.non-blocking-prepped-modal')
  await expect(previousModal).toBeVisible()
  const previousBox = await previousModal.boundingBox()
  expect(previousBox).not.toBeNull()
  await page.mouse.move(previousBox!.x + previousBox!.width / 2, previousBox!.y + 10)
  await page.mouse.down()
  await page.mouse.move(previousBox!.x + previousBox!.width / 2, previousBox!.y + 180)
  await page.mouse.up()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const nextState = JSON.parse(await stateField.inputValue())
  nextState.game.pendingDecision = {
    id: 'venomite-effect-choice', playerId: debugState.game.players[0].id, prompt: 'Choose the Venomite effect', kind: 'choose_one',
    options: [
      { id: 'damage', label: 'Lowest-life player suffers 2 damage' },
      { id: 'discard', label: 'Discard a prepped spell costing 3 or more' },
    ],
  }
  nextState.game.pendingEffect = {
    playerId: debugState.game.players[0].id, remainingEffects: [],
    awaiting: {
      kind: 'choose_one', prompt: 'Choose the Venomite effect',
      options: [
        { id: 'damage', label: 'Lowest-life player suffers 2 damage', effects: [] },
        { id: 'discard', label: 'Discard a prepped spell costing 3 or more', effects: [] },
      ],
    },
  }
  await stateField.fill(JSON.stringify(nextState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const modal = page.locator('.decision-modal')
  await expect(modal).toBeVisible()
  await page.waitForTimeout(350)
  const modalBox = await modal.boundingBox()
  expect(modalBox).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(Math.abs(modalBox!.x + modalBox!.width / 2 - viewport.width / 2)).toBeLessThan(2)
  expect(Math.abs(modalBox!.y + modalBox!.height / 2 - viewport.height / 2)).toBeLessThan(2)
})
