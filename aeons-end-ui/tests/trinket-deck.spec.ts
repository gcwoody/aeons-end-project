import { test, expect } from '@playwright/test'

test('the shared Trinket deck keeps unknown copies hidden and shows known copies in its viewer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start Game' }).click()

  const deckPile = page.getByRole('button', { name: 'Open Trinket Deck' })
  await expect(deckPile).toBeVisible()
  await expect(deckPile.locator('img')).toHaveAttribute('alt', 'Trinket deck card back')
  await expect(deckPile.locator('.player-pile-count')).toHaveText('13')

  await deckPile.click()
  await expect(page.locator('.pile-modal h3')).toContainText('Trinket Deck')
  await expect(page.locator('.pile-modal .pile-card')).toHaveCount(13)
  await expect(page.locator('.pile-modal .pile-unknown-card')).toHaveCount(13)
  await page.locator('.pile-modal').getByRole('button', { name: 'Close' }).click()

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const game = debugState.game
  game.trinketDeck = ['clouded_trinket', 'golden_trinket']
  game.trinketDeckRevealed = [true, false]
  const player = game.players.find((candidate: { id: string }) => candidate.id === debugState.selectedPlayer)
  const breach = player.breaches.find((candidate: { present?: boolean }) => candidate.present !== false)
  breach.opened = true
  breach.prepSpells = ['spark']
  breach.preppedThisTurn = [false]

  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await expect(deckPile.locator('img')).toHaveAttribute('alt', 'Clouded Trinket')
  await expect(deckPile.locator('.player-pile-count')).toHaveText('2')
  const marketThirdColumn = await page.locator('.market-grid .pile').nth(2).boundingBox()
  const trinketDeckRect = await deckPile.boundingBox()
  const prepRect = await page.locator('.breach-spell-card-frame').first().boundingBox()
  expect(marketThirdColumn).not.toBeNull()
  expect(trinketDeckRect).not.toBeNull()
  expect(prepRect).not.toBeNull()
  expect(Math.abs(
    marketThirdColumn!.x + marketThirdColumn!.width / 2 - (trinketDeckRect!.x + trinketDeckRect!.width / 2),
  )).toBeLessThanOrEqual(4)
  expect(Math.abs(
    prepRect!.y + prepRect!.height / 2 - (trinketDeckRect!.y + trinketDeckRect!.height / 2),
  )).toBeLessThanOrEqual(4)

  await deckPile.click()
  await expect(page.locator('.pile-modal .pile-card')).toHaveCount(2)
  await expect(page.locator('.pile-modal .pile-card-image:not(.pile-unknown-card)')).toHaveCount(1)
  await expect(page.locator('.pile-modal .pile-unknown-card')).toHaveCount(1)
  await expect(page.locator('.pile-modal img[alt="Clouded Trinket"]')).toHaveCount(1)
  await expect(page.locator('.pile-modal img[alt="Trinket Deck card back"]')).toHaveCount(1)
})
