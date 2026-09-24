import { test, expect, type Locator, type Page } from '@playwright/test'

const newMages = ['adelheim', 'kadir', 'lash', 'mist', 'phaedraxa']

async function resetSetup(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

async function resolveAttackIfNeeded(page: Page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const target = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (!(await target.isVisible().catch(() => false))) return
    await target.click()
  }
}

async function resolveStartupInterrupts(page: Page) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const continueDraw = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueDraw.isVisible().catch(() => false)) {
      await continueDraw.click()
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
    const nemesisEffectCard = page.locator('.nemesis-play-card.effect-target').first()
    if (await nemesisEffectCard.isVisible().catch(() => false)) {
      await nemesisEffectCard.click()
      continue
    }
    const attack = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (await attack.isVisible().catch(() => false)) {
      await attack.click()
      continue
    }
    return
  }
}

async function expectAllImagesLoaded(page: Page) {
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete))
  const brokenImages = await page.locator('img').evaluateAll(images => images
    .filter(image => image.naturalWidth === 0)
    .map(image => ({ alt: image.alt, src: image.currentSrc || image.src })))
  expect(brokenImages).toEqual([])
}

async function applyDebugGameState(page: Page, update: (game: any) => void, phase?: string) {
  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.selectedPlayer = debugState.game.players[0].id
  if (phase) debugState.phase = phase
  update(debugState.game)
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

async function dragSpellToBreach(page: Page, spell: Locator, breachIndex: number) {
  await spell.scrollIntoViewIfNeeded()
  const source = await spell.boundingBox()
  const target = await page.locator(`.breach[data-breach-index="${breachIndex}"]`).boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 })
  await page.mouse.up()
}

async function dragLocatorToLocator(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(targetBox).not.toBeNull()
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 })
  await page.mouse.up()
}

test('all new Wave 1 Mages can start with their boards visible', async ({ page }) => {
  for (const mage of newMages) {
    await resetSetup(page)
    await page.getByLabel('Player 1').selectOption(mage)
    await page.getByLabel('Player 2').selectOption('jian')
    await page.getByRole('button', { name: 'Start Game' }).click()

    await resolveStartupInterrupts(page)
    await expectAllImagesLoaded(page)
    await page.locator('.char-btn').first().click()
    await expect(page.getByRole('img', { name: `${mage} mage board` })).toBeVisible()
    await resolveAttackIfNeeded(page)
  }
})

test('Mage board modal stays above the hand and below the exit modal', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.locator('.mage-image-wrap').first().click()
  await expect(page.locator('.mage-overlay')).toBeVisible()
  const layerOrder = await page.evaluate(() => ({
    handRow: getComputedStyle(document.querySelector('.hand-row')!).zIndex,
    mageArea: getComputedStyle(document.querySelector('.mage-area')!).zIndex,
    mageOverlay: getComputedStyle(document.querySelector('.mage-overlay')!).zIndex,
  }))
  expect(Number(layerOrder.mageArea)).toBeGreaterThan(Number(layerOrder.handRow))
  expect(Number(layerOrder.mageOverlay)).toBeGreaterThan(Number(layerOrder.handRow))

  await page.keyboard.press('Escape')
  await expect(page.locator('.mage-overlay')).toHaveCount(0)
  await page.keyboard.press('Escape')
  const exitLayer = await page.locator('.exit-overlay').evaluate(element => getComputedStyle(element).zIndex)
  expect(Number(exitLayer)).toBeGreaterThan(Number(layerOrder.mageOverlay))
})

test('Kadir can stack two spells on one Breach in the UI', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('kadir')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()

  const kadirSection = page.locator('.debug-section').filter({ hasText: 'kadir (wave1_KADIR)' })
  await kadirSection.getByRole('spinbutton', { name: 'Charge for kadir' }).fill('5')
  const addCardSection = page.locator('.debug-section').filter({ hasText: 'Add card' })
  const cardPicker = addCardSection.locator('.debug-card-picker')
  const playerSelect = addCardSection.getByLabel('Debug card player')
  const zoneSelect = addCardSection.getByLabel('Debug card zone')
  for (const type of ['Gem', 'Relic', 'Spell']) {
    await cardPicker.locator('.debug-card-group-toggle').filter({ hasText: type }).click()
  }
  for (const playerId of ['wave1_KADIR', 'wave1_BRAMA']) {
    for (const cardId of ['spark', 'flare']) {
      await cardPicker.locator(`.debug-card-option[data-card-id="${cardId}"]`).click()
      await playerSelect.selectOption(playerId)
      await zoneSelect.selectOption('hand')
      await addCardSection.getByRole('button', { name: 'Add Card', exact: true }).click()
    }
  }
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  for (let attempt = 0; attempt < 10; attempt++) {
    await resolveAttackIfNeeded(page)
    const mainPhase = page.getByRole('button', { name: 'Start Main Phase →' })
    if (await mainPhase.isVisible().catch(() => false)) await mainPhase.click()
    await page.locator('.char-btn').first().click()
    const ability = page.getByRole('button', { name: 'Activate Ability' })
    if (await ability.isVisible().catch(() => false)) {
      await expect(ability).toBeEnabled()
      await ability.click()
      break
    }
    await page.waitForTimeout(50)
  }

  const currentPlayer = page.locator('.char-btn.cur')
  await expect(currentPlayer).toHaveCount(1)
  await currentPlayer.click()
  for (const cardName of ['Spark', 'Flare']) {
    const spell = page.locator('.hand .card').filter({ has: page.locator(`img[alt="${cardName}"]`) }).last()
    await spell.click()
    await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(cardName === 'Spark' ? 0 : 1)
    await dragSpellToBreach(page, spell, 1)
  }

  await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(2)
})

test('prepped spells can move between Breaches and swap positions during Main Phase', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['spark']
    game.players[0].breaches[1].opened = true
    game.players[0].breaches[1].prepSpells = ['flare']
  }, 'main')

  const source = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  const target = page.locator('.breach[data-breach-index="2"] .breach-spell-card-frame')
  await dragLocatorToLocator(page, source, target)

  await expect(page.locator('.breach[data-breach-index="1"] img[alt="Flare"]')).toBeVisible()
  await expect(page.locator('.breach[data-breach-index="2"] img[alt="Spark"]')).toBeVisible()
})

test('Feral Lightning can move onto a closed Breach during Main Phase', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = []
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['feral_lightning']
    game.players[0].breaches[1].opened = false
    game.players[0].breaches[1].focusedThisTurn = false
    game.players[0].breaches[1].prepSpells = []
  }, 'main')

  const source = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  const target = page.locator('.breach[data-breach-index="2"]')
  await expect(source).toHaveClass(/repositionable-spell/)
  await expect(target).not.toHaveClass(/drag-target/)
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(targetBox).not.toBeNull()
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 })
  await expect(target).toHaveClass(/move-drag-target/)
  await page.mouse.up()

  await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(0)
  await expect(page.locator('.breach[data-breach-index="2"] img[alt="Feral Lightning"]')).toBeVisible()
})

test('prepped spells remain movable during discard order before the turn fully ends', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['spark']
    game.players[0].breaches[1].opened = true
    game.players[0].playedThisTurn = ['crystal']
  }, 'discard_order')

  const source = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  const target = page.locator('.breach[data-breach-index="2"]')
  await expect(source).toHaveClass(/repositionable-spell/)
  await dragLocatorToLocator(page, source, target)

  await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(0)
  await expect(page.locator('.breach[data-breach-index="2"] img[alt="Spark"]')).toBeVisible()
})

test('discarding a duplicate card preserves the remaining Played order', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = []
    game.players[0].playedThisTurn = ['flexing_dagger', 'crystal', 'crystal', 'flexing_dagger']
  }, 'main')

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  await expect(page.getByText('Discard Phase · Card Order', { exact: true })).toBeVisible()
  const playedCards = page.locator('.played-zones .played-zone-center .card img')
  await expect.poll(() => playedCards.evaluateAll(images => images.map(image => image.alt))).toEqual([
    'Flexing Dagger', 'Crystal', 'Crystal', 'Flexing Dagger',
  ])

  await playedCards.nth(3).click()
  await expect.poll(() => playedCards.evaluateAll(images => images.map(image => image.alt))).toEqual([
    'Flexing Dagger', 'Crystal', 'Crystal',
  ])
})

test('a hand spell does not replace a prepped spell, while a prepped spell can return to hand', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = ['flare']
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['spark']
  }, 'main')

  const hand = page.locator('.hand')
  const handSpell = hand.locator('.card').filter({ has: page.locator('img[alt="Flare"]') })
  const breachSpell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  await dragLocatorToLocator(page, handSpell, breachSpell)
  await expect(page.locator('.breach[data-breach-index="1"] img[alt="Spark"]')).toBeVisible()
  await expect(hand.locator('img[alt="Flare"]')).toBeVisible()

  const returnedSpell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  await dragLocatorToLocator(page, returnedSpell, hand)
  await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveCount(0)
  await expect(hand.locator('img[alt="Spark"]')).toBeVisible()
})

test('a spell stays highlighted until its damage target is confirmed', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'casting'
  debugState.selectedPlayer = debugState.game.players[0].id
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'casting'
  debugState.game.players[0].breaches[0].prepSpells = ['lava_tendril']
  debugState.game.nemesis.playArea = [{
    instanceId: 'target-minion:1', cardId: 'bane_sire', cardType: 'minion', placedAt: 1, lifeTokens: 3,
  }]
  debugState.game.pendingDecision = {
    id: 'target-1', playerId: debugState.game.players[0].id, prompt: 'Choose a damage target', kind: 'select_damage_target',
    targets: [
      { kind: 'nemesis', id: 'nemesis', label: 'Nemesis' },
      { kind: 'minion', id: 'minion:1', placedAt: 1, cardId: 'bane_sire', label: 'Bane Sire' },
    ],
  }
  debugState.game.pendingEffect = {
    playerId: debugState.game.players[0].id, sourceCardId: 'lava_tendril', remainingEffects: [],
    awaiting: { kind: 'deal_damage', amount: 3, target: 'nemesis_or_minion' },
    pendingSpellCast: { playerId: debugState.game.players[0].id, breachIndex: 1, spellIndex: 0, cardId: 'lava_tendril', discard: true },
    spellDamageEffectSeen: true,
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const pendingSpell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  await expect(pendingSpell).toHaveClass(/pending-cast-spell/)
  await expect(pendingSpell.locator('.spell-damage-badge')).toHaveText('3')
  await expect(page.locator('.nemesis-play-card.damage-target')).toBeVisible()

  await page.locator('.char-btn').nth(1).click()
  await page.locator('.deck-pile.clickable').click()
  await expect(page.locator('.pile-modal')).toBeVisible()
  await page.locator('.pile-modal').getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.char-btn').first().click()

  await page.locator('.nemesis-play-card.damage-target').click()
  await expect(pendingSpell).toHaveCount(0)
})

test('a prepped spell shows its damage preview while hovered during Casting Phase', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'casting'
    for (const breach of game.players[0].breaches) breach.prepSpells = []
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['spark']
    game.nemesis.playArea = []
  }, 'casting')

  const spell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  const badge = spell.locator('.spell-damage-badge')
  await expect(badge).toHaveText('1')
  await expect(badge).toBeHidden()

  await spell.hover()
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText('1')
})

test('Flare shows a conditional damage range before the next turn-order card is revealed', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'casting'
    for (const breach of game.players[0].breaches) breach.prepSpells = []
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['flare']
    game.turnOrderDeck = [game.players[1].id]
    game.nemesis.playArea = []
  }, 'casting')

  const spell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  const badge = spell.locator('.spell-damage-badge')
  await expect(badge).toHaveText('1/3')
  await spell.hover()
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText('1/3')
})

test('Oblivion Swell highlights and grants Aether when its prepped spell is clicked', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = ['crystal']
    game.players[0].bonusAether = 0
    game.players[0].turnEffects.usedPreppedEffects = []
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['oblivion_swell']
  }, 'main')

  const spell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  await expect(spell).toHaveClass(/manual-prepped-action/)
  await spell.click()
  await expect(spell).not.toHaveClass(/manual-prepped-action/)
  await expect(page.locator('.aether')).toContainText('Aether 1')
})

test('Focusing Orb selects a Breach directly from highlighted board targets', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = ['focusing_orb']
    game.players[0].playedThisTurn = []
    game.players[0].bonusAether = 0
  }, 'main')

  await page.locator('.hand .card').filter({ has: page.locator('img[alt="Focusing Orb"]') }).click()
  await page.getByRole('button', { name: "Focus any player's closed breach" }).click()
  await expect(page.locator('.non-blocking-selection-modal')).toHaveCount(0)
  const target = page.locator('.breach-token-wrap.decision-breach-target').first()
  await expect(target).toBeVisible()
  await target.click()
  await expect(page.locator('.breach-token-wrap.decision-breach-target')).toHaveCount(0)
})

test('Wildfire Whip is a repeatable blue prepped action that requires two Aether', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = []
    game.players[0].bonusAether = 4
    game.players[0].regularAetherSpent = 0
    game.players[0].breaches[0].opened = true
    game.players[0].breaches[0].prepSpells = ['wildfire_whip']
    game.players[1].breaches[0].prepSpells = ['spark']
  }, 'main')

  const spell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  await expect(spell).toHaveClass(/repeatable-prepped-action/)
  await spell.click()
  await expect(page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')).toHaveClass(/repeatable-prepped-action/)
  await expect(page.locator('.aether')).toContainText('2')
  await expect(page.locator('.breach-spell-card-frame.ability-prepped-spell')).toHaveCount(1)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.pendingDecision = null
    game.pendingEffect = null
    game.players[0].bonusAether = 1
    game.players[0].regularAetherSpent = 0
    game.players[0].breaches[0].prepSpells = ['wildfire_whip']
  }, 'main')
  const unavailableSpell = page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame')
  await expect(unavailableSpell).toHaveClass(/repeatable-prepped-action/)
  await unavailableSpell.click()
  await expect(page.locator('.decision-modal')).toHaveCount(0)
})

test('Flexing Dagger disables its breach-cost option when all breaches are open', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = ['flexing_dagger']
    for (const breach of game.players[0].breaches) {
      if (breach.present !== false) breach.opened = true
    }
  }, 'main')

  await page.locator('.hand .card').filter({ has: page.locator('img[alt="Flexing Dagger"]') }).click()
  const unavailableOption = page.getByRole('button', { name: 'Reduce the next focus or open cost by 3' })
  await expect(unavailableOption).toBeDisabled()
  await expect(unavailableOption).toHaveClass(/unavailable/)
  await expect(page.getByRole('button', { name: 'Destroy this to deal 1 damage' })).toBeEnabled()
})

test('Unstable Prism disables its play-Gem option when the hand has no Gems', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = ['unstable_prism']
  }, 'main')

  await page.locator('.hand .card').filter({ has: page.locator('img[alt="Unstable Prism"]') }).click()
  const playGemOption = page.getByRole('button', { name: 'Play a gem in hand twice, then destroy it' })
  await expect(playGemOption).toBeDisabled()
  await expect(playGemOption).toHaveClass(/unavailable/)
  await expect(page.getByRole('button', { name: 'Gain 2 Aether' })).toBeEnabled()
})

test('Flexing Dagger destroys its played copy instead of an identical card in hand', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = ['flexing_dagger', 'flexing_dagger']
    game.players[0].playedThisTurn = []
    game.players[0].destroyedCards = []
    game.nemesis.hp = 20
  }, 'main')

  const handDaggers = page.locator('.hand .card').filter({ has: page.locator('img[alt="Flexing Dagger"]') })
  await expect(handDaggers).toHaveCount(2)
  await handDaggers.first().click()
  await page.getByRole('button', { name: 'Destroy this to deal 1 damage' }).click()

  await expect(handDaggers).toHaveCount(1)
  await expect(page.locator('.played-zones .played-zone-center img[alt="Flexing Dagger"]')).toHaveCount(0)
  await expect(page.locator('.played-zones .played-zone-center .empty')).toHaveText('— none —')
})

test('preparing a spell preserves the remaining hand order', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1100 })
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.selectedPlayer = debugState.game.players[0].id
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'main'
  debugState.game.players[0].hand = ['spark', 'crystal', 'crystal', 'crystal', 'spark']
  debugState.game.players[0].breaches[0].opened = true
  debugState.game.players[0].breaches[0].prepSpells = []
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect.poll(() => page.locator('.hand img').evaluateAll(images => images.map(image => image.alt))).toEqual([
    'Spark', 'Crystal', 'Crystal', 'Crystal', 'Spark',
  ])
  await dragSpellToBreach(page, page.locator('.hand .card').last(), 1)
  await expect.poll(() => page.locator('.hand img').evaluateAll(images => images.map(image => image.alt))).toEqual([
    'Spark', 'Crystal', 'Crystal', 'Crystal',
  ])
})

test('Save & Exit creates a resumable game record', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('kadir')
  await page.getByLabel('Player 2').selectOption('mist')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.getByText('Market', { exact: true })).toBeVisible()
  await resolveAttackIfNeeded(page)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Exit Game?' })).toBeVisible()
  await page.getByRole('button', { name: 'Save & Exit' }).click()

  await expect(page.getByRole('heading', { name: /Saved Games \(1\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume Game' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume Game' }).click()
  await expect(page.getByText('Market', { exact: true })).toBeVisible()
})

test('Debug Tools can add Nemesis cards to play or the deck top', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()
  const nemesisSection = page.locator('.debug-section').filter({ hasText: 'Add Nemesis card' })
  const nemesisPicker = nemesisSection.locator('.debug-card-picker')
  const nemesisSearch = nemesisPicker.getByRole('searchbox', { name: 'Search debug cards' })
  for (const [query, cardName] of [['venomite', 'Venomite'], ['agony field', 'Agony Field'], ['slaughter', 'Slaughter']] as const) {
    await nemesisSearch.fill(query)
    await nemesisPicker.locator('.debug-card-option').filter({ has: page.locator(`img[alt="${cardName}"]`) }).click()
    await nemesisSection.getByRole('button', { name: 'Add to Nemesis', exact: true }).click()
  }

  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  expect(debugState.game.nemesis.playArea.some((card: any) => card.cardId === 'venomite')).toBe(true)
  expect(debugState.game.nemesis.playArea.some((card: any) => card.cardId === 'agony_field')).toBe(true)
  expect(debugState.game.nemesis.deck[0]).toBe('slaughter')
})

test('saved games retain the undo history after resume', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.players[0].hand = Array.from({ length: 12 }, () => 'crystal')
    game.players[0].bonusAether = 0
    game.players[0].playedThisTurn = []
  }, 'main')

  const handCard = page.locator('.hand .card').first()
  for (let action = 0; action < 12; action++) {
    await handCard.click({ force: true })
    await expect(page.locator('.played-zones .played-zone-center img[alt="Crystal"]')).toHaveCount(action + 1)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Save & Exit' }).click()
  const savedHistoryLength = await page.evaluate(() => {
    const saves = JSON.parse(localStorage.getItem('aeons-end-saves-v3') ?? '[]')
    return saves[0]?.undoStack?.length ?? 0
  })
  expect(savedHistoryLength).toBe(10)
  await page.getByRole('button', { name: 'Resume Game' }).click()
  for (let action = 0; action < 10; action++) await page.keyboard.press('Control+z')

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const resumedState = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  expect(resumedState.game.players[0].playedThisTurn).toHaveLength(2)
})

test('hand stays inside its column and scrolls horizontally with the wheel', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1100 })
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  const hand = page.locator('.hand')
  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.hand = ['spark', 'crystal', 'spark', 'crystal']
    }
  })
  const measureHand = () => hand.evaluate(element => {
    const cards = [...element.querySelectorAll<HTMLElement>('.card')]
    const first = cards[0]!.getBoundingClientRect()
    const last = cards[cards.length - 1]!.getBoundingClientRect()
    const container = element.getBoundingClientRect()
    const styles = getComputedStyle(element)
    const contentWidth = last.right - first.left
    const safeLeft = container.left
    const safeRight = container.right - Number.parseFloat(styles.paddingRight)
    const centeredLeft = window.innerWidth / 2 - contentWidth / 2
    return {
      actualLeft: first.left,
      expectedLeft: Math.min(Math.max(safeLeft, centeredLeft), safeRight - contentWidth),
      contentWidth,
    }
  })
  const centered = await measureHand()
  expect(Math.abs(centered.actualLeft - centered.expectedLeft)).toBeLessThan(2)

  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.hand = ['spark', 'crystal', 'spark', 'crystal', 'spark']
    }
  })
  const stillCentered = await measureHand()
  expect(Math.abs(stillCentered.actualLeft - stillCentered.expectedLeft)).toBeLessThan(2)

  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.hand = Array.from({ length: 12 }, (_, index) => index % 2 ? 'crystal' : 'spark')
    }
  })

  await expect(hand).toBeVisible()
  const dimensions = await hand.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollLeft: element.scrollLeft,
    cardTop: element.querySelector<HTMLElement>('.card')!.getBoundingClientRect().top,
    cardBottom: element.querySelector<HTMLElement>('.card')!.getBoundingClientRect().bottom,
    handTop: element.getBoundingClientRect().top,
    handBottom: element.getBoundingClientRect().bottom,
  }))
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
  expect(dimensions.cardTop - dimensions.handTop).toBeGreaterThanOrEqual(3)
  expect(dimensions.handBottom - dimensions.cardBottom).toBeGreaterThanOrEqual(3)
  const box = await hand.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, 500)
  await expect.poll(() => hand.evaluate(element => element.scrollLeft)).toBeGreaterThan(dimensions.scrollLeft)
  const rightPosition = await hand.evaluate(element => element.scrollLeft)
  await page.mouse.wheel(0, -500)
  await expect.poll(() => hand.evaluate(element => element.scrollLeft)).toBeLessThan(rightPosition)
})

test('dragging a spell suppresses Breach preview and accepts an overlapping drop', async ({ page }) => {
  await resetSetup(page)
  await page.setViewportSize({ width: 1920, height: 1100 })
  await page.reload()
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = game.players[0].id
    game.currentPhase = 'main'
    game.pendingDecision = null
    game.pendingEffect = null
    // Keep one non-spell action in hand so the Main Phase remains active after
    // the test spell is prepared.
    game.players[0].hand = ['spark', 'crystal']
    game.players[0].breaches[0].prepSpells = []
  }, 'main')
  await page.locator('.char-btn').filter({ hasText: 'jian' }).click()

  const spell = page.locator('.hand .card').filter({ has: page.locator('img[alt="Spark"]') }).first()
  const breach = page.locator('.breach[data-breach-index="1"]')
  await expect(spell).toBeVisible()
  const source = await spell.boundingBox()
  const target = await breach.boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()

  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  const releaseX = target!.x + target!.width / 2
  const releaseY = target!.y - 10
  await page.mouse.move(releaseX, releaseY, { steps: 8 })
  await page.waitForTimeout(600)
  await expect(page.locator('.card-hover-preview.breach-preview')).toHaveCount(0)
  await page.mouse.up()

  await expect(breach.locator('.breach-spell-card-frame')).toHaveCount(1)
})

test('face-up discard retains its draw forecast and opens with either mouse button', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    for (const player of game.players) {
      player.deck = ['crystal', 'spark', 'crystal', 'spark', 'crystal']
      player.discard = Array.from({ length: 11 }, (_, index) => index % 2 ? 'crystal' : 'spark')
    }
  })

  await expect(page.locator('.player-discard-top-card img')).toHaveAttribute('alt', 'Spark')
  await page.locator('.discard-pile').click()
  const rows = page.locator('.pile-modal .pile-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('.pile-row-label')).toHaveText('FUTURE DRAW')
  await expect(rows.nth(1).locator('.pile-row-label')).toHaveText('FUTURE DRAW')
  await expect(rows.nth(2).locator('.pile-row-label')).toHaveText('NEXT DRAW')
  await expect(rows.nth(0).locator('.pile-card')).toHaveCount(1)
  await expect(rows.nth(1).locator('.pile-card')).toHaveCount(5)
  await expect(rows.nth(2).locator('.pile-card')).toHaveCount(5)
  expect(await page.locator('.pile-modal .pile-card img').evaluateAll(images => images.map(image => image.alt)))
    .toEqual(['Spark', 'Crystal', 'Spark', 'Crystal', 'Spark', 'Crystal', 'Spark', 'Crystal', 'Spark', 'Crystal', 'Spark'])
  await page.locator('.pile-modal').getByRole('button', { name: 'Close', exact: true }).click()

  await page.locator('.player-discard-top-card').click({ button: 'right' })
  await expect(page.locator('.pile-modal')).toBeVisible()
  await expect(page.locator('.pile-modal .pile-card')).toHaveCount(11)
})

test('number, Q, and W shortcuts switch the shown mage and open player piles above decisions', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.players[0].deck = ['spark']
    game.players[0].discard = ['crystal']
    game.players[1].deck = ['crystal']
    game.players[1].discard = ['spark']
  })

  await page.getByLabel('Open game help').click()
  await expect(page.getByRole('dialog', { name: 'Game Help' })).toBeVisible()
  await page.keyboard.press('2')
  await expect(page.locator('.char-btn.sel .cn')).toHaveText('brama')
  await page.keyboard.press('Tab')
  await expect(page.locator('.char-btn.sel .cn')).toHaveText('jian')
  await page.keyboard.press('Tab')
  await expect(page.locator('.char-btn.sel .cn')).toHaveText('brama')
  await page.keyboard.press('q')
  await expect(page.getByRole('dialog', { name: 'Game Help' })).toBeHidden()
  await expect(page.locator('.pile-modal h3')).toContainText('Deck')
  await expect(page.locator('.pile-modal .pile-card img')).toHaveAttribute('alt', 'Crystal')
  await page.keyboard.press('q')
  await expect(page.locator('.pile-modal')).toHaveCount(0)
  await page.keyboard.press('q')
  await expect(page.locator('.pile-modal h3')).toContainText('Deck')
  await page.keyboard.press('w')
  await expect(page.locator('.pile-modal')).toHaveCount(1)
  await expect(page.locator('.pile-modal h3')).toContainText('Discard')
  await expect(page.locator('.pile-modal .pile-card img')).toHaveAttribute('alt', 'Spark')
  await page.locator('.pile-modal').getByRole('button', { name: 'Close', exact: true }).click()

  await applyDebugGameState(page, game => {
    game.pendingDecision = {
      id: 'shortcut-decision',
      playerId: game.players[0].id,
      kind: 'choose_one',
      prompt: 'Choose an option before continuing',
      options: [{ id: 'continue', label: 'Continue' }],
    }
  }, 'main')

  await expect(page.locator('.decision-overlay .decision-modal')).toBeVisible()
  await page.keyboard.press('q')
  await expect(page.locator('.pile-modal h3')).toContainText('Deck')
  await expect(page.locator('.decision-overlay .decision-modal')).toBeVisible()
  await expect.poll(() => page.evaluate(() => ({
    pile: Number(getComputedStyle(document.querySelector('.pile-viewer-overlay')!).zIndex),
    decision: Number(getComputedStyle(document.querySelector('.decision-overlay')!).zIndex),
  }))).toEqual({ pile: 130, decision: 120 })
})

test('damage and life target decisions show each mage\'s current life', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    const [first, second] = game.players
    first.hp = 7
    second.hp = 4
    game.currentTurn = first.id
    game.currentPhase = 'main'
    game.pendingDecision = {
      id: 'damage-life-1', playerId: first.id, prompt: 'Choose a player to suffer damage',
      kind: 'select_player_target',
      targets: game.players.map((player: any) => ({ kind: 'player', playerId: player.id })),
    }
    game.pendingEffect = {
      sourcePlayerId: first.id, effectPlayerId: first.id, remainingEffects: [],
      awaiting: { kind: 'deal_player_damage', amount: 2, target: 'any_player' },
    }
  }, 'main')

  const damageTargets = page.locator('.player-target-option')
  await expect(damageTargets).toHaveCount(2)
  await expect(damageTargets.nth(0)).toContainText('HP 7/')
  await expect(damageTargets.nth(1)).toContainText('HP 4/')

  await applyDebugGameState(page, game => {
    const [first, second] = game.players
    game.currentTurn = first.id
    game.currentPhase = 'main'
    game.pendingDecision = {
      id: 'life-target-1', playerId: first.id, prompt: 'Choose a life target',
      kind: 'select_life_target',
      targets: game.players.map((player: any) => ({ kind: 'player', playerId: player.id })),
    }
    game.pendingEffect = {
      sourcePlayerId: first.id, effectPlayerId: first.id, remainingEffects: [],
      awaiting: { kind: 'gain_life', amount: 2, target: 'any_player' },
    }
    second.hp = 4
  }, 'main')

  const lifeTargets = page.locator('.player-target-option')
  await expect(lifeTargets).toHaveCount(2)
  await expect(lifeTargets.nth(0)).toContainText('HP 7/')
  await expect(lifeTargets.nth(1)).toContainText('HP 4/')
})

test('Space advances from Casting to Main and ends the Main Phase', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    const player = game.players[0]
    game.currentTurn = player.id
    game.currentPhase = 'casting'
    game.pendingDecision = null
    game.pendingEffect = null
    player.hand = ['crystal']
    player.playedThisTurn = []
    for (const breach of player.breaches) breach.prepSpells = []
  }, 'casting')

  await expect(page.getByRole('button', { name: 'Start Main Phase →' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible()

  await applyDebugGameState(page, game => {
    const player = game.players[0]
    game.currentTurn = player.id
    game.currentPhase = 'main'
    game.pendingDecision = null
    game.pendingEffect = null
    player.playedThisTurn = ['crystal', 'spark']
  }, 'main')

  await page.keyboard.press('Space')
  await expect(page.getByText('Actions remain. End turn anyway?', { exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByText('Discard Phase · Card Order', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toHaveCount(0)
})

test('Space confirms a revealed Nemesis card', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    game.currentTurn = 'nemesis'
    game.currentPhase = 'nemesis_draw'
    game.pendingEffect = null
    game.pendingDecision = {
      id: 'nemesis-draw-confirm',
      kind: 'confirm_nemesis_draw',
      prompt: 'Nemesis drew Bane Sire',
      cardId: 'bane_sire',
    }
    game.nemesis.deck = []
    game.nemesis.playArea = []
    game.nemesisResolution = {
      step: 'draw',
      mainQueue: [],
      mainIndex: 0,
      drawnCardId: 'bane_sire',
      drawnCardRevealed: true,
    }
  }, 'nemesis_draw')

  await expect(page.locator('.nemesis-reveal-overlay')).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.locator('.nemesis-reveal-overlay')).toHaveCount(0)
})

test('a unique ally card decision automatically displays that ally', async ({ page }) => {
  await resetSetup(page)
  await page.getByLabel('Player 1').selectOption('adelheim')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await applyDebugGameState(page, game => {
    const [sourcePlayer, ally] = game.players
    sourcePlayer.hand = ['amethyst_shard']
    ally.hand = ['crystal']
    game.pendingEffect = {
      playerId: sourcePlayer.id,
      effectPlayerId: ally.id,
      remainingEffects: [],
    }
    game.pendingDecision = {
      id: 'amethyst-shard-ally-discard',
      playerId: sourcePlayer.id,
      kind: 'select_cards',
      prompt: 'Discard a card.',
      min: 1,
      max: 1,
      candidates: [{ zone: 'hand', index: 0, cardId: 'crystal' }],
    }
  }, 'main')

  await expect(page.locator('.char-btn.sel .cn')).toHaveText('brama')
  await expect(page.getByRole('heading', { name: 'Discard a card.' })).toBeVisible()
})
