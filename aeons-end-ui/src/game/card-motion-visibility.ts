export interface CardMotionVisibilityHold {
  element: HTMLElement
  visibility: string
}
type CardMotionVisibilityKey = string | HTMLElement

/** Keeps temporary destination cards invisible until their flight takes over. */
export function createCardMotionVisibilityHolds() {
  const holdsByOwner = new WeakMap<object, Map<CardMotionVisibilityKey, CardMotionVisibilityHold>>()

  function get(owner: object, key: CardMotionVisibilityKey): CardMotionVisibilityHold | undefined {
    return holdsByOwner.get(owner)?.get(key)
  }

  function hold(owner: object, key: CardMotionVisibilityKey, element: HTMLElement): CardMotionVisibilityHold {
    const holds = holdsByOwner.get(owner) ?? new Map<CardMotionVisibilityKey, CardMotionVisibilityHold>()
    const existing = holds.get(key)
    if (existing) return existing
    const held = { element, visibility: element.style.visibility }
    element.style.visibility = 'hidden'
    holds.set(key, held)
    holdsByOwner.set(owner, holds)
    return held
  }

  /** Remove and return the holds so their owner can transfer responsibility. */
  function take(owner: object): Map<CardMotionVisibilityKey, CardMotionVisibilityHold> {
    const holds = holdsByOwner.get(owner) ?? new Map<CardMotionVisibilityKey, CardMotionVisibilityHold>()
    holdsByOwner.delete(owner)
    return holds
  }

  function restore(owner: object) {
    take(owner).forEach(held => {
      held.element.style.visibility = held.visibility
    })
  }

  return { get, hold, take, restore }
}
