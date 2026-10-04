import type { BreachState, Direction } from '../types'

export function rotateDirection(direction: Direction): Direction {
  return ({ east: 'south', south: 'west', west: 'north', north: 'east' })[direction] as Direction
}

/** Saves made before optional Breach slots were introduced omit `present`. */
export function isPresentBreach(breach: BreachState): boolean {
  return breach.present !== false
}

/** Apply one focus consistently for paid and effect-granted Breach focuses. */
export function advanceBreachFocus(breach: BreachState): boolean {
  breach.focusCount++
  breach.focusedThisTurn = true
  if (breach.focusCount < breach.focusToOpen) {
    breach.focusDirection = rotateDirection(breach.focusDirection)
    return false
  }
  breach.opened = true
  return true
}
