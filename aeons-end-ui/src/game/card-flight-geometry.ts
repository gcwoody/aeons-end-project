export interface CardFlightOrigin {
  left: number
  top: number
  width: number
  height: number
}

function fitCardFlightToTarget(flight: CardFlightOrigin, target: DOMRect) {
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

const geometrySamples = 60

function cubicBezierValue(t: number, first: number, second: number): number {
  const inverse = 1 - t
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t
}

function easingControls(easing: string): [number, number, number, number] | null {
  const cubic = easing.match(/^cubic-bezier\(\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*\)$/i)
  if (cubic) return cubic.slice(1).map(Number) as [number, number, number, number]
  const named: Record<string, [number, number, number, number]> = {
    ease: [.25, .1, .25, 1],
    'ease-in': [.42, 0, 1, 1],
    'ease-out': [0, 0, .58, 1],
    'ease-in-out': [.42, 0, .58, 1],
  }
  return named[easing.trim().toLowerCase()] ?? null
}

function easedFlightProgress(progress: number, easing: string): number {
  if (easing === 'linear') return progress
  const controls = easingControls(easing)
  if (!controls) return progress
  const [x1, y1, x2, y2] = controls
  let low = 0
  let high = 1
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const middle = (low + high) / 2
    if (cubicBezierValue(middle, x1, x2) < progress) low = middle
    else high = middle
  }
  return cubicBezierValue((low + high) / 2, y1, y2)
}

function readCardCornerRadius(element: HTMLElement): [number, number] | null {
  const value = getComputedStyle(element).borderTopLeftRadius.trim().split(/\s+/)
  const horizontal = Number.parseFloat(value[0] ?? '')
  const vertical = Number.parseFloat(value[1] ?? value[0] ?? '')
  return Number.isFinite(horizontal) && Number.isFinite(vertical)
    ? [horizontal, vertical]
    : null
}

/** Move a card while keeping its visible corner radius constant on screen. */
export function animateCardFlightPath(
  mover: HTMLElement,
  cornerElements: HTMLElement[],
  flight: CardFlightOrigin,
  target: DOMRect,
  duration: number,
  easing: string,
): Animation[] {
  const { translateX, translateY, scaleX, scaleY } = fitCardFlightToTarget(flight, target)
  const corners = [...new Set(cornerElements)]
    .map(element => ({ element, radius: readCardCornerRadius(element) }))
    .filter((entry): entry is { element: HTMLElement; radius: [number, number] } => !!entry.radius)
  const sampledProgress = Array.from({ length: geometrySamples + 1 }, (_, index) =>
    easedFlightProgress(index / geometrySamples, easing),
  )

  const animations = [mover.animate([
    { transform: 'translate3d(0, 0, 0) scale(1)' },
    { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})` },
  ], { duration, easing, fill: 'forwards' })]
  const linearOptions: KeyframeAnimationOptions = { duration, easing: 'linear', fill: 'forwards' }
  for (const { element, radius } of corners) {
    const radiusFrames: Keyframe[] = sampledProgress.map(progress => {
      const currentScaleX = 1 + (scaleX - 1) * progress
      const currentScaleY = 1 + (scaleY - 1) * progress
      return {
        borderRadius: `${radius[0] / currentScaleX}px / ${radius[1] / currentScaleY}px`,
      }
    })
    animations.push(element.animate(radiusFrames, linearOptions))
  }
  return animations
}
