import type { CardMoveEvent, PlayerId } from '@engine/types'
import { discardCardFlight } from './card-flight'
import type { CardZoneTransfer } from './card-flight'
import type { CardFlightSnapshot } from './card-flight'
import { resolveCardMotionPolicy } from './card-motion-policy'

export interface CapturedHandCard {
  playerId: PlayerId
  cardId: string
  instanceId: string
  handIndex: number
  flight: CardFlightSnapshot | null
}

export interface HandCardMotionSnapshot {
  players: Array<{ id: PlayerId; hand: string[]; deck: string[]; discard: string[] }>
  cards: CapturedHandCard[]
}

export type CardMotionDiagnostic = (message: string, details: unknown) => void

/** Build hand-to-pile flights from engine facts, preserving the exact card copy. */
export function resolveHandCardZoneTransfers(
  snapshot: HandCardMotionSnapshot,
  events: readonly CardMoveEvent[],
  report: CardMotionDiagnostic = () => undefined,
): CardZoneTransfer[] {
  const capturedByInstance = new Map(snapshot.cards.map(card => [card.instanceId, card]))
  const beforeById = new Map(snapshot.players.map(player => [player.id, player]))
  const destinations = new Map<string, {
    cardId: string
    sourcePlayerId: PlayerId
    destinationZoneId: string
    destinationZone: string
    destinationPlayerId: PlayerId
    zoneIndex: number
    moveId: string
    moveIds: string[]
    sequence: number
  }>()

  for (const event of events) {
    if (event.kind !== 'move') continue
    if (event.source.zone === 'hand' &&
      (event.destination.zone === 'discard' || event.destination.zone === 'deck') &&
      !capturedByInstance.has(event.instanceId)) {
      report('Hand departure has no captured source card', event)
      continue
    }
    if (!capturedByInstance.has(event.instanceId)) continue
    const existing = destinations.get(event.instanceId)
    if (!existing) {
      if (event.source.zone !== 'hand' || !event.source.ownerId) continue
      destinations.set(event.instanceId, {
        cardId: event.cardId,
        sourcePlayerId: event.source.ownerId as PlayerId,
        destinationZoneId: event.destination.zoneId,
        destinationZone: event.destination.zone,
        destinationPlayerId: (event.destination.ownerId ?? event.source.ownerId) as PlayerId,
        zoneIndex: event.destination.index,
        moveId: event.moveId,
        moveIds: [event.moveId],
        sequence: event.sequence,
      })
      continue
    }
    if (existing.destinationZoneId !== event.source.zoneId) continue
    existing.destinationZoneId = event.destination.zoneId
    existing.destinationZone = event.destination.zone
    existing.destinationPlayerId = (event.destination.ownerId ?? existing.sourcePlayerId) as PlayerId
    existing.zoneIndex = event.destination.index
    existing.moveId = event.moveId
    existing.moveIds.push(event.moveId)
    existing.sequence = event.sequence
  }

  const transfers: CardZoneTransfer[] = []
  for (const [instanceId, destination] of destinations) {
    if (destination.destinationZone !== 'discard' && destination.destinationZone !== 'deck') continue
    const source = capturedByInstance.get(instanceId)
    const before = beforeById.get(destination.destinationPlayerId)
    if (!source || !before) continue
    if (!source.flight) report('Hand departure has no visible source anchor', destination)
    transfers.push({
      sequence: destination.sequence,
      moveId: destination.moveId,
      moveIds: destination.moveIds,
      instanceId,
      cardId: destination.cardId,
      sourceZoneId: `player:${destination.sourcePlayerId}:hand`,
      destinationZoneId: `player:${destination.destinationPlayerId}:${destination.destinationZone}`,
      playerId: destination.destinationPlayerId,
      sourcePlayerId: destination.sourcePlayerId,
      sourceHandIndex: source.handIndex,
      sourceHandInstanceId: instanceId,
      zone: destination.destinationZone,
      zoneIndex: destination.zoneIndex,
      flight: source.flight,
      timing: resolveCardMotionPolicy({
        sourceZone: 'hand',
        destinationZone: destination.destinationZone,
      }).timing,
      previousDeckTop: before.deck[0] ?? null,
      previousDeckCount: before.deck.length,
      previousDiscardTop: before.discard[0] ?? null,
      previousDiscardCount: before.discard.length,
    })
  }
  const transferredInstances = new Set(transfers.map(transfer => transfer.sourceHandInstanceId))
  snapshot.cards.forEach(card => {
    if (!transferredInstances.has(card.instanceId)) discardCardFlight(card.flight)
  })
  return transfers
}

/** Advance a visible pile only after its incoming card has finished flying. */
export function projectPileArrival(
  current: { cardId: string | null; count: number },
  transfer: Pick<CardZoneTransfer, 'zone' | 'zoneIndex' | 'cardId'>,
) {
  return {
    // Until the next incoming card arrives, the first arrival is the visible
    // top of an empty pile even when a later arrival will be inserted above it.
    cardId: current.count === 0 || transfer.zoneIndex === 0 ? transfer.cardId : current.cardId,
    count: current.count + 1,
  }
}
