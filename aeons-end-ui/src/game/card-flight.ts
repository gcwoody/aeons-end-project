import {
  cardZoneFlightDestinationMode,
  resolveCardFlightDestinationMode,
  resolveCardFlightTiming,
  resolveCardMotionDuration,
  resolveCardMotionEasing,
} from './card-motion-policy'
import type { CardFlightDestinationMode, CardFlightTiming, PlayerCardZone } from './card-motion-policy'

export {
  cardZoneFlightDestinationMode,
  resolveCardFlightDestinationMode,
  resolveCardFlightTiming,
} from './card-motion-policy'
export type {
  CardFlightDestinationMode,
  CardFlightTiming,
  PlayerCardZone,
} from './card-motion-policy'

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
  sequence?: number
  moveId?: string
  moveIds?: string[]
  instanceId?: string
  cardId: string
  sourceZoneId?: string
  destinationZoneId?: string
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
  arrivalDestination?: HTMLElement | null
  arrivalDestinationVisibilityBefore?: string
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
  const durationVariable = options.durationVariable ?? (options.gainingCards
    ? '--hand-gain-reflow-duration' : '--hand-card-reflow-duration')
  const duration = resolveCardMotionDuration(durationVariable)
  const staggerDuration = resolveCardMotionDuration('--hand-draw-stagger-duration')
  const easing = resolveCardMotionEasing()

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

  const duration = resolveCardMotionDuration('--nemesis-draw-flight-duration')
  const flipDuration = resolveCardMotionDuration('--nemesis-draw-flip-duration')
  const flipStartDelay = Math.round(duration * 0.45)
  const easing = resolveCardMotionEasing()
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
