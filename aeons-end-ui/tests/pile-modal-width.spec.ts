import { test, expect } from '@playwright/test'

test('empty specific deck and other pile viewers retain readable widths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
  await page.getByLabel('Player 1 Mage').selectOption('stake')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  const stake = saved.game.players.find((player: { mageType: string }) => player.mageType === 'stake')
  stake.specificDeck = []
  stake.deck = []
  stake.discard = []
  saved.selectedPlayer = stake.id
  saved.phase = 'main'
  saved.game.currentTurn = stake.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByLabel("Open Stake's Breach Upgrade Deck").click()
  const modal = page.locator('.pile-modal')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.empty')).toBeVisible()
  await expect.poll(async () => (await modal.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(440)
  expect(await modal.locator('h3').evaluate(heading => heading.getBoundingClientRect().height)).toBeLessThan(30)
  await modal.screenshot({ path: 'test-results/stake-empty-pile.png' })
  await modal.getByRole('button', { name: 'Close' }).click()

  await page.locator('.player-deck-pile').first().click()
  await expect(modal.locator('.empty')).toBeVisible()
  await expect.poll(async () => (await modal.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(280)
  await modal.getByRole('button', { name: 'Close' }).click()

  await page.locator('.player-discard-pile').first().click()
  await expect(modal.locator('.empty')).toBeVisible()
  await expect.poll(async () => (await modal.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(280)
  await modal.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Open Nemesis Discard' }).click()
  await expect.poll(async () => (await modal.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(440)
  await modal.getByRole('button', { name: 'Close' }).click()

  await page.setViewportSize({ width: 360, height: 640 })
  await page.getByLabel("Open Stake's Breach Upgrade Deck").click()
  await expect.poll(async () => (await modal.boundingBox())?.width ?? 999).toBeLessThanOrEqual(328)
})

test('enabled Nemesis specific discard uses the same pile viewer width', async ({ page }) => {
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
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'Open Nemesis Specific Discard' }).click()
  const modal = page.locator('.pile-modal')
  await expect(modal.locator('h3')).toContainText('Nemesis Specific Discard')
  expect(await modal.locator('h3').evaluate(heading => heading.getBoundingClientRect().height)).toBeLessThan(30)
  await expect(modal.locator('.pile-card')).toHaveCount(1)
  await expect.poll(async () => (await modal.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(440)
})
