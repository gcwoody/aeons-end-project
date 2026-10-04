export interface CardFlightSnapshot {
  clone: HTMLElement
  left: number
  top: number
  width: number
  height: number
}

/** Keep a visual copy before the engine moves a card to another zone. */
export function captureCardFlight(element: HTMLElement | null): CardFlightSnapshot | null {
  if (!element || typeof document === 'undefined') return null
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const clone = element.cloneNode(true) as HTMLElement
  clone.classList.add('card-flight-clone')
  clone.removeAttribute('id')
  clone.removeAttribute('aria-label')
  clone.removeAttribute('title')
  clone.removeAttribute('disabled')
  clone.setAttribute('aria-hidden', 'true')
  clone.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'))
  clone.querySelectorAll('.remaining, .develop-cost-badge, .market-set-card-overlay, .pile-count-badge')
    .forEach(child => child.remove())

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

/** Animate the captured card into its newly rendered destination. */
export async function animateCardFlight(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  options: { hideDestination?: boolean } = {},
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
  const destinationVisibility = destination.style.visibility
  const hideDestination = options.hideDestination ?? true
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
  const durationToken = rootStyle.getPropertyValue('--card-flight-duration').trim()
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
