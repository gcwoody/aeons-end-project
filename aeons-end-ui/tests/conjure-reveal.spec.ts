import { expect, test, type Page } from '@playwright/test'

async function resolveStartupInterrupts(page: Page) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const transition = page.locator('.turn-transition-shield')
    if (await transition.isVisible().catch(() => false)) {
      await expect(transition).toHaveCount(0)
      continue
    }
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    if (await reveal.isVisible().catch(() => false)) {
      await expect(page.locator('.nemesis-draw-flight-scene')).toHaveCount(0)
      await reveal.click({ position: { x: 12, y: 12 } })
      continue
    }
    const next = page.getByRole('button', { name: /^(Continue|Resolve Card|Skip|Confirm|Attack .+|Gravehold)$/ }).first()
    if (!(await next.isVisible().catch(() => false))) return
    await next.click()
  }
}

async function startIndiraWithHand(
  page: Page,
  hand: string[],
  deck: string[],
  openBreachForConjure = false,
) {
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
  indira.hand = hand
  indira.deck = deck
  indira.discard = []
  indira.playedThisTurn = []
  for (const breach of indira.breaches) {
    breach.opened = false
    breach.focusedThisTurn = false
    breach.prepSpells = []
  }
  if (openBreachForConjure) indira.breaches[1].opened = true
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

async function startConjure(page: Page, hasEligibleBreach: boolean, topCardId = 'spark') {
  await startIndiraWithHand(
    page,
    ['fused_opal', 'crystal'],
    hasEligibleBreach ? [topCardId, 'spark'] : [topCardId],
    hasEligibleBreach,
  )
  await page.locator('.hand .card').filter({ has: page.locator('img[alt="Fused Opal"]') }).click()
  await page.getByRole('button', { name: 'Conjure', exact: true }).click()
}

async function currentGame(page: Page) {
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  return JSON.parse(await stateField.inputValue()).game
}

for (const { cardId, cardName, decisionPrompt } of [
  { cardId: 'fused_opal', cardName: 'Fused Opal', decisionPrompt: 'Choose Fused Opal effect' },
  { cardId: 'rift_ring', cardName: 'Rift Ring', decisionPrompt: 'Choose a Rift Ring effect' },
]) {
  test(`${cardName} stays still while its play decision is open`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await startIndiraWithHand(page, [cardId], ['spark'])

    const card = page.locator('.hand .card').filter({ has: page.locator(`img[alt="${cardName}"]`) })
    await card.hover()
    await page.waitForTimeout(300)
    await page.evaluate(() => {
      const samples: Array<{ top: number; transform: string; flightCount: number }> = []
      const startedAt = performance.now()
      const sample = () => {
        const element = document.querySelector<HTMLElement>('.hand .card[data-hand-card-id]')
        const entry = element?.closest<HTMLElement>('.hand-card-entry')
        samples.push({
          top: entry?.getBoundingClientRect().top ?? Number.NaN,
          transform: element ? getComputedStyle(element).transform : 'missing',
          flightCount: document.querySelectorAll('.card-flight-clone').length,
        })
        if (performance.now() - startedAt < 1200) requestAnimationFrame(sample)
      }
      Object.assign(window, { handDecisionMotionSamples: samples })
      requestAnimationFrame(sample)
    })
    await card.click()
    await expect(page.locator('.decision-modal')).toContainText(decisionPrompt)
    await page.waitForTimeout(250)
    const samples = await page.evaluate(() =>
      (window as typeof window & { handDecisionMotionSamples: Array<{ top: number; transform: string; flightCount: number }> })
        .handDecisionMotionSamples,
    )
    const positions = samples.map(sample => sample.top).filter(Number.isFinite)
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(0.5)
    expect(new Set(samples.map(sample => sample.transform)).size).toBe(1)
    expect(samples.every(sample => sample.flightCount === 0)).toBe(true)
    await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  })
}

test('Conjure adds the revealed card to the hand display and allows Skip with no eligible Breach', async ({ page }) => {
  await startConjure(page, false)

  const modal = page.locator('.decision-modal')
  const revealedCard = page.locator('.hand .pending-conjure-card')
  await page.addStyleTag({ content: ':root { --hand-to-deck-top-flight-duration: 4000ms; }' })
  await expect(revealedCard).toBeVisible()
  const conjuredInstanceId = await revealedCard.getAttribute('data-card-instance-id')
  await expect(revealedCard).toHaveClass(/game-highlight--choice/)
  expect(await revealedCard.evaluate(element => getComputedStyle(element, '::after').borderTopColor)).toBe('rgb(242, 153, 74)')
  await revealedCard.hover()
  expect(await revealedCard.evaluate(element => getComputedStyle(element, '::after').borderTopColor)).toBe('rgb(242, 153, 74)')
  await expect(revealedCard.locator('img[alt="Spark"]')).toBeVisible()
  await expect(page.locator('.char-btn.sel .chand')).toContainText('Hand 1')
  await expect(modal.locator('.reveal-top-card')).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Skip' })).toBeVisible()
  await expect(page.locator('.breach .decision-breach-target')).toHaveCount(0)
  await expect(page.locator('.player-deck-pile .player-empty-pile-label')).toHaveText('Deck 0')
  await modal.getByRole('button', { name: 'Skip' }).click()
  await expect(modal).toHaveCount(0)
  await expect(revealedCard).toHaveCount(0)
  const returnFlight = page.locator(`.card-flight-clone[data-card-flight-instance-id="${conjuredInstanceId}"]`)
  await expect(returnFlight).toHaveAttribute('data-card-flight-instance-id', conjuredInstanceId)
  await expect.poll(() => returnFlight.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0)
  expect(await returnFlight.evaluate(element => element.getAnimations()[0]?.effect?.getTiming().duration)).toBe(4000)
  await expect(page.locator('.player-deck-pile .player-empty-pile-label')).toHaveText('Deck 0')
  await returnFlight.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
  await expect(page.locator('.player-deck-pile .player-pile-count')).toHaveText('1')
  await expect(page.locator('.char-btn.sel .chand')).toContainText('Hand 1')

  const game = await currentGame(page)
  expect(game.players[0].deck[0]).toBe('spark')
  expect(game.pendingDecision).toBeNull()
})

test('Conjure prepares the highlighted hand card by dragging it to an eligible Breach', async ({ page }) => {
  await startConjure(page, true, 'crystal')

  const card = page.locator('.hand .pending-conjure-card')
  const breach = page.locator('.breach[data-breach-index="2"]')
  const conjuredInstanceId = await card.getAttribute('data-card-instance-id')
  await expect(card).toBeVisible()
  await expect(page.locator('.breach .decision-breach-target')).toHaveCount(0)
  await expect(breach).not.toHaveClass(/drag-target/)
  await expect(page.locator('.decision-modal').getByRole('button', { name: 'Skip' })).toBeVisible()

  const source = await card.boundingBox()
  const target = await breach.boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 })
  await expect(breach).toHaveClass(/drag-target/)
  expect(await breach.locator('.breach-token-wrap').evaluate(element => getComputedStyle(element, '::after').borderTopColor)).toBe('rgb(122, 162, 255)')
  await expect(page.locator('.breach .decision-breach-target')).toHaveCount(0)
  await page.mouse.up()

  await expect(page.locator('.decision-modal')).toHaveCount(0)
  await expect(card).toHaveCount(0)
  const breachFlight = page.locator(`.card-flight-clone[data-card-flight-instance-id="${conjuredInstanceId}"]`)
  await expect(breachFlight).toHaveAttribute('data-card-flight-instance-id', conjuredInstanceId)
  await expect.poll(() => breachFlight.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0)
  await breachFlight.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
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
