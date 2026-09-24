import { BREACH_IMAGE_IMPORTS } from './generated-image-imports'
import type { BreachState } from '@engine/types'
import transferClosed from '../../image-database/cards/wave9/mages/indira/Transfer Breach.jpg'
import transferOpen from '../../image-database/cards/wave9/mages/indira/Opened Transfer Breach.jpg'
import riftBreachIIIClosed from '../../image-database/cards/wave9/mages/remnant/Rift Breach III.jpg'
import riftBreachIIIOpen from '../../image-database/cards/wave9/mages/remnant/Opened Rift Breach III.jpg'
import riftBreachIVClosed from '../../image-database/cards/wave9/mages/remnant/Rift Breach IV.jpg'
import riftBreachIVOpen from '../../image-database/cards/wave9/mages/remnant/Opened Rift Breach IV.jpg'
import prototypeBreachClosed from '../../image-database/cards/wave9/mages/stake/Prototype Breach.jpg'
import prototypeBreachOpen from '../../image-database/cards/wave9/mages/stake/Opened Prototype Breach.jpg'

export function breachImageUrl(breach: BreachState): string {
  if (breach.special === 'transfer') return breach.opened ? transferOpen : transferClosed
  if (breach.special === 'prototype') return breach.opened ? prototypeBreachOpen : prototypeBreachClosed
  if (breach.special === 'rift') {
    const images = breach.index === 3
      ? { closed: riftBreachIIIClosed, open: riftBreachIIIOpen }
      : breach.index === 4
        ? { closed: riftBreachIVClosed, open: riftBreachIVOpen }
        : null
    if (images) return breach.opened ? images.open : images.closed
  }
  const imageKey = `${breach.index}:${breach.opened ? 'open' : 'down'}`
  return BREACH_IMAGE_IMPORTS[imageKey] ?? BREACH_IMAGE_IMPORTS[`${breach.index}:open`]!
}

export function breachRotation(breach: BreachState): number {
  if (breach.opened) return 0
  if (breach.special === 'rift' || breach.special === 'prototype') return 0
  if (breach.special === 'transfer') {
    const rotations: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 }
    return rotations[breach.focusDirection] ?? 0
  }
  const rotations: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 }
  return rotations[breach.focusDirection] ?? 0
}
