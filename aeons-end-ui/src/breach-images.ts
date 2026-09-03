import breachI from '../../image-database/common breach/Breach_I_Open.jpg'
import breachIIDown from '../../image-database/common breach/Breach_II_Down.jpg'
import breachIIOpen from '../../image-database/common breach/Breach_II_Open.jpg'
import breachIIIDown from '../../image-database/common breach/Breach_III_Down.jpg'
import breachIIIOpen from '../../image-database/common breach/Breach_III_Open.jpg'
import breachIVDown from '../../image-database/common breach/Breach_IV_Down.jpg'
import breachIVOpen from '../../image-database/common breach/Breach_IV_Open.jpg'
import type { BreachState } from '@engine/types'

const OPEN_IMAGES: Record<number, string> = {
  1: breachI,
  2: breachIIOpen,
  3: breachIIIOpen,
  4: breachIVOpen,
}

const DOWN_IMAGES: Record<number, string | undefined> = {
  2: breachIIDown,
  3: breachIIIDown,
  4: breachIVDown,
}

export function breachImageUrl(breach: BreachState): string {
  return breach.opened ? OPEN_IMAGES[breach.index]! : (DOWN_IMAGES[breach.index] ?? OPEN_IMAGES[breach.index]!)
}

export function breachRotation(breach: BreachState): number {
  if (breach.opened) return 0
  const rotations: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 }
  return rotations[breach.focusDirection] ?? 0
}
