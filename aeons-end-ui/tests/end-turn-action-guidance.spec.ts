import { expect, test, type Page } from '@playwright/test'

async function startGame(page: Page): Promise<void> {
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

test('End Turn names and points to a remaining action in another Mage area', async ({ page }) => {
  await startGame(page)
  let ownerId = ''
  await applyDebugState(page, state => {
    const [active, owner] = state.game.players
    ownerId = owner.id
    owner.mageType = 'dezmodia'
    owner.playerCardsInPlay = ['corrupted_coil']
    owner.playerCardSupplyTargets = [null]
    owner.playerCardPowerTokens = [0]

    state.selectedPlayer = active.id
    state.phase = 'main'
    state.game.currentTurn = active.id
    state.game.currentPhase = 'main'
    state.game.pendingDecision = null
    state.game.pendingEffect = null
    active.hand = []
    active.playedThisTurn = []
    active.bonusAether = 0
    active.aetherTokens = 0
    active.charge = 0
    active.breaches.forEach((breach: { present?: boolean; opened: boolean }) => {
      if (breach.present !== false) breach.opened = true
    })
  })

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  const warning = page.locator('.end-turn-warning')
  await expect(warning).toContainText('Corrupted Coil')
  await expect(warning).toContainText('Dezmodia’s area')

  const ownerSelector = page.locator(`.char-btn[data-player-control-id="${ownerId}"]`)
  await expect(ownerSelector).toHaveClass(/end-turn-attention/)
  await ownerSelector.click()

  const coil = page.locator(`[data-main-action-id="player-card-in-play:${ownerId}:0"]`)
  await expect(coil).toHaveClass(/end-turn-attention/)
  await expect(page.locator('.end-turn-warning')).toHaveCount(0)
})

test('End Turn is blocked while Genesis Emerald waits for card selection', async ({ page }) => {
  await startGame(page)
  await applyDebugState(page, state => {
    const player = state.game.players[0]
    state.selectedPlayer = player.id
    state.phase = 'main'
    state.game.currentTurn = player.id
    state.game.currentPhase = 'main'
    state.game.pendingDecision = null
    state.game.pendingEffect = null
    player.mageType = 'inco'
    player.hand = ['genesis_emerald', 'crystal', 'spark']
    player.playedThisTurn = []
    player.deck = ['jade', 'moonstone_shard']
  })

  await page.locator('.hand .card').filter({ has: page.locator('img[alt="Genesis Emerald"]') }).click()
  await page.getByRole('button', { name: 'Discard 2 cards to gain the top Firethorn' }).click()

  const decision = page.locator('.non-blocking-selection-modal')
  await expect(decision).toBeVisible()
  await expect(decision).toContainText('Choose 2 card(s) to discard')
  const endTurn = page.getByRole('button', { name: 'End Turn', exact: true })
  await expect(endTurn).toBeDisabled()

  await page.keyboard.press('Space')
  await expect(decision).toBeVisible()

  // Exercise the handler guard as well as the disabled UI state.
  await endTurn.evaluate((button: HTMLButtonElement) => {
    button.disabled = false
    button.click()
  })
  await expect(decision).toBeVisible()
})
