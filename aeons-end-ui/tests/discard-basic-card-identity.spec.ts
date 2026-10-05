import { test, expect, type Page } from '@playwright/test'

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
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click()
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
    const attack = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (await attack.isVisible().catch(() => false)) {
      await attack.click()
      continue
    }
    break
  }
}

async function seedCardsAndEndTurn(page: Page, cards: string[]) {
  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const current = JSON.parse(await field.inputValue())
  const game = current.game
  const player = game.players[0]
  game.currentTurn = player.id
  game.currentPhase = 'main'
  game.turnOrderDeck = [game.players[1].id, 'nemesis', player.id]
  game.turnOrderDiscard = []
  game.pendingDecision = null
  game.pendingEffect = null
  player.hand = []
  player.playedThisTurn = [...cards]
  player.discard = []
  player.bonusAether = 0
  player.regularAetherSpent = 0
  player.conditionalAetherEarned = {}
  player.condAetherSpent = {}
  player.aetherTokens = 0
  player.charge = 0
  for (const breach of player.breaches) breach.prepSpells = []
  current.phase = 'main'
  current.selectedPlayer = player.id
  await field.fill(JSON.stringify(current))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  await expect(page.getByText('Discard Phase · Card Order', { exact: true })).toHaveCount(0)

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const afterTurn = JSON.parse(await field.inputValue())
  expect(afterTurn.game.players[0].discard.slice(0, cards.length).sort()).toEqual([...cards].sort())
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

for (const [cardName, cardIds] of [
  ['Crystal', ['crystal', 'wave9_crystal']],
  ['Spark', ['spark', 'wave9_spark']],
] as const) {
  test(`${cardName} versions from different Waves discard without ordering`, async ({ page }) => {
    await startGame(page)
    await seedCardsAndEndTurn(page, [...cardIds])
  })
}
