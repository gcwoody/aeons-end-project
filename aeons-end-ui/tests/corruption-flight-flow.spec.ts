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

  const reveal = page.locator('.nemesis-draw-reveal-screen')
  if (await reveal.isVisible().catch(() => false)) {
    await expect(page.locator('.nemesis-draw-flight-scene')).toHaveCount(0)
    await reveal.click({ position: { x: 12, y: 12 } })
  }
  await expect(page.getByRole('button', { name: 'Start Game' })).toHaveCount(0)
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

test('Nemesis turn continuation waits for Crooked Mask Corruption to fly to a Mage deck', async ({ page }) => {
  await startGame(page)
  await page.addStyleTag({ content: ':root { --card-flight-duration: 1200ms; }' })
  await editDebugState(page, current => {
    const [first, second] = current.game.players
    current.phase = 'nemesis_main'
    current.game.currentTurn = 'nemesis'
    current.game.currentPhase = 'nemesis_main'
    current.game.turnOrderDiscard = ['nemesis']
    current.game.turnOrderDeck = [first.id, second.id, 'nemesis']
    current.game.nemesis.type = 'crooked_mask'
    current.game.nemesis.corruptionDeck = ['contagion_btb']
    current.game.nemesis.corruptionDeckRevealed = [false]
    current.game.nemesis.corruptionDeckInstanceIds = ['test-contagion-instance']
    current.game.nemesisResolution = null
    current.game.pendingDecision = {
      id: 'test-corruption-recipient',
      prompt: 'Choose a player to gain Corruption(s)',
      kind: 'select_player_target',
      targets: [first, second].map(player => ({ kind: 'player', playerId: player.id })),
    }
    current.game.pendingEffect = {
      sourcePlayerId: first.id,
      sourceCardOwnerId: first.id,
      sourceCardId: 'afflict_crooked_mask_btb',
      effectPlayerId: first.id,
      remainingEffects: [],
      awaiting: { kind: 'gain_corruptions', amount: 1, target: 'any_player', destination: 'deck_top' },
    }
  })

  await expect(page.locator('[data-card-flight-source="corruption-deck"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Choose a player to gain Corruption(s)' })).toBeVisible()
  await page.locator('.player-target-option').first().click()
  const flight = page.locator('.card-flight-clone')
  await expect(flight).toBeVisible()
  // Both the Corruption Deck and player Deck show cards back-up, so the move
  // should travel as-is without opening a flip scene.
  await expect(flight.locator('.card-flight-flip-face')).toHaveCount(0)
  const flightInstanceId = await flight.getAttribute('data-card-flight-instance-id')
  expect(flightInstanceId).toBeTruthy()
  await expect(page.locator('.turn-order-cards .slot.current')).toHaveAttribute('aria-label', 'NEM turn')

  await flight.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
  await expect(flight).toHaveCount(0)
  await expect(page.locator('.turn-order-cards .slot.current')).not.toHaveAttribute('aria-label', 'NEM turn')
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const settledGame = JSON.parse(await stateField.inputValue()).game
  expect(settledGame.players.some((player: { deckInstanceIds?: string[] }) =>
    player.deckInstanceIds?.includes(flightInstanceId!))).toBe(true)
})
