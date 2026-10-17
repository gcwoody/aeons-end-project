import type { CardMoveEvent, GameState } from '@engine/types'

export interface CardPileDisplayOverride {
  count: number
  cardIds?: readonly string[]
  /** The front card currently represented by this pile, when its face is visible. */
  topCardId?: string | null
  motionId: number
}

export type CardPileDisplayOverrides = Record<string, CardPileDisplayOverride>

export interface CardPileMotionState {
  count: number
  /** Ordered card faces for piles whose displayed top card can change. */
  cardIds?: readonly string[]
}

export type CardPileMotionStates = Record<string, CardPileMotionState>

export interface CardPileMotionDisplayBaseline {
  counts: Readonly<Record<string, number>>
  cardIdsByZone: Readonly<Record<string, readonly string[]>>
  motionId: number
}

export interface CardPileMotionRoute {
  instanceId: string
  cardId: string
  sourceZoneId?: string
  destinationZoneId?: string
  sourceIndex?: number
  destinationIndex?: number
}

export interface CardPileMotionDisplayAccess {
  get(): CardPileDisplayOverrides
  set(value: CardPileDisplayOverrides): void
}

interface CardPileMotionFlow extends CardPileMotionRoute {}
type TrackedCardMoveEvent = Extract<CardMoveEvent, { kind: 'move' }>
  | Extract<CardMoveEvent, { kind: 'create' }>
  | Extract<CardMoveEvent, { kind: 'destroy' }>

export interface CardPileMotionDisplaySession {
  depart(instanceId: string): void
  arrive(instanceId: string): void
  finish(): void
}

let nextMotionId = 0

/** Capture card faces and counts for every rule-side pile before or after an action. */
export function captureCardPileMotionStates(game: GameState): CardPileMotionStates {
  const piles: CardPileMotionStates = {}
  const add = (zoneId: string, cardIds: readonly string[] | undefined) => {
    const cards = [...(cardIds ?? [])]
    piles[zoneId] = { count: cards.length, cardIds: cards }
  }
  const addCount = (zoneId: string, count: number) => {
    piles[zoneId] = { count: Math.max(0, count) }
  }

  for (const player of game.players) {
    add(`player:${player.id}:deck`, player.deck)
    add(`player:${player.id}:hand`, player.hand)
    add(`player:${player.id}:discard`, player.discard)
    add(`player:${player.id}:played_this_turn`, player.playedThisTurn)
    add(`player:${player.id}:swap_zone`, player.swapZone)
    add(`player:${player.id}:specific_deck`, player.specificDeck)
    add(`player:${player.id}:player_cards_in_play`, player.playerCardsInPlay)
    add(`player:${player.id}:destroyed`, player.destroyedCards)
    for (const breach of player.breaches) {
      add(`player:${player.id}:breach:${breach.index}`, breach.prepSpells)
      const attached = breach.attachedRelic ? [breach.attachedRelic.cardId] : []
      add(`player:${player.id}:breach:${breach.index}:attached`, attached)
    }
  }
  add('shared:develop', game.developZone)
  add('nemesis:nemesis_deck', game.nemesis.deck)
  add('nemesis:nemesis_discard', game.nemesis.discard)
  add('nemesis:corruption_deck', game.nemesis.corruptionDeck)
  add('nemesis:strike_deck', game.nemesis.strikeDeck)
  add('nemesis:strike_discard', game.nemesis.strikeDiscard)
  add('nemesis:trinket_deck', game.trinketDeck)
  add('nemesis:play_area', game.nemesis.playArea.map(card => card.cardId))
  add('nemesis:set_aside', game.nemesis.setAsideCards?.map(card => card.cardId))
  for (const card of game.nemesis.playArea) {
    add(`nemesis:minion:${card.placedAt}:under`, card.underCards)
  }
  if (game.pendingEffect?.conjuredCard) {
    add(`temporary:conjure:${game.pendingEffect.conjuredCard.playerId}`,
      [game.pendingEffect.conjuredCard.cardId])
  }
  if (game.nemesisResolution?.drawnCardId) add('temporary:nemesis_draw', [game.nemesisResolution.drawnCardId])
  game.market.piles.forEach((pile, index) => {
    // Supply art is fixed by the market slot; only its count changes.
    addCount(`supply:${index}`, pile.remaining)
  })
  return piles
}

/** Keep every displayed pile's count and visible top card at its action-start state. */
export function holdCardPileMotionDisplay(
  access: CardPileMotionDisplayAccess,
  game: GameState,
): CardPileMotionDisplayBaseline {
  const piles = captureCardPileMotionStates(game)
  const counts = Object.fromEntries(Object.entries(piles).map(([zoneId, pile]) => [zoneId, pile.count]))
  const cardIdsByZone = Object.fromEntries(Object.entries(piles)
    .flatMap(([zoneId, pile]) => pile.cardIds ? [[zoneId, [...pile.cardIds]]] : []))
  const motionId = ++nextMotionId
  const overrides = { ...access.get() }
  for (const [zoneId, pile] of Object.entries(piles)) {
    overrides[zoneId] = {
      count: pile.count,
      ...(pile.cardIds ? {
        cardIds: [...pile.cardIds],
        topCardId: pile.cardIds[0] ?? null,
      } : {}),
      motionId,
    }
  }
  access.set(overrides)
  return { counts, cardIdsByZone, motionId }
}

/** Release a pre-action hold when its action cannot reach a motion session. */
export function releaseCardPileMotionDisplayBaseline(
  access: CardPileMotionDisplayAccess,
  baseline: CardPileMotionDisplayBaseline,
): void {
  const overrides = { ...access.get() }
  for (const zoneId of Object.keys(baseline.counts)) {
    if (overrides[zoneId]?.motionId === baseline.motionId) delete overrides[zoneId]
  }
  access.set(overrides)
}

function normalizedFlows(events: readonly CardMoveEvent[]): CardPileMotionFlow[] {
  const byInstance = new Map<string, TrackedCardMoveEvent[]>()
  for (const event of events) {
    if (event.kind !== 'move' && event.kind !== 'create' && event.kind !== 'destroy') continue
    const flow = byInstance.get(event.instanceId) ?? []
    flow.push(event)
    byInstance.set(event.instanceId, flow)
  }
  return [...byInstance.entries()].flatMap(([instanceId, instanceEvents]) => {
    const ordered = [...instanceEvents].sort((left, right) => left.sequence - right.sequence)
    const first = ordered[0]!
    const last = ordered[ordered.length - 1]!
    const source = first.source
    const destinationZoneId = last.kind === 'destroy'
      ? last.source.ownerId ? `player:${last.source.ownerId}:destroyed` : undefined
      : last.destination.zoneId
    const destinationIndex = last.kind === 'destroy' ? undefined : last.destination.index
    return [{
      instanceId,
      cardId: last.cardId,
      ...(source ? { sourceZoneId: source.zoneId, sourceIndex: source.index } : {}),
      ...(destinationZoneId ? { destinationZoneId } : {}),
      ...(destinationIndex !== undefined ? { destinationIndex } : {}),
    }]
  })
}

function routeFlows(
  events: readonly CardMoveEvent[],
  extraRoutes: readonly CardPileMotionRoute[],
): CardPileMotionFlow[] {
  const flows = normalizedFlows(events)
  const knownInstances = new Set(flows.map(flow => flow.instanceId))
  for (const route of extraRoutes) {
    if (knownInstances.has(route.instanceId)) continue
    flows.push(route)
    knownInstances.add(route.instanceId)
  }
  return flows
}

function removeCardAt(cards: string[], index: number | undefined, cardId: string) {
  if (index !== undefined && cards[index] === cardId) {
    cards.splice(index, 1)
    return
  }
  const found = cards.indexOf(cardId)
  if (found >= 0) cards.splice(found, 1)
}

function insertCardAt(cards: string[], index: number | undefined, cardId: string) {
  const destinationIndex = index === undefined ? 0 : Math.max(0, Math.min(index, cards.length))
  cards.splice(destinationIndex, 0, cardId)
}

function reverseFlows(
  piles: Readonly<CardPileMotionStates>,
  flows: readonly CardPileMotionFlow[],
): Map<string, string[]> {
  const projected = new Map<string, string[]>()
  for (const [zoneId, pile] of Object.entries(piles)) {
    if (pile.cardIds) projected.set(zoneId, [...pile.cardIds])
  }
  for (const flow of [...flows].reverse()) {
    if (flow.sourceZoneId === flow.destinationZoneId) continue
    if (flow.destinationZoneId) {
      const destination = projected.get(flow.destinationZoneId)
      if (destination) removeCardAt(destination, flow.destinationIndex, flow.cardId)
    }
    if (flow.sourceZoneId) {
      const source = projected.get(flow.sourceZoneId)
      if (source) insertCardAt(source, flow.sourceIndex, flow.cardId)
    }
  }
  return projected
}

/**
 * Holds pile counts and visible top cards until their matching flights depart
 * and arrive. Piles without a visible flight settle immediately.
 */
export function createCardPileMotionDisplaySession(
  access: CardPileMotionDisplayAccess,
  events: readonly CardMoveEvent[],
  finalPiles: Readonly<CardPileMotionStates>,
  animatedInstanceIds: ReadonlySet<string>,
  extraRoutes: readonly CardPileMotionRoute[] = [],
  baseline?: CardPileMotionDisplayBaseline,
): CardPileMotionDisplaySession {
  const motionId = ++nextMotionId
  const flows = routeFlows(events, extraRoutes)
  const flowsByInstance = new Map(flows.map(flow => [flow.instanceId, flow]))
  const affectedZones = new Set<string>()
  const netDelta = new Map<string, number>()
  const projectedCounts = new Map<string, number>()
  const projectedCards = baseline
    ? new Map(Object.entries(baseline.cardIdsByZone).map(([zoneId, cards]) => [zoneId, [...cards]]))
    : reverseFlows(finalPiles, flows)
  const appliedDeparture = new Set<string>()
  const appliedArrival = new Set<string>()

  const adjustDelta = (zoneId: string | undefined, amount: number) => {
    if (!zoneId || (finalPiles[zoneId] === undefined && baseline?.counts[zoneId] === undefined)) return
    affectedZones.add(zoneId)
    netDelta.set(zoneId, (netDelta.get(zoneId) ?? 0) + amount)
  }
  for (const flow of flows) {
    if (flow.sourceZoneId === flow.destinationZoneId) continue
    adjustDelta(flow.sourceZoneId, -1)
    adjustDelta(flow.destinationZoneId, 1)
  }
  for (const zoneId of affectedZones) {
    const initialCount = baseline?.counts[zoneId] ??
      (finalPiles[zoneId]?.count ?? 0) - (netDelta.get(zoneId) ?? 0)
    projectedCounts.set(zoneId, Math.max(0, initialCount))
  }

  const publish = () => {
    const overrides = { ...access.get() }
    for (const zoneId of affectedZones) {
      const count = projectedCounts.get(zoneId)
      if (count === undefined) continue
      const cards = projectedCards.get(zoneId)
      overrides[zoneId] = {
        count,
        ...(cards ? {
          cardIds: [...cards],
          topCardId: cards[0] ?? null,
        } : {}),
        motionId,
      }
    }
    if (baseline) {
      for (const zoneId of Object.keys(baseline.counts)) {
        if (!affectedZones.has(zoneId) && overrides[zoneId]?.motionId === baseline.motionId) {
          delete overrides[zoneId]
        }
      }
    }
    access.set(overrides)
  }
  const removeFromPile = (zoneId: string | undefined, index: number | undefined, cardId: string) => {
    if (!zoneId) return
    const cards = projectedCards.get(zoneId)
    if (cards) removeCardAt(cards, index, cardId)
  }
  const addToPile = (zoneId: string | undefined, index: number | undefined, cardId: string) => {
    if (!zoneId) return
    const cards = projectedCards.get(zoneId)
    if (cards) insertCardAt(cards, index, cardId)
  }
  const departFlow = (flow: CardPileMotionFlow) => {
    if (flow.sourceZoneId === flow.destinationZoneId) return
    if (flow.sourceZoneId && affectedZones.has(flow.sourceZoneId)) {
      projectedCounts.set(flow.sourceZoneId,
        Math.max(0, (projectedCounts.get(flow.sourceZoneId) ?? 0) - 1))
    }
    removeFromPile(flow.sourceZoneId, flow.sourceIndex, flow.cardId)
    publish()
  }
  const arriveFlow = (flow: CardPileMotionFlow) => {
    if (flow.sourceZoneId === flow.destinationZoneId) return
    addToPile(flow.destinationZoneId, flow.destinationIndex, flow.cardId)
    if (flow.destinationZoneId && affectedZones.has(flow.destinationZoneId)) {
      projectedCounts.set(flow.destinationZoneId,
        (projectedCounts.get(flow.destinationZoneId) ?? 0) + 1)
    }
    publish()
  }
  const settleFlowImmediately = (flow: CardPileMotionFlow) => {
    if (flow.sourceZoneId === flow.destinationZoneId) return
    if (flow.sourceZoneId && affectedZones.has(flow.sourceZoneId)) {
      projectedCounts.set(flow.sourceZoneId,
        Math.max(0, (projectedCounts.get(flow.sourceZoneId) ?? 0) - 1))
    }
    removeFromPile(flow.sourceZoneId, flow.sourceIndex, flow.cardId)
    addToPile(flow.destinationZoneId, flow.destinationIndex, flow.cardId)
    if (flow.destinationZoneId && affectedZones.has(flow.destinationZoneId)) {
      projectedCounts.set(flow.destinationZoneId,
        (projectedCounts.get(flow.destinationZoneId) ?? 0) + 1)
    }
    publish()
  }

  // Movements without a visible flight should not wait for an animation boundary.
  for (const flow of flows) {
    if (animatedInstanceIds.has(flow.instanceId)) continue
    settleFlowImmediately(flow)
  }
  publish()

  return {
    depart(instanceId) {
      if (appliedDeparture.has(instanceId)) return
      appliedDeparture.add(instanceId)
      const flow = flowsByInstance.get(instanceId)
      if (flow) departFlow(flow)
    },
    arrive(instanceId) {
      if (appliedArrival.has(instanceId)) return
      appliedArrival.add(instanceId)
      const flow = flowsByInstance.get(instanceId)
      if (flow) arriveFlow(flow)
    },
    finish() {
      const overrides = { ...access.get() }
      for (const zoneId of affectedZones) {
        if (overrides[zoneId]?.motionId === motionId) delete overrides[zoneId]
      }
      if (baseline) {
        for (const zoneId of Object.keys(baseline.counts)) {
          if (overrides[zoneId]?.motionId === baseline.motionId) delete overrides[zoneId]
        }
      }
      access.set(overrides)
    },
  }
}
