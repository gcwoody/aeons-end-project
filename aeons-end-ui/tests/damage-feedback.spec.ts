import { test, expect, type Page } from '@playwright/test'

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

async function applyMainPhaseState(page: Page, update: (game: any, player: any) => void) {
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
  update(debugState.game, player)
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  return { playerId: player.id as string, allyId: debugState.game.players[1].id as string }
}

test('casting a damaging spell shows localized damage feedback on the target', async ({ page }) => {
  await startCleanGame(page)

  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players[0]
  debugState.selectedPlayer = player.id
  debugState.phase = 'casting'
  debugState.game.currentTurn = player.id
  debugState.game.currentPhase = 'casting'
  for (const breach of player.breaches) breach.prepSpells = []
  player.breaches[0].opened = true
  player.breaches[0].prepSpells = ['spark']
  debugState.game.nemesis.playArea = []
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const hp = page.locator('.nemesis-info-nemesis .hp-num b')
  await expect(hp).toHaveText('70')
  await page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame').click()

  await expect(hp).toHaveText('69')
  await expect(page.locator('.damage-impact-nemesis .damage-impact-number')).toHaveText('−1')
  await expect(page.locator('.damage-impact-aura')).toBeVisible()
})

test('Tressa Overload Stance shows feedback when the last spell auto-enters Main Phase', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (game, player) => {
    player.mageType = 'tressa'
    player.playerCardsInPlay = ['overload_stance']
    player.playerCardSupplyTargets = [null]
    player.playerCardPowerTokens = [0]
    player.spellsCastThisTurn = 0
    for (const breach of player.breaches) {
      breach.prepSpells = []
      breach.preppedThisTurn = []
      breach.preppedSpellFaceDown = []
    }
    player.breaches[0].opened = true
    player.breaches[0].prepSpells = ['spark']
    player.breaches[0].preppedThisTurn = [false]
    player.breaches[0].preppedSpellFaceDown = [false]
    game.nemesis.hp = 70
    game.nemesis.playArea = []
    game.currentPhase = 'casting'
  })

  // The helper sets Main Phase for its standard fixtures; put the UI back in
  // Casting Phase so the final Spark drives the same automatic transition.
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'casting'
  debugState.game.currentPhase = 'casting'
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame').click()
  await expect(page.locator('.nemesis-info-nemesis .hp-num b')).toHaveText('68')
  const bubbles = page.locator('.damage-impact-nemesis .damage-impact-number')
  await expect(bubbles).toHaveCount(2)
  await expect(bubbles.nth(0)).toHaveText('−1')
  await expect(bubbles.nth(1)).toHaveText('−1')
})


test('a resolved healing effect shows a green health feedback bubble', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (game, player) => {
    game.gravehold.hp = 27
    player.hand = ['focusing_orb']
    player.playedThisTurn = []
  })

  await page.locator('[data-hand-card-index="0"]').click()
  await page.getByRole('button', { name: 'Destroy this to let Gravehold gain 3 life' }).click()

  await expect(page.locator('.nemesis-info-gravehold .hp-num b')).toHaveText('30')
  const bubble = page.locator('.damage-impact-gravehold .damage-impact-number')
  await expect(bubble).toHaveText('+3')
  await expect(page.locator('.damage-impact-gravehold')).toHaveClass(/damage-impact--healing/)
})

test('Play All Gems keeps a card in hand until its decision resolves, then animates it once', async ({ page }) => {
  await startCleanGame(page)
  // Keep the travel long enough to assert the intermediate state rather than
  // racing the end of the animation on a fast test machine.
  await page.addStyleTag({ content: ':root { --hand-to-play-zone-flight-duration: 700ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = ['crystal', 'sagestone']
    player.knowledge = 1
    player.playedThisTurn = []
  })

  await page.getByRole('button', { name: 'Play All Gems' }).click()
  const decision = page.locator('.app .decision-overlay')
  await expect(decision).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.hand [data-hand-card-id="sagestone"]')).toBeVisible()
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toBeVisible()
  await expect(page.locator('.played-zone-center [data-played-card-id="sagestone"]')).toBeHidden()

  await page.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page.locator('.card-flight-clone')).toHaveCount(1)
  await expect(page.locator('.hand [data-hand-card-id="sagestone"]')).toBeHidden()
  await expect(page.locator('.played-zone-center [data-played-card-id="sagestone"]')).toBeHidden()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.played-zone-center [data-played-card-id="sagestone"]')).toBeVisible()
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await page.keyboard.press('Control+z')
  await expect(page.locator('.hand [data-hand-card-id="sagestone"]')).toBeVisible()
  await expect(page.locator('.hand [data-hand-card-id="crystal"]')).toBeVisible()
  await expect(page.locator('.played-zone-center [data-played-card-id="sagestone"]')).toHaveCount(0)
})

test('a Gem played directly stays in hand until its optional effect resolves', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --hand-to-play-zone-flight-duration: 500ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = ['sagestone', 'crystal']
    player.knowledge = 1
    player.playedThisTurn = []
  })

  await page.locator('.hand [data-hand-card-index="0"]').click()
  await expect(page.locator('.app .decision-overlay')).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.hand [data-hand-card-id="sagestone"]')).toBeVisible()
  await expect(page.locator('.played-zone-center [data-played-card-id="sagestone"]')).toBeHidden()

  await page.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page.locator('.card-flight-clone')).toHaveCount(1)
  await expect(page.locator('.hand [data-hand-card-id="sagestone"]')).toBeHidden()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.played-zone-center [data-played-card-id="sagestone"]')).toBeVisible()
})

test('a held duplicate keeps the Played Zone layout until its decision resolves', async ({ page }) => {
  await startCleanGame(page)
  // Keep any (incorrect) reflow running long enough to catch a layout shift
  // while the decision overlay is open.
  await page.addStyleTag({ content: ':root { --card-zone-reflow-duration: 1000ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = ['sagestone', 'sagestone']
    player.knowledge = 1
    player.playedThisTurn = []
  })

  await page.locator('.hand [data-hand-card-index="0"]').click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const played = page.locator('.played-zone-center [data-played-card-id="sagestone"]')
  await expect(played).toHaveCount(1)
  const landed = await played.boundingBox()

  await page.locator('.hand [data-hand-card-index="0"]').click()
  await expect(page.locator('.app .decision-overlay')).toBeVisible()
  await expect(page.locator('.hand [data-hand-card-id="sagestone"]')).toBeVisible()
  // The held copy must not reserve a slot in the Played Zone yet: the first
  // Sagestone stays visible, centered, and does not shift left before the decision.
  await expect(played).toHaveCount(1)
  await expect(played).toBeVisible()
  const held = await played.boundingBox()
  expect(Math.abs(held!.x - landed!.x)).toBeLessThan(0.5)
  expect(Math.abs(held!.y - landed!.y)).toBeLessThan(0.5)

  await page.getByRole('button', { name: 'No', exact: true }).click()
  await expect(played).toHaveCount(2)
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await expect(played.nth(0)).toBeVisible()
  await expect(played.nth(1)).toBeVisible()
})

test('Play All Gems reflows an already played Sagestone as each Crystal lands', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = ['sagestone', 'crystal', 'crystal', 'crystal']
    player.knowledge = 1
    player.playedThisTurn = []
  })

  await page.locator('.hand [data-hand-card-id="sagestone"]').click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await expect(page.locator('.played-zone-center [data-played-card-id="sagestone"]')).toBeVisible()

  await page.evaluate(() => {
    const trackedWindow = window as typeof window & { sagestoneReflowCrystalCounts: number[] }
    trackedWindow.sagestoneReflowCrystalCounts = []
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      if ((this as HTMLElement).dataset.playedCardId === 'sagestone') {
        trackedWindow.sagestoneReflowCrystalCounts.push(
          this.closest('[data-card-motion-row]')?.querySelectorAll('[data-played-card-id="crystal"]').length ?? 0,
        )
      }
      return originalAnimate.call(this, keyframes, options)
    }
  })

  await page.getByRole('button', { name: 'Play All Gems' }).click()
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toHaveCount(3)
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const reflowCounts = await page.evaluate(() =>
    (window as typeof window & { sagestoneReflowCrystalCounts: number[] }).sagestoneReflowCrystalCounts)
  expect(reflowCounts).toEqual([1, 2, 3])
})

test('Play All Gems animates every Crystal in hand order, one flight at a time', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --hand-to-play-zone-flight-duration: 400ms; --hand-card-reflow-duration: 120ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = ['crystal', 'crystal', 'crystal']
    player.playedThisTurn = []
  })

  const expectedInstanceIds = await page.locator('.hand [data-hand-card-id="crystal"]').evaluateAll(cards =>
    cards.map(card => card.getAttribute('data-card-instance-id')))
  expect(expectedInstanceIds.every(Boolean)).toBe(true)

  await page.evaluate(() => {
    const trace = { started: [] as string[], maxActive: 0 }
    const active = new Set<string>()
    const clonesIn = (node: Node) => node instanceof HTMLElement
      ? [...(node.matches('.card-flight-clone') ? [node] : []), ...node.querySelectorAll<HTMLElement>('.card-flight-clone')]
      : []
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          for (const clone of clonesIn(node)) {
            const instanceId = clone.dataset.cardFlightInstanceId
            if (!instanceId) continue
            trace.started.push(instanceId)
            active.add(instanceId)
            trace.maxActive = Math.max(trace.maxActive, active.size)
          }
        }
        for (const node of record.removedNodes) {
          for (const clone of clonesIn(node)) {
            const instanceId = clone.dataset.cardFlightInstanceId
            if (instanceId) active.delete(instanceId)
          }
        }
      }
    })
    Object.assign(window, { playAllGemFlightTrace: trace, playAllGemFlightObserver: observer })
    observer.observe(document.body, { childList: true, subtree: true })
  })

  await page.getByRole('button', { name: 'Play All Gems' }).click()
  await expect(page.locator('.card-flight-clone')).toHaveCount(1)
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toHaveCount(3)
  await expect(page.locator('.app')).not.toHaveClass(/card-motion-batch-active/)
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { playAllGemFlightTrace: { started: string[] } }).playAllGemFlightTrace.started.length,
  )).toBe(3)

  const trace = await page.evaluate(() => {
    const trackedWindow = window as typeof window & {
      playAllGemFlightTrace: { started: string[]; maxActive: number }
      playAllGemFlightObserver: MutationObserver
    }
    trackedWindow.playAllGemFlightObserver.disconnect()
    return trackedWindow.playAllGemFlightTrace
  })
  expect(trace.started).toEqual(expectedInstanceIds)
  expect(trace.maxActive).toBe(1)
})

test('A plays all Gems and does not trigger while help or a text field is active', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = ['crystal', 'crystal']
    player.playedThisTurn = []
  })

  await page.getByRole('button', { name: 'Open game help' }).click()
  await expect(page.getByText('Play all Gems in the current Mage\'s hand.')).toBeVisible()
  await expect(page.getByText('Undo the last player operation, up to twenty steps.')).toBeVisible()
  await page.keyboard.press('a')
  await expect(page.locator('.hand [data-hand-card-id="crystal"]')).toHaveCount(2)
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close game help' }).click()

  await page.keyboard.press('Control+d')
  const debugField = page.locator('.debug-panel textarea')
  await expect(debugField).toBeVisible()
  await debugField.focus()
  await page.keyboard.press('a')
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.keyboard.press('a')
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toHaveCount(2)
  await expect(page.locator('.app')).not.toHaveClass(/card-motion-batch-active/)
})

test('Play All Gems resolves each Trinket gain before playing the next Gem', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --card-flight-duration: 250ms; --hand-to-play-zone-flight-duration: 250ms; --hand-card-reflow-duration: 120ms; --card-zone-reflow-duration: 120ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    player.hand = ['luminous_facet', 'crystal', 'crystal']
    player.discard = []
    player.playedThisTurn = []
    game.trinketDeck = ['clouded_trinket']
    game.trinketDeckRevealed = [false]
  })

  await page.evaluate(() => {
    const luminousSrc = document.querySelector<HTMLImageElement>('.hand img[alt="Luminous Facet"]')?.src
    const crystalSrc = document.querySelector<HTMLImageElement>('.hand img[alt="Crystal"]')?.src
    const order: string[] = []
    Object.assign(window, { playAllGemMotionOrder: order })
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          const clones = [
            ...(node.matches('.card-flight-clone') ? [node] : []),
            ...node.querySelectorAll<HTMLElement>('.card-flight-clone'),
          ]
          for (const clone of clones) {
            if (clone.querySelector('.card-flight-reveal-front')) {
              order.push('trinket')
              continue
            }
            const source = clone.querySelector<HTMLImageElement>('img')?.src
            if (source === luminousSrc) order.push('luminous-facet')
            else if (source === crystalSrc) order.push('crystal')
          }
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })

  await page.getByRole('button', { name: 'Play All Gems' }).click()
  await expect(page.locator('.played-zone-center [data-played-card-id="luminous_facet"]')).toHaveCount(1)
  await expect(page.locator('.played-zone-center [data-played-card-id="crystal"]')).toHaveCount(2)
  await expect(page.locator('.app')).not.toHaveClass(/card-motion-batch-active/)

  const motionOrder = await page.evaluate(() =>
    (window as Window & { playAllGemMotionOrder?: string[] }).playAllGemMotionOrder ?? [])
  expect(motionOrder.filter(event => event === 'crystal')).toHaveLength(2)
  expect(motionOrder.indexOf('trinket')).toBeGreaterThan(motionOrder.indexOf('luminous-facet'))
  expect(motionOrder.indexOf('trinket')).toBeLessThan(motionOrder.indexOf('crystal'))
})

for (const { cardId, answer } of [
  { cardId: 'sagestone', answer: 'No' },
  { cardId: 'superior_crystal', answer: 'Gain 1 Aether' },
  { cardId: 'focusing_orb', answer: 'Destroy this to let Gravehold gain 3 life' },
]) {
  test(`one undo returns a resolved ${cardId} decision play to the hand`, async ({ page }) => {
    await startCleanGame(page)
    await applyMainPhaseState(page, (game, player) => {
      player.hand = [cardId, 'crystal']
      player.playedThisTurn = []
      player.knowledge = 1
      game.gravehold.hp = 27
    })

    await page.locator(`.hand [data-hand-card-id="${cardId}"]`).click()
    await expect(page.locator(`.hand [data-hand-card-id="${cardId}"]`)).toBeVisible()
    await expect(page.locator(`.played-zone-center [data-played-card-id="${cardId}"]`)).toBeHidden()
    await page.getByRole('button', { name: answer, exact: true }).click()
    await expect(page.locator('.card-motion-shield')).toBeHidden()
    await page.keyboard.press('Control+z')

    await expect(page.locator(`.hand [data-hand-card-id="${cardId}"]`)).toBeVisible()
    await expect(page.locator(`.played-zone-center [data-played-card-id="${cardId}"]`)).toHaveCount(0)
    await expect(page.locator('.app .decision-overlay')).toHaveCount(0)
  })
}

for (const previousDiscard of [[], ['spark']]) {
  test(`Swap keeps the ${previousDiscard.length ? 'old' : 'empty'} Discard visible until its target lands`, async ({ page }) => {
    await startCleanGame(page)
    await page.addStyleTag({ content: ':root { --hand-to-play-zone-flight-duration: 100ms; --hand-to-swap-zone-flight-duration: 900ms; --swap-to-discard-flight-duration: 900ms; --card-flight-duration: 900ms; --card-zone-reflow-duration: 1200ms; }' })
    await applyMainPhaseState(page, (game, player) => {
      game.hasSwapZone = true
      player.hand = ['superior_crystal', 'crystal']
      player.playedThisTurn = []
      player.swapZone = ['infused_crystal', 'dim_crystal']
      player.discard = [...previousDiscard]
    })

    const discard = page.locator('.player-discard-pile')
    const swapSource = page.locator('.played-zone-swap [data-card-motion-card-id="superior_crystal"]')
    const swapTargetSize = await page.locator('.played-zone-swap [data-card-motion-card-id="infused_crystal"]').boundingBox()
    expect(swapTargetSize).not.toBeNull()
    await page.locator('.hand [data-hand-card-id="superior_crystal"]').click()
    await page.getByRole('button', { name: 'Gain 3 Aether and swap for Infused Crystal' }).click()

    const heldSwapTarget = page.locator('.played-zone-swap [data-card-motion-held-key]')
    await expect(page.locator('.card-flight-clone')).toHaveCount(1)
    await expect(heldSwapTarget).toHaveCount(1)
    await expect(heldSwapTarget).toBeVisible()
    await expect(swapSource).toBeHidden()
    await expect.poll(() => page.locator('.played-zone-swap [data-card-motion-card-id="dim_crystal"]')
      .evaluate(card => card.getAnimations().some(animation => animation.playState === 'running'))).toBe(true)
    await page.evaluate(() => {
      const tracked = window as typeof window & { firstSwapReflow?: Animation }
      tracked.firstSwapReflow = document.querySelector<HTMLElement>(
        '.played-zone-swap [data-card-motion-card-id="dim_crystal"]',
      )?.getAnimations().find(animation => animation.playState === 'running')
    })
    await expect(discard.locator('[data-discard-top-card="infused_crystal"]')).toHaveCount(0)
    if (previousDiscard.length) {
      await expect(discard.locator('[data-discard-top-card="spark"]')).toBeVisible()
      await expect(discard.locator('.player-pile-count')).toHaveText('1')
    } else {
      await expect(discard.locator('.player-discard-top-card')).toHaveCount(0)
      await expect(discard.locator('.player-empty-pile-label')).toHaveText('Discard 0')
    }

    await expect(swapSource).toBeVisible()
    await expect(page.locator('.card-flight-clone')).toHaveCount(1)
    await expect(heldSwapTarget).toHaveCount(0)
    await expect.poll(() => page.locator('.played-zone-swap [data-card-motion-card-id="dim_crystal"]')
      .evaluate(card => {
        const tracked = window as typeof window & { firstSwapReflow?: Animation }
        return card.getAnimations().some(animation => animation.playState === 'running' &&
          animation !== tracked.firstSwapReflow)
      })).toBe(true)
    const flightTargetSize = await discard.locator('.player-discard-flight-target').boundingBox()
    const discardSize = await discard.boundingBox()
    expect(flightTargetSize).not.toBeNull()
    expect(discardSize).not.toBeNull()
    expect(flightTargetSize!.height).toBeCloseTo(discardSize!.height, 0)
    expect(flightTargetSize!.width / flightTargetSize!.height)
      .toBeCloseTo(swapTargetSize!.width / swapTargetSize!.height, 1)
    await expect(discard.locator('[data-discard-top-card="infused_crystal"]')).toHaveCount(0)
    await expect(page.locator('.card-motion-shield')).toBeHidden()
    await expect(discard.locator('[data-discard-top-card="infused_crystal"]')).toBeVisible()
    await expect(discard.locator('.player-pile-count')).toHaveText(String(previousDiscard.length + 1))
  })
}

test('Swap keeps a surviving copy of an identical card stable through both row reflows', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --hand-to-swap-zone-flight-duration: 900ms; --swap-to-discard-flight-duration: 900ms; --card-flight-duration: 900ms; --card-zone-reflow-duration: 1200ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    game.hasSwapZone = true
    player.hand = ['superior_crystal']
    player.playedThisTurn = []
    player.swapZone = ['infused_crystal', 'infused_crystal', 'dim_crystal']
    player.discard = []
  })

  const survivingCopy = page.locator('.played-zone-swap [data-card-motion-card-id="infused_crystal"]')
  const originalKey = await survivingCopy.nth(1).getAttribute('data-card-motion-key')
  expect(originalKey).toBeTruthy()
  await page.locator('.hand [data-hand-card-id="superior_crystal"]').click()
  await page.getByRole('button', { name: 'Gain 3 Aether and swap for Infused Crystal' }).first().click()

  await expect(page.locator('.played-zone-swap [data-card-motion-held-key]')).toHaveCount(1)
  await expect(survivingCopy).toHaveAttribute('data-card-motion-key', originalKey!)
  await expect(page.locator('.played-zone-swap [data-card-motion-card-id="superior_crystal"]')).toBeVisible()
  await expect(page.locator('.played-zone-swap [data-card-motion-held-key]')).toHaveCount(0)
  await expect(survivingCopy).toHaveAttribute('data-card-motion-key', originalKey!)
  await expect.poll(() => survivingCopy.evaluate(card =>
    card.getAnimations().some(animation => animation.playState === 'running'))).toBe(true)
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await expect(page.locator('.played-zone-swap [data-card-motion-card-id="infused_crystal"]')).toHaveCount(1)
  await expect(survivingCopy).toHaveAttribute('data-card-motion-key', originalKey!)
})

test('a Swap effect without a decision also flies in before its target leaves', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --hand-to-swap-zone-flight-duration: 900ms; --swap-to-discard-flight-duration: 900ms; --card-flight-duration: 900ms; --card-zone-reflow-duration: 1200ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    game.hasSwapZone = true
    player.hand = ['dim_crystal']
    player.playedThisTurn = []
    player.swapZone = ['empty_crystal', 'infused_crystal']
    player.discard = []
  })

  const heldTarget = page.locator('.played-zone-swap [data-card-motion-held-key]')
  const incoming = page.locator('.played-zone-swap [data-card-motion-card-id="dim_crystal"]')
  await page.locator('.hand [data-hand-card-id="dim_crystal"]').click()
  await expect(heldTarget).toBeVisible()
  await expect(incoming).toBeHidden()
  await expect(page.locator('.player-discard-pile [data-discard-top-card="empty_crystal"]')).toHaveCount(0)
  await expect(incoming).toBeVisible()
  await expect(heldTarget).toHaveCount(0)
  await expect(page.locator('.card-flight-clone')).toHaveCount(1)
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await expect(page.locator('.player-discard-pile [data-discard-top-card="empty_crystal"]')).toBeVisible()
})

test('Swap flights use the dedicated swap duration tokens', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --hand-to-swap-zone-flight-duration: 250ms; --swap-to-discard-flight-duration: 150ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    game.hasSwapZone = true
    player.hand = ['dim_crystal']
    player.playedThisTurn = []
    player.swapZone = ['empty_crystal', 'infused_crystal']
    player.discard = []
  })

  await page.evaluate(() => {
    const trackedWindow = window as typeof window & { swapFlightDurations: number[] }
    trackedWindow.swapFlightDurations = []
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      if ((this as HTMLElement).classList.contains('card-flight-clone')) {
        trackedWindow.swapFlightDurations.push(Number((options as KeyframeAnimationOptions | undefined)?.duration ?? 0))
      }
      return originalAnimate.call(this, keyframes, options)
    }
  })

  await page.locator('.hand [data-hand-card-id="dim_crystal"]').click()
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await expect(page.locator('.played-zone-swap [data-card-motion-card-id="dim_crystal"]')).toBeVisible()
  await expect(page.locator('.player-discard-pile [data-discard-top-card="empty_crystal"]')).toBeVisible()

  const durations = await page.evaluate(() =>
    (window as typeof window & { swapFlightDurations: number[] }).swapFlightDurations)
  // Hand to Swap Zone and Swap Zone to Discard read their own tokens instead
  // of the shared --card-flight-duration.
  expect(durations).toContain(250)
  expect(durations).toContain(150)
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
test(`Swap makes room on screen without a layout flash at ${viewport.width}px`, async ({ page }) => {
  await startCleanGame(page)
  await page.setViewportSize(viewport)
  await page.addStyleTag({ content: ':root { --hand-to-swap-zone-flight-duration: 900ms; --swap-to-discard-flight-duration: 900ms; --card-flight-duration: 900ms; --card-zone-reflow-duration: 900ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    game.hasSwapZone = true
    game.hasDevelopZone = true
    game.developZone = ['chromia_sphere']
    player.hand = ['superior_crystal']
    player.playedThisTurn = []
    player.swapZone = [
      'infused_crystal', 'dim_crystal', 'empty_crystal',
      'infused_spark', 'empty_spark', 'dim_spark',
    ]
    player.discard = []
  })

  await page.locator('.hand [data-hand-card-id="superior_crystal"]').click()
  await page.evaluate(() => {
    const tracked = window as typeof window & {
      swapMotionSamples: Array<{
        time: number
        survivorX: number
        developX: number
        held: boolean
        incomingVisible: boolean
        incomingX: number | null
        incomingKey: string | null
      }>
      stopSwapSampling: boolean
    }
    tracked.swapMotionSamples = []
    tracked.stopSwapSampling = false
    const sample = () => {
      const survivor = document.querySelector<HTMLElement>(
        '.played-zone-swap [data-card-motion-card-id="dim_crystal"]',
      )
      const develop = document.querySelector<HTMLElement>(
        '.played-zone-develop [data-card-motion-card-id="chromia_sphere"]',
      )
      const incoming = document.querySelector<HTMLElement>(
        '.played-zone-swap [data-card-motion-card-id="superior_crystal"]',
      )
      if (survivor && develop) tracked.swapMotionSamples.push({
        time: performance.now(),
        survivorX: survivor.getBoundingClientRect().x,
        developX: develop.getBoundingClientRect().x,
        held: !!document.querySelector('.played-zone-swap [data-card-motion-held-key]'),
        incomingVisible: !!incoming && getComputedStyle(incoming).visibility === 'visible',
        incomingX: incoming?.getBoundingClientRect().x ?? null,
        incomingKey: incoming?.dataset.cardMotionKey ?? null,
      })
      if (!tracked.stopSwapSampling) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.getByRole('button', { name: 'Gain 3 Aether and swap for Infused Crystal' }).click()
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const samples = await page.evaluate(() => {
    const tracked = window as typeof window & {
      swapMotionSamples: Array<{
        time: number
        survivorX: number
        developX: number
        held: boolean
        incomingVisible: boolean
        incomingX: number | null
        incomingKey: string | null
      }>
      stopSwapSampling: boolean
    }
    tracked.stopSwapSampling = true
    return tracked.swapMotionSamples
  })
  const firstHeld = samples.find(sample => sample.held)
  expect(firstHeld).toBeDefined()
  expect(Math.abs(firstHeld!.survivorX - samples[0]!.survivorX)).toBeLessThan(8)
  expect(samples.filter(sample => sample.held).length).toBeGreaterThan(4)
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!
    const current = samples[index]!
    if (current.time - previous.time < 40) {
      expect(Math.abs(current.survivorX - previous.survivorX)).toBeLessThan(15)
      if (previous.incomingVisible && current.incomingVisible) {
        expect(Math.abs(current.incomingX! - previous.incomingX!)).toBeLessThan(15)
      }
    }
  }
  expect(Math.max(...samples.map(sample => sample.developX)) -
    Math.min(...samples.map(sample => sample.developX))).toBeLessThan(1)
  const firstVisible = samples.findIndex(sample => sample.incomingVisible)
  expect(firstVisible).toBeGreaterThan(0)
  expect(samples.slice(firstVisible).every(sample => sample.incomingVisible)).toBe(true)
  expect(new Set(samples.slice(firstVisible).map(sample => sample.incomingKey)).size).toBe(1)
})
}

test('a cast spell swapped into the Swap Zone holds the departing target in place', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --card-flight-duration: 900ms; --card-zone-reflow-duration: 1200ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    game.hasSwapZone = true
    game.nemesis.playArea = [{
      cardId: 'haze_spewer', cardType: 'minion', placedAt: 123456,
      instanceId: 'haze-spewer-spell-swap', enteredOnNemesisTurn: 0, lifeTokens: 5,
    }]
    player.swapZone = ['infused_crystal', 'dim_crystal', 'empty_crystal', 'infused_spark', 'empty_spark', 'dim_spark']
    player.discard = []
    player.playedThisTurn = []
    player.hand = ['crystal']
    for (const breach of player.breaches) {
      breach.opened = false
      breach.focusedThisTurn = false
      breach.prepSpells = []
      breach.preppedThisTurn = []
      breach.preppedSpellFaceDown = []
    }
    player.breaches[0].opened = true
    player.breaches[0].prepSpells = ['superior_spark']
    player.breaches[0].preppedThisTurn = [false]
    player.breaches[0].preppedSpellFaceDown = [false]
  })
  // Put the UI back into the Casting Phase so the prepped spell can be cast.
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const castingState = JSON.parse(await stateField.inputValue())
  castingState.phase = 'casting'
  castingState.game.currentPhase = 'casting'
  await stateField.fill(JSON.stringify(castingState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.breach[data-breach-index="1"] .breach-spell-card-frame').click()
  await page.getByRole('button', { name: 'Deal 3 damage and swap for Infused Spark' }).click()
  await page.locator('[data-damage-target="minion:123456"]').click()

  // The spell leaves the discard (its resolve spot) for the Swap Zone's
  // rightmost slot while the swapped-out target stays visible in place.
  const held = page.locator('.played-zone-swap [data-card-motion-held-key]')
  await expect(held).toHaveCount(1)
  await expect(held).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(1)
  await expect(page.locator('.player-discard-pile [data-discard-top-card]')).toHaveCount(0)

  await expect(page.locator('.card-motion-shield')).toBeHidden({ timeout: 8000 })
  await expect(page.locator('.played-zone-swap [data-card-motion-card-id]')).toHaveCount(6)
  await expect(page.locator('.played-zone-swap [data-card-motion-card-id="superior_spark"]')).toBeVisible()
  await expect(page.locator('.played-zone-swap [data-card-motion-card-id="infused_spark"]')).toHaveCount(0)
  await expect(held).toHaveCount(0)
  await expect(page.locator('.player-discard-pile [data-discard-top-card="infused_spark"]')).toBeVisible()
})

test('a hand card placed on the deck starts its flight before the deck shows the new count', async ({ page }) => {
  await startCleanGame(page)
  // The dedicated hand-to-deck-top duration both slows the flight enough to
  // observe and proves the flight reads its own token.
  await page.addStyleTag({ content: ':root { --hand-to-deck-top-flight-duration: 700ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    game.pendingDecision = {
      id: 'vapor-wraith-top-deck',
      playerId: player.id,
      kind: 'select_cards',
      source: 'hand',
      min: 1,
      max: 1,
      prompt: 'Choose a card in hand to place on top of your deck',
      candidates: [{ zone: 'hand', index: 1, cardId: 'spark', cardName: 'Spark' }],
    }
    game.pendingEffect = {
      sourcePlayerId: player.id,
      effectPlayerId: player.id,
      awaiting: { kind: 'place_card_on_top_of_own_deck' },
      remainingEffects: [],
    }
    player.hand = ['crystal', 'spark', 'focusing_orb']
    player.deck = ['crystal']
    player.discard = []
    player.playedThisTurn = []
  })

  await expect(page.locator('.hand .pending-board-card')).toHaveCount(1)
  await page.evaluate(() => {
    const tracked = window as typeof window & {
      deckTransferTimeline: Array<{
        clone: boolean
        flip: boolean
        handVisible: boolean
        count: string | null
        duration: number | null
      }>
    }
    tracked.deckTransferTimeline = []
    const probe = () => {
      const handCard = document.querySelector<HTMLElement>('.hand [data-hand-card-id="spark"]')
      const clone = document.querySelector<HTMLElement>('.card-flight-clone')
      tracked.deckTransferTimeline.push({
        clone: !!clone,
        flip: !!clone?.querySelector('.card-flight-flip-face'),
        handVisible: !!handCard && getComputedStyle(handCard).visibility !== 'hidden',
        count: document.querySelector('.player-deck-pile .player-pile-count')?.textContent ?? null,
        duration: clone
          ? Math.max(...clone.getAnimations().map(animation =>
            Number((animation.effect as KeyframeEffect | null)?.getTiming().duration ?? 0)))
          : null,
      })
      if (tracked.deckTransferTimeline.length < 200) requestAnimationFrame(probe)
    }
    requestAnimationFrame(probe)
  })

  await page.locator('.hand .pending-board-card').click()
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const timeline = await page.evaluate(() =>
    (window as typeof window & {
      deckTransferTimeline: Array<{
        clone: boolean
        flip: boolean
        handVisible: boolean
        count: string | null
        duration: number | null
      }>
    }).deckTransferTimeline)

  const firstClone = timeline.findIndex(frame => frame.clone)
  const firstCountTwo = timeline.findIndex(frame => frame.count === '2')
  const firstHandHidden = timeline.findIndex(frame => !frame.handVisible)
  // The deck count must not reveal the new top card before the flight starts...
  expect(firstClone).toBeGreaterThanOrEqual(0)
  expect(timeline[firstClone]?.flip).toBe(true)
  expect(Math.max(...timeline.map(frame => frame.duration ?? 0))).toBe(700)
  expect(firstCountTwo).toBeGreaterThan(firstClone)
  // ...and the card must leave the hand only once the flight clone is on screen.
  expect(timeline[firstHandHidden]?.clone).toBe(true)
})

test('a hand card placed on an ally deck flies to its visible player control and reaches the deck top', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --hand-to-deck-top-flight-duration: 700ms; }' })
  const { playerId, allyId } = await applyMainPhaseState(page, (game, player) => {
    const ally = game.players[1]
    game.pendingDecision = {
      id: 'flailer-ally-top-deck',
      playerId: player.id,
      kind: 'select_cards',
      source: 'hand',
      min: 1,
      max: 1,
      prompt: 'Choose a card in hand to place on top of an ally’s deck',
      candidates: [{ zone: 'hand', index: 1, cardId: 'spark', cardName: 'Spark' }],
    }
    game.pendingEffect = {
      sourcePlayerId: player.id,
      effectPlayerId: player.id,
      selectedActionPlayerId: player.id,
      placementRecipientPlayerId: ally.id,
      awaiting: { kind: 'place_hand_card_on_ally_deck' },
      remainingEffects: [],
    }
    player.hand = ['crystal', 'spark', 'focusing_orb']
    player.playedThisTurn = []
    ally.deck = ['crystal']
    ally.discard = []
  })

  const allyControl = page.locator(`[data-player-control-id="${allyId}"]`)
  await expect(page.locator('.hand .pending-board-card')).toHaveCount(1)
  await expect(allyControl).toBeVisible()
  await page.evaluate(({ sourceId, targetId }) => {
    const tracked = window as typeof window & {
      allyDeckTimeline: Array<{ clone: boolean; handVisible: boolean; distance: number | null; duration: number | null }>
    }
    tracked.allyDeckTimeline = []
    const source = document.querySelector<HTMLElement>(`[data-player-area-id="${sourceId}"]`)
    const target = document.querySelector<HTMLElement>(`[data-player-control-id="${targetId}"]`)
    const probe = () => {
      const clone = document.querySelector<HTMLElement>('.card-flight-clone')
      const card = source?.querySelector<HTMLElement>('.hand [data-hand-card-id="spark"]')
      const cloneRect = clone?.getBoundingClientRect()
      const targetRect = target?.getBoundingClientRect()
      tracked.allyDeckTimeline.push({
        clone: !!clone,
        handVisible: !!card && getComputedStyle(card).visibility !== 'hidden',
        distance: cloneRect && targetRect
          ? Math.hypot(
            cloneRect.x + cloneRect.width / 2 - targetRect.x - targetRect.width / 2,
            cloneRect.y + cloneRect.height / 2 - targetRect.y - targetRect.height / 2,
          )
          : null,
        duration: clone
          ? Math.max(...clone.getAnimations().map(animation =>
            Number((animation.effect as KeyframeEffect | null)?.getTiming().duration ?? 0)))
          : null,
      })
      if (tracked.allyDeckTimeline.length < 200) requestAnimationFrame(probe)
    }
    requestAnimationFrame(probe)
  }, { sourceId: playerId, targetId: allyId })

  await page.locator('.hand .pending-board-card').click()
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const timeline = await page.evaluate(() =>
    (window as typeof window & {
      allyDeckTimeline: Array<{ clone: boolean; handVisible: boolean; distance: number | null; duration: number | null }>
    }).allyDeckTimeline)
  const firstClone = timeline.findIndex(frame => frame.clone)
  const firstHandHidden = timeline.findIndex(frame => !frame.handVisible)
  expect(Math.max(...timeline.map(frame => frame.duration ?? 0))).toBe(700)
  expect(firstClone).toBeGreaterThanOrEqual(0)
  expect(Math.min(...timeline.map(frame => frame.distance ?? Number.POSITIVE_INFINITY))).toBeLessThan(30)
  expect(timeline[firstHandHidden]?.clone).toBe(true)
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const resolvedState = JSON.parse(await stateField.inputValue())
  expect(resolvedState.game.players.find((player: { id: string }) => player.id === allyId).deck)
    .toEqual(['spark', 'crystal'])
})

test('buying a supply card animates it into the top of the discard pile', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --card-flight-duration: 900ms; }' })
  await applyMainPhaseState(page, (game, player) => {
    game.market.piles[0] = { cardId: 'phosphor_nugget', remaining: 7 }
    player.bonusAether = 50
    player.regularAetherSpent = 0
    player.conditionalAetherEarned = {}
    player.condAetherSpent = {}
  })

  const supply = page.locator('.market-grid [data-supply-card-id="phosphor_nugget"]').first()
  const cardId = await supply.getAttribute('data-supply-card-id')
  expect(cardId).toBeTruthy()
  await supply.click()

  const flight = page.locator('.card-flight-clone')
  await expect(flight).toBeVisible()
  await expect(flight).not.toHaveClass(/can-buy|develop-action-available/)
  await expect(flight.locator('.remaining, .develop-cost-badge')).toHaveCount(0)
  const destination = page.locator(`.player-discard-pile [data-discard-top-card="${cardId}"]`)
  await expect(destination).toBeVisible()
  await expect(page.locator('.player-discard-pile')).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(destination).toBeVisible()
})

test('Discard Phase waits for each card flight before advancing the turn', async ({ page }) => {
  await startCleanGame(page)
  await page.addStyleTag({ content: ':root { --discard-phase-flight-duration: 1200ms; }' })
  await applyMainPhaseState(page, (_game, player) => {
    player.hand = []
    player.playedThisTurn = ['crystal', 'spark', 'emerald_shard']
    player.discard = ['vriswood_amber']
  })

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  await expect(page.locator('.controls .phase')).toHaveText('Discard Phase · Card Order')
  const playedHeading = page.locator('.played-zone-heading-played')
  const firstPlayedCard = page.locator('.played-zone-center [data-discard-phase-card-index="0"]')
  await firstPlayedCard.hover()
  const headingLayout = await page.evaluate(() => {
    const heading = document.querySelector('.played-zone-heading-played')!
    const zone = document.querySelector('.played-zone-center')!
    return {
      headingTop: heading.getBoundingClientRect().top,
      zoneTop: zone.getBoundingClientRect().top,
      headingLayer: Number.parseInt(getComputedStyle(heading.parentElement!).zIndex, 10),
      hoveredZoneLayer: Number.parseInt(getComputedStyle(zone).zIndex, 10),
    }
  })
  await expect(playedHeading).toBeVisible()
  expect(headingLayout.headingTop - headingLayout.zoneTop).toBeCloseTo(5, 0)
  expect(headingLayout.headingLayer).toBeGreaterThan(headingLayout.hoveredZoneLayer)
  const previousTop = page.locator('.player-discard-pile [data-discard-top-card="vriswood_amber"]')
  await expect(previousTop).toBeVisible()
  await firstPlayedCard.click()

  const crystalDestination = page.locator('.player-discard-pile [data-discard-top-card="crystal"]')
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(previousTop).toBeVisible()
  await expect(crystalDestination).toHaveCount(0)
  await expect(page.locator('.controls .phase')).toHaveText('Discard Phase · Card Order')
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(crystalDestination).toBeVisible()
  await expect(page.locator('.controls .phase')).toHaveText('Discard Phase · Card Order')
  await page.locator('.played-zone-center [data-discard-phase-card-index="0"]').click()
  await expect(page.locator('.card-flight-clone')).toBeVisible()
  await expect(crystalDestination).toBeVisible()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.controls .phase')).not.toHaveText('Discard Phase · Card Order')

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const resolved = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  expect(resolved.game.players[0].discard).toEqual(expect.arrayContaining(['crystal', 'spark', 'emerald_shard', 'vriswood_amber']))
})


test('Undo after the next Mage starts returns to the beginning of Discard Phase', async ({ page }) => {
  await startCleanGame(page)
  await applyMainPhaseState(page, (game, player) => {
    player.hand = []
    player.playedThisTurn = ['crystal', 'spark', 'emerald_shard']
    player.pendingEndTurnCardIds = []
    player.discard = ['vriswood_amber']
    game.turnOrderDiscard = [player.id]
    game.turnOrderDeck = [game.players[1].id, 'nemesis', player.id]
  })

  await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  const discardPhase = page.getByText('Discard Phase · Card Order', { exact: true })
  if (await page.getByText('Actions remain. End turn anyway?', { exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'End Turn', exact: true }).click()
  }
  await expect(discardPhase).toBeVisible()

  await page.locator('.played-zone-center [data-discard-phase-card-index="0"]').click()
  await page.locator('.played-zone-center [data-discard-phase-card-index="0"]').click()
  await expect(page.locator('.controls .phase')).not.toHaveText('Discard Phase · Card Order')
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const nextTurn = JSON.parse(await stateField.inputValue())
  expect(nextTurn.game.currentTurn).toBe(nextTurn.game.players[1].id)
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.keyboard.press('Control+z')
  await expect(discardPhase).toBeVisible()
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const undone = JSON.parse(await page.locator('.debug-panel textarea').inputValue())
  expect(undone.phase).toBe('discard_order')
  expect(undone.discardRemaining).toEqual(['crystal', 'spark', 'emerald_shard'])
  expect(undone.game.players[0].playedThisTurn).toEqual(['crystal', 'spark', 'emerald_shard'])
  expect(undone.game.players[0].discard).toEqual(['vriswood_amber'])
})
