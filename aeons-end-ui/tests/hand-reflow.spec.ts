import { expect, test, type Page } from '@playwright/test'

async function prepareHand(page: Page, hand: string[], power = false) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('mist')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const field = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await field.inputValue())
  const player = saved.game.players[0]
  player.hand = hand
  player.playedThisTurn = []
  player.discard = []
  player.bonusAether = 0
  saved.game.currentTurn = player.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  saved.game.pendingNemesisDiscard = null
  saved.game.nemesis.playArea = power ? [{
    instanceId: 'hand-reflow-power', cardId: 'woven_sky', cardType: 'power', placedAt: 1, powerTokens: 2,
  }] : []
  saved.phase = 'main'
  saved.selectedPlayer = player.id
  await field.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(400)
}

async function startSampling(page: Page) {
  await page.evaluate(() => {
    const samples: Array<{ count: number; lefts: number[]; overlap: number; animations: number; flying: boolean }> = []
    const sample = () => {
      const entries = [...document.querySelectorAll<HTMLElement>('.hand .hand-card-entry')]
      const rects = entries.map(entry => entry.getBoundingClientRect())
      samples.push({
        count: entries.length,
        lefts: rects.map(rect => rect.left),
        overlap: Math.max(0, ...rects.slice(1).map((rect, index) => rects[index]!.right - rect.left)),
        animations: Math.max(0, ...entries.map(entry => entry.getAnimations().length)),
        flying: !!document.querySelector('.card-flight-clone'),
      })
      frame = requestAnimationFrame(sample)
    }
    let frame = requestAnimationFrame(sample)
    Object.assign(window, { stopHandSamples: () => { cancelAnimationFrame(frame); return samples } })
  })
}

async function assertStableHand(page: Page, expectedCount: number) {
  await expect(page.locator('.hand [data-card-flight-target="hand"]')).toHaveCount(expectedCount)
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect.poll(() => page.locator('.hand').evaluate(hand => hand.getAnimations({ subtree: true }).length)).toBe(0)
  const samples = await page.evaluate(() => (window as any).stopHandSamples()) as Array<{
    count: number; lefts: number[]; overlap: number; animations: number; flying: boolean
  }>
  expect(samples.length).toBeGreaterThan(5)
  expect(samples.some(sample => sample.flying)).toBe(true)
  expect(Math.max(...samples.map(sample => sample.overlap)), 'hand slots overlap during movement').toBeLessThan(1)
  expect(Math.max(...samples.map(sample => sample.animations)), 'a slot has stacked reflow animations').toBeLessThanOrEqual(1)
  expect(await page.locator('.hand-card-entry').evaluateAll(entries => entries.every(entry =>
    getComputedStyle(entry).transform === 'none' && !(entry as HTMLElement).style.transform))).toBe(true)
  // At least one pair of adjacent frames must show an actual slide, not just a final jump.
  expect(samples.some((sample, index) => index > 0 && sample.count === samples[index - 1]!.count &&
    sample.lefts.some((left, cardIndex) => {
      const delta = Math.abs(left - samples[index - 1]!.lefts[cardIndex]!)
      return delta > .1 && delta < 35
    }))).toBe(true)
}

test('playing a duplicate removes its exact slot and blocks repeated input until reflow settles', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await prepareHand(page, ['crystal', 'spark', 'crystal', 'spark', 'crystal'])
  const keys = () => page.locator('.hand-card-entry').evaluateAll(entries =>
    entries.map(entry => (entry as HTMLElement).dataset.handCardVisualKey))
  const originalKeys = await keys()
  await page.addStyleTag({ content: ':root { --hand-card-reflow-duration: 650ms; }' })
  await startSampling(page)
  await page.locator('[data-hand-card-index="2"]').evaluate(card => {
    for (let index = 0; index < 5; index++) (card as HTMLElement).click()
  })
  await expect(page.locator('.hand-card-entry')).toHaveCount(4)
  expect(await keys()).toEqual(originalKeys.filter((_, index) => index !== 2))
  await assertStableHand(page, 4)
})

test('a scrolled overflowing hand recenters after consecutive flights and restores on undo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await prepareHand(page, Array.from({ length: 12 }, (_, index) => index % 3 ? 'crystal' : 'spark'))
  await page.locator('.hand').evaluate(hand => hand.scrollLeft = hand.scrollWidth)
  await startSampling(page)
  await page.getByRole('button', { name: 'Play All Gems', exact: true }).click()
  await assertStableHand(page, 4)
  const hand = page.locator('.hand')
  expect(await hand.evaluate(hand => hand.scrollLeft)).toBe(0)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.hand-card-entry')).toHaveCount(12)
  await expect.poll(() => hand.evaluate(hand => hand.getAnimations({ subtree: true }).length)).toBe(0)
  expect(await page.locator('.hand-card-entry').evaluateAll(entries => entries.every(entry =>
    getComputedStyle(entry).transform === 'none'))).toBe(true)
})

test('Gallery hand safely replaces interrupted animations, additions, resizing and Mage views', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?ui-gallery=1')
  const demo = page.locator('[data-component="Hand.Motion"]')
  await demo.scrollIntoViewIfNeeded()
  await page.addStyleTag({ content: ':root { --hand-card-reflow-duration: 600ms; --hand-gain-reflow-duration: 600ms; }' })
  await startSampling(page)
  for (let index = 0; index < 6; index++) {
    // DOM clicks deliberately interrupt the previous movement without waiting
    // for Playwright's element-stability check to finish the animation first.
    await demo.getByRole('button', { name: 'Add card', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
    await page.waitForTimeout(40)
    await demo.getByRole('button', { name: 'Play a card', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
    await page.waitForTimeout(40)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await assertStableHand(page, 5)
  await demo.getByRole('button', { name: 'Play a card', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  await demo.getByRole('button', { name: 'Switch Mage', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  await expect(page.locator('.hand-card-entry')).toHaveCount(2)
  await expect.poll(() => page.locator('.hand').evaluate(hand => hand.getAnimations({ subtree: true }).length)).toBe(0)
})

for (const width of [1440, 1920]) {
  test(`consecutive Gem flights keep every surviving hand slot separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
    await prepareHand(page, ['spark', 'crystal', 'crystal', 'spark', 'crystal', 'crystal', 'spark'])
    // Deliberately let reflow outlast flight to expose interrupted animations.
    await page.addStyleTag({ content: ':root { --hand-card-reflow-duration: 650ms; }' })
    await startSampling(page)
    await page.getByRole('button', { name: 'Play All Gems', exact: true }).click()
    await assertStableHand(page, 3)
  })

  test(`nonadjacent duplicate discards close the hand during each flight at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
    await prepareHand(page, ['crystal', 'spark', 'crystal', 'spark', 'crystal'], true)
    await page.locator('.nemesis-play-card').click()
    for (const index of [3, 0, 2]) await page.locator(`[data-hand-card-index="${index}"]`).click()
    await page.addStyleTag({ content: ':root { --hand-card-reflow-duration: 350ms; --hand-to-pile-flight-duration: 500ms; }' })
    await startSampling(page)
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await assertStableHand(page, 2)
  })
}
