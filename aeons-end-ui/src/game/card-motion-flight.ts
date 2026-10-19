import { cardImageUrl, playerDeckCardBackUrl } from '../card-images'
import {
  animateCardFlight,
  animateCardRevealFlight,
  animateCardFlightToPlayerDeck,
  animateCardFlightWithFaceDownReveal,
  animateCardFlightWithReveal,
} from './card-flight'
import type { CardFlightSnapshot } from './card-flight'
import { cardFaceForZone, cardMotionChangesFace, resolveCardMotionPolicy } from './card-motion-policy'
import type { CardFlightDestinationMode, CardFlightTiming } from './card-motion-policy'
import { createDestroyedCardFlightTarget } from './card-destroy-motion'

export interface CardMotionFlightInput {
  cardId: string
  sourceZone: string
  sourceFace?: 'front' | 'back'
  destinationZone: string
  flight: CardFlightSnapshot | null
  destination: HTMLElement | null
  reason?: string
  targetIsNewCard?: boolean
  usePlayCardTimingFallback?: boolean
  timing?: CardFlightTiming
  destinationMode?: CardFlightDestinationMode
  restoreDestinationVisibility?: string
  afterFlight?: () => void | Promise<void>
  revealOnArrival?: boolean
  faceDownOnArrival?: boolean
  faceDownImageUrl?: string
  revealFromFaceDown?: boolean
  revealFrontImageUrl?: string
  isCurrent?: () => boolean
}

/** Apply the shared route, speed, card-back and reveal rules to a single flight. */
export function animateCardMotionFlight(input: CardMotionFlightInput): Promise<void> {
  if (input.flight) {
    input.flight.clone.dataset.cardMotionSourceZone = input.sourceZone
    input.flight.clone.dataset.cardMotionDestinationZone = input.destinationZone
  }
  if (input.destinationZone === 'destroyed' && input.destination && input.flight) {
    const target = createDestroyedCardFlightTarget(input.destination, input.flight)
    return renderCardMotionFlight({ ...input, destination: target, destinationMode: 'overlay' })
      .finally(() => target.remove())
  }
  return renderCardMotionFlight(input)
}

function renderCardMotionFlight(input: CardMotionFlightInput): Promise<void> {
  const policy = resolveCardMotionPolicy({
    sourceZone: input.sourceZone,
    destinationZone: input.destinationZone,
    reason: input.reason,
    targetIsNewCard: input.targetIsNewCard,
    usePlayCardTimingFallback: input.usePlayCardTimingFallback,
  })
  const options = {
    destinationMode: input.destinationMode ?? policy.destinationMode,
    timing: input.timing ?? policy.timing,
    restoreDestinationVisibility: input.restoreDestinationVisibility,
    afterFlight: input.afterFlight,
    isCurrent: input.isCurrent,
  }
  const faceDownOnArrival = input.faceDownOnArrival ?? policy.faceDownOnArrival
  const destinationFaceDown = faceDownOnArrival ?? (cardFaceForZone(input.destinationZone) === 'back')
  const changesFace = cardMotionChangesFace(
    input.sourceZone,
    input.destinationZone,
    faceDownOnArrival,
    input.sourceFace,
  )

  if (input.revealFromFaceDown) {
    return animateCardRevealFlight(
      input.flight,
      input.destination,
      input.revealFrontImageUrl ?? cardImageUrl(input.cardId),
    )
  }

  if (input.destinationZone === 'deck') {
    if (!changesFace) return animateCardFlight(input.flight, input.destination, options)
    return animateCardFlightToPlayerDeck(
      input.flight,
      input.destination,
      playerDeckCardBackUrl(input.cardId),
      {
        destinationMode: options.destinationMode,
        timing: options.timing,
        afterFlight: input.afterFlight,
        isCurrent: input.isCurrent,
      },
    )
  }

  if (input.revealOnArrival || (changesFace && !destinationFaceDown)) {
    const faceImageUrl = cardImageUrl(input.cardId)
    if (faceImageUrl) {
      return animateCardFlightWithReveal(
        input.flight,
        input.destination,
        faceImageUrl,
        options,
      )
    }
  }

  const destinationCardBack = input.destination?.querySelector<HTMLImageElement>('img')
  const faceDownImageUrl = input.faceDownImageUrl ?? (destinationFaceDown
    ? input.destinationZone === 'deck'
      ? playerDeckCardBackUrl(input.cardId)
      : destinationCardBack?.currentSrc || destinationCardBack?.src || playerDeckCardBackUrl(input.cardId)
    : undefined)
  if (changesFace && destinationFaceDown && faceDownImageUrl) {
    return animateCardFlightWithFaceDownReveal(
      input.flight,
      input.destination,
      faceDownImageUrl,
      {
        destinationMode: options.destinationMode,
        timing: options.timing,
        afterFlight: input.afterFlight,
        isCurrent: input.isCurrent,
      },
    )
  }

  return animateCardFlight(input.flight, input.destination, options)
}
