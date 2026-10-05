import { test, expect, type Page } from '@playwright/test'

async function revealedCardSrc(page: Page): Promise<string> {
  const src = await page.locator('.nemesis-reveal-card img').getAttribute('src')
  if (src === null) throw new Error('The revealed Nemesis card has no image source')
  return src
}

async function startGame(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1' }).first().click()
  await page.getByRole('tab', { name: 'Wave 1' }).last().click()
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  if (await page.locator('.turn-order-cards .slot.current[aria-label="NEM turn"]').count()) {
    await expect(page.locator('.turn-transition-shield')).toBeVisible()
    await expect(page.locator('.nemesis-draw-flight-scene')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.nemesis-draw-flight-scene')).toHaveCount(0)
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    await expect(reveal).toBeVisible()
    await reveal.click({ position: { x: 12, y: 12 } })
    await expect(reveal).toHaveCount(0)
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const flight = page.locator('.nemesis-draw-flight-scene')
    if (await flight.isVisible().catch(() => false)) {
      await expect(flight).toBeHidden({ timeout: 4000 })
      continue
    }
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click({ position: { x: 12, y: 12 } })
      await expect(reveal).toHaveCount(0)
      continue
    }
    for (const label of ['Continue', 'Resolve Card', 'Skip', 'Confirm']) {
      const button = page.getByRole('button', { name: label, exact: true })
      if (await button.isVisible().catch(() => false)) {
        await button.click()
        break
      }
    }
    if (!await page.getByRole('button', { name: 'Start Game' }).isVisible().catch(() => false)) {
      const setupDecision = page.locator('.decision-overlay')
      if (!await setupDecision.isVisible().catch(() => false)
        && !await page.locator('.turn-transition-shield').count()) return
    }
    await page.waitForTimeout(50)
  }
}

test('first-turn Nemesis draw waits for the board and flies from its deck', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(() => { Math.random = () => 0.35 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1' }).first().click()
  await page.getByRole('tab', { name: 'Wave 1' }).last().click()
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('brama')
  await page.addStyleTag({ content: ':root { --turn-order-arrival-duration: 1600ms; --nemesis-draw-flight-duration: 900ms; --nemesis-draw-flip-duration: 420ms; }' })
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.locator('.turn-order-cards .slot.arriving')).toBeVisible()
  const sourceRect = await page.locator('[data-nemesis-deck-pile="true"]').evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top }
  })
  await expect(page.locator('.nemesis-draw-flight-scene')).toBeVisible({ timeout: 4000 })
  const flightOrigin = await page.locator('.nemesis-draw-flight-scene').evaluate(element => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))
  expect(flightOrigin.left).toBeCloseTo(sourceRect.left, 2)
  expect(flightOrigin.top).toBeCloseTo(sourceRect.top, 2)
  await expect(page.locator('.nemesis-draw-flight-front')).toHaveAttribute(
    'src',
    await revealedCardSrc(page),
  )
  await expect(page.locator('.nemesis-reveal-overlay')).toBeVisible()
})

test('a Nemesis draw after resolving a Power decision still flies from the deck', async ({ page }) => {
  await startGame(page)
  await page.addStyleTag({ content: ':root { --nemesis-draw-flight-duration: 1200ms; --nemesis-draw-flip-duration: 420ms; }' })

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const save = JSON.parse(await stateField.inputValue())
  const instanceId = 'invoke-carnage:post-decision-animation'
  save.phase = 'nemesis_main'
  save.game.currentTurn = 'nemesis'
  save.game.currentPhase = 'nemesis_main'
  save.game.pendingEffect = null
  save.game.pendingDecision = {
    id: 'invoke-carnage-main-confirm',
    prompt: 'Resolve Power: Invoke Carnage',
    kind: 'confirm_nemesis_effect',
    cardId: 'invoke_carnage',
    instanceId,
    trigger: 'power_resolved',
  }
  save.game.nemesis.deck = ['cauterizer']
  save.game.nemesis.discard = []
  save.game.nemesis.playArea = [{
    cardId: 'invoke_carnage',
    cardType: 'power',
    placedAt: 901,
    instanceId,
    enteredOnNemesisTurn: -1,
    powerTokens: 1,
  }]
  save.game.nemesisResolution = {
    step: 'main',
    mainQueue: [instanceId],
    mainIndex: 0,
    activeCardInstanceId: instanceId,
    activeCardId: 'invoke_carnage',
    activeTrigger: 'power_resolved',
    mainEffectConfirmed: false,
  }
  await stateField.fill(JSON.stringify(save))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.nemesis-play-card.effect-target').click()
  await expect(page.getByRole('heading', { name: 'Choose a player to suffer damage' })).toBeVisible()
  await page.getByRole('button', { name: /^Attack / }).first().click()

  await expect(page.locator('.nemesis-draw-flight-scene')).toBeVisible()
  await expect(page.locator('.nemesis-draw-flight-front')).toHaveAttribute(
    'src',
    await revealedCardSrc(page),
  )
  await expect(page.locator('.nemesis-reveal-overlay')).toBeVisible()
})

test('turn changes animate the token first, then reveal a Nemesis draw from its deck', async ({ page }) => {
  await startGame(page)
  await page.addStyleTag({ content: ':root { --turn-order-arrival-duration: 2000ms; --turn-order-arrival-scale: 7; --nemesis-draw-flight-duration: 1200ms; --nemesis-draw-flip-duration: 420ms; }' })

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const save = JSON.parse(await stateField.inputValue())
  const player = save.game.players[0]
  save.selectedPlayer = player.id
  save.phase = 'main'
  save.game.currentTurn = player.id
  save.game.currentPhase = 'main'
  save.game.turnOrderDeck = ['nemesis']
  save.game.nemesisResolution = null
  save.game.pendingDecision = null
  save.game.pendingEffect = null
  save.game.nemesis.deck = ['agony_field']
  save.game.nemesis.discard = []
  save.game.nemesis.playArea = []
  player.hand = []
  player.playedThisTurn = []
  player.pendingEndTurnCardIds = []
  for (const breach of player.breaches) breach.prepSpells = []
  await stateField.fill(JSON.stringify(save))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  if (await page.getByText('Actions remain. End turn anyway?', { exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  }
  await expect(page.locator('.turn-order-cards .slot.arriving')).toBeVisible()
  const arrivalToken = page.locator('body > .turn-order-token-arrival')
  await expect(arrivalToken).toBeVisible()
  expect(await arrivalToken.evaluate(element => getComputedStyle(element).position)).toBe('fixed')
  expect(await arrivalToken.evaluate(element => Number(getComputedStyle(element).zIndex))).toBe(645)
  const arrivalTransforms = await arrivalToken.evaluate(element => (element.getAnimations()[0]!.effect as KeyframeEffect).getKeyframes()
    .map(frame => frame.transform))
  expect(arrivalTransforms.every(transform => typeof transform !== 'string' || !transform.includes('translateY'))).toBe(true)
  expect(arrivalTransforms.at(-1)).toBe('scale(7)')
  await expect(page.locator('.turn-transition-shield')).toBeVisible()
  await expect(page.locator('.nemesis-reveal-overlay')).toHaveCount(0)

  await expect(page.locator('.nemesis-draw-flight-scene')).toBeVisible({ timeout: 4000 })
  await expect(page.locator('.nemesis-reveal-overlay')).toBeVisible()
  const faceUrl = await revealedCardSrc(page)
  await expect(page.locator('.nemesis-draw-flight-front')).toHaveAttribute('src', faceUrl)
  expect(await page.locator('.nemesis-draw-flight-scene').evaluate(element => element.getAnimations().length)).toBeGreaterThan(0)
  const flipTimings = await page.locator('.nemesis-draw-flight-card').evaluate(element => element.getAnimations()
    .map(animation => animation.effect?.getComputedTiming()))
  expect(flipTimings[0]?.delay).toBe(540)
  expect(flipTimings[0]?.duration).toBe(420)
  const flipTransforms = await page.locator('.nemesis-draw-flight-card').evaluate(element => (element.getAnimations()[0]!.effect as KeyframeEffect).getKeyframes()
    .map(frame => frame.transform))
  expect(flipTransforms).toEqual(['scaleX(1)', 'scaleX(0.015)', 'scaleX(1)'])
  const faceOpacity = await page.locator('.nemesis-draw-flight-back').evaluate(element => (element.getAnimations()[0]!.effect as KeyframeEffect).getKeyframes()
    .map(frame => Number(frame.opacity)))
  expect(faceOpacity).toEqual([1, 1, 0, 0])
  expect(await page.locator('.nemesis-draw-flight-front').evaluate(element => (element.getAnimations()[0]!.effect as KeyframeEffect).getKeyframes()
    .map(frame => Number(frame.opacity)))).toEqual([0, 0, 1, 1])
  await expect.poll(() => page.locator('.nemesis-reveal-overlay').evaluate(element => Number(getComputedStyle(element).opacity)))
    .toBeGreaterThan(0)
  expect(await page.locator('.nemesis-reveal-overlay').evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThan(1)

  await expect(page.locator('.nemesis-reveal-overlay')).toBeVisible({ timeout: 4000 })
  await expect(page.locator('.nemesis-draw-flight-scene')).toHaveCount(0)
  await expect(page.locator('.nemesis-reveal-card img[alt="Agony Field"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(0)
  await page.locator('.nemesis-reveal-overlay').click({ position: { x: 12, y: 12 } })
  await expect(page.locator('.nemesis-reveal-overlay')).toHaveCount(0)
})

test('the first token of a new round gets its arrival animation after the slots reset', async ({ page }) => {
  await startGame(page)
  await page.addStyleTag({ content: ':root { --turn-order-arrival-duration: 1600ms; }' })

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const save = JSON.parse(await stateField.inputValue())
  const player = save.game.players[0]
  const otherPlayer = save.game.players[1]
  save.selectedPlayer = player.id
  save.phase = 'main'
  save.game.currentTurn = player.id
  save.game.currentPhase = 'main'
  save.game.round = 1
  save.game.turnOrderDeck = []
  save.game.turnOrderDiscard = [otherPlayer.id, 'nemesis', otherPlayer.id, 'nemesis', player.id, player.id]
  player.hand = []
  player.playedThisTurn = []
  player.pendingEndTurnCardIds = []
  player.aether = 0
  player.conditionalAetherEarned = {}
  player.bonusAether = 0
  player.charge = 0
  for (const breach of player.breaches) breach.prepSpells = []
  await stateField.fill(JSON.stringify(save))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  if (await page.getByText('Actions remain. End turn anyway?', { exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  }

  await expect(page.locator('.turn-order-cards .turn-round')).toHaveText('Round 2')
  await expect(page.locator('.turn-order-cards .slot.current img')).toBeVisible()
  const arrivalToken = page.locator('body > .turn-order-token-arrival')
  await expect(arrivalToken).toBeVisible()
  const currentTokenSrc = await page.locator('.turn-order-cards .slot.current img').getAttribute('src')
  if (currentTokenSrc === null) throw new Error('The current turn token has no image source')
  await expect(arrivalToken).toHaveAttribute('src', currentTokenSrc)
})
