import { expect, test, type Page } from '@playwright/test'

async function startJianGame(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('jian')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = page.getByRole('button', { name: /^(Continue|Resolve Card|Skip|Confirm|Attack .+|Gravehold)$/ }).first()
    if (!(await next.isVisible().catch(() => false))) return
    await next.click()
  }
}

async function applyDebugState(page: Page, update: (state: any) => void): Promise<void> {
  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const state = JSON.parse(await field.inputValue())
  update(state)
  await field.fill(JSON.stringify(state))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

test('Recall highlighting appears only while an unused paid Recall is available', async ({ page }) => {
  await startJianGame(page)
  let playerId = ''
  await applyDebugState(page, state => {
    const player = state.game.players[0]
    playerId = player.id
    state.selectedPlayer = player.id
    state.phase = 'main'
    state.game.currentTurn = player.id
    state.game.currentPhase = 'main'
    state.game.pendingDecision = null
    state.game.pendingEffect = null
    player.hand = ['crystal']
    player.discard = ['atomized_ash', 'phosphor_nugget']
    player.pulseTokens = 1
    player.turnEffects.usedRecallEffects = {}
  })

  const discard = page.locator('.player-discard-pile')
  await expect(discard).toHaveClass(/recall-action-available/)
  await discard.click()
  const recallCard = page.locator('.pile-modal .pile-card.recall-card-action')
  await expect(recallCard).toHaveCount(2)
  const recalledDiscardCard = discard.locator('.player-discard-top-card')
  await expect(recalledDiscardCard).toHaveCSS('border-top-color', 'rgb(101, 184, 255)')
  await recallCard.first().click()
  await expect(page.locator('.pile-modal')).toHaveCount(1)
  await expect(page.locator('.pile-modal .pile-card.recall-card-action')).toHaveCount(1)
  await page.locator('.pile-modal .pile-card.recall-card-action').click()
  await expect(page.locator('.pile-modal')).toHaveCount(0)
  await expect(discard).not.toHaveClass(/recall-action-available/)

  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const result = JSON.parse(await field.inputValue())
  const player = result.game.players.find((candidate: { id: string }) => candidate.id === playerId)
  expect(player.pulseTokens).toBe(0)
})

test('Recall closes the discard viewer before a follow-up spell decision', async ({ page }) => {
  await startJianGame(page)
  await applyDebugState(page, state => {
    const player = state.game.players[0]
    state.selectedPlayer = player.id
    state.phase = 'main'
    state.game.currentTurn = player.id
    state.game.currentPhase = 'main'
    state.game.pendingDecision = null
    state.game.pendingEffect = null
    player.hand = ['crystal']
    player.deck = ['crystal']
    player.discard = ['eternitys_echo']
    player.turnEffects.usedRecallEffects = {}
    const breach = player.breaches[0]
    breach.opened = true
    breach.prepSpells = ['spark']
    breach.preppedThisTurn = [false]
    breach.preppedSpellFaceDown = [false]
  })

  await page.locator('.player-discard-pile').click()
  await page.locator('.pile-modal .pile-card.recall-card-action').click()
  await expect(page.locator('.pile-modal')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Choose a prepped spell to cast' })).toBeVisible()
})

test('Pulse, Recall usage, shared Develop, and Trinket knowledge survive Save & Exit and Resume', async ({ page }) => {
  await startJianGame(page)
  await applyDebugState(page, state => {
    const player = state.game.players[0]
    state.selectedPlayer = player.id
    state.phase = 'main'
    state.game.currentTurn = player.id
    state.game.currentPhase = 'main'
    state.game.pendingDecision = null
    state.game.pendingEffect = null
    state.game.hasDevelopZone = true
    state.game.supplyMechanics = ['pulse_token', 'develop', 'trinket']
    state.game.developZone = ['chromia_sphere', 'chromia_sphere']
    state.game.trinketDeck = ['clouded_trinket', 'golden_trinket', 'power_trinket']
    state.game.trinketDeckRevealed = [true, false, true]
    player.hand = ['crystal']
    player.discard = ['atomized_ash']
    player.pulseTokens = 4
    player.turnEffects.usedRecallEffects = { 'atomized_ash:2': 1 }
  })

  await page.keyboard.press('Escape')
  await page.getByRole('heading', { name: 'Exit Game?' }).waitFor()
  await page.getByRole('button', { name: 'Save & Exit' }).click()
  await expect(page.getByRole('heading', { name: /Saved Games \(1\)/ })).toBeVisible()

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aeons-end-saves-v3') ?? '[]')[0].game)
  expect(stored.players[0].pulseTokens).toBe(4)
  expect(stored.players[0].turnEffects.usedRecallEffects['atomized_ash:2']).toBe(1)
  expect(stored.developZone).toEqual(['chromia_sphere', 'chromia_sphere'])
  expect(stored.trinketDeck).toEqual(['clouded_trinket', 'golden_trinket', 'power_trinket'])
  expect(stored.trinketDeckRevealed).toEqual([true, false, true])

  await page.getByRole('button', { name: 'Resume Game' }).click()
  await expect(page.getByText('Market', { exact: true })).toBeVisible()
  await expect(page.locator('.pulse-token-status')).toHaveAttribute('aria-label', '4 Pulse Tokens')
  await expect(page.locator('.played-zone-develop .card')).toHaveCount(2)
  const deck = page.getByRole('button', { name: 'Open Trinket Deck' })
  await expect(deck).not.toHaveAttribute('title')
  await expect(deck.locator('.player-pile-count')).toHaveText('3')
  await expect(deck.locator('img')).toHaveAttribute('alt', 'Clouded Trinket')
})

test('Irradiax Lump chooses a gained Trinket by clicking its large card immediately', async ({ page }) => {
  await startJianGame(page)
  await applyDebugState(page, state => {
    const player = state.game.players[0]
    state.selectedPlayer = player.id
    state.phase = 'main'
    state.game.currentTurn = player.id
    state.game.currentPhase = 'main'
    state.game.pendingDecision = null
    state.game.pendingEffect = null
    player.hand = ['irradiax_lump']
    player.discard = []
    player.turnEffects.usedRecallEffects = {}
    state.game.trinketDeck = ['clouded_trinket', 'golden_trinket']
    state.game.trinketDeckRevealed = [false, false]
  })

  await page.locator('.hand img[alt="Irradiax Lump"]').click()
  const dialog = page.getByRole('heading', { name: 'Choose a gained Trinket to put into your hand' })
  await expect(dialog).toBeVisible()
  const choices = page.locator('.large-card-choice')
  await expect(choices).toHaveCount(2)
  const cloudedTrinket = choices.filter({ has: page.locator('img[alt="Clouded Trinket"]') })
  const goldenTrinket = choices.filter({ has: page.locator('img[alt="Golden Trinket"]') })
  await expect(cloudedTrinket).toHaveCSS('width', '252px')
  await expect(cloudedTrinket.locator('img')).toHaveCount(1)
  const borderGaps = await cloudedTrinket.evaluate(button => {
    const frame = button.getBoundingClientRect()
    const image = button.querySelector('img')!.getBoundingClientRect()
    return {
      left: Math.round(image.left - frame.left),
      top: Math.round(image.top - frame.top),
      right: Math.round(frame.right - image.right),
      bottom: Math.round(frame.bottom - image.bottom),
    }
  })
  expect(borderGaps).toEqual({ left: 2, top: 2, right: 2, bottom: 2 })
  const optionLabels = await choices.allTextContents()
  expect(optionLabels.join(' ')).not.toContain('Put Golden Trinket into your hand')
  await expect(page.locator('.decision-modal .decision-footer')).toHaveCount(0)
  await goldenTrinket.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.decision-modal .decision-footer')).toHaveCount(0)

  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const result = JSON.parse(await field.inputValue())
  const player = result.game.players.find((candidate: { id: string }) => candidate.id === result.selectedPlayer)
  expect(player.hand).toContain('golden_trinket')
  expect(player.discard).toContain('clouded_trinket')
})
