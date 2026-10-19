import { expect, test, type Page } from '@playwright/test'
import { ALL_NEMESIS_CARDS, createTwoPlayerScenario } from '../../aeons-end-engine/src/data'
import { createGame, resolveEffects } from '../../aeons-end-engine/src/engine'
import { getPlayerCardInstanceZone } from '../../aeons-end-engine/src/engine/card-movement'
import type { GameState, NemesisCardDef } from '../../aeons-end-engine/src/types'

function saveFor(game: GameState) {
  return {
    id: 'destroy-motion', name: 'Destroy motion', players: game.players.map(p => p.mageType),
    nemesisType: game.nemesis.definitionId, round: game.round, turn: game.timestamp,
    currentTurn: game.currentTurn, createdAt: 1, updatedAt: 1,
    game, phase: 'main', selectedPlayer: game.players[0]!.id,
    discardRemaining: [], undoStack: [] as unknown[],
  }
}

function gatherDarknessSave(targetIndex = 0) {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[targetIndex]!
  game.currentTurn = game.players[0]!.id
  game.currentPhase = 'main'
  game.nemesis.counters.fury = 0
  player.hand = ['crystal']
  player.deck = ['spark', 'ignite']
  player.discard = ['jade', 'crystal', 'spark']
  player.destroyedCards = []
  for (const zone of ['hand', 'deck', 'discard', 'destroyed'] as const) getPlayerCardInstanceZone(game, player.id, zone)
  const card = ALL_NEMESIS_CARDS.gather_darkness as NemesisCardDef
  resolveEffects(game, undefined,
    card.nemesisEffects!.find(block => block.trigger === 'immediately')!.effects, card.id)
  return saveFor(game)
}

async function resume(page: Page, save: ReturnType<typeof saveFor>) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(saved => {
    localStorage.setItem('aeons-end-saves-v3', JSON.stringify([saved]))
  }, save)
  await page.goto('/')
  await page.getByRole('button', { name: 'Resume Game', exact: true }).click()
}

async function observeFlights(page: Page) {
  await page.evaluate(() => {
    const frames: Array<Record<string, unknown>> = []
    ;(window as any).destroyMotionFrames = frames
    const state = () => {
      const game = JSON.parse(localStorage.getItem('aeons-end-saves-v3')!)[0].game
      return {
        fury: game.nemesis.counters.fury,
        destroyed: Number(document.querySelector<HTMLElement>('[data-destroyed-card-count]')?.dataset.destroyedCardCount),
        deck: Number(document.querySelector('[data-card-flight-target="deck"] .player-pile-count')?.textContent ?? 0),
        active: document.querySelectorAll('.card-flight-clone').length,
      }
    }
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('card-flight-clone')) {
            frames.push({ event: 'start', from: node.dataset.cardMotionSourceZone,
              to: node.dataset.cardMotionDestinationZone, flip: !!node.querySelector('.card-flight-flip-face'), ...state() })
          }
        }
        for (const node of record.removedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('card-flight-clone')) {
            frames.push({ event: 'end', to: node.dataset.cardMotionDestinationZone, ...state() })
          }
        }
      }
    }).observe(document.body, { childList: true })
  })
}

for (const [targetIndex, mageName] of [[0, 'Jian'], [1, 'Brama']] as const) {
test(`Gather Darkness transfers and flips ${mageName}'s discard stack, destroys four cards serially, then unleashes`, async ({ page }) => {
  await resume(page, gatherDarknessSave(targetIndex))
  await observeFlights(page)
  await page.locator('.player-target-option').filter({ hasText: mageName }).click()
  await expect.poll(() => page.evaluate(() =>
    (window as any).destroyMotionFrames.filter((frame: any) => frame.event === 'end').length)).toBe(5)
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  const frames = await page.evaluate(() => (window as any).destroyMotionFrames)
  const starts = frames.filter((frame: any) => frame.event === 'start')
  expect(starts.map((frame: any) => [frame.from, frame.to])).toEqual([
    ['discard', 'deck'], ['deck', 'destroyed'], ['deck', 'destroyed'],
    ['deck', 'destroyed'], ['deck', 'destroyed'],
  ])
  expect(starts[0].flip).toBe(true)
  expect(starts.map((frame: any) => frame.destroyed)).toEqual([0, 0, 1, 2, 3])
  expect(starts.map((frame: any) => frame.deck)).toEqual([2, 4, 3, 2, 1])
  expect(starts.every((frame: any) => frame.active === 1 && frame.fury === 0)).toBe(true)
  const final = await page.evaluate(() => JSON.parse(localStorage.getItem('aeons-end-saves-v3')!)[0].game)
  expect(final.players[targetIndex].destroyedCards).toHaveLength(4)
  expect(final.nemesis.counters.fury).toBe(2)
  await page.screenshot({ path: `test-results/gather-darkness-${mageName}-destroy-complete.png` })
})
}

for (const during of ['discard transfer', 'second destruction']) {
test(`undo during ${during} cancels later destruction and unleash`, async ({ page }) => {
  await resume(page, gatherDarknessSave())
  if (during === 'second destruction') {
    await page.addStyleTag({ content: ':root { --destroy-card-flight-duration: 1000ms; }' })
  }
  await page.locator('.player-target-option').filter({ hasText: 'Jian' }).click()
  if (during === 'discard transfer') {
    await expect(page.locator('.card-flight-clone[data-card-motion-destination-zone="deck"]')).toBeVisible()
  } else {
    await page.waitForFunction(() =>
      document.querySelector<HTMLElement>('[data-destroyed-card-count]')?.dataset.destroyedCardCount === '1' &&
      !!document.querySelector('.card-flight-clone[data-card-motion-destination-zone="destroyed"]'))
  }
  await page.keyboard.press('Control+z')
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
  await expect(page.locator('.player-target-option').filter({ hasText: 'Jian' })).toBeVisible()
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('aeons-end-saves-v3')!)[0].game)
  expect(restored.players[0].deck).toHaveLength(2)
  expect(restored.players[0].discard).toHaveLength(3)
  expect(restored.players[0].destroyedCards).toHaveLength(0)
  expect(restored.nemesis.counters.fury).toBe(0)
})
}

test('resumed games retain fifty undo snapshots and discard older ones', async ({ page }) => {
  const save = gatherDarknessSave()
  save.game.pendingDecision = null
  save.game.pendingEffect = null
  save.undoStack = Array.from({ length: 55 }, (_, index) => {
    const game = JSON.parse(JSON.stringify(save.game))
    game.gravehold.hp = index + 1
    return { game, phase: 'main', prepTarget: null, selectedPlayer: save.selectedPlayer, discardRemaining: [] }
  })
  await resume(page, save)
  for (let index = 0; index < 50; index++) await page.keyboard.press('Control+z')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aeons-end-saves-v3')!)[0].game.gravehold.hp)).toBe(6)
  await page.keyboard.press('Control+z')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aeons-end-saves-v3')!)[0].game.gravehold.hp)).toBe(6)
})

for (const relic of ['focusing_orb', 'bottled_vortex']) {
test(`${relic} flies from its hand position into trash even when later decisions remain`, async ({ page }) => {
  const save = gatherDarknessSave()
  save.game.pendingDecision = null
  save.game.pendingEffect = null
  save.game.players[0]!.hand = [relic, 'crystal']
  save.game.gravehold.hp = 20
  getPlayerCardInstanceZone(save.game, save.selectedPlayer, 'hand')
  await resume(page, save)
  await observeFlights(page)
  await page.locator(`.hand [data-hand-card-id="${relic}"]`).click()
  if (relic === 'focusing_orb') {
    await page.getByRole('button', { name: 'Destroy this to let Gravehold gain 3 life', exact: true }).click()
  }
  await expect(page.locator('.card-flight-clone[data-card-motion-destination-zone="destroyed"]')).toBeVisible()
  await expect(page.locator('[data-destroyed-card-count]')).toHaveAttribute('data-destroyed-card-count', '0')
  await expect(page.locator('.card-motion-shield')).toBeHidden()
  await expect(page.locator('[data-destroyed-card-count]')).toHaveAttribute('data-destroyed-card-count', '1')
  const starts = await page.evaluate(() => (window as any).destroyMotionFrames.filter((frame: any) => frame.event === 'start'))
  expect(starts).toHaveLength(1)
  expect(starts[0].to).toBe('destroyed')
})
}

test('a deck card selected in a decision window is destroyed from the real deck, not the modal copy', async ({ page }) => {
  const save = gatherDarknessSave()
  save.game.pendingDecision = null
  save.game.pendingEffect = null
  resolveEffects(save.game, save.selectedPlayer, [{ kind: 'look_at_top_card_may_destroy' }])
  await resume(page, save)
  await observeFlights(page)
  await page.locator('[data-card-selection-key="deck:0:spark"]').click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect.poll(() => page.evaluate(() =>
    (window as any).destroyMotionFrames.filter((frame: any) => frame.event === 'end').length)).toBe(1)
  const frames = await page.evaluate(() => (window as any).destroyMotionFrames)
  expect(frames[0]).toMatchObject({ from: 'deck', to: 'destroyed', destroyed: 0, flip: true })
  await expect(page.locator('[data-destroyed-card-count]')).toHaveAttribute('data-destroyed-card-count', '1')
})

test('all visible physical card zones share the destroy route while modal copies stay excluded', async ({ page }) => {
  await page.goto('/')
  const routes = await page.evaluate(async () => {
    const { captureCardZoneMotion } = await import('/src/game/card-flight.ts')
    const { discardCardZoneMotion, resolveCardZoneMotionFromEvents } = await import('/src/game/card-zone-motion.ts')
    const root = document.createElement('div')
    const zones = ['hand', 'deck', 'discard', 'played_this_turn', 'swap_zone', 'specific_deck',
      'player_cards_in_play', 'breach', 'develop', 'strike_deck']
    zones.forEach((zone, index) => {
      const source = document.createElement('div')
      source.dataset.cardMotionZone = zone === 'played_this_turn' ? 'played' : zone === 'swap_zone' ? 'swap' : zone
      source.dataset.cardMotionCardId = 'crystal'
      source.dataset.cardMotionOwnerId = 'p1'
      source.dataset.cardMotionKey = `source-${index}`
      source.dataset.cardInstanceId = `copy-${index}`
      source.style.cssText = `position:fixed;left:${index * 80}px;top:20px;width:64px;height:88px`
      source.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
      root.append(source)
      if (zone === 'discard') {
        const modal = source.cloneNode(true) as HTMLElement
        modal.dataset.cardMotionKey = 'decision-discard:0:crystal'
        modal.dataset.cardMotionSuppressFlight = 'true'
        root.append(modal)
      }
    })
    const trash = document.createElement('button')
    trash.dataset.cardFlightTarget = 'destroyed'
    root.append(trash)
    document.body.append(root)
    const snapshot = captureCardZoneMotion(root)
    const events = zones.map((zone, index) => ({
      kind: 'destroy', reason: 'destroy', transactionId: 'destroy-all-zones', eventId: `event-${index}`,
      sequence: index, instanceId: `copy-${index}`, cardId: 'crystal',
      source: { zoneId: `player:p1:${zone}`, zone, ownerId: 'p1', index: 0 },
    }))
    const transfers = resolveCardZoneMotionFromEvents(snapshot, events as never, root).transfers
    const result = transfers.map(transfer => ({ from: transfer.sourceZone, to: transfer.destinationZone,
      fromModal: transfer.sourceKey.startsWith('decision-'), hasFlight: !!transfer.flight }))
    discardCardZoneMotion(snapshot)
    root.remove()
    return result
  })
  expect(routes).toHaveLength(10)
  expect(routes.every(route => route.to === 'destroyed' && route.hasFlight && !route.fromModal)).toBe(true)
})

test('Gallery demonstrates serial destruction with an arrival-based trash count', async ({ page }) => {
  await page.goto('/?ui-gallery=1')
  const gallery = page.locator('[data-component="Hand.Motion"]')
  await gallery.getByRole('button', { name: 'Destroy three', exact: true }).click()
  await expect(gallery.getByRole('button', { name: 'Destroyed cards: 3', exact: true })).toBeVisible()
  await expect(gallery.locator('.hand-card-entry')).toHaveCount(2)
  await expect(page.locator('.card-flight-clone')).toHaveCount(0)
})

test('intermediate moves, recycled piles and newly gained cards retain a single real destroy origin', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { captureCardZoneMotion } = await import('/src/game/card-flight.ts')
    const { discardCardZoneMotion, resolveCardZoneMotionFromEvents } = await import('/src/game/card-zone-motion.ts')
    const root = document.createElement('div')
    for (const [index, zone] of ['hand', 'discard', 'supply', 'hand'].entries()) {
      const source = document.createElement('div')
      Object.assign(source.dataset, { cardMotionZone: zone, cardMotionCardId: 'crystal',
        cardMotionOwnerId: 'p1', cardMotionKey: zone === 'supply' ? 'supply:0' : `source-${index}`,
        cardInstanceId: zone === 'supply' ? '' : `copy-${index}` })
      source.style.cssText = `position:fixed;left:${index * 80}px;top:20px;width:64px;height:88px`
      source.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
      root.append(source)
    }
    const trash = document.createElement('button')
    trash.dataset.cardFlightTarget = 'destroyed'
    root.append(trash)
    document.body.append(root)
    const snapshot = captureCardZoneMotion(root)
    const address = (zone: string) => ({ zone, zoneId: zone === 'supply' ? 'supply:0' : `player:p1:${zone}`, ownerId: 'p1', index: 0 })
    const events = ['hand', 'discard', 'supply', 'hand'].flatMap((zone, index) => {
      const firstKind = index === 2 ? 'create' : index === 3 ? 'temporary' : 'move'
      const nextZone = index === 3 ? 'temporary' : 'deck'
      const first = { kind: firstKind, reason: index === 1 ? 'draw' : 'effect',
        transactionId: 'compound-destroy', eventId: `first-${index}`, moveId: `first-${index}`,
        sequence: index * 2, instanceId: `copy-${index}`, cardId: 'crystal',
        source: address(zone), destination: address(nextZone) }
      const last = { kind: 'destroy', reason: 'destroy', transactionId: 'compound-destroy',
        eventId: `last-${index}`, sequence: index * 2 + 1, instanceId: `copy-${index}`, cardId: 'crystal',
        source: address(nextZone) }
      return [first, last]
    })
    const transfers = resolveCardZoneMotionFromEvents(snapshot, events as never, root).transfers
    const result = transfers.map(transfer => [transfer.sourceZone, transfer.destinationZone])
    discardCardZoneMotion(snapshot)
    root.remove()
    return result
  })
  expect(result).toEqual([['hand', 'destroyed'], ['discard', 'destroyed'], ['supply', 'destroyed'], ['hand', 'destroyed']])
})
