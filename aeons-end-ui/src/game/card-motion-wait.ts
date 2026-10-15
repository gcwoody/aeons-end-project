import type { CardMotionQueue } from './card-motion-queue'

export interface CardMotionWaitDependencies {
  queue: CardMotionQueue
  waitForBreachMotions: (onMotionStart?: () => void) => Promise<boolean>
  nextTick: () => Promise<unknown>
  getHand: () => HTMLElement | null
  hasActiveHandCardReflow: (hand: HTMLElement | null) => boolean
  waitForHandCardReflow: (hand: HTMLElement | null) => Promise<void>
  isMotionBlocked: () => boolean
  setMotionBlocked: (blocked: boolean) => void
}

/** Wait until queued card flights, breach motion, and hand reflow all settle. */
export function createCardMotionWaiter({
  queue,
  waitForBreachMotions,
  nextTick,
  getHand,
  hasActiveHandCardReflow,
  waitForHandCardReflow,
  isMotionBlocked,
  setMotionBlocked,
}: CardMotionWaitDependencies) {
  return async function waitForCardMotions(): Promise<boolean> {
    let ownsMotionShield = false
    let waitedForMotion = false
    try {
      let observedCardQueue: Promise<void>
      do {
        observedCardQueue = queue.current()
        await queue.waitUntilIdle()
        waitedForMotion = await waitForBreachMotions(() => {
          if (!isMotionBlocked()) {
            setMotionBlocked(true)
            ownsMotionShield = true
          }
        }) || waitedForMotion
        await nextTick()
        const hand = getHand()
        if (hasActiveHandCardReflow(hand)) {
          if (!isMotionBlocked()) {
            setMotionBlocked(true)
            ownsMotionShield = true
          }
          waitedForMotion = true
          await waitForHandCardReflow(hand)
        }
      } while (queue.changedSince(observedCardQueue))
      return waitedForMotion
    } finally {
      if (ownsMotionShield) setMotionBlocked(false)
    }
  }
}
