import { nextTick } from 'vue'
import type { CardMoveEvent, CardMoveZone } from '@engine/types'
import {
  discardCardFlight,
  waitForCardRowReflow,
  waitForHandCardReflow,
} from './card-flight'
import { animateCardMotionFlight } from './card-motion-flight'
import type { CardFlightSnapshot, CardZoneMotionCardSnapshot, CardZoneMotionSnapshot } from './card-flight'
import { resolveCardMotionPolicy } from './card-motion-policy'
import type { CardFlightTiming } from './card-motion-policy'
import { cardMovesForAnimation } from './card-destroy-motion'

export interface CardZoneMotionTransfer {
  sourceZone: string
  sourceZoneId: string
  sourceKey: string
  destinationZone: string
  destinationZoneId: string
  destinationIndex: number
  sourceInstanceId?: string
  /** A whole pile can move as one visible stack while retaining each card's count. */
  sourceInstanceIds?: string[]
  destinationInstanceId?: string
  moveId?: string
  moveIds?: string[]
  sequence?: number
  waitForZones: string[]
  cardId: string
  ownerId: string
  sourceFace?: 'front' | 'back'
  flight: CardFlightSnapshot | null
  destination: HTMLElement | null
  /** Flip a face-up source to the card back while it flies to a face-down zone. */
  faceDownOnArrival?: boolean
  destinationVisibilityBefore?: string
  /** Settle the visible destination under the clone before the clone is removed. */
  afterFlight?: () => void | Promise<void>
  timing?: CardFlightTiming
  reason?: string
}
/** Map rule-side zones to the visible names used by card surfaces. */
const motionZoneByEngineZone: Partial<Record<CardMoveZone, string>> = {
  hand: 'hand',
  deck: 'deck',
  discard: 'discard',
  played_this_turn: 'played',
  swap_zone: 'swap',
  specific_deck: 'specific_deck',
  player_cards_in_play: 'player_cards_in_play',
  breach: 'breach',
  develop: 'develop',
  supply: 'supply',
  nemesis_deck: 'nemesis_deck',
  nemesis_discard: 'nemesis_discard',
  nemesis_play_area: 'nemesis_play_area',
  nemesis_set_aside: 'nemesis_set_aside',
  nemesis_card_stack: 'nemesis_card_stack',
  corruption_deck: 'corruption_deck',
  strike_deck: 'strike_deck',
  strike_discard: 'strike_discard',
  trinket_deck: 'trinket_deck',
  destroyed: 'destroyed',
  temporary: 'conjure',
}

export interface CardZoneMotionEventResolution {
  transfers: CardZoneMotionTransfer[]
  /** Exact moves whose destination is not present in the rendered board. */
  settleImmediatelyInstanceIds: string[]
}

function eventDestination(
  root: ParentNode,
  event: Extract<CardMoveEvent, { kind: 'move' | 'create' }>,
  zone: string,
  sourceZone: string,
): HTMLElement | null {
  if (zone === 'destroyed') return root.querySelector<HTMLElement>('[data-card-flight-target="destroyed"]')
  const instanceDestination = [...root.querySelectorAll<HTMLElement>('[data-card-instance-id][data-card-motion-zone]')]
    .find(element => element.dataset.cardInstanceId === event.instanceId &&
      element.dataset.cardMotionZone === zone)
  if (instanceDestination) return instanceDestination
  if (zone === 'discard') {
    const eligible = [...root.querySelectorAll<HTMLElement>(
      '[data-card-motion-zone="discard"][data-card-motion-card-id][data-card-motion-owner-id]',
    )].filter(element => element.dataset.cardMotionCardId === event.cardId &&
      element.dataset.cardMotionOwnerId === (event.destination.ownerId ?? '') &&
      (element.dataset.cardMotionFromZones ?? '').split(',').map(value => value.trim()).includes(sourceZone))
    return eligible.find(element => element.dataset.cardMotionKey?.endsWith('-arrival')) ?? eligible[0] ?? null
  }
  if (zone === 'nemesis_discard') {
    return [...root.querySelectorAll<HTMLElement>('[data-card-flight-target="nemesis-discard"]')][0] ?? null
  }
  if (zone === 'strike_discard') {
    return [...root.querySelectorAll<HTMLElement>('[data-card-flight-target="strike-discard"]')][0] ?? null
  }
  if (zone === 'deck') {
    return [...root.querySelectorAll<HTMLElement>('[data-card-flight-target="deck"]')]
      .find(element => element.closest<HTMLElement>('[data-player-area-id]')?.dataset.playerAreaId === event.destination.ownerId) ?? null
  }
  if (zone === 'trinket_deck') {
    return [...root.querySelectorAll<HTMLElement>('[data-card-flight-target="trinket-deck"]')][0] ?? null
  }
  if (zone === 'strike_deck') {
    const pile = [...root.querySelectorAll<HTMLElement>(
      '[data-card-flight-source="nemesis-specific-deck"]',
    )][0] ?? null
    if (pile?.dataset.cardMotionTopAlwaysRevealed === 'true' && event.destination.index > 0) return pile
    return pile?.querySelector<HTMLElement>('[data-card-motion-pile-top="true"]') ?? pile
  }
  if (zone === 'corruption_deck') {
    return [...root.querySelectorAll<HTMLElement>('[data-card-flight-source="corruption-deck"]')][0] ?? null
  }
  return null
}

/** Resolve visible card movement from exact engine facts and physical card identity. */
export function resolveCardZoneMotionFromEvents(
  snapshot: CardZoneMotionSnapshot,
  events: readonly CardMoveEvent[],
  root: ParentNode = document,
  alreadyClaimedMoveIds: ReadonlySet<string> = new Set(),
): CardZoneMotionEventResolution {
  const animationMoves = cardMovesForAnimation(events)
  const destroyedInstances = new Set(animationMoves.flatMap(event =>
    event.destination.zone === 'destroyed' ? [event.instanceId] : []))
  const capturedInstances = new Set(snapshot.cards.map(card => card.instanceId))
  for (const event of animationMoves) {
    if (destroyedInstances.has(event.instanceId) && snapshot.cards.some(card =>
      card.key === event.source.zoneId && card.cardId === event.cardId)) capturedInstances.add(event.instanceId)
  }
  const relevant = animationMoves.filter(event =>
      !!motionZoneByEngineZone[event.source.zone] && !!motionZoneByEngineZone[event.destination.zone] &&
      capturedInstances.has(event.instanceId) &&
      !alreadyClaimedMoveIds.has(event.moveId) &&
      // Ordinary draw recycling stays immediate. Explicit shuffle effects
      // move the discard pile as one stack before the next effect resumes.
      (destroyedInstances.has(event.instanceId) || (
      !(event.source.zone === 'discard' && event.destination.zone === 'deck' && event.reason !== 'shuffle') &&
      // These routes have their own exact, ordered flight queue.
      !(event.source.zone === 'hand' && ['deck', 'discard'].includes(event.destination.zone)) &&
      !(event.reason === 'discard_phase' && event.source.zone === 'played_this_turn' && event.destination.zone === 'discard') &&
      !(event.source.zone === 'temporary' && event.destination.zone === 'deck'))),
  ).sort((left, right) => left.sequence - right.sequence)
  const supplyDevelopCreations = events.filter((event): event is Extract<CardMoveEvent, { kind: 'create' }> =>
    event.kind === 'create' && event.reason === 'develop' &&
      event.source?.zone === 'supply' && event.destination.zone === 'develop',
  ).sort((left, right) => left.sequence - right.sequence)
  const byInstance = new Map<string, typeof relevant>()
  for (const event of relevant) {
    const prior = byInstance.get(event.instanceId) ?? []
    prior.push(event)
    byInstance.set(event.instanceId, prior)
  }

  const transfers: CardZoneMotionTransfer[] = []
  const settleImmediatelyInstanceIds: string[] = []
  const usedOrigins = new Set<CardZoneMotionCardSnapshot>()
  const transferredFlights = new Set<CardFlightSnapshot>()
  const takeOriginFlight = (origin: CardZoneMotionCardSnapshot, captured = origin.flight) => {
    const flight = captured && transferredFlights.has(captured) ? cloneCardFlightSnapshot(captured) : captured
    usedOrigins.add(origin)
    if (flight) transferredFlights.add(flight)
    return flight
  }
  for (const [instanceId, moves] of byInstance) {
    const first = moves[0]!
    const last = moves[moves.length - 1]!
    const sourceZone = motionZoneByEngineZone[first.source.zone]!
    const destinationZone = motionZoneByEngineZone[last.destination.zone]!
    const origins = snapshot.cards.filter(card => card.zone === sourceZone &&
      (card.instanceId === instanceId || (destinationZone === 'destroyed' &&
        card.key === first.source.zoneId && card.cardId === first.cardId)))
    const usePhysicalSource = destinationZone === 'destroyed' ||
      (sourceZone === 'discard' && destinationZone === 'deck' && first.reason === 'shuffle')
    const origin = usePhysicalSource
      ? origins.find(card => !card.key.startsWith('decision-') && (card.physicalFlight || card.flight))
      : origins.find(card => card.key.startsWith('decision-')) ?? origins[0]
    const captured = usePhysicalSource ? origin?.physicalFlight ?? origin?.flight : origin?.flight
    if (!origin || !captured) continue
    const destination = eventDestination(root, last, destinationZone, sourceZone)
    if (!destination) {
      settleImmediatelyInstanceIds.push(instanceId)
      continue
    }
    const motionPolicy = resolveCardMotionPolicy({
      sourceZone,
      destinationZone,
      reason: first.reason,
    })
    const displayedFace = destination.dataset.cardMotionFace ??
      destination.closest<HTMLElement>('[data-card-motion-face]')?.dataset.cardMotionFace
    const destinationHidesCardsBelowRevealedTop = destinationZone === 'strike_deck' &&
      destination.closest<HTMLElement>('[data-card-flight-source="nemesis-specific-deck"]')?.dataset.cardMotionTopAlwaysRevealed === 'true'
    const faceDownOnArrival = destinationHidesCardsBelowRevealedTop
      ? last.destination.index !== 0
      : displayedFace === 'front'
        ? false
        : displayedFace === 'back'
          ? true
          : motionPolicy.faceDownOnArrival
    const flight = takeOriginFlight(origin, captured)
    if (flight) flight.clone.dataset.cardFlightInstanceId = instanceId
    transfers.push({
      sourceZone,
      sourceZoneId: first.source.zoneId,
      sourceKey: origin.key,
      sourceInstanceId: instanceId,
      destinationInstanceId: destination.dataset.cardInstanceId ?? '',
      destinationZone,
      destinationZoneId: last.destination.zoneId,
      destinationIndex: last.destination.index,
      waitForZones: (destination.dataset.cardMotionAfterZones ?? '').split(',').map(value => value.trim()).filter(Boolean),
      cardId: last.cardId,
      ownerId: first.source.ownerId ?? last.destination.ownerId ?? '',
      sourceFace: origin.face,
      moveId: last.moveId,
      moveIds: moves.map(move => move.moveId),
      sequence: first.sequence,
      flight,
      destination,
      timing: motionPolicy.timing,
      faceDownOnArrival,
      reason: first.reason,
    })
  }
  for (const event of supplyDevelopCreations) {
    const sourceZone = motionZoneByEngineZone[event.source!.zone]!
    const laterMoves = events.filter((candidate): candidate is Extract<CardMoveEvent, { kind: 'move' }> =>
      candidate.kind === 'move' && candidate.instanceId === event.instanceId &&
        candidate.sequence > event.sequence,
    ).sort((left, right) => left.sequence - right.sequence)
    const finalMove = laterMoves.at(-1)
    if (finalMove && finalMove.destination.zone !== 'develop') continue
    const terminalEvent = finalMove ?? event
    const origins = snapshot.cards.filter(card =>
      card.zone === sourceZone && card.key === event.source!.zoneId && card.cardId === event.cardId,
    )
    const origin = origins.find(card => !usedOrigins.has(card)) ?? origins[0]
    if (!origin?.flight) continue
    const destinationZone = motionZoneByEngineZone[terminalEvent.destination.zone]!
    if (destinationZone !== 'develop') continue
    const destination = eventDestination(root, terminalEvent, destinationZone, sourceZone)
    if (!destination) {
      discardCardFlight(origin.flight)
      settleImmediatelyInstanceIds.push(origin.instanceId)
      continue
    }
    transfers.push({
      sourceZone,
      sourceZoneId: event.source!.zoneId,
      sourceKey: origin.key,
      sourceInstanceId: origin.instanceId,
      destinationInstanceId: terminalEvent.instanceId,
      destinationZone,
      destinationZoneId: terminalEvent.destination.zoneId,
      destinationIndex: terminalEvent.destination.index,
      waitForZones: (destination.dataset.cardMotionAfterZones ?? '').split(',').map(value => value.trim()).filter(Boolean),
      cardId: event.cardId,
      ownerId: terminalEvent.destination.ownerId ?? '',
      moveId: finalMove?.moveId ?? `create:${event.eventId}`,
      moveIds: finalMove ? [event.eventId, finalMove.moveId] : [`create:${event.eventId}`],
      sequence: event.sequence,
      flight: takeOriginFlight(origin),
      destination,
    })
  }
  // A shuffle transfers a discard pile, not a row of individually played
  // cards. Keep its physical IDs together for one departure and one arrival.
  const pileTransfers = new Map<string, CardZoneMotionTransfer>()
  const visibleTransfers: CardZoneMotionTransfer[] = []
  for (const transfer of transfers) {
    if (transfer.sourceZone !== 'discard' || transfer.destinationZone !== 'deck' || transfer.reason !== 'shuffle') {
      visibleTransfers.push(transfer)
      continue
    }
    const key = `${transfer.sourceZoneId}->${transfer.destinationZoneId}`
    const stack = pileTransfers.get(key)
    if (!stack) {
      transfer.sourceInstanceIds = transfer.sourceInstanceId ? [transfer.sourceInstanceId] : []
      pileTransfers.set(key, transfer)
      visibleTransfers.push(transfer)
    } else {
      if (transfer.sourceInstanceId) stack.sourceInstanceIds!.push(transfer.sourceInstanceId)
      stack.moveIds!.push(...(transfer.moveIds ?? []))
      discardCardFlight(transfer.flight)
    }
  }
  snapshot.cards.forEach(card => {
    for (const flight of [card.flight, card.physicalFlight]) {
      if (flight && !transferredFlights.has(flight)) discardCardFlight(flight)
    }
  })
  return { transfers: visibleTransfers, settleImmediatelyInstanceIds }
}

function cloneCardFlightSnapshot(flight: CardFlightSnapshot | null): CardFlightSnapshot | null {
  return flight ? {
    clone: flight.clone.cloneNode(true) as HTMLElement,
    left: flight.left,
    top: flight.top,
    width: flight.width,
    height: flight.height,
  } : null
}

export function discardCardZoneMotion(snapshot: CardZoneMotionSnapshot | null) {
  snapshot?.cards.forEach(card => {
    discardCardFlight(card.flight)
    discardCardFlight(card.physicalFlight ?? null)
  })
}

/** Animate board-zone flights in engine order, honoring authored zone dependencies. */
export async function animateCardZoneMotion(
  transfers: readonly CardZoneMotionTransfer[],
  zoneBarriers: ReadonlyMap<string, Promise<void>> = new Map(),
  prepareTransfer?: (transfer: CardZoneMotionTransfer) => Promise<HTMLElement | null>,
  faceDownImageUrl?: string | ((transfer: CardZoneMotionTransfer) => string),
  pileMotionDisplay?: { depart(instanceId: string): void; arrive(instanceId: string): void },
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const animateTransfer = async (transfer: CardZoneMotionTransfer) => {
    if (!isCurrent()) return
    const sourceRow = await prepareTransfer?.(transfer) ?? null
    if (!isCurrent()) return
    // A destination can be hidden while this transfer waits for another
    // zone's animation. Restore its original visibility before starting the
    // flight; overlay destinations intentionally remain visible beneath the
    // moving card.
    if (transfer.destination && transfer.destinationVisibilityBefore !== undefined) {
      transfer.destination.style.visibility = transfer.destinationVisibilityBefore
    }
    const arrivalBackImage = typeof faceDownImageUrl === 'function'
      ? faceDownImageUrl(transfer)
      : faceDownImageUrl
    const instanceIds = transfer.sourceInstanceIds ?? (transfer.sourceInstanceId ? [transfer.sourceInstanceId] : [])
    instanceIds.forEach(instanceId => pileMotionDisplay?.depart(instanceId))
    const flight = animateCardMotionFlight({
      cardId: transfer.cardId,
      sourceZone: transfer.sourceZone,
      sourceFace: transfer.sourceFace,
      destinationZone: transfer.destinationZone,
      flight: transfer.flight,
      isCurrent,
      destination: transfer.destination,
      timing: transfer.timing,
      restoreDestinationVisibility: transfer.destinationVisibilityBefore,
      afterFlight: async () => {
        if (!isCurrent()) return
        await transfer.afterFlight?.()
        if (!isCurrent()) return
        if (instanceIds.length > 0) {
          instanceIds.forEach(instanceId => pileMotionDisplay?.arrive(instanceId))
          await nextTick()
        }
      },
      faceDownOnArrival: transfer.faceDownOnArrival,
      faceDownImageUrl: arrivalBackImage,
    })
    if (sourceRow) {
      await Promise.all([flight, waitForCardRowReflow(sourceRow)])
      return
    }
    if (!['hand', 'conjure'].includes(transfer.sourceZone) || !transfer.ownerId || typeof document === 'undefined') {
      await flight
      return
    }
    const playerArea = [...document.querySelectorAll<HTMLElement>('[data-player-area-id]')]
      .find(element => element.dataset.playerAreaId === transfer.ownerId)
    await Promise.all([flight, waitForHandCardReflow(playerArea?.querySelector<HTMLElement>('.hand') ?? null)])
  }
  const transfersByDestination = new Map<string, CardZoneMotionTransfer[]>()
  for (const transfer of transfers) {
    const destinationTransfers = transfersByDestination.get(transfer.destinationZone) ?? []
    destinationTransfers.push(transfer)
    transfersByDestination.set(transfer.destinationZone, destinationTransfers)
  }

  const settledZones = new Map<string, Promise<void>>()
  const settlingZones = new Set<string>()
  const settledTransfers = new Map<CardZoneMotionTransfer, Promise<void>>()
  const settlingTransfers = new Set<CardZoneMotionTransfer>()
  let settleZone!: (zone: string) => Promise<void>
  let settleTransfer!: (transfer: CardZoneMotionTransfer) => Promise<void>
  settleZone = (zone: string): Promise<void> => {
    const settled = settledZones.get(zone)
    if (settled) return settled
    // Zone sequencing is authored as a DAG. If a future route accidentally
    // declares a cycle, break the cycle instead of leaving the action pending.
    if (settlingZones.has(zone)) return Promise.resolve()
    settlingZones.add(zone)
    const zoneSettled = (async () => {
      try {
        const barrier = zoneBarriers.get(zone)
        if (barrier) await barrier
        const zoneTransfers = [...(transfersByDestination.get(zone) ?? [])]
          .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
        for (const transfer of zoneTransfers) {
          if (!isCurrent()) break
          await settleTransfer(transfer)
        }
      } finally {
        settlingZones.delete(zone)
      }
    })()
    settledZones.set(zone, zoneSettled)
    return zoneSettled
  }
  settleTransfer = (transfer: CardZoneMotionTransfer): Promise<void> => {
    const settled = settledTransfers.get(transfer)
    if (settled) return settled
    if (settlingTransfers.has(transfer)) return Promise.resolve()
    settlingTransfers.add(transfer)
    const transferSettled = (async () => {
      try {
        const barrier = zoneBarriers.get(transfer.destinationZone)
        if (barrier) await barrier
        if (!isCurrent()) return
        for (const zone of transfer.waitForZones) await settleZone(zone)
        if (!isCurrent()) return
        await animateTransfer(transfer)
      } finally {
        settlingTransfers.delete(transfer)
      }
    })()
    settledTransfers.set(transfer, transferSettled)
    return transferSettled
  }

  const orderedTransfers = [...transfers]
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
  for (const transfer of orderedTransfers) {
    if (!isCurrent()) break
    await settleTransfer(transfer)
  }
  if (isCurrent()) {
    for (const zone of zoneBarriers.keys()) await settleZone(zone)
  } else {
    transfers.forEach(transfer => discardCardFlight(transfer.flight))
  }
}

