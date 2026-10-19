export type PlayerCardZone = 'hand' | 'deck' | 'discard'
export type CardFlightDestinationMode = 'overlay' | 'replace'
export type CardFace = 'front' | 'back'
export type CardFlightTiming =
  | 'standard'
  | 'breach-to-discard'
  | 'hand-to-breach'
  | 'hand-to-play-zone'
  | 'hand-to-swap-zone'
  | 'swap-to-discard'
  | 'hand-to-deck-top'
  | 'hand-to-pile'
  | 'played-to-nemesis-specific-deck'
  | 'discard-phase'
  | 'destroy'

interface CardFlightTimingConfig {
  durationVariable: string
}

const motionDurationFallbacks: Record<string, number> = {
  '--card-flight-duration': 600,
  '--breach-to-discard-flight-duration': 180,
  '--hand-to-breach-flight-duration': 220,
  '--hand-to-play-zone-flight-duration': 200,
  '--hand-to-swap-zone-flight-duration': 200,
  '--swap-to-discard-flight-duration': 200,
  '--hand-to-deck-top-flight-duration': 300,
  '--hand-to-pile-flight-duration': 200,
  '--played-to-nemesis-specific-deck-flight-duration': 300,
  '--discard-phase-flight-duration': 200,
  '--destroy-card-flight-duration': 300,
  '--hand-gain-reflow-duration': 220,
  '--hand-card-reflow-duration': 220,
  '--hand-draw-stagger-duration': 45,
  '--card-zone-reflow-duration': 240,
  '--nemesis-draw-flight-duration': 500,
  '--nemesis-draw-flip-duration': 150,
}

/** Pile surfaces remain visible while an arriving card flies over them. */
const persistentPileZones = new Set([
  'deck', 'discard', 'specific_deck', 'trinket_deck',
  'nemesis_deck', 'nemesis_discard', 'corruption_deck',
  'strike_deck', 'strike_discard', 'destroyed',
])

function normalizePileZone(zone: string): string {
  const normalized = zone.trim().toLowerCase().replace(/-/g, '_')
  if (normalized === 'nemesis_specific_deck') return 'strike_deck'
  if (normalized === 'nemesis_specific_discard') return 'strike_discard'
  return normalized
}

function isPersistentPileZone(zone: string | undefined): boolean {
  return !!zone && persistentPileZones.has(normalizePileZone(zone))
}

function isPersistentPileDestination(destination: HTMLElement): boolean {
  let element: HTMLElement | null = destination
  while (element) {
    if (element.dataset.nemesisDeckPile === 'true') return true
    if ([
      element.dataset.cardMotionZone,
      element.dataset.cardFlightZone,
      element.dataset.cardFlightTarget,
      element.dataset.cardFlightSource,
    ].some(isPersistentPileZone)) return true
    element = element.parentElement
  }
  return false
}

const cardFlightTimingConfig: Record<CardFlightTiming, CardFlightTimingConfig> = {
  standard: { durationVariable: '--card-flight-duration' },
  'breach-to-discard': { durationVariable: '--breach-to-discard-flight-duration' },
  'hand-to-breach': { durationVariable: '--hand-to-breach-flight-duration' },
  'hand-to-play-zone': { durationVariable: '--hand-to-play-zone-flight-duration' },
  'hand-to-swap-zone': { durationVariable: '--hand-to-swap-zone-flight-duration' },
  'swap-to-discard': { durationVariable: '--swap-to-discard-flight-duration' },
  'hand-to-deck-top': { durationVariable: '--hand-to-deck-top-flight-duration' },
  'hand-to-pile': { durationVariable: '--hand-to-pile-flight-duration' },
  'played-to-nemesis-specific-deck': { durationVariable: '--played-to-nemesis-specific-deck-flight-duration' },
  'discard-phase': { durationVariable: '--discard-phase-flight-duration' },
  destroy: { durationVariable: '--destroy-card-flight-duration' },
}

/** Read a CSS animation duration using one shared parser and fallback rule. */
export function resolveCardMotionDuration(
  variable: string,
  fallbackDurationMs = motionDurationFallbacks[variable] ?? 0,
): number {
  const token = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return fallbackDurationMs
  if (token.endsWith('ms')) return value
  if (token.endsWith('s')) return value * 1000
  return fallbackDurationMs
}

export function resolveCardMotionEasing(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--card-flight-easing').trim()
    || 'cubic-bezier(.22, .78, .24, 1)'
}

/** Resolve duration and easing once for every card flight renderer. */
export function resolveCardFlightTiming(timing: CardFlightTiming = 'standard') {
  const config = cardFlightTimingConfig[timing]
  return {
    duration: resolveCardMotionDuration(config.durationVariable),
    easing: resolveCardMotionEasing(),
    durationVariable: config.durationVariable,
  }
}

/**
 * Piles stay visible while cards arrive. A newly rendered card is temporarily
 * covered by its flying copy so the same card is not shown twice.
 */
export function cardZoneFlightDestinationMode(
  zone: string,
  targetIsNewCard: boolean,
): CardFlightDestinationMode {
  return isPersistentPileZone(zone) || !targetIsNewCard
    ? 'overlay'
    : 'replace'
}

/** Keep persistent piles visible even when a caller requests replacement. */
export function resolveCardFlightDestinationMode(
  destination: HTMLElement,
  requestedMode: CardFlightDestinationMode = 'replace',
): CardFlightDestinationMode {
  if (isPersistentPileDestination(destination)) return 'overlay'
  return requestedMode
}

export interface CardMotionPolicyInput {
  sourceZone: string
  destinationZone: string
  targetIsNewCard?: boolean
  usePlayCardTimingFallback?: boolean
  reason?: string
}

export interface CardMotionPolicy {
  destinationMode: CardFlightDestinationMode
  timing?: CardFlightTiming
  /** Explicitly force the destination face; otherwise infer it from the zone. */
  faceDownOnArrival?: boolean
}

const faceDownCardZones = new Set([
  'deck',
  'specific_deck',
  'nemesis_deck',
  'corruption_deck',
  'strike_deck',
  'trinket_deck',
])

/** Piles in these zones show the back of their cards. Other zones show fronts. */
export function cardFaceForZone(zone: string): CardFace {
  return faceDownCardZones.has(zone) ? 'back' : 'front'
}

/** Compare the source and destination faces to decide whether a flight should flip. */
export function cardMotionChangesFace(
  sourceZone: string,
  destinationZone: string,
  faceDownOnArrival?: boolean,
  sourceFaceOverride?: CardFace,
): boolean {
  const sourceFace = sourceFaceOverride ?? cardFaceForZone(sourceZone)
  const destinationFace = faceDownOnArrival === undefined
    ? cardFaceForZone(destinationZone)
    : faceDownOnArrival ? 'back' : 'front'
  return sourceFace !== destinationFace
}

/**
 * Shared route rules for movement timing, arrival visibility and face-down
 * arrivals. Source capture and destination lookup remain with each route.
 */
export function resolveCardMotionPolicy({
  sourceZone,
  destinationZone,
  targetIsNewCard = true,
  usePlayCardTimingFallback = false,
  reason,
}: CardMotionPolicyInput): CardMotionPolicy {
  let timing: CardFlightTiming | undefined
  if (destinationZone === 'destroyed') timing = 'destroy'
  else if (reason === 'discard_phase' && sourceZone === 'played' && destinationZone === 'discard') timing = 'discard-phase'
  else if (sourceZone === 'played' && destinationZone === 'strike_deck') timing = 'played-to-nemesis-specific-deck'
  else if (sourceZone === 'breach' && destinationZone === 'discard') timing = 'breach-to-discard'
  else if (sourceZone === 'swap' && destinationZone === 'discard') timing = 'swap-to-discard'
  else if (sourceZone === 'hand' && destinationZone === 'swap') timing = 'hand-to-swap-zone'
  else if (['hand', 'conjure'].includes(sourceZone) && destinationZone === 'breach') timing = 'hand-to-breach'
  else if (sourceZone === 'hand' && destinationZone === 'played') timing = 'hand-to-play-zone'
  else if (sourceZone === 'conjure' && destinationZone === 'deck') timing = 'hand-to-deck-top'
  else if (sourceZone === 'hand' && destinationZone === 'deck') timing = 'hand-to-deck-top'
  else if (sourceZone === 'hand' && destinationZone === 'discard') timing = 'hand-to-pile'
  else if (sourceZone === 'hand' && destinationZone === 'trinket_deck') timing = 'standard'
  else if (sourceZone === 'hand' && usePlayCardTimingFallback && destinationZone !== 'trinket_deck') {
    timing = 'hand-to-play-zone'
  }

  return {
    destinationMode: cardZoneFlightDestinationMode(destinationZone, targetIsNewCard),
    timing,
    ...(sourceZone === 'conjure' && destinationZone === 'breach' ? { faceDownOnArrival: true } : {}),
  }
}
