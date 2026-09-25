import { BREACH_IMAGE_IMPORTS } from './generated-image-imports'
import type { BreachState, Direction } from '@engine/types'
import transferClosed from '../../image-database/cards/wave9/mages/indira/Transfer Breach.jpg'
import transferOpen from '../../image-database/cards/wave9/mages/indira/Opened Transfer Breach.jpg'
import riftBreachIIIClosed from '../../image-database/cards/wave9/mages/remnant/Rift Breach III.jpg'
import riftBreachIIIOpen from '../../image-database/cards/wave9/mages/remnant/Opened Rift Breach III.jpg'
import riftBreachIVClosed from '../../image-database/cards/wave9/mages/remnant/Rift Breach IV.jpg'
import riftBreachIVOpen from '../../image-database/cards/wave9/mages/remnant/Opened Rift Breach IV.jpg'
import prototypeBreachClosed from '../../image-database/cards/wave9/mages/stake/Prototype Breach.jpg'
import prototypeBreachOpen from '../../image-database/cards/wave9/mages/stake/Opened Prototype Breach.jpg'

export interface BreachPresentation {
  imageUrl: string
  rotation: number
}

interface BreachArtwork {
  closed: string
  open: string
  /** Direction shown by this closed artwork when it has no CSS rotation. */
  baseDirection: Direction
}

const riftArtwork: Record<number, BreachArtwork> = {
  3: { closed: riftBreachIIIClosed, open: riftBreachIIIOpen, baseDirection: 'south' },
  4: { closed: riftBreachIVClosed, open: riftBreachIVOpen, baseDirection: 'north' },
}

const directionDegrees: Record<Direction, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
}

function breachArtwork(breach: BreachState): BreachArtwork {
  if (breach.special === 'transfer') {
    return { closed: transferClosed, open: transferOpen, baseDirection: 'east' }
  }
  if (breach.special === 'prototype') {
    return { closed: prototypeBreachClosed, open: prototypeBreachOpen, baseDirection: 'north' }
  }
  if (breach.special === 'rift' && riftArtwork[breach.index]) return riftArtwork[breach.index]!

  const open = BREACH_IMAGE_IMPORTS[`${breach.index}:open`]!
  return {
    closed: BREACH_IMAGE_IMPORTS[`${breach.index}:down`] ?? open,
    open,
    baseDirection: 'north',
  }
}

/** Keep image selection and orientation together; engine direction is authoritative. */
export function breachPresentation(breach: BreachState): BreachPresentation {
  const artwork = breachArtwork(breach)
  const rotation = breach.opened
    ? 0
    : (directionDegrees[breach.focusDirection] - directionDegrees[artwork.baseDirection] + 360) % 360
  return {
    imageUrl: breach.opened ? artwork.open : artwork.closed,
    rotation,
  }
}
