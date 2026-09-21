import { BREACH_IMAGE_IMPORTS } from './generated-image-imports'
import type { BreachState } from '@engine/types'
import transferClosed from '../../image-database/cards/wave9/mages/indira/Transfer Breach.jpg'
import transferOpen from '../../image-database/cards/wave9/mages/indira/Opened Transfer Breach.jpg'

export function breachImageUrl(breach: BreachState): string {
  if (breach.special === 'transfer') return breach.opened ? transferOpen : transferClosed
  const imageKey = `${breach.index}:${breach.opened ? 'open' : 'down'}`
  return BREACH_IMAGE_IMPORTS[imageKey] ?? BREACH_IMAGE_IMPORTS[`${breach.index}:open`]!
}

export function breachRotation(breach: BreachState): number {
  if (breach.opened) return 0
  if (breach.special === 'transfer') {
    const rotations: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 }
    return rotations[breach.focusDirection] ?? 0
  }
  const rotations: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 }
  return rotations[breach.focusDirection] ?? 0
}
