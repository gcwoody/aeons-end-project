import { test, expect } from '@playwright/test'

const defaultMarketPiles = [
  ['vriswood_amber', 7], ['diamond_cluster', 4], ['burning_opal', 5],
  ['flexing_dagger', 2], ['bottled_vortex', 3],
  ['lava_tendril', 5], ['essence_theft', 5], ['planar_insight', 6], ['arcane_nexus', 7],
]

function useDefaultMarket(game: any) {
  game.market.piles = defaultMarketPiles.map(([cardId, remaining]) => ({ cardId, remaining }))
}

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
  debugState.selectedPlayer = debugState.game.players[0].id
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
      const matWrap = getComputedStyle(document.querySelector('.nemesis-mat-wrap')!)
      const mat = box('.nemesis-mat-image')
      const img = document.querySelector<HTMLImageElement>('.nemesis-mat-image')!
      const assets = [...document.querySelectorAll('.nemesis-assets-row > *')].map(el => el.getBoundingClientRect())
      const slots = box('.slots')
      const left = box('.turn-side-left')
      const right = box('.turn-side-right')
      const round = box('.turn-round')
      return {
        loaded: img.naturalWidth > 0,
        fullHeight: Math.abs(mat.height - (areaBox.height - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - parseFloat(matWrap.borderTopWidth) - parseFloat(matWrap.borderBottomWidth))) < 3,
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
  await page.keyboard.press('Escape')
  await expect(page.locator('.mage-overlay')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open Nemesis Discard' }).click()
  await expect(page.locator('.pile-modal .pile-card')).toHaveCount(1)
  await expect.poll(async () => (await page.locator('.pile-modal').boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(440)
  await page.keyboard.press('Escape')
  await expect(page.locator('.pile-modal')).toHaveCount(0)
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

test('Nemesis mat modal receives focus and remains draggable', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  // Remove startup interrupts so the focus behavior is isolated from turn resolution.
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.selectedPlayer = debugState.game.players[0].id
  debugState.game.currentTurn = debugState.game.players[0].id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'Open Rageborne mat' }).click()
  await expect(page.locator('.nemesis-mat-modal-frame')).toBeVisible()
  await expect.poll(() => page.evaluate(() => ({
    activeIsModal: document.activeElement?.classList.contains('draggable-modal'),
    triggerFocused: document.querySelector('.nemesis-mat-wrap') === document.activeElement,
  }))).toEqual({ activeIsModal: true, triggerFocused: false })

  const modal = page.locator('.mage-modal.draggable-modal')
  const before = await modal.boundingBox()
  expect(before).not.toBeNull()
  await page.mouse.move(before!.x + 4, before!.y + 4)
  await page.mouse.down()
  await expect(modal).toHaveClass(/dragging/)
  await page.mouse.move(before!.x + 44, before!.y + 34, { steps: 5 })
  await page.mouse.up()
  const after = await modal.boundingBox()
  expect(after!.x).toBeGreaterThan(before!.x + 20)

  await page.keyboard.press('Digit2')
  await expect(page.locator('.mage-image')).toHaveAttribute('alt', 'brama mage board')
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('draggable-modal'))).toBe(true)
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
  await page.keyboard.press('Space')
  await expect(page.locator('.nemesis-play-card.effect-target')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(page.getByText('Nemesis Draw Phase', { exact: true })).toBeVisible()
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

  await page.locator('.nemesis-specific-pile').click({ button: 'right' })
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
  await page.locator('.pending-board-card').first().click()
  await expect(page.locator('.pending-board-card-selected')).toHaveCount(1)
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
