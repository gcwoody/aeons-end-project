import { BREACH_IMAGE_IMPORTS } from './generated-image-imports'
import type { BreachState } from '@engine/types'

export function breachImageUrl(breach: BreachState): string {
  const imageKey = `${breach.index}:${breach.opened ? 'open' : 'down'}`
  return BREACH_IMAGE_IMPORTS[imageKey] ?? BREACH_IMAGE_IMPORTS[`${breach.index}:open`]!
}

export function breachRotation(breach: BreachState): number {
  if (breach.opened) return 0
  const rotations: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 }
  return rotations[breach.focusDirection] ?? 0
}
