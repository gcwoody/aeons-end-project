import { expect, test, type Page } from '@playwright/test'

async function startGame(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1' }).first().click()
  await page.getByRole('tab', { name: 'Wave 1' }).last().click()
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  for (let attempt = 0; attempt < 20; attempt++) {
    const transition = page.locator('.turn-transition-shield')
    if (await transition.isVisible().catch(() => false)) {
      await expect(transition).toHaveCount(0)
      continue
    }
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    if (await reveal.isVisible().catch(() => false)) {
      await expect(page.locator('.nemesis-draw-flight-scene')).toHaveCount(0)
      await reveal.click({ position: { x: 12, y: 12 } })
      continue
    }
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueButton.isVisible().catch(() => false)) { await continueButton.click(); continue }
    const resolveCard = page.getByRole('button', { name: 'Resolve Card', exact: true })
    if (await resolveCard.isVisible().catch(() => false)) { await resolveCard.click(); continue }
    const skip = page.getByRole('button', { name: 'Skip', exact: true })
    if (await skip.isVisible().catch(() => false)) { await skip.click(); continue }
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true })
    if (await confirm.isVisible().catch(() => false)) { await confirm.click(); continue }
    const attack = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (await attack.isVisible().catch(() => false)) { await attack.click(); continue }
    break
  }
}

async function editDebugState(page: Page, edit: (state: any) => void) {
  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const current = JSON.parse(await field.inputValue())
  edit(current)
  await field.fill(JSON.stringify(current))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

async function finishFlight(page: Page) {
  const clone = page.locator('.card-flight-clone').first()
  await expect(clone).toBeVisible()
  await clone.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
}

test('Control Bar opens the selected Mage destroyed-card area', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    current.selectedPlayer = current.game.players[0].id
    current.game.players[0].destroyedCards = ['crystal', 'spark']
  })

  const destroyedCardsButton = page.getByRole('button', { name: 'View destroyed cards (2)' })
  await expect(destroyedCardsButton).toContainText('2')
  await destroyedCardsButton.click()
  const modal = page.locator('.pile-modal')
  await expect(modal.getByRole('heading', { name: 'Destroyed Cards' })).toBeVisible()
  await expect(modal.locator('img[alt="Crystal"]')).toBeVisible()
  await expect(modal.locator('img[alt="Spark"]')).toBeVisible()
})

test('required constrained supply choices use the red market highlight', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    const player = current.game.players[0]
    current.selectedPlayer = player.id
    current.phase = 'main'
    current.game.currentTurn = player.id
    current.game.currentPhase = 'main'
    current.game.pendingDecision = {
      id: 'test-market-choice',
      prompt: 'Choose a least expensive Gem supply pile to gain',
      kind: 'select_market_pile',
      emphasis: 'required',
      candidates: [{ pileIndex: 0, cardId: 'crystal', cardName: 'Crystal', remaining: 5 }],
    }
    current.game.pendingEffect = {
      sourcePlayerId: player.id,
      sourceCardOwnerId: player.id,
      sourceCardId: 'insatiable_avarice_btb',
      remainingEffects: [],
      awaiting: { kind: 'gain_card_from_market', cardType: 'gem', leastExpensive: true, destination: 'discard_top' },
    }
    current.game.market.piles[0] = { cardId: 'crystal', remaining: 5 }
  })

  const pile = page.locator('[data-supply-card-id="crystal"]')
  await expect(pile).toHaveClass(/decision-market-choice-required/)
  const outline = await pile.evaluate(element => {
    const style = getComputedStyle(element, '::after')
    return { width: style.borderTopWidth, color: style.borderTopColor }
  })
  expect(outline.width).toBe(await pile.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--pixel-border-width').trim(),
  ))
  expect(outline.color).toBe('rgb(224, 82, 82)')
})

test('eligible market choices keep the orange choice outline above the supply artwork', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    const player = current.game.players[0]
    current.selectedPlayer = player.id
    current.phase = 'nemesis_main'
    current.game.currentTurn = 'nemesis'
    current.game.currentPhase = 'nemesis_main'
    current.game.market.piles[0] = { cardId: 'vriswood_amber', remaining: 5 }
    current.game.pendingDecision = {
      id: 'test-tempt-market-choice',
      prompt: 'Choose a supply card costing 4 Aether or less to gain',
      kind: 'select_market_pile',
      candidates: [{ pileIndex: 0, cardId: 'vriswood_amber', cardName: "V'riswood Amber", remaining: 5 }],
    }
    current.game.pendingEffect = {
      sourceCardId: 'tempt_btb',
      remainingEffects: [],
      awaiting: { kind: 'gain_card_from_market', maxCost: 4 },
    }
  })

  const pile = page.locator('[data-supply-pile-index="0"]')
  await expect(pile).toHaveClass(/decision-market-choice/)
  const outline = await pile.evaluate(element => {
    const style = getComputedStyle(element, '::after')
    return { content: style.content, width: style.borderTopWidth, color: style.borderTopColor }
  })
  expect(outline.content).not.toBe('none')
  expect(outline.width).toBe(await pile.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--pixel-border-width').trim(),
  ))
  expect(outline.color).toBe('rgb(242, 153, 74)')
})

test('filtered discard-card choices show the target outline before selection', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    const player = current.game.players[0]
    current.selectedPlayer = player.id
    current.phase = 'main'
    current.game.currentTurn = player.id
    current.game.currentPhase = 'main'
    player.discard = ['crystal', 'obliterating_arc']
    current.game.pendingDecision = {
      id: 'test-filtered-discard-choice',
      prompt: 'Choose an eligible card from your discard pile',
      kind: 'select_cards',
      source: 'discard',
      candidates: [{ zone: 'discard', index: 0, cardId: 'crystal', cardName: 'Crystal' }],
      min: 0,
      max: 1,
      targetHighlight: 'choice',
    }
    current.game.pendingEffect = {
      effectPlayerId: player.id,
      sourcePlayerId: player.id,
      sourceCardId: 'contagion_btb',
      remainingEffects: [],
      awaiting: {
        kind: 'return_cards_to_hand', source: 'discard', amount: 1, minAmount: 0,
        cardTypes: ['gem', 'relic', 'spell', 'treasure', 'corruption'], maxCost: 0,
      },
    }
  })

  const target = page.locator('.decision-card-choice').filter({ has: page.getByRole('img', { name: 'Crystal' }) })
  await expect(target).toHaveClass(/game-highlight--choice/)
  const borderColor = await target.evaluate(element => getComputedStyle(element, '::after').borderTopColor)
  expect(borderColor).toBe('rgb(242, 153, 74)')
})

for (const [decision, destination] of [['Yes', 'deck'], ['No', 'discard']] as const) {
  test(`V'riswood Amber flies to ${destination} only after its destination choice`, async ({ page }) => {
    await startGame(page)
    await editDebugState(page, current => {
      const player = current.game.players[0]
      current.selectedPlayer = player.id
      current.phase = 'main'
      current.game.currentTurn = player.id
      current.game.currentPhase = 'main'
      current.game.pendingDecision = null
      current.game.pendingEffect = null
      current.game.market.piles[0] = { cardId: 'vriswood_amber', remaining: 5 }
      // Leave a playable card so the buy does not automatically end the turn
      // before the destination in the test can be inspected.
      player.hand = ['crystal']
      player.discard = []
      player.deck = ['spark']
      player.playedThisTurn = []
      player.bonusAether = 3
      player.regularAetherSpent = 0
      player.conditionalAetherEarned = {}
      player.condAetherSpent = {}
      player.aetherTokens = 0
      for (const breach of player.breaches) breach.prepSpells = []
    })

    await page.locator('[data-supply-card-id="vriswood_amber"]').click()
    await expect(page.getByText("Place V'riswood Amber on top of your deck?")).toBeVisible()
    await expect(page.locator('.card-flight-clone')).toHaveCount(0)
    await expect(page.locator('.player-discard-top-card img[alt="V\'riswood Amber"]')).toHaveCount(0)
    await expect(page.locator('.player-area').first().locator('.player-discard-pile .player-empty-pile-label'))
      .toHaveText('Discard 0')
    await expect(page.locator('.player-area').first().locator('.player-deck-pile .player-pile-count'))
      .toHaveText('1')

    await page.getByRole('button', { name: decision, exact: true }).click()
    await expect(page.locator('.card-flight-clone')).toHaveCount(1)
    await expect(page.locator('.card-flight-clone')).toBeVisible()
    await expect(page.locator('.player-area').first().locator('.player-deck-pile .player-pile-count'))
      .toHaveText('1')
    if (destination === 'deck') {
      const flyingBack = page.locator('.card-flight-clone .card-flight-flip-back')
      await expect(flyingBack).toBeVisible()
      expect(await flyingBack.getAttribute('src')).toContain('player-card')
      const mageDeckRadius = await page.locator('.player-deck-pile img').first()
        .evaluate(image => getComputedStyle(image).borderRadius)
      await expect(flyingBack).toHaveCSS('border-radius', mageDeckRadius)
    } else {
      // The empty discard pile stays empty until the card finishes arriving.
      await expect(page.locator('.player-area').first().locator('.player-discard-top-card')).toHaveCount(0)
      await expect(page.locator('.player-area').first().locator('.player-discard-pile .player-empty-pile-label'))
        .toHaveText('Discard 0')
    }
    await finishFlight(page)
    await expect(page.locator('.player-area').first().locator('.player-deck-pile .player-pile-count'))
      .toHaveText(destination === 'deck' ? '2' : '1')
    await page.keyboard.press('Control+d')
    const field = page.locator('.debug-panel textarea')
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const current = JSON.parse(await field.inputValue())
    const player = current.game.players[0]
    if (destination === 'deck') {
      expect(player.deck[0]).toBe('vriswood_amber')
      expect(player.deck).toHaveLength(2)
      expect(player.discard).not.toContain('vriswood_amber')
    } else {
      expect(player.discard[0]).toBe('vriswood_amber')
      expect(player.deck).not.toContain('vriswood_amber')
    }
  })
}

test('a card gained from the Market by an effect uses the same destination flight', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    const player = current.game.players[0]
    current.selectedPlayer = player.id
    current.phase = 'main'
    current.game.currentTurn = player.id
    current.game.currentPhase = 'main'
    current.game.market.piles[0] = { cardId: 'vriswood_amber', remaining: 5 }
    player.hand = ['crystal']
    player.discard = []
    player.deck = []
    current.game.pendingDecision = {
      id: 'test-insatiable-avarice-gain',
      prompt: 'Choose a Gem supply card from the least expensive pile to gain',
      kind: 'select_market_pile',
      emphasis: 'required',
      candidates: [{ pileIndex: 0, cardId: 'vriswood_amber', cardName: "V'riswood Amber", remaining: 5 }],
    }
    current.game.pendingEffect = {
      sourcePlayerId: player.id,
      sourceCardOwnerId: player.id,
      sourceCardId: 'insatiable_avarice_btb',
      effectPlayerId: player.id,
      remainingEffects: [],
      awaiting: { kind: 'gain_card_from_market', cardType: 'gem', leastExpensive: true, destination: 'discard_top' },
    }
  })

  await page.locator('[data-supply-card-id="vriswood_amber"]').click()
  await expect(page.getByText("Place V'riswood Amber on top of your deck?")).toBeVisible()
  await expect(page.locator('.player-area').first().locator('.player-discard-pile .player-empty-pile-label'))
    .toHaveText('Discard 0')
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(page.locator('.card-flight-clone .card-flight-flip-back')).toBeVisible()
  await finishFlight(page)

  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const current = JSON.parse(await field.inputValue())
  expect(current.game.players[0].deck[0]).toBe('vriswood_amber')
  expect(current.game.players[0].discard).not.toContain('vriswood_amber')
})

test('a Market card gained to hand flies to its new rightmost slot while the hand shifts smoothly', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    const player = current.game.players[0]
    current.selectedPlayer = player.id
    current.phase = 'main'
    current.game.currentTurn = player.id
    current.game.currentPhase = 'main'
    current.game.market.piles[0] = { cardId: 'crystal', remaining: 5 }
    player.hand = ['crystal', 'spark']
    player.discard = []
    player.deck = []
    current.game.pendingDecision = {
      id: 'test-hand-gain',
      prompt: 'Choose a Gem supply card to gain',
      kind: 'select_market_pile',
      emphasis: 'required',
      candidates: [{ pileIndex: 0, cardId: 'crystal', cardName: 'Crystal', remaining: 5 }],
    }
    current.game.pendingEffect = {
      sourcePlayerId: player.id,
      sourceCardOwnerId: player.id,
      sourceCardId: 'insatiable_avarice_btb',
      effectPlayerId: player.id,
      remainingEffects: [{ kind: 'move_gained_card', destination: 'hand' }],
      awaiting: { kind: 'gain_card_from_market', cardType: 'gem', destination: 'discard_top' },
    }
  })

  const hand = page.locator('.player-area').first().locator('.hand')
  const oldFirstCard = hand.locator('[data-hand-card-index="0"]')
  const oldFirstCardLeft = await oldFirstCard.evaluate(element => element.getBoundingClientRect().left)
  await page.locator('[data-supply-card-id="crystal"]').click()
  await expect(page.locator('.card-flight-clone')).toHaveCount(1)
  const oldCrystal = hand.locator('[data-hand-card-index="0"]')
  const newCrystal = hand.locator('[data-hand-card-index="2"]')
  await expect(oldCrystal).not.toHaveCSS('visibility', 'hidden')
  await expect(newCrystal).toHaveCSS('visibility', 'hidden')
  const shiftedFirstCardLeft = await oldFirstCard.evaluate(element => element.getBoundingClientRect().left)
  expect(shiftedFirstCardLeft).toBeLessThan(oldFirstCardLeft)

  await finishFlight(page)
  await expect(newCrystal).not.toHaveCSS('visibility', 'hidden')
  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const current = JSON.parse(await field.inputValue())
  expect(current.game.players[0].hand).toEqual(['crystal', 'spark', 'crystal'])
})

test('an empty discard pile replaces its empty label with the arriving card and clears the display override', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    const player = current.game.players[0]
    current.selectedPlayer = player.id
    current.phase = 'main'
    current.game.currentTurn = player.id
    current.game.currentPhase = 'main'
    current.game.market.piles[0] = { cardId: 'rift_ring', remaining: 5 }
    player.hand = ['spark']
    player.deck = ['crystal']
    player.discard = []
    player.playedThisTurn = []
    player.bonusAether = 3
    player.regularAetherSpent = 0
    player.conditionalAetherEarned = {}
    player.condAetherSpent = {}
    player.aetherTokens = 0
  })

  const discard = page.locator('.player-area').first().locator('.player-discard-pile')
  await page.locator('[data-supply-pile-index="0"]').click()
  await expect(page.locator('.card-flight-clone')).toHaveCount(1)
  await expect(discard.locator('.player-empty-pile-label')).toHaveText('Discard 0')
  await finishFlight(page)

  await expect(discard.locator('.player-empty-pile-label')).toHaveCount(0)
  await expect(discard.locator('.player-pile-count')).toHaveText('1')
  const topCard = discard.locator('.player-discard-top-card')
  await expect(topCard.locator('img[alt="Rift Ring"]')).toBeVisible()
  await expect(topCard).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.nemesis-mat-wrap')).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.nemesis-pile-card').first()).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')

  await discard.click()
  await expect(page.locator('.pile-modal img[alt="Rift Ring"]')).toBeVisible()
})
