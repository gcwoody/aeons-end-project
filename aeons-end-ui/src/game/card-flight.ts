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
  amount: number
  arrivalCount: number
  flight: CardFlightSnapshot | null
}

export interface CardZoneMotionSnapshot {
  rows: Array<{
    key: string
    element: HTMLElement
    positions: CardRowPositionSnapshot
  }>
  cards: CardZoneMotionCardSnapshot[]
  externalArrivals: Array<{ zone: string; cardId: string; ownerId: string; amount: number }>
}

export interface CardZoneMotionTransfer {
  sourceZone: string
  sourceKey: string
  destinationZone: string
  waitForZones: string[]
  cardId: string
  ownerId: string
  flight: CardFlightSnapshot | null
  destination: HTMLElement | null
  destinationVisibilityBefore?: string
  timing?: CardFlightTiming
}

export type PlayerCardZone = 'hand' | 'deck' | 'discard'
export type CardFlightDestinationMode = 'overlay' | 'replace'
export type CardFlightTiming =
  | 'standard'
  | 'hand-to-play-zone'
  | 'hand-to-swap-zone'
  | 'swap-to-discard'
  | 'hand-to-deck-top'
  | 'hand-to-pile'
  | 'discard-phase'

/**
 * Deck and discard pile surfaces represent persistent piles and stay visible
 * while a card is added. A newly rendered hand card is temporarily replaced
 * by the flying copy to avoid showing the same card twice.
 */
export function cardZoneFlightDestinationMode(
  zone: PlayerCardZone,
  targetIsNewCard: boolean,
): CardFlightDestinationMode {
  return zone === 'deck' || zone === 'discard' || !targetIsNewCard ? 'overlay' : 'replace'
}

export interface PlayerCardZones {
  id: string
  hand: readonly string[]
  deck: readonly string[]
  discard: readonly string[]
}

export interface CardZoneTransferSnapshot {
  flight: CardFlightSnapshot | null
  sourceCardIds: string[]
  players: Array<{
    id: string
    hand: string[]
    deck: string[]
    discard: string[]
  }>
}

export interface CardZoneTransfer {
  cardId: string
  playerId: string
  zone: PlayerCardZone
  zoneIndex: number
  sourcePlayerId?: string
  sourceHandIndex?: number
  flight: CardFlightSnapshot | null
  timing?: CardFlightTiming
  previousDeckTop: string | null
  previousDeckCount: number
  previousDiscardTop: string | null
  previousDiscardCount: number
}

/** Capture a board pile and player zones before an effect moves cards. */
export function captureCardZoneTransfer(
  sourceElement: HTMLElement | null,
  sourceCardIds: readonly string[],
  players: readonly PlayerCardZones[],
): CardZoneTransferSnapshot {
  return {
    flight: captureCardFlight(sourceElement),
    sourceCardIds: [...sourceCardIds],
    players: players.map(player => ({
      id: player.id,
      hand: [...player.hand],
      deck: [...player.deck],
      discard: [...player.discard],
    })),
  }
}

/**
 * Match cards removed from a board pile with cards added to player zones.
 * The same helper handles market purchases and Nemesis-specific card gains.
 */
export function resolveCardZoneTransfers(
  snapshot: CardZoneTransferSnapshot,
  sourceCardIdsAfter: readonly string[],
  playersAfter: readonly PlayerCardZones[],
): CardZoneTransfer[] {
  const count = (ids: readonly string[], cardId: string) => ids.filter(id => id === cardId).length
  const removed = new Map<string, number>()
  for (const cardId of new Set(snapshot.sourceCardIds)) {
    const amount = count(snapshot.sourceCardIds, cardId) - count(sourceCardIdsAfter, cardId)
    if (amount > 0) removed.set(cardId, amount)
  }

  const beforeByPlayer = new Map(snapshot.players.map(player => [player.id, player]))
  const additions: Array<{ cardId: string; playerId: string; zone: PlayerCardZone; zoneIndex: number }> = []
  for (const player of playersAfter) {
    const before = beforeByPlayer.get(player.id)
    if (!before) continue
    for (const zone of ['hand', 'deck', 'discard'] as const) {
      const remainingBefore = new Map<string, number>()
      for (const cardId of before[zone]) {
        remainingBefore.set(cardId, (remainingBefore.get(cardId) ?? 0) + 1)
      }
      for (let zoneIndex = 0; zoneIndex < player[zone].length; zoneIndex++) {
        const cardId = player[zone][zoneIndex]!
        const available = remainingBefore.get(cardId) ?? 0
        if (available > 0) remainingBefore.set(cardId, available - 1)
        else additions.push({ cardId, playerId: player.id, zone, zoneIndex })
      }
    }
  }

  const transfers: CardZoneTransfer[] = []
  for (const addition of additions) {
    const available = removed.get(addition.cardId) ?? 0
    if (available <= 0) continue
    removed.set(addition.cardId, available - 1)
    transfers.push({
      ...addition,
      previousDeckTop: beforeByPlayer.get(addition.playerId)?.deck[0] ?? null,
      previousDeckCount: beforeByPlayer.get(addition.playerId)?.deck.length ?? 0,
      previousDiscardTop: beforeByPlayer.get(addition.playerId)?.discard[0] ?? null,
      previousDiscardCount: beforeByPlayer.get(addition.playerId)?.discard.length ?? 0,
      flight: snapshot.flight ? {
        clone: snapshot.flight.clone.cloneNode(true) as HTMLElement,
        left: snapshot.flight.left,
        top: snapshot.flight.top,
        width: snapshot.flight.width,
        height: snapshot.flight.height,
      } : null,
    })
  }
  discardCardFlight(snapshot.flight)
  return transfers
}

export function discardCardZoneTransfer(snapshot: CardZoneTransferSnapshot | null) {
  discardCardFlight(snapshot?.flight ?? null)
}

/** Keep a visual copy before the engine moves a card to another zone. */
export function captureCardFlight(element: HTMLElement | null): CardFlightSnapshot | null {
  if (!element || typeof document === 'undefined') return null
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
    // A card held in hand for a pending decision is presented UI, not real
    // hand state. Its dedicated flight handles the move, so the generic zone
    // motion must not treat it as a hand departure.
    if (element.dataset.heldPlayCard === 'true') return []
    const zone = element.dataset.cardMotionZone
    const cardId = element.dataset.cardMotionCardId
    const key = element.dataset.cardMotionKey
    if (!zone || !cardId || !key) return []
    const ownerId = element.dataset.cardMotionOwnerId ?? ''
    const rawAmount = Number(element.dataset.cardMotionCount)
    const visibility = getComputedStyle(element).visibility
    return [{
      zone,
      cardId,
      ownerId,
      key,
      amount: Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 1,
      arrivalCount: Number.isFinite(Number(element.dataset.cardMotionArrivalCount))
        ? Math.max(0, Number(element.dataset.cardMotionArrivalCount)) : 1,
      flight: visibility === 'hidden' ? null : captureCardFlight(element),
    }]
  })
  return { rows, cards, externalArrivals: [] }
}

/** Account for a separately animated arrival omitted from the DOM snapshot. */
export function recordCardZoneMotionArrival(
  snapshot: CardZoneMotionSnapshot | null,
  zone: string,
  cardId: string,
  ownerId: string,
  amount = 1,
) {
  if (!snapshot || amount <= 0) return
  snapshot.externalArrivals.push({ zone, cardId, ownerId, amount })
}

/** Remove a card handled by a dedicated flight from the generic zone snapshot. */
export function discardCardZoneMotionSource(
  snapshot: CardZoneMotionSnapshot | null,
  zone: string,
  cardId: string,
  ownerId: string,
  key: string,
): boolean {
  if (!snapshot) return false
  const index = snapshot.cards.findIndex(card =>
    card.zone === zone && card.cardId === cardId && card.ownerId === ownerId && card.key === key)
  if (index < 0) return false
  const [card] = snapshot.cards.splice(index, 1)
  discardCardFlight(card?.flight ?? null)
  return true
}

/** Resolve real card departures and arrivals after Vue has rendered the new zones. */
export function resolveCardZoneMotion(
  snapshot: CardZoneMotionSnapshot,
  root: ParentNode = document,
): CardZoneMotionTransfer[] {
  const currentCards = [...root.querySelectorAll<HTMLElement>(
    '[data-card-motion-zone][data-card-motion-card-id][data-card-motion-key]',
  )].flatMap(element => {
    const zone = element.dataset.cardMotionZone
    const cardId = element.dataset.cardMotionCardId
    const key = element.dataset.cardMotionKey
    if (!zone || !cardId || !key) return []
    return [{
      zone,
      cardId,
      key,
      ownerId: element.dataset.cardMotionOwnerId ?? '',
      amount: Number.isFinite(Number(element.dataset.cardMotionCount))
        ? Math.max(0, Number(element.dataset.cardMotionCount)) : 1,
      arrivalCount: Number.isFinite(Number(element.dataset.cardMotionArrivalCount))
        ? Math.max(0, Number(element.dataset.cardMotionArrivalCount)) : 1,
      acceptedSourceZones: (element.dataset.cardMotionFromZones ?? '').split(',').map(value => value.trim()).filter(Boolean),
      waitForZones: (element.dataset.cardMotionAfterZones ?? '').split(',').map(value => value.trim()).filter(Boolean),
      element,
    }]
  })
  const transfers: CardZoneMotionTransfer[] = []
  const usedOrigins = new Set<CardZoneMotionCardSnapshot>()
  const addedDestinations = currentCards.flatMap(card => {
    const previous = snapshot.cards.find(before =>
      before.zone === card.zone && before.cardId === card.cardId &&
      before.ownerId === card.ownerId && before.key === card.key)
    const arrivals = previous ? Math.max(0, card.arrivalCount - previous.arrivalCount) : 1
    return Array.from({ length: arrivals }, () => ({ ...card }))
  })
  const usedDestinations = new Set<(typeof addedDestinations)[number]>()
  const sourceZones = new Set(snapshot.cards.map(card => card.zone))
  for (const sourceZone of sourceZones) {
    const cardIds = new Set(snapshot.cards.filter(card => card.zone === sourceZone).map(card => card.cardId))
    for (const cardId of cardIds) {
      const sourceOwners = new Set(snapshot.cards
        .filter(card => card.zone === sourceZone && card.cardId === cardId)
        .map(card => card.ownerId))
      for (const ownerId of sourceOwners) {
        const sourceBefore = snapshot.cards.filter(card =>
          card.zone === sourceZone && card.cardId === cardId && card.ownerId === ownerId)
        const sourceAfter = currentCards.filter(card =>
          card.zone === sourceZone && card.cardId === cardId && card.ownerId === ownerId)
        const beforeAmount = sourceBefore.reduce((total, card) => total + card.amount, 0)
        const afterAmount = sourceAfter.reduce((total, card) => total + card.amount, 0)
        let departures = Math.max(0, beforeAmount - afterAmount)
        const acceptedDestinations = () => addedDestinations.filter(card =>
          card.cardId === cardId &&
          card.acceptedSourceZones.includes(sourceZone) &&
          (card.ownerId === ownerId || !ownerId || !card.ownerId) &&
          !usedDestinations.has(card))
        const externalArrivals = snapshot.externalArrivals
          .filter(arrival => arrival.zone === sourceZone && arrival.cardId === cardId && arrival.ownerId === ownerId)
          .reduce((total, arrival) => total + arrival.amount, 0)
        if (externalArrivals > 0) {
          departures += Math.min(externalArrivals, Math.max(0, acceptedDestinations().length - departures))
        }
        departures = Math.min(departures, acceptedDestinations().length)
        while (departures > 0) {
          const origin = sourceBefore.find(card => card.flight) ?? sourceBefore[0]
          const destination = acceptedDestinations()[0]
          if (!destination || !origin) break
          const flight = usedOrigins.has(origin) ? cloneCardFlightSnapshot(origin.flight) : origin.flight
          usedOrigins.add(origin)
          usedDestinations.add(destination)
          transfers.push({
            sourceZone,
            sourceKey: origin.key,
            destinationZone: destination.zone,
            waitForZones: destination.waitForZones,
            cardId,
            ownerId,
            flight,
            destination: destination.element,
            timing: sourceZone === 'swap' && destination.zone === 'discard'
              ? 'swap-to-discard'
              : undefined,
          })
          departures--
        }
      }
    }
  }

  const transferredFlights = new Set(transfers.map(transfer => transfer.flight).filter(Boolean))
  snapshot.cards.forEach(card => {
    if (card.flight && !transferredFlights.has(card.flight)) discardCardFlight(card.flight)
  })
  return transfers
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

/** Animate board-zone flights in dependency order and reflow every affected row. */
export async function animateCardZoneMotion(
  transfers: readonly CardZoneMotionTransfer[],
  zoneBarriers: ReadonlyMap<string, Promise<void>> = new Map(),
  prepareTransfer?: (transfer: CardZoneMotionTransfer) => Promise<HTMLElement | null>,
): Promise<void> {
  const animateTransfer = async (transfer: CardZoneMotionTransfer) => {
    const sourceRow = await prepareTransfer?.(transfer) ?? null
    const flight = animateCardFlight(transfer.flight, transfer.destination, {
      destinationMode: 'replace',
      restoreDestinationVisibility: transfer.destinationVisibilityBefore,
      timing: transfer.timing,
    })
    if (sourceRow) {
      await Promise.all([flight, waitForCardRowReflow(sourceRow)])
      return
    }
    if (transfer.sourceZone !== 'hand' || !transfer.ownerId || typeof document === 'undefined') {
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
  const settleZone = (zone: string): Promise<void> => {
    const settled = settledZones.get(zone)
    if (settled) return settled
    // Zone sequencing is authored as a DAG. If a future route accidentally
    // declares a cycle, break the cycle instead of leaving the action pending.
    if (settlingZones.has(zone)) return Promise.resolve()
    settlingZones.add(zone)
    const zoneTransfers = transfersByDestination.get(zone) ?? []
    const prerequisiteZones = new Set(zoneTransfers.flatMap(transfer => transfer.waitForZones))
    const prerequisites = [...prerequisiteZones].map(settleZone)
    const transfersByElement = new Map<HTMLElement | null, CardZoneMotionTransfer[]>()
    for (const transfer of zoneTransfers) {
      const destinationTransfers = transfersByElement.get(transfer.destination) ?? []
      destinationTransfers.push(transfer)
      transfersByElement.set(transfer.destination, destinationTransfers)
    }
    const zoneFlights = [...transfersByElement.values()].map(async destinationTransfers => {
      for (const transfer of destinationTransfers) {
        await Promise.all(transfer.waitForZones.map(settleZone))
        await animateTransfer(transfer)
      }
    })
    const barrier = zoneBarriers.get(zone)
    const zoneSettled = Promise.all([
      ...(barrier ? [barrier] : []),
      ...prerequisites,
      ...zoneFlights,
    ]).then(() => undefined)
    settledZones.set(zone, zoneSettled)
    settlingZones.delete(zone)
    return zoneSettled
  }

  const zones = new Set([
    ...transfersByDestination.keys(),
    ...zoneBarriers.keys(),
  ])
  await Promise.all([...zones].map(settleZone))
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
    }
    if (!previous || typeof entry.animate !== 'function') continue
    const deltaX = previous.left - rect.left
    const deltaY = previous.top - rect.top
    if (!revealAfterReflow && Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue

    const inverseTransform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
    const animation = entry.animate([
      { transform: inverseTransform, ...(revealAfterReflow ? { opacity: 0 } : {}) },
      { transform: 'translate3d(0, 0, 0)', ...(revealAfterReflow ? { opacity: 0 } : {}) },
    ], { duration, easing, fill: 'both' })
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
  const hideDestination = options.destinationMode !== 'overlay'
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

  const rootStyle = getComputedStyle(document.documentElement)
  const durationVariable = options.timing === 'hand-to-play-zone'
    ? '--hand-to-play-zone-flight-duration'
    : options.timing === 'hand-to-swap-zone'
      ? '--hand-to-swap-zone-flight-duration'
    : options.timing === 'swap-to-discard'
      ? '--swap-to-discard-flight-duration'
    : options.timing === 'hand-to-deck-top'
      ? '--hand-to-deck-top-flight-duration'
    : options.timing === 'hand-to-pile'
      ? '--hand-to-pile-flight-duration'
    : options.timing === 'discard-phase'
      ? '--discard-phase-flight-duration'
      : '--card-flight-duration'
  const durationToken = rootStyle.getPropertyValue(durationVariable).trim()
  const durationValue = Number.parseFloat(durationToken)
  const duration = durationToken.endsWith('ms')
    ? durationValue
    : durationToken.endsWith('s') ? durationValue * 1000 : 360
  const easing = rootStyle.getPropertyValue('--card-flight-easing').trim()
    || 'cubic-bezier(.22, .78, .24, 1)'
  const translateX = target.left - left
  const translateY = target.top - top
  const scaleX = target.width / width
  const scaleY = target.height / height

  try {
    await clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)' },
      { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})` },
    ], { duration, easing, fill: 'forwards' }).finished
  } catch {
    // Navigation or teardown can cancel a flight; the transient clone is still removed.
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

/** Fly a card into the hidden player deck, turning it to the player-card back on the way. */
export async function animateCardFlightToPlayerDeck(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  playerCardBackImageUrl: string,
  options: { destinationMode?: CardFlightDestinationMode; timing?: CardFlightTiming } = {},
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
  if (frontImageUrl === playerCardBackImageUrl) {
    return animateCardFlight(flight, destination, options)
  }

  const clone = flight.clone
  const frontStyle = front ? getComputedStyle(front) : null
  const back = document.createElement('img')
  back.src = playerCardBackImageUrl
  back.alt = ''
  back.draggable = false
  back.className = 'card-flight-flip-back'
  if (frontStyle) {
    back.style.objectFit = frontStyle.objectFit
    back.style.objectPosition = frontStyle.objectPosition
  }
  const playerDeckImageRadius = 'calc(var(--card-radius) - var(--pixel-border-width))'
  back.style.borderRadius = playerDeckImageRadius
  const face = document.createElement('div')
  face.className = 'card-flight-flip-face'
  face.style.borderRadius = playerDeckImageRadius
  if (front) {
    front.classList.add('card-flight-flip-front')
    front.remove()
    face.append(front, back)
    clone.append(face)
  } else {
    face.append(back)
    clone.append(face)
  }
  clone.style.borderRadius = playerDeckImageRadius

  const destinationVisibility = destination.style.visibility
  const hideDestination = options.destinationMode !== 'overlay'
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

  const decodedBack = decodeCardBackOnce(playerCardBackImageUrl)
  await decodedBack

  const rootStyle = getComputedStyle(document.documentElement)
  const durationVariable = options.timing === 'hand-to-deck-top'
    ? '--hand-to-deck-top-flight-duration'
    : options.timing === 'hand-to-pile'
      ? '--hand-to-pile-flight-duration'
      : '--card-flight-duration'
  const durationToken = rootStyle.getPropertyValue(durationVariable).trim()
  const durationValue = Number.parseFloat(durationToken)
  const duration = durationToken.endsWith('ms')
    ? durationValue
    : durationToken.endsWith('s') ? durationValue * 1000 : 600
  const easing = rootStyle.getPropertyValue('--card-flight-easing').trim()
    || 'cubic-bezier(.22, .78, .24, 1)'
  const translateX = target.left - flight.left
  const translateY = target.top - flight.top
  const scaleX = target.width / flight.width
  const scaleY = target.height / flight.height

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
  } catch {
    // Navigation or teardown can cancel a flight; the transient clone is removed below.
  } finally {
    clone.remove()
    if (hideDestination) destination.style.visibility = destinationVisibility
  }
}
