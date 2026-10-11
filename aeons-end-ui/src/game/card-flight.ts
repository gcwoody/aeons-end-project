import type { CardMoveEvent, CardMoveZone } from '@engine/types'

export interface CardFlightSnapshot {
  clone: HTMLElement
  left: number
  top: number
  width: number
  height: number
}

export interface CardRowPosition {
  left: number
  top: number
  visible: boolean
}

export type CardRowPositionSnapshot = Map<string, CardRowPosition>

export interface CardZoneMotionCardSnapshot {
  zone: string
  cardId: string
  ownerId: string
  key: string
  instanceId: string
  flight: CardFlightSnapshot | null
}

export interface CardZoneMotionSnapshot {
  rows: Array<{
    key: string
    element: HTMLElement
    positions: CardRowPositionSnapshot
  }>
  cards: CardZoneMotionCardSnapshot[]
}

export interface CardZoneMotionTransfer {
  sourceZone: string
  sourceKey: string
  destinationZone: string
  sourceInstanceId?: string
  destinationInstanceId?: string
  moveId?: string
  moveIds?: string[]
  sequence?: number
  waitForZones: string[]
  cardId: string
  ownerId: string
  flight: CardFlightSnapshot | null
  destination: HTMLElement | null
  /** Flip a face-up source to the card back while it flies to a face-down zone. */
  faceDownOnArrival?: boolean
  destinationVisibilityBefore?: string
  /** Settle the visible destination under the clone before the clone is removed. */
  afterFlight?: () => void | Promise<void>
  timing?: CardFlightTiming
}

export type PlayerCardZone = 'hand' | 'deck' | 'discard'
export type CardFlightDestinationMode = 'overlay' | 'replace'
export type CardFlightTiming =
  | 'standard'
  | 'breach-to-discard'
  | 'hand-to-breach'
  | 'hand-to-play-zone'
  | 'hand-to-swap-zone'
  | 'swap-to-discard'
  | 'hand-to-deck-top'
  | 'hand-to-pile'
  | 'discard-phase'

interface CardFlightTimingConfig {
  durationVariable: string
  fallbackDurationMs: number
}

const cardFlightTimingConfig: Record<CardFlightTiming, CardFlightTimingConfig> = {
  standard: { durationVariable: '--card-flight-duration', fallbackDurationMs: 600 },
  'breach-to-discard': { durationVariable: '--breach-to-discard-flight-duration', fallbackDurationMs: 300 },
  'hand-to-breach': { durationVariable: '--hand-to-breach-flight-duration', fallbackDurationMs: 280 },
  'hand-to-play-zone': { durationVariable: '--hand-to-play-zone-flight-duration', fallbackDurationMs: 360 },
  'hand-to-swap-zone': { durationVariable: '--hand-to-swap-zone-flight-duration', fallbackDurationMs: 360 },
  'swap-to-discard': { durationVariable: '--swap-to-discard-flight-duration', fallbackDurationMs: 360 },
  'hand-to-deck-top': { durationVariable: '--hand-to-deck-top-flight-duration', fallbackDurationMs: 300 },
  'hand-to-pile': { durationVariable: '--hand-to-pile-flight-duration', fallbackDurationMs: 200 },
  'discard-phase': { durationVariable: '--discard-phase-flight-duration', fallbackDurationMs: 200 },
}

/** Resolve duration and easing once for every card flight renderer. */
export function resolveCardFlightTiming(timing: CardFlightTiming = 'standard') {
  const config = cardFlightTimingConfig[timing]
  const rootStyle = getComputedStyle(document.documentElement)
  const token = rootStyle.getPropertyValue(config.durationVariable).trim()
  const value = Number.parseFloat(token)
  const duration = token.endsWith('ms')
    ? value
    : token.endsWith('s') ? value * 1000 : config.fallbackDurationMs
  const easing = rootStyle.getPropertyValue('--card-flight-easing').trim()
    || 'cubic-bezier(.22, .78, .24, 1)'
  return { duration, easing, durationVariable: config.durationVariable }
}

function fitCardFlightToTarget(
  flight: Pick<CardFlightSnapshot, 'left' | 'top' | 'width' | 'height'>,
  target: DOMRect,
) {
  const scale = Math.min(target.width / flight.width, target.height / flight.height)
  const fittedLeft = target.left + (target.width - flight.width * scale) / 2
  const fittedTop = target.top + (target.height - flight.height * scale) / 2
  return {
    scaleX: scale,
    scaleY: scale,
    translateX: fittedLeft - flight.left,
    translateY: fittedTop - flight.top,
  }
}

/**
 * Deck and discard pile surfaces represent persistent piles and stay visible
 * while a card is added. A newly rendered hand card is temporarily replaced
 * by the flying copy to avoid showing the same card twice.
 */
export function cardZoneFlightDestinationMode(
  zone: string,
  targetIsNewCard: boolean,
): CardFlightDestinationMode {
  return zone === 'deck' || zone === 'discard' || zone === 'trinket_deck' || !targetIsNewCard
    ? 'overlay'
    : 'replace'
}

/** Keep persistent player piles visible even when a caller requests replacement. */
export function resolveCardFlightDestinationMode(
  destination: HTMLElement,
  requestedMode: CardFlightDestinationMode = 'replace',
): CardFlightDestinationMode {
  const destinationZone = destination.dataset.cardMotionZone ??
    destination.dataset.cardFlightZone ?? destination.dataset.cardFlightTarget
  const pileAncestor = destination.closest<HTMLElement>(
    '[data-card-flight-target="deck"], [data-card-flight-target="discard"], [data-card-flight-target="trinket-deck"], [data-card-flight-zone="deck"], [data-card-flight-zone="discard"]',
  )
  if (destinationZone === 'deck' || destinationZone === 'discard' ||
    destinationZone === 'trinket-deck' || pileAncestor) return 'overlay'
  return requestedMode
}

export interface CardMoveSourceSnapshot {
  flight: CardFlightSnapshot | null
  players: Array<{
    id: string
    hand: string[]
    deck: string[]
    discard: string[]
  }>
}

export interface CardZoneTransfer {
  moveId?: string
  moveIds?: string[]
  instanceId?: string
  cardId: string
  playerId: string
  zone: PlayerCardZone
  zoneIndex: number
  sourcePlayerId?: string
  sourceHandIndex?: number
  sourceHandInstanceId?: string
  flight: CardFlightSnapshot | null
  /** Reveal a card captured face-down as it arrives in a face-up player zone. */
  revealOnArrival?: boolean
  timing?: CardFlightTiming
  previousDeckTop: string | null
  previousDeckCount: number
  previousDiscardTop: string | null
  previousDiscardCount: number
}

/** Capture a visible source and pile baselines before a recorded move. */
export function captureCardMoveSourceSnapshot(
  sourceElement: HTMLElement | null,
  players: ReadonlyArray<{
    id: string
    hand: readonly string[]
    deck: readonly string[]
    discard: readonly string[]
  }>,
): CardMoveSourceSnapshot {
  return {
    flight: captureCardFlight(sourceElement),
    players: players.map(player => ({
      id: player.id,
      hand: [...player.hand],
      deck: [...player.deck],
      discard: [...player.discard],
    })),
  }
}

export function discardCardMoveSourceSnapshot(snapshot: CardMoveSourceSnapshot | null) {
  discardCardFlight(snapshot?.flight ?? null)
}

/** Keep a visual copy before the engine moves a card to another zone. */
export function captureCardFlight(element: HTMLElement | null): CardFlightSnapshot | null {
  if (!element || typeof document === 'undefined') return null
  if (element.dataset.cardMotionSuppressFlight === 'true') return null
  const instanceId = element.dataset.cardInstanceId
  if (instanceId && isCardInstancePresentedInDecision(instanceId, element.ownerDocument)) return null
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const sourceImage = element.querySelector<HTMLImageElement>('img')
  const imageSource = sourceImage?.currentSrc || sourceImage?.getAttribute('src')
  if (!sourceImage || !imageSource) return null

  // Render only the card artwork in flight. Cloning the interactive card
  // surface also copies pseudo-element highlights, badges, and hover styling.
  const clone = document.createElement('div')
  clone.className = 'card-flight-clone'
  clone.setAttribute('aria-hidden', 'true')
  const sourceInstanceId = element.getAttribute('data-card-instance-id')
  if (sourceInstanceId) clone.dataset.cardFlightInstanceId = sourceInstanceId
  const image = document.createElement('img')
  const imageStyle = getComputedStyle(sourceImage)
  image.src = imageSource
  image.alt = ''
  image.draggable = false
  image.style.objectFit = imageStyle.objectFit
  image.style.objectPosition = imageStyle.objectPosition
  image.style.borderRadius = imageStyle.borderRadius
  clone.append(image)

  return {
    clone,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

const decisionPresentedCardSelector = '[data-card-motion-suppress-flight="true"][data-card-instance-id]'

/** Return the physical card copies currently displayed as decision choices. */
export function getDecisionPresentedCardInstanceIds(root?: ParentNode): Set<string> {
  const scope = root ?? (typeof document === 'undefined' ? null : document)
  if (!scope) return new Set()
  return new Set([...scope.querySelectorAll<HTMLElement>(decisionPresentedCardSelector)]
    .flatMap(element => element.dataset.cardInstanceId ? [element.dataset.cardInstanceId] : []))
}

/** Check whether a physical card is being presented in a decision window. */
export function isCardInstancePresentedInDecision(instanceId: string, root?: ParentNode): boolean {
  if (!instanceId) return false
  const scope = root ?? (typeof document === 'undefined' ? null : document)
  return !!scope && [...scope.querySelectorAll<HTMLElement>(decisionPresentedCardSelector)]
    .some(element => element.dataset.cardInstanceId === instanceId)
}

export function discardCardFlight(flight: CardFlightSnapshot | null) {
  flight?.clone.remove()
}

/** Hold a captured card in place while a decision is waiting for input. */
export function holdCardFlightAtOrigin(flight: CardFlightSnapshot | null) {
  if (!flight || typeof document === 'undefined') return
  Object.assign(flight.clone.style, {
    position: 'fixed',
    left: `${flight.left}px`,
    top: `${flight.top}px`,
    width: `${flight.width}px`,
    height: `${flight.height}px`,
    margin: '0',
    minWidth: '0',
    maxWidth: 'none',
    minHeight: '0',
    maxHeight: 'none',
    transform: 'translate3d(0, 0, 0) scale(1)',
    transformOrigin: 'top left',
  })
  document.body.append(flight.clone)
}

/** Capture visible card rows and candidate card origins before a zone update. */
export function captureCardZoneMotion(
  root: ParentNode = document,
  excludedElement: HTMLElement | null = null,
): CardZoneMotionSnapshot {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-card-motion-row]')].map(element => ({
    key: element.dataset.cardMotionRow ?? '',
    element,
    positions: captureCardRowPositions(element),
  }))
  const cards = [...root.querySelectorAll<HTMLElement>(
    '[data-card-motion-zone][data-card-motion-card-id][data-card-motion-key]',
  )].flatMap(element => {
    if (element === excludedElement) return []
    // A held play card is a temporary presentation, not a second zone origin.
    if (element.dataset.heldPlayCard === 'true') return []
    const zone = element.dataset.cardMotionZone
    const cardId = element.dataset.cardMotionCardId
    const key = element.dataset.cardMotionKey
    if (!zone || !cardId || !key) return []
    const ownerId = element.dataset.cardMotionOwnerId ?? ''
    const visibility = getComputedStyle(element).visibility
    return [{
      zone,
      cardId,
      ownerId,
      key,
      instanceId: element.dataset.cardInstanceId ?? '',
      flight: visibility === 'hidden' ? null : captureCardFlight(element),
    }]
  })
  return { rows, cards }
}

/** Remove a card handled by a dedicated flight from the generic zone snapshot. */
export function discardCardZoneMotionSource(
  snapshot: CardZoneMotionSnapshot | null,
  zone: string,
  cardId: string,
  ownerId: string,
  key: string,
  instanceId = '',
): boolean {
  if (!snapshot) return false
  const matchesSource = (card: CardZoneMotionCardSnapshot) =>
    card.zone === zone && card.cardId === cardId && card.ownerId === ownerId
  const exactIndex = instanceId
    ? snapshot.cards.findIndex(card => matchesSource(card) && card.instanceId === instanceId)
    : -1
  const index = exactIndex >= 0
    ? exactIndex
    : snapshot.cards.findIndex(card => matchesSource(card) && card.key === key)
  if (index < 0) return false
  const [card] = snapshot.cards.splice(index, 1)
  discardCardFlight(card?.flight ?? null)
  return true
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
  corruption_deck: 'corruption_deck',
  strike_deck: 'strike_deck',
  strike_discard: 'strike_discard',
  trinket_deck: 'trinket_deck',
  destroyed: 'destroyed',
  temporary: 'conjure',
}

export interface CardZoneMotionEventResolution {
  transfers: CardZoneMotionTransfer[]
}

function eventDestination(
  root: ParentNode,
  event: Extract<CardMoveEvent, { kind: 'move' | 'create' }>,
  zone: string,
  sourceZone: string,
): HTMLElement | null {
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
  if (zone === 'deck') {
    return [...root.querySelectorAll<HTMLElement>('[data-card-flight-target="deck"]')]
      .find(element => element.closest<HTMLElement>('[data-player-area-id]')?.dataset.playerAreaId === event.destination.ownerId) ?? null
  }
  if (zone === 'trinket_deck') {
    return [...root.querySelectorAll<HTMLElement>('[data-card-flight-target="trinket-deck"]')][0] ?? null
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
  const relevant = events.filter((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
    event.kind === 'move' &&
      !!motionZoneByEngineZone[event.source.zone] && !!motionZoneByEngineZone[event.destination.zone] &&
      snapshot.cards.some(card => card.instanceId === event.instanceId) &&
      !alreadyClaimedMoveIds.has(event.moveId) &&
      // Recycling a player's discard pile updates the piles without flying
      // each card back into the deck.
      !(event.source.zone === 'discard' && event.destination.zone === 'deck') &&
      // These routes have their own exact, ordered flight queue.
      !(event.source.zone === 'hand' && ['deck', 'discard'].includes(event.destination.zone)) &&
      !(event.reason === 'discard_phase' && event.source.zone === 'played_this_turn' && event.destination.zone === 'discard') &&
      !(event.source.zone === 'temporary' && event.destination.zone === 'deck'),
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
  const usedOrigins = new Set<CardZoneMotionCardSnapshot>()
  const transferredFlights = new Set<CardFlightSnapshot>()
  const takeOriginFlight = (origin: CardZoneMotionCardSnapshot) => {
    const flight = usedOrigins.has(origin) ? cloneCardFlightSnapshot(origin.flight) : origin.flight
    usedOrigins.add(origin)
    if (flight) transferredFlights.add(flight)
    return flight
  }
  for (const [instanceId, moves] of byInstance) {
    const first = moves[0]!
    const last = moves[moves.length - 1]!
    const sourceZone = motionZoneByEngineZone[first.source.zone]!
    const origins = snapshot.cards.filter(card => card.instanceId === instanceId && card.zone === sourceZone)
    const origin = origins.find(card => card.key.startsWith('decision-')) ?? origins[0]
    if (!origin?.flight) continue
    const destinationZone = motionZoneByEngineZone[last.destination.zone]!
    const destination = eventDestination(root, last, destinationZone, sourceZone)
    if (!destination) {
      discardCardFlight(origin.flight)
      continue
    }
    transfers.push({
      sourceZone,
      sourceKey: origin.key,
      sourceInstanceId: instanceId,
      destinationInstanceId: destination.dataset.cardInstanceId ?? '',
      destinationZone,
      waitForZones: (destination.dataset.cardMotionAfterZones ?? '').split(',').map(value => value.trim()).filter(Boolean),
      cardId: last.cardId,
      ownerId: first.source.ownerId ?? last.destination.ownerId ?? '',
      moveId: last.moveId,
      moveIds: moves.map(move => move.moveId),
      sequence: first.sequence,
      flight: takeOriginFlight(origin),
      destination,
      timing: sourceZone === 'breach' && destinationZone === 'discard'
        ? 'breach-to-discard'
        : sourceZone === 'swap' && destinationZone === 'discard'
          ? 'swap-to-discard'
          : sourceZone === 'hand' && destinationZone === 'swap'
            ? 'hand-to-swap-zone'
            : ['hand', 'conjure'].includes(sourceZone) && destinationZone === 'breach'
              ? 'hand-to-breach'
              : sourceZone === 'hand' && destinationZone === 'played'
                ? 'hand-to-play-zone'
                : undefined,
      faceDownOnArrival: sourceZone === 'conjure' && destinationZone === 'breach',
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
      continue
    }
    transfers.push({
      sourceZone,
      sourceKey: origin.key,
      sourceInstanceId: origin.instanceId,
      destinationInstanceId: terminalEvent.instanceId,
      destinationZone,
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
  snapshot.cards.forEach(card => {
    if (card.flight && !transferredFlights.has(card.flight)) discardCardFlight(card.flight)
  })
  return { transfers }
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
  snapshot?.cards.forEach(card => discardCardFlight(card.flight))
}

/** Animate board-zone flights in engine order, honoring authored zone dependencies. */
export async function animateCardZoneMotion(
  transfers: readonly CardZoneMotionTransfer[],
  zoneBarriers: ReadonlyMap<string, Promise<void>> = new Map(),
  prepareTransfer?: (transfer: CardZoneMotionTransfer) => Promise<HTMLElement | null>,
  faceDownImageUrl?: string,
): Promise<void> {
  const animateTransfer = async (transfer: CardZoneMotionTransfer) => {
    const sourceRow = await prepareTransfer?.(transfer) ?? null
    const options = {
      destinationMode: cardZoneFlightDestinationMode(transfer.destinationZone, true),
      restoreDestinationVisibility: transfer.destinationVisibilityBefore,
      afterFlight: transfer.afterFlight,
      timing: transfer.timing,
    }
    const flight = transfer.faceDownOnArrival && faceDownImageUrl
      ? animateCardFlightWithFaceDownReveal(transfer.flight, transfer.destination, faceDownImageUrl, {
        destinationMode: options.destinationMode,
        afterFlight: options.afterFlight,
        timing: options.timing,
      })
      : animateCardFlight(transfer.flight, transfer.destination, options)
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
        for (const transfer of zoneTransfers) await settleTransfer(transfer)
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
        for (const zone of transfer.waitForZones) await settleZone(zone)
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
  for (const transfer of orderedTransfers) await settleTransfer(transfer)
  for (const zone of zoneBarriers.keys()) await settleZone(zone)
}

export type HandCardPositionSnapshot = CardRowPositionSnapshot

const handReflowAnimations = new WeakMap<HTMLElement, Set<Animation>>()

export function hasActiveHandCardReflow(hand: HTMLElement | null): boolean {
  return !!hand && (handReflowAnimations.get(hand)?.size ?? 0) > 0
}

/** Identify the exact departing copy when a hand contains identical cards. */
export function markHandCardDeparting(card: HTMLElement | null) {
  const entry = card?.closest<HTMLElement>('[data-hand-card-visual-key]')
  if (entry) entry.dataset.handCardDeparting = 'true'
}

export function cancelHandCardReflow(hand: HTMLElement | null) {
  cancelCardRowReflow(hand)
}

/** Capture each visible card slot by its stable visual identity before a reflow. */
export function captureCardRowPositions(
  row: HTMLElement | null,
  selector = '[data-card-motion-key]',
  keyAttribute = 'data-card-motion-key',
): CardRowPositionSnapshot {
  const positions: CardRowPositionSnapshot = new Map()
  for (const entry of row?.querySelectorAll<HTMLElement>(selector) ?? []) {
    const key = entry.getAttribute(keyAttribute)
    if (!key) continue
    const rect = entry.getBoundingClientRect()
    positions.set(key, { left: rect.left, top: rect.top, visible: Number(getComputedStyle(entry).opacity) > 0 })
  }
  return positions
}

export function captureHandCardPositions(hand: HTMLElement | null): HandCardPositionSnapshot {
  return captureCardRowPositions(hand, '[data-hand-card-visual-key]', 'data-hand-card-visual-key')
}

export function cancelCardRowReflow(row: HTMLElement | null) {
  if (!row) return
  for (const animation of handReflowAnimations.get(row) ?? []) animation.cancel()
  handReflowAnimations.delete(row)
}

/** Smoothly move surviving cards from their previous screen positions. */
export function animateCardRowReflow(
  row: HTMLElement | null,
  previousPositions: CardRowPositionSnapshot,
  options: {
    selector?: string
    keyAttribute?: string
    durationVariable?: string
    gainingCards?: boolean
    excludedKeys?: ReadonlySet<string>
    animateNewCards?: boolean
  } = {},
) {
  if (!row) return
  const selector = options.selector ?? '[data-card-motion-key]'
  const keyAttribute = options.keyAttribute ?? 'data-card-motion-key'
  // Snapshot the visible positions before cancelling. Measure the new targets
  // only after every previous transform has been removed.
  cancelCardRowReflow(row)
  const rootStyle = getComputedStyle(document.documentElement)
  const rawDuration = rootStyle.getPropertyValue(options.durationVariable ?? (options.gainingCards
    ? '--hand-gain-reflow-duration' : '--hand-card-reflow-duration')).trim()
  const durationValue = Number.parseFloat(rawDuration)
  const duration = rawDuration.endsWith('ms')
    ? durationValue
    : rawDuration.endsWith('s') ? durationValue * 1000 : options.durationVariable ? 240 : 220
  const rawStagger = rootStyle.getPropertyValue('--hand-draw-stagger-duration').trim()
  const staggerValue = Number.parseFloat(rawStagger)
  const staggerDuration = rawStagger.endsWith('ms')
    ? staggerValue
    : rawStagger.endsWith('s') ? staggerValue * 1000 : 45
  const easing = rootStyle.getPropertyValue('--card-flight-easing').trim()
    || 'cubic-bezier(.22, .78, .24, 1)'

  const animations = new Set<Animation>()
  handReflowAnimations.set(row, animations)
  const targets = [...row.querySelectorAll<HTMLElement>(selector)]
    .filter(entry => !options.excludedKeys?.has(entry.getAttribute(keyAttribute) ?? ''))
    .map(entry => ({ entry, rect: entry.getBoundingClientRect() }))
  const survivors = targets.flatMap((target, index) => {
    const previous = previousPositions.get(target.entry.getAttribute(keyAttribute) ?? '')
    return previous ? [{ ...target, previous, index }] : []
  })
  const newCardIndexes = targets.flatMap((target, index) =>
    previousPositions.has(target.entry.getAttribute(keyAttribute) ?? '') ? [] : [index],
  )
  const newCardOrderByIndex = new Map(newCardIndexes.map((index, order) => [index, order]))
  for (const [index, { entry, rect }] of targets.entries()) {
    const key = entry.getAttribute(keyAttribute)
    let previous = key ? previousPositions.get(key) : undefined
    let revealAfterReflow = previous?.visible === false
    if (!previous && survivors.length > 0) {
      if (!options.animateNewCards) continue
      // Extend the old row for appended cards (draw/gain/Conjure). Starting a
      // new card at its centered final slot would overlap the sliding old row.
      const neighbor = survivors.reduce((nearest, candidate) =>
        Math.abs(candidate.index - index) < Math.abs(nearest.index - index) ? candidate : nearest)
      previous = {
        left: neighbor.previous.left + rect.left - neighbor.rect.left,
        top: neighbor.previous.top + rect.top - neighbor.rect.top,
        visible: true,
      }
      // Undo may insert a card into the middle of the row. Reveal it once its
      // neighbors have made room rather than drawing over a surviving card.
      revealAfterReflow = index > survivors[0]!.index && index < survivors[survivors.length - 1]!.index
    } else if (!previous && options.animateNewCards && targets.length > 0) {
      // When the hand was empty, deal new cards from a shared point just to
      // the right of the final slot instead of rendering them in place.
      const rightmost = targets[targets.length - 1]!.rect
      previous = {
        left: rightmost.left + rightmost.width * .55,
        top: rightmost.top,
        visible: true,
      }
    }
    if (!previous || typeof entry.animate !== 'function') continue
    const deltaX = previous.left - rect.left
    const deltaY = previous.top - rect.top
    if (!revealAfterReflow && Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue

    const inverseTransform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
    const newCardOrder = newCardOrderByIndex.get(index)
    const delay = options.gainingCards && newCardOrder !== undefined
      ? (newCardIndexes.length - newCardOrder - 1) * staggerDuration
      : 0
    const animation = entry.animate([
      { transform: inverseTransform, ...(revealAfterReflow ? { opacity: 0 } : {}) },
      { transform: 'translate3d(0, 0, 0)', ...(revealAfterReflow ? { opacity: 0 } : {}) },
    ], { duration, delay, easing, fill: 'both' })
    animations.add(animation)
      const cleanup = () => {
        animations.delete(animation)
        animation.cancel()
      }
      void animation.finished.then(cleanup, cleanup)
    }
}

export function animateHandCardReflow(
  hand: HTMLElement | null,
  previousPositions: HandCardPositionSnapshot,
  gainingCards = false,
) {
  animateCardRowReflow(hand, previousPositions, {
    selector: '[data-hand-card-visual-key]',
    keyAttribute: 'data-hand-card-visual-key',
    gainingCards,
    animateNewCards: true,
  })
}

export async function waitForCardRowReflow(row: HTMLElement | null): Promise<void> {
  if (!row || typeof window === 'undefined') return
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await nextFrame()
  while (row.isConnected) {
    const animations = [...handReflowAnimations.get(row) ?? []]
    if (animations.length === 0) return
    await Promise.allSettled(animations.map(animation => animation.finished))
  }
}

/** Fly a face-down Nemesis deck card to the reveal slot, then turn it face up. */
export async function animateCardRevealFlight(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  resolvedFrontImageUrl?: string,
): Promise<void> {
  if (!flight || !destination || typeof document === 'undefined') {
    discardCardFlight(flight)
    return
  }

  const backImageUrl = flight.clone.querySelector('img')?.getAttribute('src')
  const frontImageUrl = resolvedFrontImageUrl ?? destination.querySelector('img')?.getAttribute('src')
  const target = destination.getBoundingClientRect()
  if (!backImageUrl || !frontImageUrl || target.width <= 0 || target.height <= 0) {
    discardCardFlight(flight)
    return
  }

  const { left, top, width, height } = flight
  const destinationVisibility = destination.style.visibility
  const scene = document.createElement('div')
  scene.className = 'nemesis-draw-flight-scene'
  Object.assign(scene.style, {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    margin: '0',
    transform: 'translate3d(0, 0, 0) scale(1)',
    transformOrigin: 'top left',
  })

  const card = document.createElement('div')
  card.className = 'nemesis-draw-flight-card'
  const back = document.createElement('img')
  back.className = 'nemesis-draw-flight-face nemesis-draw-flight-back'
  back.src = backImageUrl
  back.alt = ''
  const front = document.createElement('img')
  front.className = 'nemesis-draw-flight-face nemesis-draw-flight-front'
  front.src = frontImageUrl
  front.alt = ''
  card.append(back, front)
  scene.append(card)

  destination.style.visibility = 'hidden'
  document.body.append(scene)

  // Decode the actual drawn card before the flip exposes its face. This avoids
  // briefly showing the back again when the front image is not cached yet.
  const decodedFront = new Image()
  decodedFront.src = frontImageUrl
  if (typeof decodedFront.decode === 'function') {
    try {
      await decodedFront.decode()
    } catch {
      // Keep the reveal moving if the browser cannot decode this image eagerly.
    }
  }

  const cssDuration = (variable: string, fallback: number) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) return fallback
    return raw.endsWith('ms') ? value : raw.endsWith('s') ? value * 1000 : fallback
  }
  const duration = cssDuration('--nemesis-draw-flight-duration', 300)
  const flipDuration = cssDuration('--nemesis-draw-flip-duration', 320)
  const flipStartDelay = Math.round(duration * 0.45)
  const easing = getComputedStyle(document.documentElement)
    .getPropertyValue('--card-flight-easing').trim() || 'cubic-bezier(.22, .78, .24, 1)'
  const translateX = target.left - left
  const translateY = target.top - top
  const scaleX = target.width / width
  const scaleY = target.height / height

  try {
    const revealOverlay = document.querySelector<HTMLElement>('.nemesis-draw-reveal-screen')
    const backdrop = revealOverlay?.animate([
      { opacity: 0 },
      { opacity: 1 },
    ], { duration, easing: 'ease-out', fill: 'forwards' })
    const movement = scene.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)' },
      { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})` },
    ], { duration, easing, fill: 'forwards' })
    // Collapse the card to its edge, swap the two image layers while hidden,
    // then expand it again. This avoids showing a mirrored card back during
    // the 3D backface turn, and guarantees the face is visible as it opens.
    const flipOptions: KeyframeAnimationOptions = {
      duration: flipDuration,
      delay: flipStartDelay,
      easing: 'linear',
      fill: 'forwards',
    }
    const flip = card.animate([
      { transform: 'scaleX(1)', offset: 0 },
      { transform: 'scaleX(.015)', offset: .5 },
      { transform: 'scaleX(1)', offset: 1 },
    ], flipOptions)
    const hideBack = back.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: .47 },
      { opacity: 0, offset: .5 },
      { opacity: 0, offset: 1 },
    ], flipOptions)
    const revealFront = front.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: .5 },
      { opacity: 1, offset: .53 },
      { opacity: 1, offset: 1 },
    ], flipOptions)
    await Promise.all([
      movement.finished,
      flip.finished,
      hideBack.finished,
      revealFront.finished,
      ...(backdrop ? [backdrop.finished] : []),
    ])
  } catch {
    // Navigation or teardown can cancel an in-flight reveal.
  } finally {
    scene.remove()
    flight.clone.remove()
    destination.style.visibility = destinationVisibility
  }
}

/**
 * Animate the captured card into its newly rendered destination. Use `overlay`
 * for persistent pile surfaces so they remain visible throughout the flight;
 * use `replace` only when the destination is the newly rendered card itself.
 */
export async function animateCardFlight(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  options: {
    destinationMode?: CardFlightDestinationMode
    timing?: CardFlightTiming
    restoreDestinationVisibility?: string
    afterFlight?: () => void | Promise<void>
  } = {},
): Promise<void> {
  if (!flight || !destination || typeof document === 'undefined') {
    discardCardFlight(flight)
    return
  }

  const target = destination.getBoundingClientRect()
  if (target.width <= 0 || target.height <= 0) {
    discardCardFlight(flight)
    return
  }

  const { clone, left, top, width, height } = flight
  const destinationVisibility = options.restoreDestinationVisibility ?? destination.style.visibility
  const destinationMode = resolveCardFlightDestinationMode(destination, options.destinationMode)
  const hideDestination = destinationMode !== 'overlay'
  if (hideDestination) destination.style.visibility = 'hidden'
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    margin: '0',
    minWidth: '0',
    maxWidth: 'none',
    minHeight: '0',
    maxHeight: 'none',
    transform: 'translate3d(0, 0, 0) scale(1)',
    transformOrigin: 'top left',
  })
  document.body.append(clone)

  const { duration, easing } = resolveCardFlightTiming(options.timing)
  const { translateX, translateY, scaleX, scaleY } = fitCardFlightToTarget(flight, target)

  let completed = false
  try {
    await clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)' },
      { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})` },
    ], { duration, easing, fill: 'forwards' }).finished
    completed = true
  } catch {
    // Navigation or teardown can cancel a flight; the transient clone is still removed.
  }
  try {
    if (completed) await options.afterFlight?.()
  } finally {
    clone.remove()
    if (hideDestination) destination.style.visibility = destinationVisibility
  }
}

/** Flip a captured card back to its face while it flies into a face-up zone. */
export async function animateCardFlightWithReveal(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  faceImageUrl: string,
  options: {
    destinationMode?: CardFlightDestinationMode
    timing?: CardFlightTiming
    restoreDestinationVisibility?: string
    afterFlight?: () => void | Promise<void>
  } = {},
): Promise<void> {
  if (!flight || !destination || typeof document === 'undefined') {
    discardCardFlight(flight)
    return
  }

  const target = destination.getBoundingClientRect()
  const clone = flight.clone
  const back = clone.querySelector<HTMLImageElement>('img')
  const backImageUrl = back?.currentSrc || back?.getAttribute('src')
  if (!back || !backImageUrl || !faceImageUrl || target.width <= 0 || target.height <= 0) {
    discardCardFlight(flight)
    return
  }
  if (backImageUrl === faceImageUrl) {
    return animateCardFlight(flight, destination, options)
  }

  const decodedFace = new Image()
  decodedFace.src = faceImageUrl
  if (typeof decodedFace.decode === 'function') {
    try {
      await decodedFace.decode()
    } catch {
      // Keep the flight moving if the browser cannot eagerly decode the face.
    }
  }

  const imageStyle = getComputedStyle(back)
  const face = document.createElement('div')
  face.className = 'card-flight-flip-face'
  face.style.borderRadius = imageStyle.borderRadius

  const front = document.createElement('img')
  front.className = 'card-flight-reveal-front'
  front.src = faceImageUrl
  front.alt = ''
  front.draggable = false
  front.style.objectFit = imageStyle.objectFit
  front.style.objectPosition = imageStyle.objectPosition
  front.style.borderRadius = imageStyle.borderRadius
  back.classList.add('card-flight-reveal-back')
  back.remove()
  face.append(back, front)
  clone.append(face)

  const destinationVisibility = options.restoreDestinationVisibility ?? destination.style.visibility
  const destinationMode = resolveCardFlightDestinationMode(destination, options.destinationMode)
  const hideDestination = destinationMode !== 'overlay'
  if (hideDestination) destination.style.visibility = 'hidden'
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${flight.left}px`,
    top: `${flight.top}px`,
    width: `${flight.width}px`,
    height: `${flight.height}px`,
    margin: '0',
    minWidth: '0',
    maxWidth: 'none',
    minHeight: '0',
    maxHeight: 'none',
    overflow: 'hidden',
    transform: 'translate3d(0, 0, 0) scale(1)',
    transformOrigin: 'top left',
  })
  document.body.append(clone)

  const { duration, easing } = resolveCardFlightTiming(options.timing)
  const { translateX, translateY, scaleX, scaleY } = fitCardFlightToTarget(flight, target)
  const flipDuration = Math.min(180, duration * .5)
  const flipOptions: KeyframeAnimationOptions = {
    duration: flipDuration,
    delay: Math.round(duration * .08),
    easing: 'linear',
    fill: 'forwards',
  }

  let completed = false
  try {
    const movement = clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)' },
      { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})` },
    ], { duration, easing, fill: 'forwards' })
    const flip = face.animate([
      { transform: 'scaleX(1)', offset: 0 },
      { transform: 'scaleX(.015)', offset: .5 },
      { transform: 'scaleX(1)', offset: 1 },
    ], flipOptions)
    const hideBack = back.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: .47 },
      { opacity: 0, offset: .5 },
      { opacity: 0, offset: 1 },
    ], flipOptions)
    const showFront = front.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: .5 },
      { opacity: 1, offset: .53 },
      { opacity: 1, offset: 1 },
    ], flipOptions)
    await Promise.all([movement.finished, flip.finished, hideBack.finished, showFront.finished])
    completed = true
  } catch {
    // Navigation or teardown can cancel the flight; the transient clone is still removed.
  }
  try {
    if (completed) await options.afterFlight?.()
  } finally {
    clone.remove()
    if (hideDestination) destination.style.visibility = destinationVisibility
  }
}

/** Wait for the hand's gain reflow so a flying card lands in its final rightmost slot. */
export async function waitForHandGainReflow(hand: HTMLElement | null): Promise<void> {
  await waitForHandCardReflow(hand)
}

/** Wait for the hand cards to finish sliding into the slots left by a removed card. */
export async function waitForHandCardReflow(hand: HTMLElement | null): Promise<void> {
  await waitForCardRowReflow(hand)
}

// Decode each card back once so repeated deck flights do not pause on the
// image decode before their animation starts.
const decodedCardBackPromises = new Map<string, Promise<void>>()
function decodeCardBackOnce(imageUrl: string): Promise<void> {
  const cached = decodedCardBackPromises.get(imageUrl)
  if (cached) return cached
  const image = new Image()
  image.src = imageUrl
  const promise = typeof image.decode === 'function'
    ? image.decode().catch(() => undefined)
    : Promise.resolve()
  decodedCardBackPromises.set(imageUrl, promise)
  return promise
}

/** Flip a face-up card to a supplied card back as it flies into a face-down zone. */
export async function animateCardFlightWithFaceDownReveal(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  cardBackImageUrl: string,
  options: {
    destinationMode?: CardFlightDestinationMode
    timing?: CardFlightTiming
    afterFlight?: () => void | Promise<void>
    backBorderRadius?: string
  } = {},
): Promise<void> {
  if (!flight || !destination || typeof document === 'undefined') {
    discardCardFlight(flight)
    return
  }

  const target = destination.getBoundingClientRect()
  const front = flight.clone.querySelector<HTMLImageElement>('img')
  const frontImageUrl = front?.currentSrc || front?.getAttribute('src')
  if (!frontImageUrl || target.width <= 0 || target.height <= 0) {
    discardCardFlight(flight)
    return
  }
  if (frontImageUrl === cardBackImageUrl) {
    return animateCardFlight(flight, destination, options)
  }

  const clone = flight.clone
  const frontStyle = front ? getComputedStyle(front) : null
  const back = document.createElement('img')
  back.src = cardBackImageUrl
  back.alt = ''
  back.draggable = false
  back.className = 'card-flight-flip-back'
  if (frontStyle) {
    back.style.objectFit = frontStyle.objectFit
    back.style.objectPosition = frontStyle.objectPosition
  }
  const cardFaceRadius = options.backBorderRadius ?? frontStyle?.borderRadius ?? ''
  back.style.borderRadius = cardFaceRadius
  const face = document.createElement('div')
  face.className = 'card-flight-flip-face'
  face.style.borderRadius = cardFaceRadius
  if (front) {
    front.classList.add('card-flight-flip-front')
    front.remove()
    face.append(front, back)
    clone.append(face)
  } else {
    face.append(back)
    clone.append(face)
  }
  clone.style.borderRadius = cardFaceRadius

  const destinationVisibility = destination.style.visibility
  const destinationMode = resolveCardFlightDestinationMode(destination, options.destinationMode)
  const hideDestination = destinationMode !== 'overlay'
  if (hideDestination) destination.style.visibility = 'hidden'
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${flight.left}px`,
    top: `${flight.top}px`,
    width: `${flight.width}px`,
    height: `${flight.height}px`,
    margin: '0',
    minWidth: '0',
    maxWidth: 'none',
    minHeight: '0',
    maxHeight: 'none',
    overflow: 'hidden',
    transform: 'translate3d(0, 0, 0) scale(1)',
    transformOrigin: 'top left',
  })
  document.body.append(clone)

  const decodedBack = decodeCardBackOnce(cardBackImageUrl)
  await decodedBack

  const { duration, easing } = resolveCardFlightTiming(options.timing)
  const { translateX, translateY, scaleX, scaleY } = fitCardFlightToTarget(flight, target)

  let completed = false
  try {
    const movement = clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)' },
      { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})` },
    ], { duration, easing, fill: 'forwards' })
    // Collapse early and exchange faces while edge-on so the card back is
    // shown upright instead of appearing mirrored. Keep the flip short and
    // start it right after the launch so short flights do not feel delayed.
    const flipDuration = Math.min(180, duration * .5)
    const flipOptions: KeyframeAnimationOptions = {
      duration: flipDuration,
      delay: duration * .08,
      easing: 'linear',
      fill: 'forwards',
    }
    const flip = face.animate([
      { transform: 'scaleX(1)', offset: 0 },
      { transform: 'scaleX(.015)', offset: .5 },
      { transform: 'scaleX(1)', offset: 1 },
    ], flipOptions)
    const hideFront = front?.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: .47 },
      { opacity: 0, offset: .5 },
      { opacity: 0, offset: 1 },
    ], flipOptions)
    const showBack = back.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: .5 },
      { opacity: 1, offset: .53 },
      { opacity: 1, offset: 1 },
    ], flipOptions)
    await Promise.all([
      movement.finished,
      flip.finished,
      ...(hideFront ? [hideFront.finished] : []),
      showBack.finished,
    ])
    completed = true
  } catch {
    // Navigation or teardown can cancel a flight; the transient clone is removed below.
  } finally {
    try {
      if (completed) await options.afterFlight?.()
    } finally {
      clone.remove()
      if (hideDestination) destination.style.visibility = destinationVisibility
    }
  }
}

/** Fly into the hidden player deck, turning the card to its back on the way. */
export function animateCardFlightToPlayerDeck(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  playerCardBackImageUrl: string,
  options: {
    destinationMode?: CardFlightDestinationMode
    timing?: CardFlightTiming
    afterFlight?: () => void | Promise<void>
  } = {},
): Promise<void> {
  return animateCardFlightWithFaceDownReveal(flight, destination, playerCardBackImageUrl, {
    ...options,
    destinationMode: options.destinationMode ?? cardZoneFlightDestinationMode('deck', false),
    backBorderRadius: 'calc(var(--card-radius) - var(--pixel-border-width))',
  })
}
