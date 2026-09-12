import { test, expect } from '@playwright/test'

test('Nemesis board proportions, five asset regions, HP space and pile interactions', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.locator('.nemesis-area')).toBeVisible()
  // Isolate layout from random turn-order interrupts without touching real saves.
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'main'
  debugState.game.nemesis.discard = ['slaughter']
  debugState.game.nemesis.playArea = Array.from({ length: 12 }, (_, i) => ({
    instanceId: `layout-${i}`, cardId: 'haze_spewer', cardType: 'minion', placedAt: i, lifeTokens: 5,
  }))
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.nemesis-mat-image')).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const area = document.querySelector('.nemesis-area')!
      const areaBox = box('.nemesis-area')
      const padding = getComputedStyle(area)
      const mat = box('.nemesis-mat-image')
      const img = document.querySelector<HTMLImageElement>('.nemesis-mat-image')!
      const assets = [...document.querySelectorAll('.nemesis-assets-row > *')].map(el => el.getBoundingClientRect())
      const slots = box('.slots')
      const left = box('.turn-side-left')
      const right = box('.turn-side-right')
      const round = box('.turn-round')
      return {
        loaded: img.naturalWidth > 0,
        fullHeight: Math.abs(mat.height - (areaBox.height - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom))) < 3,
        correctRatio: Math.abs(mat.width / mat.height - img.naturalWidth / img.naturalHeight) < .01,
        fiveTiles: assets.length === 5 && assets.every(b => Math.abs(b.width - assets[0].width) < 1 && b.y === assets[0].y),
        noOverflow: assets[4].right <= areaBox.right && box('.nemesis-play').right <= areaBox.right,
        globalCenter: Math.abs(slots.x + slots.width / 2 - window.innerWidth / 2) < 2,
        hpGap: slots.left - left.right >= 23 && right.left - slots.right >= 23,
        fillsLeft: Math.abs(left.left - (box('.turn-order-bar').left + 14)) < 2,
        fillsRight: Math.abs(round.left - right.right - 16) < 2,
        flexibleBars: box('.turn-side-left .hpbar').width > 100 && box('.turn-side-right .hpbar').width > 20,
      }
    })).toEqual({ loaded: true, fullHeight: true, correctRatio: true, fiveTiles: true, noOverflow: true, globalCenter: true, hpGap: true, fillsLeft: true, fillsRight: true, flexibleBars: true })
    await page.screenshot({ path: `test-results/nemesis-layout-${viewport.width}.png` })
  }

  await expect(page.getByRole('region', { name: 'Nemesis Sub Board' })).toHaveCount(0)
  await expect(page.getByLabel('Nemesis Specific Discard', { exact: true })).toContainText('Not used')
  await page.getByRole('button', { name: 'Open Rageborne mat' }).click()
  await expect(page.locator('.nemesis-mat-modal-frame img')).toBeVisible()
  await page.getByRole('button', { name: 'Flip to Back' }).click()
  await expect(page.locator('.nemesis-mat-modal-frame img')).toHaveAttribute('alt', 'Rageborne mat back')
  await page.locator('.mage-overlay').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Open Nemesis Discard' }).click()
  await expect(page.locator('.pile-modal .pile-card')).toHaveCount(1)
  await expect.poll(async () => (await page.locator('.pile-modal').boundingBox())?.width ?? 999).toBeLessThan(260)
  await page.locator('.pile-modal').getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.nemesis-card-scroll').hover({ position: { x: 5, y: 5 } })
  await page.mouse.wheel(0, 700)
  await expect.poll(() => page.locator('.nemesis-card-scroll').evaluate(el => el.scrollLeft)).toBeGreaterThan(50)

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const damageStateField = page.locator('.debug-panel textarea')
  const damageState = JSON.parse(await damageStateField.inputValue())
  damageState.phase = 'main'
  damageState.game.currentTurn = damageState.game.players[0].id
  damageState.game.currentPhase = 'main'
  damageState.game.nemesis.hp = damageState.game.nemesis.maxHp
  damageState.game.nemesis.playArea = [{ instanceId: 'damage-minion:1', cardId: 'haze_spewer', cardType: 'minion', placedAt: 1, lifeTokens: 5 }]
  damageState.game.pendingDecision = {
    id: 'damage-1', playerId: damageState.game.players[0].id, prompt: 'Choose a damage target', kind: 'select_damage_target',
    targets: [
      { kind: 'nemesis', id: 'nemesis', label: 'Nemesis' },
      { kind: 'minion', id: 'minion:1', placedAt: 1, cardId: 'haze_spewer', label: 'Haze Spewer' },
    ],
  }
  damageState.game.pendingEffect = {
    playerId: damageState.game.players[0].id, remainingEffects: [],
    awaiting: { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
  }
  await damageStateField.fill(JSON.stringify(damageState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await expect(page.locator('.nemesis-mat-wrap.damage-target')).toBeVisible()
  await expect(page.locator('.nemesis-play-card.damage-target')).toBeVisible()
  await page.locator('.nemesis-mat-wrap.damage-target').click()
  await expect(page.locator('.mage-overlay')).toHaveCount(0)
  await expect(page.locator('.nemesis-mat-wrap.damage-target')).toHaveCount(0)
})

test('To Discard does not show or retain the Power card preview', async ({ page }) => {
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
  debugState.game.nemesis.playArea = [{
    instanceId: 'woven-sky:preview-test', cardId: 'woven_sky', cardType: 'power', placedAt: 1, powerTokens: 2,
  }]
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const powerCard = page.locator('.nemesis-play-card').first()
  const discardButton = powerCard.getByRole('button', { name: 'To Discard' })
  await expect(discardButton).toBeVisible()

  await powerCard.hover()
  await expect(page.locator('.card-hover-preview')).toBeVisible()
  await discardButton.hover()
  await expect(page.locator('.card-hover-preview')).toHaveCount(0)

  await page.mouse.move(10, 10)
  await discardButton.hover()
  await expect(page.locator('.card-hover-preview')).toHaveCount(0)
})

test('collective card decisions use the reusable selection panel', async ({ page }) => {
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
  await expect(page.getByText('Selected 0 / 3', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible()
  await expect(page.locator('.decision-card-choice')).toHaveCount(3)
  await page.locator('.decision-card-choice').first().click()
  await expect(page.getByText('Selected 1 / 3', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.locator('.decision-card-choice')).toHaveCount(0)
})

test('most-expensive prepped spell decisions wait for confirmation', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'nemesis_draw'
  debugState.selectedPlayer = debugState.game.players[0].id
  debugState.game.currentTurn = 'nemesis'
  debugState.game.currentPhase = 'nemesis_draw'
  debugState.game.players[0].breaches[0].prepSpells = ['spark', 'spark']
  debugState.game.players[1].breaches[0].prepSpells = ['lava_tendril']
  debugState.game.pendingDecision = {
    id: 'most-expensive-prepped-selection',
    playerId: debugState.game.players[0].id,
    prompt: 'Choose 2 prepped spell(s) to discard',
    kind: 'select_prepped_spells',
    min: 2,
    max: 2,
    requiredChoices: [{ playerId: debugState.game.players[1].id, breachIndex: 1, spellIndex: 0, cardId: 'lava_tendril', cardName: 'Lava Tendril' }],
    candidates: [
      { playerId: debugState.game.players[1].id, breachIndex: 1, spellIndex: 0, cardId: 'lava_tendril', cardName: 'Lava Tendril' },
      { playerId: debugState.game.players[0].id, breachIndex: 1, spellIndex: 0, cardId: 'spark', cardName: 'Spark' },
      { playerId: debugState.game.players[0].id, breachIndex: 1, spellIndex: 1, cardId: 'spark', cardName: 'Spark' },
    ],
  }
  debugState.game.pendingEffect = {
    playerId: debugState.game.players[0].id, remainingEffects: [],
    awaiting: { kind: 'discard_prepped_spells', amount: 2, target: 'any_player', mostExpensive: true },
  }
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(page.getByText('1/2 chosen prepped spells', { exact: true })).toBeVisible()
  await expect(page.locator('.breach-spell-card-frame.pending-prepped-spell-selected')).toHaveCount(0)
  await page.locator('.char-btn').nth(1).click()
  await expect(page.locator('.breach-spell-card-frame.pending-prepped-spell-selected')).toHaveCount(1)
  await page.locator('.char-btn').first().click()
  await page.locator('.breach-spell-card-frame.pending-prepped-spell').filter({ has: page.locator('img[alt="Spark"]') }).first().click({ force: true })
  await expect(page.getByText('2/2 chosen prepped spells', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText('2/2 chosen prepped spells', { exact: true })).toHaveCount(0)
  // The selection interrupt is complete. Depending on the serialized Nemesis
  // resolution state, the engine may now show the next Nemesis interrupt or
  // advance to the next turn; neither is part of this selection-panel check.
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
