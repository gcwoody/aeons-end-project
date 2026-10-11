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

test('opening the log scrolls to its newest entries', async ({ page }) => {
  await startGame(page)
  await expect(page.locator('.log-col')).toHaveCount(0)
  await page.keyboard.press('Control+d')
  await page.getByLabel('Show Log Panel').check()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.log-toggle').evaluate(element => {
    const panel = (element as HTMLElement & { __vueParentComponent?: any }).__vueParentComponent
    const log = panel?.setupState?.state?.log
    if (!log) throw new Error('Could not access the Log panel state in the test harness')
    log.splice(0, log.length, ...Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      text: `Log entry ${index + 1}`,
      kind: 'info',
    })))
  })

  await page.getByRole('button', { name: 'Toggle log' }).click()
  const log = page.locator('.log-panel .log')
  await expect(log.locator('div').last()).toHaveText('Log entry 80')
  await expect.poll(() => log.evaluate(element =>
    element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
  )).toBe(true)
})

test('one undo reverses a purchase and its automatic transition to Discard Phase', async ({ page }) => {
  await startGame(page)
  await editDebugState(page, current => {
    const game = current.game
    const player = game.players[0]
    game.currentTurn = player.id
    game.currentPhase = 'main'
    game.pendingDecision = null
    game.pendingEffect = null
    game.market.piles[0] = { cardId: 'phoenix_flame', remaining: 5 }
    player.hand = []
    player.playedThisTurn = ['crystal', 'spark']
    player.bonusAether = 3
    player.regularAetherSpent = 0
    player.conditionalAetherEarned = {}
    player.condAetherSpent = {}
    player.aetherTokens = 0
    player.charge = 0
    player.chargeThreshold = 5
    for (const breach of player.breaches) breach.prepSpells = []
    current.phase = 'main'
    current.selectedPlayer = player.id
  })

  await page.locator('[data-supply-card-id="phoenix_flame"]').first().click()
  await expect(page.getByText('Discard Phase · Card Order', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: 'End Turn', exact: true })).toBeVisible()

  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const restored = JSON.parse(await field.inputValue())
  expect(restored.phase).toBe('main')
  expect(restored.game.players[0].bonusAether).toBe(3)
  expect(restored.game.players[0].regularAetherSpent).toBe(0)
  expect(restored.game.players[0].discard).not.toContain('phoenix_flame')
  expect(restored.game.market.piles[0]).toEqual({ cardId: 'phoenix_flame', remaining: 5 })
})

test('undo retains the most recent twenty player operations', async ({ page }) => {
  await startGame(page)
  let supplyCardId = ''
  await editDebugState(page, current => {
    const game = current.game
    const player = game.players[0]
    game.currentTurn = player.id
    game.currentPhase = 'main'
    current.phase = 'main'
    current.selectedPlayer = player.id
    player.hand = []
    player.discard = []
    player.playedThisTurn = []
    player.bonusAether = 1000
    player.regularAetherSpent = 0
    player.conditionalAetherEarned = {}
    player.condAetherSpent = {}
    player.aetherTokens = 0
    game.market.piles[0].remaining = 30
    supplyCardId = game.market.piles[0].cardId
  })
  await page.addStyleTag({ content: ':root { --card-flight-duration: 1ms; --card-zone-reflow-duration: 1ms; }' })

  const supplyPile = page.locator('[data-supply-pile-index="0"]')
  for (let purchase = 0; purchase < 21; purchase++) {
    await supplyPile.click()
    await expect(supplyPile.locator('.remaining')).toHaveText(String(29 - purchase))
  }
  await expect(page.locator('.card-motion-shield')).toBeHidden()

  for (let undo = 0; undo < 20; undo++) await page.keyboard.press('Control+z')

  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const restored = JSON.parse(await field.inputValue())
  expect(restored.game.market.piles[0].remaining).toBe(29)
  expect(restored.game.players[0].discard).toEqual([supplyCardId])
})
