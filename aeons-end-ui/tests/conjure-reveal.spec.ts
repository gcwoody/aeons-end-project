import { expect, test, type Page } from '@playwright/test'

async function resolveStartupInterrupts(page: Page) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = page.getByRole('button', { name: /^(Continue|Resolve Card|Skip|Confirm|Attack .+|Gravehold)$/ }).first()
    if (!(await next.isVisible().catch(() => false))) return
    await next.click()
  }
}

async function startConjure(page: Page, hasEligibleBreach: boolean, topCardId = 'spark') {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('indira')
  await page.getByLabel('Player 2 Mage').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await resolveStartupInterrupts(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const indira = debugState.game.players[0]
  debugState.selectedPlayer = indira.id
  debugState.phase = 'main'
  debugState.game.currentTurn = indira.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  indira.hand = ['fused_opal', 'crystal']
  indira.deck = hasEligibleBreach ? [topCardId, 'spark'] : [topCardId]
  indira.discard = []
  indira.playedThisTurn = []
  for (const breach of indira.breaches) {
    breach.opened = false
    breach.focusedThisTurn = false
    breach.prepSpells = []
  }
  if (hasEligibleBreach) indira.breaches[1].opened = true
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.hand .card').filter({ has: page.locator('img[alt="Fused Opal"]') }).click()
  await page.getByRole('button', { name: 'Conjure', exact: true }).click()
}

async function currentGame(page: Page) {
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  return JSON.parse(await stateField.inputValue()).game
}

test('Conjure adds the revealed card to the hand display and allows Skip with no eligible Breach', async ({ page }) => {
  await startConjure(page, false)

  const modal = page.locator('.decision-modal')
  const revealedCard = page.locator('.hand .pending-conjure-card')
  await expect(revealedCard).toBeVisible()
  await expect(revealedCard).toHaveCSS('border-color', 'rgb(230, 200, 79)')
  await revealedCard.hover()
  await expect(revealedCard).toHaveCSS('border-color', 'rgb(230, 200, 79)')
  await expect(revealedCard.locator('img[alt="Spark"]')).toBeVisible()
  await expect(page.locator('.char-btn.sel .chand')).toContainText('Hand 2')
  await expect(modal.locator('.reveal-top-card')).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Skip' })).toBeVisible()
  await expect(page.locator('.breach .decision-breach-target')).toHaveCount(0)
  await modal.getByRole('button', { name: 'Skip' }).click()
  await expect(modal).toHaveCount(0)
  await expect(revealedCard).toHaveCount(0)
  await expect(page.locator('.char-btn.sel .chand')).toContainText('Hand 1')

  const game = await currentGame(page)
  expect(game.players[0].deck[0]).toBe('spark')
  expect(game.pendingDecision).toBeNull()
})

test('Conjure prepares the highlighted hand card by dragging it to an eligible Breach', async ({ page }) => {
  await startConjure(page, true, 'crystal')

  const card = page.locator('.hand .pending-conjure-card')
  const breach = page.locator('.breach[data-breach-index="2"]')
  await expect(card).toBeVisible()
  await expect(breach.locator('.decision-breach-target')).toBeVisible()
  await expect(page.locator('.decision-modal').getByRole('button', { name: 'Skip' })).toBeVisible()

  const source = await card.boundingBox()
  const target = await breach.boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect(page.locator('.decision-modal')).toHaveCount(0)
  await expect(card).toHaveCount(0)
  await expect(breach.locator('img[alt="Face-down conjured spell"]')).toBeVisible()
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const castingField = page.locator('.debug-panel textarea')
  const castingState = JSON.parse(await castingField.inputValue())
  castingState.phase = 'casting'
  castingState.game.currentPhase = 'casting'
  await castingField.fill(JSON.stringify(castingState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  const imageGeometry = await page.evaluate(() => {
    const capture = (selector: string) => {
      const image = document.querySelector<HTMLImageElement>(selector)!
      const rect = image.getBoundingClientRect()
      const frameElement = image.parentElement!
      const frame = frameElement.getBoundingClientRect()
      const frameStyle = getComputedStyle(frameElement)
      const contentWidth = frame.width - parseFloat(frameStyle.borderLeftWidth) - parseFloat(frameStyle.borderRightWidth)
      const contentHeight = frame.height - parseFloat(frameStyle.borderTopWidth) - parseFloat(frameStyle.borderBottomWidth)
      return { width: rect.width, height: rect.height, frameWidth: frame.width, frameHeight: frame.height, contentWidth, contentHeight, src: image.currentSrc }
    }
    return { deck: capture('.player-deck-pile img'), breach: capture('.breach[data-breach-index="2"] img[alt="Face-down conjured spell"]') }
  })
  expect(imageGeometry.breach.src).toBe(imageGeometry.deck.src)
  expect(Math.abs(imageGeometry.breach.frameWidth / imageGeometry.breach.frameHeight
    - imageGeometry.deck.frameWidth / imageGeometry.deck.frameHeight)).toBeLessThan(0.005)
  expect(Math.abs(imageGeometry.breach.width - imageGeometry.breach.contentWidth)).toBeLessThan(0.1)
  expect(Math.abs(imageGeometry.breach.height - imageGeometry.breach.contentHeight)).toBeLessThan(0.1)
  const game = await currentGame(page)
  expect(game.players[0].deck).toEqual(['spark'])
  expect(game.players[0].breaches[1].prepSpells).toEqual(['crystal'])
  expect(game.players[0].breaches[1].preppedSpellFaceDown).toEqual([true])
})
