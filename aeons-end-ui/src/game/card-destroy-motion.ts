import type { CardMoveEvent } from '@engine/types'
import type { CardFlightSnapshot, CardZoneMotionSnapshot } from './card-flight'

/** Hand-play presentation uses the same destruction queue and arrival counts. */
export function stageDestroyedCardOrigin(
  snapshot: CardZoneMotionSnapshot | null,
  events: readonly CardMoveEvent[],
  source: { cardId: string; instanceId: string; ownerId: string; key: string; flight: CardFlightSnapshot | null },
): boolean {
  if (!snapshot || !source.flight || !events.some(event =>
    event.kind === 'destroy' && event.reason === 'destroy' && event.instanceId === source.instanceId)) return false
  const first = events.find(event =>
    (event.kind === 'move' || event.kind === 'destroy') && event.instanceId === source.instanceId)
  if (!first || (first.kind !== 'move' && first.kind !== 'destroy')) return false
  const zone = first.source.zone === 'played_this_turn' ? 'played' : first.source.zone
  snapshot.cards.push({ ...source, zone, face: 'front', flight: null, physicalFlight: source.flight })
  return true
}

/** Destruction has a physical destination even though it is not a normal move. */
export function cardMovesForAnimation(events: readonly CardMoveEvent[]): Extract<CardMoveEvent, { kind: 'move' }>[] {
  const destroyedInstances = new Set(events.flatMap(event =>
    event.kind === 'destroy' && event.reason === 'destroy' ? [event.instanceId] : []))
  return events.flatMap(event => {
    if (event.kind === 'move') return [event]
    if ((event.kind === 'temporary' || event.kind === 'create') && event.source &&
      destroyedInstances.has(event.instanceId)) {
      return [{ ...event, kind: 'move' as const, source: event.source, moveId: event.eventId }]
    }
    // Some Nemesis cancellation rules remove an unplayed card from the game;
    // those bookkeeping removals are not the Destroy keyword.
    if (event.kind !== 'destroy' || event.reason !== 'destroy') return []
    return [{
      ...event,
      kind: 'move' as const,
      moveId: event.eventId,
      destination: {
        zoneId: event.source.ownerId && event.source.ownerId !== 'nemesis'
          ? `player:${event.source.ownerId}:destroyed`
          : 'nemesis:destroyed',
        zone: 'destroyed' as const,
        ownerId: event.source.ownerId,
        index: 0,
      },
    }]
  })
}

/** Shrink into the trash without stretching the card to the button's shape. */
export function createDestroyedCardFlightTarget(
  destination: HTMLElement,
  flight: CardFlightSnapshot,
): HTMLElement {
  const rect = destination.getBoundingClientRect()
  const scale = Math.min(rect.width / flight.width, rect.height / flight.height) * .75
  const width = flight.width * scale
  const height = flight.height * scale
  const target = destination.ownerDocument.createElement('span')
  target.setAttribute('aria-hidden', 'true')
  target.dataset.cardMotionZone = 'destroyed'
  Object.assign(target.style, {
    position: 'fixed', pointerEvents: 'none',
    left: `${rect.left + (rect.width - width) / 2}px`,
    top: `${rect.top + (rect.height - height) / 2}px`,
    width: `${width}px`, height: `${height}px`,
  })
  destination.ownerDocument.body.append(target)
  return target
}
