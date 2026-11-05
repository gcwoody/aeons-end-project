import type { CardMoveEvent, PlayerId, PlayerState } from '@engine/types'
import type { CardZoneMotionSnapshot } from './card-flight'
import type { CardZoneMotionTransfer } from './card-zone-motion'
import type { DiscardPileDisplayValue } from './card-motion-display'

export interface PlayerZoneMotionBaseline {
  id: PlayerId
  swapZone: string[]
  swapZoneInstanceIds: string[]
  discard: string[]
  discardInstanceIds: string[]
}

export interface SwapZoneDisplayHold {
  cardId: string
  instanceId: string
  index: number
  motionKey: string
  survivorKeys: string[]
  departing: boolean
}

export interface SwapZoneCardKeys {
  cardIds: string[]
  motionKeys: string[]
}

interface BoardDiscardDisplayHold {
  playerId: PlayerId
  previous: DiscardPileDisplayValue | undefined
  current: DiscardPileDisplayValue
  previousSwap: SwapZoneDisplayHold | undefined
  currentSwap: SwapZoneDisplayHold | undefined
}

export interface CardMotionBoardDisplayAccess {
  getDiscard(): Partial<Record<PlayerId, DiscardPileDisplayValue>>
  setDiscard(value: Partial<Record<PlayerId, DiscardPileDisplayValue>>): void
  getSwapHolds(): Partial<Record<PlayerId, SwapZoneDisplayHold>>
  setSwapHolds(value: Partial<Record<PlayerId, SwapZoneDisplayHold>>): void
  getSwapCardKeys(): Partial<Record<PlayerId, SwapZoneCardKeys>>
  setSwapCardKeys(value: Partial<Record<PlayerId, SwapZoneCardKeys>>): void
}

type HoldFlightAtOrigin = (flight: NonNullable<CardZoneMotionSnapshot['cards'][number]['flight']>) => void

/** Keeps player piles visually stable while board cards arrive or depart. */
export function createCardMotionBoardDisplay(
  access: CardMotionBoardDisplayAccess,
  holdFlightAtOrigin: HoldFlightAtOrigin,
  waitForRender: () => Promise<unknown>,
) {
  const holdsByMotion = new WeakMap<CardZoneMotionSnapshot, Map<PlayerId, BoardDiscardDisplayHold>>()

  function holdsFor(snapshot: CardZoneMotionSnapshot) {
    const holds = holdsByMotion.get(snapshot) ?? new Map<PlayerId, BoardDiscardDisplayHold>()
    holdsByMotion.set(snapshot, holds)
    return holds
  }

  function holdSwapCardsMovingToDiscard(
    snapshot: CardZoneMotionSnapshot,
    before: readonly PlayerZoneMotionBaseline[],
    after: readonly PlayerState[],
    events: readonly CardMoveEvent[],
  ) {
    const departures = events.filter((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
      event.kind === 'move' && event.reason === 'swap' &&
      event.source.zone === 'swap_zone' && event.destination.zone === 'discard')
    for (const prior of before) {
      const player = after.find(candidate => candidate.id === prior.id)
      if (!player) continue
      for (const event of departures.filter(candidate => candidate.source.ownerId === player.id)) {
        const origin = snapshot.cards.find(card => card.instanceId === event.instanceId && card.flight)
        if (!origin) continue
        if (player.discard[0] !== event.cardId) {
          holdFlightAtOrigin(origin.flight!)
          continue
        }
        const holds = holdsFor(snapshot)
        const existing = holds.get(player.id)
        if (existing?.current.boardArrival?.cardId === event.cardId &&
          existing.current.boardArrival.count === player.discard.length) continue
        const previous = existing ? existing.previous : access.getDiscard()[player.id]
        // A card returning from discard to Swap is already leaving the pile;
        // keep it out of the temporary surface shown before this arrival.
        const returnedFromDiscardIds = new Set(events.flatMap(candidate =>
          candidate.kind === 'move' && candidate.source.zone === 'discard' &&
            candidate.destination.zone === 'swap_zone' && candidate.source.ownerId === player.id
            ? [candidate.instanceId] : []))
        const displayIndex = prior.discardInstanceIds.findIndex(instanceId =>
          !returnedFromDiscardIds.has(instanceId))
        const current: DiscardPileDisplayValue = {
          cardId: displayIndex >= 0 ? prior.discard[displayIndex] ?? null : null,
          count: prior.discard.length - returnedFromDiscardIds.size,
          boardArrival: {
            cardId: event.cardId,
            count: player.discard.length,
            instanceId: event.instanceId,
            sourceZone: 'swap',
          },
        }
        const previousSwap = existing ? existing.previousSwap : access.getSwapHolds()[player.id]
        const oldSwapCards = snapshot.cards.filter(card => card.zone === 'swap' && card.ownerId === player.id)
        const availableKeys = oldSwapCards.filter(card => card.instanceId !== origin.instanceId)
        const survivorKeys = (player.swapZoneInstanceIds ?? []).map((instanceId, index) => {
          const priorIndex = availableKeys.findIndex(card => card.instanceId === instanceId)
          if (priorIndex >= 0) return availableKeys.splice(priorIndex, 1)[0]!.key
          return `${origin.key}:arrival:${index}`
        })
        const currentSwap: SwapZoneDisplayHold = {
          cardId: event.cardId,
          instanceId: event.instanceId,
          index: oldSwapCards.findIndex(card => card.key === origin.key),
          motionKey: origin.key,
          survivorKeys,
          departing: false,
        }
        holds.set(player.id, { playerId: player.id, previous, current, previousSwap, currentSwap })
        access.setDiscard({ ...access.getDiscard(), [player.id]: current })
        access.setSwapHolds({ ...access.getSwapHolds(), [player.id]: currentSwap })
        access.setSwapCardKeys({
          ...access.getSwapCardKeys(),
          [player.id]: { cardIds: [...(player.swapZone ?? [])], motionKeys: survivorKeys },
        })
      }
    }
  }

  function holdPlayerCardsMovingToDiscard(
    snapshot: CardZoneMotionSnapshot,
    before: readonly PlayerZoneMotionBaseline[],
    after: readonly PlayerState[],
    events: readonly CardMoveEvent[],
    route: 'develop' | 'board',
  ) {
    const arrivals = events.filter((event): event is Extract<CardMoveEvent, { kind: 'move' }> => {
      if (event.kind !== 'move' || event.destination.zone !== 'discard') return false
      return route === 'develop'
        ? event.reason === 'develop' && event.source.zone === 'develop'
        : event.source.zone !== 'discard' &&
          (event.source.zone === 'breach' || event.source.zone === 'played_this_turn') &&
          event.reason !== 'discard_phase'
    })
    for (const prior of before) {
      const player = after.find(candidate => candidate.id === prior.id)
      if (!player) continue
      for (const event of arrivals.filter(candidate => candidate.destination.ownerId === player.id)) {
        const chain = events.filter(candidate =>
          candidate.kind === 'move' && candidate.instanceId === event.instanceId)
        const finalMove = chain.at(-1)
        if (finalMove?.kind !== 'move' || finalMove.destination.zone !== 'discard') continue
        const origin = snapshot.cards.find(card => card.instanceId === event.instanceId &&
          (route === 'develop' || card.zone === (event.source.zone === 'played_this_turn' ? 'played' : 'breach')))

        // The discard surface must show its incoming top card even when the
        // source could not be captured for a flight. Otherwise the pile-count
        // projection can keep the old empty pile visible during a pending
        // decision, making a card that is already in discard appear missing.
        const discardInstanceIds = player.discardInstanceIds ?? []
        const arrivalIndex = discardInstanceIds.indexOf(event.instanceId)
        const isTopArrival = arrivalIndex === 0 ||
          (arrivalIndex < 0 && player.discard[0] === event.cardId)
        if (!isTopArrival) {
          if (origin?.flight) holdFlightAtOrigin(origin.flight)
          continue
        }

        const holds = holdsFor(snapshot)
        const existing = holds.get(player.id)
        const current: DiscardPileDisplayValue = {
          cardId: prior.discard[0] ?? null,
          count: prior.discard.length,
          boardArrival: {
            cardId: event.cardId,
            count: player.discard.length,
            instanceId: event.instanceId,
            sourceZone: route === 'develop'
              ? 'develop'
              : event.source.zone === 'played_this_turn' ? 'played' : 'breach',
          },
        }
        holds.set(player.id, {
          playerId: player.id,
          previous: existing ? existing.previous : access.getDiscard()[player.id],
          current,
          previousSwap: existing?.previousSwap,
          currentSwap: existing?.currentSwap,
        })
        access.setDiscard({ ...access.getDiscard(), [player.id]: current })
      }
    }
  }

  function holdDiscardArrivals(
    snapshot: CardZoneMotionSnapshot | null,
    before: readonly PlayerZoneMotionBaseline[],
    after: readonly PlayerState[],
    events: readonly CardMoveEvent[],
  ) {
    if (!snapshot) return
    holdSwapCardsMovingToDiscard(snapshot, before, after, events)
    holdPlayerCardsMovingToDiscard(snapshot, before, after, events, 'develop')
    holdPlayerCardsMovingToDiscard(snapshot, before, after, events, 'board')
  }

  async function settleArrival(
    snapshot: CardZoneMotionSnapshot,
    transfer: CardZoneMotionTransfer,
  ) {
    const hold = holdsByMotion.get(snapshot)?.get(transfer.ownerId)
    const arrival = hold?.current.boardArrival
    if (!hold || !arrival || arrival.sourceZone !== transfer.sourceZone ||
      arrival.instanceId !== transfer.sourceInstanceId ||
      access.getDiscard()[transfer.ownerId] !== hold.current) return
    const settled: DiscardPileDisplayValue = { cardId: arrival.cardId, count: arrival.count }
    hold.current = settled
    access.setDiscard({ ...access.getDiscard(), [transfer.ownerId]: settled })
    await waitForRender()
  }

  function release(snapshot: CardZoneMotionSnapshot | null) {
    if (!snapshot) return
    const holds = holdsByMotion.get(snapshot)
    if (!holds) return
    holdsByMotion.delete(snapshot)
    const overrides = { ...access.getDiscard() }
    const swapHolds = { ...access.getSwapHolds() }
    let changed = false
    let swapChanged = false
    for (const { playerId, previous, current, previousSwap, currentSwap } of holds.values()) {
      if (overrides[playerId] === current) {
        if (previous) overrides[playerId] = previous
        else delete overrides[playerId]
        changed = true
      }
      if (currentSwap && swapHolds[playerId]?.motionKey === currentSwap.motionKey) {
        if (previousSwap) swapHolds[playerId] = previousSwap
        else delete swapHolds[playerId]
        swapChanged = true
      }
    }
    if (changed) access.setDiscard(overrides)
    if (swapChanged) access.setSwapHolds(swapHolds)
  }

  return { holdDiscardArrivals, settleArrival, release }
}
