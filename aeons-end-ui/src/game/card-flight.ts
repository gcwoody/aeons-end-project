export interface CardFlightSnapshot {
  clone: HTMLElement
  left: number
  top: number
  width: number
  height: number
}

export type PlayerCardZone = 'hand' | 'deck' | 'discard'
export type CardFlightDestinationMode = 'overlay' | 'replace'
export type CardFlightTiming = 'standard' | 'hand-to-play-zone' | 'hand-to-discard' | 'discard-phase'

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

export type HandCardPositionSnapshot = Map<string, { left: number; top: number }>

/** Capture each visible hand slot by its stable visual identity before a reflow. */
export function captureHandCardPositions(hand: HTMLElement | null): HandCardPositionSnapshot {
  const positions: HandCardPositionSnapshot = new Map()
  for (const entry of hand?.querySelectorAll<HTMLElement>('[data-hand-card-visual-key]') ?? []) {
    const key = entry.dataset.handCardVisualKey
    if (!key) continue
    const rect = entry.getBoundingClientRect()
    positions.set(key, { left: rect.left, top: rect.top })
  }
  return positions
}

/** Smoothly move surviving hand cards from their previous screen positions. */
export function animateHandCardReflow(hand: HTMLElement | null, previousPositions: HandCardPositionSnapshot) {
  const rootStyle = getComputedStyle(document.documentElement)
  const rawDuration = rootStyle.getPropertyValue('--hand-card-reflow-duration').trim()
  const durationValue = Number.parseFloat(rawDuration)
  const duration = rawDuration.endsWith('ms')
    ? durationValue
    : rawDuration.endsWith('s') ? durationValue * 1000 : 220
  const easing = rootStyle.getPropertyValue('--card-flight-easing').trim()
    || 'cubic-bezier(.22, .78, .24, 1)'

  for (const entry of hand?.querySelectorAll<HTMLElement>('[data-hand-card-visual-key]') ?? []) {
    const key = entry.dataset.handCardVisualKey
    const previous = key ? previousPositions.get(key) : undefined
    if (!previous || typeof entry.animate !== 'function') continue
    const rect = entry.getBoundingClientRect()
    const deltaX = previous.left - rect.left
    const deltaY = previous.top - rect.top
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue

    const inverseTransform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
    entry.style.transform = inverseTransform
    void entry.offsetWidth
    const animation = entry.animate([
      { transform: inverseTransform },
      { transform: 'translate3d(0, 0, 0)' },
    ], { duration, easing, fill: 'both' })
    void animation.finished.then(() => {
      animation.cancel()
      if (entry.style.transform === inverseTransform) entry.style.removeProperty('transform')
    }).catch(() => {
      if (entry.style.transform === inverseTransform) entry.style.removeProperty('transform')
    })
  }
}

/** Begin compressing the visible hand as one selected card starts flying out. */
export function animateHandCardRemovalReflow(hand: HTMLElement | null, removedHandIndex: number): Promise<void> {
  if (!hand) return Promise.resolve()
  const entries = [...hand.querySelectorAll<HTMLElement>('.hand-card-entry')]
  const removedEntry = entries.find(entry =>
    Number(entry.querySelector<HTMLElement>('[data-hand-card-index]')?.dataset.handCardIndex) === removedHandIndex)
  if (!removedEntry) return Promise.resolve()

  const gap = Number.parseFloat(getComputedStyle(hand).gap) || 0
  const shift = removedEntry.getBoundingClientRect().width + gap
  const rootStyle = getComputedStyle(document.documentElement)
  const rawDuration = rootStyle.getPropertyValue('--hand-card-reflow-duration').trim()
  const durationValue = Number.parseFloat(rawDuration)
  const duration = rawDuration.endsWith('ms')
    ? durationValue
    : rawDuration.endsWith('s') ? durationValue * 1000 : 220
  const easing = rootStyle.getPropertyValue('--card-flight-easing').trim()
    || 'cubic-bezier(.22, .78, .24, 1)'
  const animations: Promise<unknown>[] = []

  for (const entry of entries) {
    const cardIndex = Number(entry.querySelector<HTMLElement>('[data-hand-card-index]')?.dataset.handCardIndex)
    if (!Number.isInteger(cardIndex) || cardIndex <= removedHandIndex) continue

    const inverseTransform = `translate3d(${shift}px, 0, 0)`
    entry.style.transform = inverseTransform
    void entry.offsetWidth
    const animation = entry.animate([
      { transform: inverseTransform },
      { transform: 'translate3d(0, 0, 0)' },
    ], { duration, easing, fill: 'both' })
    animations.push(animation.finished.then(() => {
      animation.cancel()
      if (entry.style.transform === inverseTransform) entry.style.removeProperty('transform')
    }).catch(() => {
      if (entry.style.transform === inverseTransform) entry.style.removeProperty('transform')
    }))
  }

  return Promise.all(animations).then(() => undefined)
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
    : options.timing === 'hand-to-discard'
      ? '--hand-to-discard-flight-duration'
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
  if (!hand?.classList.contains('hand-gain-reflow') || typeof window === 'undefined') return

  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  // The component recalculates its centering offset on the next frame after
  // receiving the new hand. Let Vue apply that offset before measuring the slot.
  await nextFrame()
  await nextFrame()

  const transitions = [
    ...hand.getAnimations(),
    ...[...hand.querySelectorAll<HTMLElement>('.hand-card-entry')]
      .flatMap(element => element.getAnimations()),
  ].filter(animation => animation.playState === 'running')
  if (transitions.length > 0) await Promise.allSettled(transitions.map(animation => animation.finished))
}

/** Wait for the hand cards to finish sliding into the slots left by a removed card. */
export async function waitForHandCardReflow(hand: HTMLElement | null): Promise<void> {
  if (!hand || typeof window === 'undefined') return
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await nextFrame()
  await nextFrame()
  const transitions = [
    ...hand.getAnimations(),
    ...[...hand.querySelectorAll<HTMLElement>('.hand-card-entry')]
      .flatMap(element => element.getAnimations()),
  ]
    .filter(animation => animation.playState === 'running')
  if (transitions.length > 0) await Promise.allSettled(transitions.map(animation => animation.finished))
}

/** Fly a card into the hidden player deck, turning it to the player-card back on the way. */
export async function animateCardFlightToPlayerDeck(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  playerCardBackImageUrl: string,
  options: { destinationMode?: CardFlightDestinationMode } = {},
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

  const decodedBack = new Image()
  decodedBack.src = playerCardBackImageUrl
  if (typeof decodedBack.decode === 'function') {
    try {
      await decodedBack.decode()
    } catch {
      // Continue the flight if the browser cannot eagerly decode the card back.
    }
  }

  const rootStyle = getComputedStyle(document.documentElement)
  const durationToken = rootStyle.getPropertyValue('--card-flight-duration').trim()
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
    // Collapse at the midpoint and exchange faces while edge-on so the card
    // back is shown upright instead of appearing mirrored.
    const flip = face.animate([
      { transform: 'scaleX(1)', offset: 0 },
      { transform: 'scaleX(.015)', offset: .5 },
      { transform: 'scaleX(1)', offset: 1 },
    ], { duration: Math.min(300, duration * .75), delay: duration * .18, easing: 'linear', fill: 'forwards' })
    const hideFront = front?.animate([
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: .47 },
      { opacity: 0, offset: .5 },
      { opacity: 0, offset: 1 },
    ], { duration: Math.min(300, duration * .75), delay: duration * .18, easing: 'linear', fill: 'forwards' })
    const showBack = back.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: .5 },
      { opacity: 1, offset: .53 },
      { opacity: 1, offset: 1 },
    ], { duration: Math.min(300, duration * .75), delay: duration * .18, easing: 'linear', fill: 'forwards' })
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
