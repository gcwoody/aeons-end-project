import type { CardMoveEvent, GameState } from '@engine/types'

export interface CardPileCountOverride {
  count: number
  motionId: number
}

export type CardPileCountOverrides = Record<string, CardPileCountOverride>

export interface CardPileMotionRoute {
  instanceId: string
  cardId: string
  sourceZoneId?: string
  destinationZoneId?: string
}

export interface CardPileMotionDisplayAccess {
  get(): CardPileCountOverrides
  set(value: CardPileCountOverrides): void
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

/** Read the final card counts for every stable rule-side pile address. */
export function captureCardPileCounts(game: GameState): Record<string, number> {
  const counts: Record<string, number> = {}
  const add = (zoneId: string, cards: readonly unknown[] | undefined) => {
    counts[zoneId] = cards?.length ?? 0
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
      counts[`player:${player.id}:breach:${breach.index}:attached`] = breach.attachedRelic ? 1 : 0
    }
  }
  add('shared:develop', game.developZone)
  add('nemesis:nemesis_deck', game.nemesis.deck)
  add('nemesis:nemesis_discard', game.nemesis.discard)
  add('nemesis:corruption_deck', game.nemesis.corruptionDeck)
  add('nemesis:strike_deck', game.nemesis.strikeDeck)
  add('nemesis:strike_discard', game.nemesis.strikeDiscard)
  add('nemesis:trinket_deck', game.trinketDeck)
  add('nemesis:play_area', game.nemesis.playArea)
  add('nemesis:set_aside', game.nemesis.setAsideCards)
  for (const card of game.nemesis.playArea) {
    add(`nemesis:minion:${card.placedAt}:under`, card.underCards)
  }
  if (game.pendingEffect?.conjuredCard) {
    counts[`temporary:conjure:${game.pendingEffect.conjuredCard.playerId}`] = 1
  }
  if (game.nemesisResolution?.drawnCardId) counts['temporary:nemesis_draw'] = 1
  game.market.piles.forEach((pile, index) => {
    counts[`supply:${index}`] = Math.max(0, pile.remaining)
  })
  return counts
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
    return [{
      instanceId,
      cardId: last.cardId,
      ...(source ? { sourceZoneId: source.zoneId } : {}),
      ...(destinationZoneId ? { destinationZoneId } : {}),
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

/**
 * Holds pile counts at their pre-action values and advances each count at the
 * matching card-flight boundary. Non-animated movements settle immediately.
 */
export function createCardPileMotionDisplaySession(
  access: CardPileMotionDisplayAccess,
  events: readonly CardMoveEvent[],
  finalCounts: Readonly<Record<string, number>>,
  animatedInstanceIds: ReadonlySet<string>,
  extraRoutes: readonly CardPileMotionRoute[] = [],
): CardPileMotionDisplaySession {
  const motionId = ++nextMotionId
  const flows = routeFlows(events, extraRoutes)
  const flowsByInstance = new Map(flows.map(flow => [flow.instanceId, flow]))
  const affectedZones = new Set<string>()
  const netDelta = new Map<string, number>()
  const projected = new Map<string, number>()
  const appliedDeparture = new Set<string>()
  const appliedArrival = new Set<string>()

  const adjustDelta = (zoneId: string | undefined, amount: number) => {
    if (!zoneId || finalCounts[zoneId] === undefined) return
    affectedZones.add(zoneId)
    netDelta.set(zoneId, (netDelta.get(zoneId) ?? 0) + amount)
  }
  for (const flow of flows) {
    if (flow.sourceZoneId === flow.destinationZoneId) continue
    adjustDelta(flow.sourceZoneId, -1)
    adjustDelta(flow.destinationZoneId, 1)
  }
  for (const zoneId of affectedZones) {
    projected.set(zoneId, Math.max(0, (finalCounts[zoneId] ?? 0) - (netDelta.get(zoneId) ?? 0)))
  }

  const publish = () => {
    const overrides = { ...access.get() }
    for (const zoneId of affectedZones) {
      const count = projected.get(zoneId)
      if (count === undefined) continue
      overrides[zoneId] = { count, motionId }
    }
    access.set(overrides)
  }
  const change = (zoneId: string | undefined, amount: number) => {
    if (!zoneId || !affectedZones.has(zoneId)) return
    projected.set(zoneId, Math.max(0, (projected.get(zoneId) ?? 0) + amount))
    publish()
  }

  // Movements without a visible flight should not hold a pile at its old count.
  for (const flow of flows) {
    if (animatedInstanceIds.has(flow.instanceId) || flow.sourceZoneId === flow.destinationZoneId) continue
    change(flow.sourceZoneId, -1)
    change(flow.destinationZoneId, 1)
  }
  publish()

  return {
    depart(instanceId) {
      if (appliedDeparture.has(instanceId)) return
      appliedDeparture.add(instanceId)
      change(flowsByInstance.get(instanceId)?.sourceZoneId, -1)
    },
    arrive(instanceId) {
      if (appliedArrival.has(instanceId)) return
      appliedArrival.add(instanceId)
      change(flowsByInstance.get(instanceId)?.destinationZoneId, 1)
    },
    finish() {
      const overrides = { ...access.get() }
      for (const zoneId of affectedZones) {
        if (overrides[zoneId]?.motionId === motionId) delete overrides[zoneId]
      }
      access.set(overrides)
    },
  }
}
