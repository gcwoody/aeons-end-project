import type { PlayerId } from '@engine/types'
import { projectPileArrival } from './card-motion-projection'
import type { CardZoneTransfer } from './card-flight'

export interface PileDisplayValue {
  cardId: string | null
  count: number
}

export interface DiscardPileDisplayValue extends PileDisplayValue {
  boardArrival?: { cardId: string; count: number; instanceId: string; sourceZone: string }
}

export interface PileDisplayBaseline {
  discard: Partial<Record<PlayerId, DiscardPileDisplayValue>>
  deck: Partial<Record<PlayerId, PileDisplayValue>>
  /** Temporary values installed by holdAction and eligible for restoration. */
  held?: {
    discard: Partial<Record<PlayerId, DiscardPileDisplayValue>>
    deck: Partial<Record<PlayerId, PileDisplayValue>>
  }
}

export interface PileDisplayPlayer {
  id: PlayerId
  deck: readonly string[]
  discard: readonly string[]
}

export interface CardMotionPileDisplayAccess {
  getDiscard(): Partial<Record<PlayerId, DiscardPileDisplayValue>>
  setDiscard(value: Partial<Record<PlayerId, DiscardPileDisplayValue>>): void
  getDeck(): Partial<Record<PlayerId, PileDisplayValue>>
  setDeck(value: Partial<Record<PlayerId, PileDisplayValue>>): void
}

export type CardMotionDisplayDiagnostic = (message: string, details: unknown) => void

/**
 * Owns temporary deck/discard display values while cards are moving.
 * Rule state remains in the engine; this module only keeps the visible piles
 * aligned with each arriving card and restores the display values afterwards.
 */
export function createCardMotionPileDisplay(
  access: CardMotionPileDisplayAccess,
  report: CardMotionDisplayDiagnostic = () => undefined,
) {
  const baselinesByAction = new WeakMap<object, PileDisplayBaseline>()
  const heldValuesByAction = new WeakMap<object, NonNullable<PileDisplayBaseline['held']>>()

  function capture(): PileDisplayBaseline {
    return {
      discard: { ...access.getDiscard() },
      deck: { ...access.getDeck() },
    }
  }

  function restoreBaseline(baseline: PileDisplayBaseline) {
    access.setDiscard({ ...baseline.discard })
    access.setDeck({ ...baseline.deck })
  }

  function stageAction(action: object, transfers: readonly CardZoneTransfer[]) {
    const arrivals = transfers.filter(transfer =>
      !!transfer.flight && (transfer.zone === 'discard' || transfer.zone === 'deck'),
    )
    if (arrivals.length === 0) return
    if (!baselinesByAction.has(action)) baselinesByAction.set(action, capture())

    const nextDiscard = { ...access.getDiscard() }
    const nextDeck = { ...access.getDeck() }
    for (const transfer of arrivals) {
      if (transfer.zone === 'discard' && nextDiscard[transfer.playerId] === undefined) {
        nextDiscard[transfer.playerId] = {
          cardId: transfer.previousDiscardTop,
          count: transfer.previousDiscardCount,
        }
      }
      if (transfer.zone === 'deck' && nextDeck[transfer.playerId] === undefined) {
        nextDeck[transfer.playerId] = {
          cardId: transfer.previousDeckTop,
          count: transfer.previousDeckCount,
        }
      }
    }
    access.setDiscard(nextDiscard)
    access.setDeck(nextDeck)
  }

  function holdAction(
    action: object,
    players: readonly PileDisplayPlayer[],
    legacyDiscard?: { playerId: PlayerId; cardId: string | null; count: number } | null,
    legacyDeck?: { playerId: PlayerId; cardId: string | null; count: number } | null,
  ) {
    if (!baselinesByAction.has(action)) baselinesByAction.set(action, capture())
    const nextDiscard = { ...access.getDiscard() }
    const nextDeck = { ...access.getDeck() }
    const heldDiscard: NonNullable<PileDisplayBaseline['held']>['discard'] = {}
    const heldDeck: NonNullable<PileDisplayBaseline['held']>['deck'] = {}
    for (const player of players) {
      if (nextDiscard[player.id] === undefined) {
        const held = legacyDiscard?.playerId === player.id
          ? legacyDiscard
          : { cardId: player.discard[0] ?? null, count: player.discard.length }
        nextDiscard[player.id] = held
        heldDiscard[player.id] = held
      }
      if (nextDeck[player.id] === undefined) {
        const held = legacyDeck?.playerId === player.id
          ? legacyDeck
          : { cardId: player.deck[0] ?? null, count: player.deck.length }
        nextDeck[player.id] = held
        heldDeck[player.id] = held
      }
    }
    heldValuesByAction.set(action, { discard: heldDiscard, deck: heldDeck })
    access.setDiscard(nextDiscard)
    access.setDeck(nextDeck)
  }

  function finalizeAction(
    action: object,
    transfers: readonly CardZoneTransfer[],
  ): PileDisplayBaseline | undefined {
    const baseline = baselinesByAction.get(action)
    if (!baseline) return undefined
    const nextDiscard = { ...baseline.discard }
    const nextDeck = { ...baseline.deck }
    // Board arrivals are staged by card-motion-board-display after the action
    // starts. Keep those temporary targets while finalizing hand-to-pile
    // flights so a swap/develop arrival does not appear in the pile early.
    for (const [playerId, value] of Object.entries(access.getDiscard())) {
      if (value?.boardArrival) nextDiscard[playerId as PlayerId] = value
    }
    for (const transfer of transfers) {
      if (!transfer.flight) continue
      if (transfer.zone === 'discard' && nextDiscard[transfer.playerId] === undefined) {
        nextDiscard[transfer.playerId] = {
          cardId: transfer.previousDiscardTop,
          count: transfer.previousDiscardCount,
        }
      }
      if (transfer.zone === 'deck' && nextDeck[transfer.playerId] === undefined) {
        nextDeck[transfer.playerId] = {
          cardId: transfer.previousDeckTop,
          count: transfer.previousDeckCount,
        }
      }
    }
    access.setDiscard(nextDiscard)
    access.setDeck(nextDeck)
    baselinesByAction.delete(action)
    const held = heldValuesByAction.get(action)
    heldValuesByAction.delete(action)
    return held ? { ...baseline, held } : baseline
  }

  function cancelAction(action: object) {
    baselinesByAction.delete(action)
    heldValuesByAction.delete(action)
  }

  function beginArrivals(
    transfers: readonly CardZoneTransfer[],
    baseline?: PileDisplayBaseline,
  ) {
    const priorDiscard = baseline?.discard ?? { ...access.getDiscard() }
    const priorDeck = baseline?.deck ?? { ...access.getDeck() }
    const discardProjection = new Map<PlayerId, PileDisplayValue>()
    const deckProjection = new Map<PlayerId, PileDisplayValue>()
    const latestDiscard = new Map<PlayerId, PileDisplayValue>()
    const latestDeck = new Map<PlayerId, PileDisplayValue>()
    const projectedDiscard = { ...priorDiscard }
    const projectedDeck = { ...priorDeck }

    for (const transfer of transfers) {
      if (transfer.zone === 'discard' && !discardProjection.has(transfer.playerId)) {
        const initial = { cardId: transfer.previousDiscardTop, count: transfer.previousDiscardCount }
        discardProjection.set(transfer.playerId, initial)
        latestDiscard.set(transfer.playerId, initial)
        projectedDiscard[transfer.playerId] = initial
      }
      if (transfer.zone === 'deck' && !deckProjection.has(transfer.playerId)) {
        const initial = { cardId: transfer.previousDeckTop, count: transfer.previousDeckCount }
        deckProjection.set(transfer.playerId, initial)
        latestDeck.set(transfer.playerId, initial)
        projectedDeck[transfer.playerId] = initial
      }
    }
    if (discardProjection.size > 0) access.setDiscard(projectedDiscard)
    if (deckProjection.size > 0) access.setDeck(projectedDeck)

    function showArrival(transfer: CardZoneTransfer) {
      if (transfer.zone === 'discard') {
        const current = discardProjection.get(transfer.playerId) ?? {
          cardId: transfer.previousDiscardTop,
          count: transfer.previousDiscardCount,
        }
        const next = projectPileArrival(current, transfer)
        discardProjection.set(transfer.playerId, next)
        latestDiscard.set(transfer.playerId, next)
        access.setDiscard({ ...access.getDiscard(), [transfer.playerId]: next })
      } else if (transfer.zone === 'deck') {
        const current = deckProjection.get(transfer.playerId) ?? {
          cardId: transfer.previousDeckTop,
          count: transfer.previousDeckCount,
        }
        const next = projectPileArrival(current, transfer)
        deckProjection.set(transfer.playerId, next)
        latestDeck.set(transfer.playerId, next)
        access.setDeck({ ...access.getDeck(), [transfer.playerId]: next })
      }
    }

    function restore(players: readonly PileDisplayPlayer[]) {
      const playersById = new Map(players.map(player => [player.id, player]))
      for (const [playerId, projection] of discardProjection) {
        const player = playersById.get(playerId)
        if (player && (projection.count !== player.discard.length ||
          projection.cardId !== (player.discard[0] ?? null))) {
          report('Discard projection did not settle to the engine state', {
            playerId, projection, engineTop: player.discard[0] ?? null, engineCount: player.discard.length,
          })
        }
      }
      for (const [playerId, projection] of deckProjection) {
        const player = playersById.get(playerId)
        if (player && (projection.count !== player.deck.length ||
          projection.cardId !== (player.deck[0] ?? null))) {
          report('Deck projection did not settle to the engine state', {
            playerId, projection, engineTop: player.deck[0] ?? null, engineCount: player.deck.length,
          })
        }
      }

      const currentDiscard = { ...access.getDiscard() }
      for (const [playerId, latest] of latestDiscard) {
        if (currentDiscard[playerId] !== latest) continue
        const previous = priorDiscard[playerId]
        if (previous) currentDiscard[playerId] = previous
        else delete currentDiscard[playerId]
      }
      const currentDeck = { ...access.getDeck() }
      for (const [playerId, latest] of latestDeck) {
        if (currentDeck[playerId] !== latest) continue
        const previous = priorDeck[playerId]
        if (previous) currentDeck[playerId] = previous
        else delete currentDeck[playerId]
      }
      for (const [playerId, held] of Object.entries(baseline?.held?.discard ?? {})) {
        const id = playerId as PlayerId
        if (currentDiscard[id] !== held) continue
        const previous = priorDiscard[id]
        if (previous) currentDiscard[id] = previous
        else delete currentDiscard[id]
      }
      for (const [playerId, held] of Object.entries(baseline?.held?.deck ?? {})) {
        const id = playerId as PlayerId
        if (currentDeck[id] !== held) continue
        const previous = priorDeck[id]
        if (previous) currentDeck[id] = previous
        else delete currentDeck[id]
      }
      access.setDiscard(currentDiscard)
      access.setDeck(currentDeck)
    }

    return { showArrival, restore }
  }

  return { restoreBaseline, stageAction, holdAction, finalizeAction, cancelAction, beginArrivals }
}
