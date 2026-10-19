import { expect, test, type Page } from '@playwright/test'

async function clearInitialNemesisDraw(page: Page) {
  let quietChecks = 0
  for (let attempt = 0; attempt < 40; attempt++) {
    const flight = page.locator('.nemesis-draw-flight-scene')
    if (await flight.isVisible().catch(() => false)) {
      await expect(flight).toHaveCount(0, { timeout: 5000 })
      quietChecks = 0
      continue
    }
    const reveal = page.locator('.nemesis-draw-reveal-screen')
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click({ position: { x: 12, y: 12 } })
      await expect(reveal).toHaveCount(0)
      quietChecks = 0
      continue
    }
    const shield = page.locator('.turn-transition-shield')
    if (await shield.isVisible().catch(() => false)) {
      await expect(shield).toBeHidden({ timeout: 5000 })
      quietChecks = 0
      continue
    }
    await page.waitForTimeout(100)
    if (++quietChecks >= 3) return
  }
}

async function startCleanGame(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 })
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
    break
  }
  await clearInitialNemesisDraw(page)
}

async function applyWovenSkyState(page: Page): Promise<string> {
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'main'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.game.pendingNemesisDiscard = null
  player.hand = ['crystal', 'crystal', 'focusing_orb', 'sagestone', 'vriswood_amber']
  player.discard = ['moonstone_shard']
  player.playedThisTurn = []
  debugState.game.nemesis.playArea = [{
    instanceId: 'woven-sky:batch-0',
    cardId: 'woven_sky',
    cardType: 'power',
    placedAt: 123456,
    powerTokens: 2,
  }]
  debugState.game.nemesis.discard = []
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  return player.id as string
}

async function startMotionTrace(page: Page, playerId: string) {
  await page.evaluate((ownerId) => {
    const trackedWindow = window as typeof window & {
      cardMotionTrace?: Array<Record<string, unknown>>
      cardMotionTraceActive?: boolean
      cardMotionTraceFrame?: number
      cardMotionTraceSample?: () => void
    }
    trackedWindow.cardMotionTrace = []
    trackedWindow.cardMotionTraceActive = true
    const area = document.querySelector<HTMLElement>(`[data-player-area-id="${ownerId}"]`)
    const sample = () => {
      if (!trackedWindow.cardMotionTraceActive || !area) return
      const discard = area.querySelector<HTMLElement>('.player-discard-pile')
      const clones = [...document.querySelectorAll<HTMLElement>('.card-flight-clone')]
      const handCards = [...area.querySelectorAll<HTMLElement>('.hand [data-hand-card-id]')]
      trackedWindow.cardMotionTrace!.push({
        t: Number(performance.now().toFixed(2)),
        discardCount: discard?.querySelector('.player-pile-count')?.textContent?.trim() ?? null,
        discardTop: discard?.querySelector<HTMLElement>('[data-discard-top-card]')?.dataset.discardTopCard ?? null,
        handCards: handCards.map(card => ({
          id: card.dataset.handCardId,
          index: card.dataset.handCardIndex,
          visible: getComputedStyle(card).visibility !== 'hidden',
          x: Number(card.getBoundingClientRect().x.toFixed(2)),
        })),
        visibleHandCount: handCards.filter(card => getComputedStyle(card).visibility !== 'hidden').length,
        playedCount: area.querySelectorAll('.played-zone-center [data-played-card-id]').length,
        swapCount: area.querySelectorAll('.played-zone-swap [data-card-motion-card-id]').length,
        clones: clones.map(clone => ({
          src: clone.querySelector('img')?.currentSrc ?? null,
          instanceId: clone.dataset.cardFlightInstanceId ?? null,
          sourceZone: clone.dataset.cardMotionSourceZone ?? null,
          destinationZone: clone.dataset.cardMotionDestinationZone ?? null,
          x: Number(clone.getBoundingClientRect().x.toFixed(2)),
          y: Number(clone.getBoundingClientRect().y.toFixed(2)),
          durations: clone.getAnimations().map(animation =>
            Number((animation.effect as KeyframeEffect | null)?.getTiming().duration ?? 0)),
        })),
        shieldVisible: !!document.querySelector('.card-motion-shield'),
      })
      if (trackedWindow.cardMotionTrace.length < 260) {
        trackedWindow.cardMotionTraceFrame = requestAnimationFrame(sample)
      }
    }
    trackedWindow.cardMotionTraceSample = sample
    trackedWindow.cardMotionTraceFrame = requestAnimationFrame(sample)
  }, playerId)
}

async function stopMotionTrace(page: Page) {
  const trace = await page.evaluate(() => {
    const trackedWindow = window as typeof window & {
      cardMotionTrace?: Array<Record<string, unknown>>
      cardMotionTraceActive?: boolean
      cardMotionTraceFrame?: number
      cardMotionTraceSample?: () => void
    }
    // High-refresh displays can exhaust the bounded frame trace before the
    // final landing. Capture the completed DOM once without dropping any
    // intermediate-frame assertions.
    trackedWindow.cardMotionTraceSample?.()
    trackedWindow.cardMotionTraceActive = false
    if (trackedWindow.cardMotionTraceFrame) cancelAnimationFrame(trackedWindow.cardMotionTraceFrame)
    return trackedWindow.cardMotionTrace ?? []
  })
  return trace
}

test.afterEach(async ({ page }, testInfo) => {
  const trace = await page.evaluate(() => {
    const trackedWindow = window as typeof window & {
      cardMotionTrace?: Array<Record<string, unknown>>
      cardMotionTraceActive?: boolean
      cardMotionTraceFrame?: number
    }
    trackedWindow.cardMotionTraceActive = false
    if (trackedWindow.cardMotionTraceFrame) cancelAnimationFrame(trackedWindow.cardMotionTraceFrame)
    return trackedWindow.cardMotionTrace ?? []
  }).catch(() => [])
  if (trace.length === 0) return
  await testInfo.attach('woven-sky-motion-timeline.json', {
    body: JSON.stringify(trace, null, 2),
    contentType: 'application/json',
  })
})

test('Woven Sky reveals each Discard arrival as its hand card lands', async ({ page }, testInfo) => {
  await startCleanGame(page)
  const playerId = await applyWovenSkyState(page)
  await page.addStyleTag({
    content: ':root { --hand-to-pile-flight-duration: 450ms; --card-flight-duration: 450ms; --hand-card-reflow-duration: 300ms; }',
  })

  const powerCard = page.locator('.nemesis-play-card').first()
  await expect(powerCard).toHaveClass(/discardable/)
  await powerCard.click()
  await expect(page.getByText('Choose 3 card(s) to discard the Power', { exact: true })).toBeVisible()
  const candidates = page.locator('.pending-board-card')
  await expect(candidates).toHaveCount(5)
  const selectedInstanceIds = await candidates.evaluateAll(elements =>
    elements.slice(0, 3).map(element => (element as HTMLElement).dataset.cardInstanceId ?? null))
  expect(selectedInstanceIds.every(Boolean)).toBe(true)
  for (let index = 0; index < 3; index++) await candidates.nth(index).click()

  await startMotionTrace(page, playerId)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.locator('.card-motion-shield')).toBeHidden({ timeout: 10000 })
  await expect(page.locator('.player-discard-pile .player-pile-count')).toHaveText('4')
  const trace = await stopMotionTrace(page)
  expect(trace.length).toBeGreaterThan(0)
  expect(trace.some(frame => Array.isArray(frame.clones) && frame.clones.length > 0)).toBe(true)

  const discardCounts = [...new Set(trace
    .map(frame => Number(frame.discardCount))
    .filter(count => Number.isFinite(count)))].sort((left, right) => left - right)
  expect(discardCounts).toEqual([1, 2, 3, 4])
  for (const countDuringFlight of [1, 2, 3]) {
    expect(trace.some(frame => Number(frame.discardCount) === countDuringFlight &&
      Array.isArray(frame.clones) && frame.clones.length > 0)).toBe(true)
  }
  expect(Math.max(...trace.map(frame => Array.isArray(frame.clones) ? frame.clones.length : 0))).toBeLessThanOrEqual(1)
  const flightInstanceIds = [...new Set(trace.flatMap(frame => Array.isArray(frame.clones)
    ? frame.clones.flatMap(clone => typeof clone === 'object' && clone !== null &&
      'sourceZone' in clone && clone.sourceZone === 'hand' &&
      'destinationZone' in clone && clone.destinationZone === 'discard' &&
      'instanceId' in clone && typeof clone.instanceId === 'string' ? [clone.instanceId] : [])
    : []))]
  expect(flightInstanceIds.sort()).toEqual((selectedInstanceIds as string[]).sort())
  const visibleHandCounts = [...new Set(trace.map(frame => Number(frame.visibleHandCount)))]
    .sort((left, right) => right - left)
  expect(visibleHandCounts).toEqual([5, 4, 3, 2])
})
