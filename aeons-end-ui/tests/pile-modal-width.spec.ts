import { test, expect } from '@playwright/test'

test('empty player and Nemesis piles stay inert without a border', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('stake')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  const stake = saved.game.players.find((player: { mageType: string }) => player.mageType === 'stake')
  for (const player of saved.game.players) {
    player.specificDeck = []
    player.deck = []
    player.discard = []
  }
  saved.game.nemesis.deck = []
  saved.game.nemesis.discard = []
  saved.game.nemesis.strikeDeck = []
  saved.game.nemesis.strikeDiscard = []
  saved.selectedPlayer = stake.id
  saved.phase = 'main'
  saved.game.currentTurn = stake.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const modal = page.locator('.pile-modal')
  await page.evaluate(async () => {
    const { nemesisPresentations } = await import('/src/game/nemesis-presentation.ts')
    nemesisPresentations.rageborne.specificDiscard.enabled = true
  })
  const emptyPlayerPiles = [
    page.locator('.player-specific-deck-pile').first(),
    page.locator('.player-deck-pile').first(),
    page.locator('.player-discard-pile').first(),
  ]
  for (const pile of emptyPlayerPiles) {
    await expect(pile).toHaveClass(/is-empty/)
    await expect.poll(() => pile.evaluate(element => getComputedStyle(element).cursor)).toBe('pointer')
    await expect.poll(() => pile.evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
    await expect.poll(() => pile.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(21, 26, 41)')
    const bounds = await pile.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
    await expect(modal).toHaveCount(0)
  }

  const emptyNemesisPiles = [
    page.getByRole('button', { name: 'Open Nemesis Deck' }),
    page.getByRole('button', { name: 'Open Nemesis Discard' }),
    page.getByRole('button', { name: 'Open Strike Deck' }),
    page.getByRole('button', { name: 'Open Nemesis Specific Discard' }),
  ]
  for (const pile of emptyNemesisPiles) {
    await expect(pile).toHaveClass(/is-empty/)
    await expect.poll(() => pile.evaluate(element => getComputedStyle(element).cursor)).toBe('pointer')
    await expect.poll(() => pile.locator('.nemesis-pile-placeholder').evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
    await expect.poll(() => pile.locator('.nemesis-pile-placeholder').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(21, 26, 41)')
    const bounds = await pile.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
    await expect(modal).toHaveCount(0)
  }
})

test('enabled Nemesis specific discard uses the same pile viewer width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.evaluate(async () => {
    const { nemesisPresentations } = await import('/src/game/nemesis-presentation.ts')
    nemesisPresentations.rageborne.specificDiscard.enabled = true
  })
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  saved.game.nemesis.strikeDiscard = ['slaughter']
  saved.phase = 'main'
  saved.selectedPlayer = saved.game.players[0].id
  saved.game.currentTurn = saved.game.players[0].id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(page.getByRole('button', { name: 'Open Nemesis Specific Discard' }).locator('.nemesis-pile-card img')).toHaveAttribute('alt', 'Slaughter')
  await page.getByRole('button', { name: 'Open Nemesis Specific Discard' }).click()
  const modal = page.locator('.pile-modal')
  await expect(modal.locator('h3')).toContainText('Nemesis Specific Discard')
  expect(await modal.locator('h3').evaluate(heading => heading.getBoundingClientRect().height)).toBeLessThan(30)
  await expect(modal.locator('.pile-card')).toHaveCount(1)
  await expect.poll(async () => (await modal.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(440)
})
