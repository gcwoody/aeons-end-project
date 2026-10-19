/** Keep independent card motions in one ordered queue. */
export interface CardMotionQueue {
  enqueue(runMotion: () => Promise<void>): Promise<void>
  current(): Promise<void>
  waitUntilIdle(): Promise<void>
  changedSince(observed: Promise<void>): boolean
  /** Drop work that has not started and prevent it from running after undo. */
  cancelAll(): void
}

export function createCardMotionQueue(): CardMotionQueue {
  let queue: Promise<void> = Promise.resolve()
  let generation = 0

  return {
    enqueue(runMotion: () => Promise<void>): Promise<void> {
      // The callback starts later, so callers must capture changing state
      // before they enqueue it.
      const queuedGeneration = generation
      const startIfCurrent = () => queuedGeneration === generation ? runMotion() : undefined
      const queuedMotion = queue.then(startIfCurrent, startIfCurrent)
      // Let later motions continue if one visual task fails. The returned
      // promise still reports that failure to the operation that enqueued it.
      queue = queuedMotion.catch(() => undefined)
      return queuedMotion
    },
    current(): Promise<void> {
      return queue
    },
    async waitUntilIdle(): Promise<void> {
      let observed = queue
      do {
        observed = queue
        await observed
      } while (observed !== queue)
    },
    changedSince(observed: Promise<void>): boolean {
      return observed !== queue
    },
    cancelAll(): void {
      generation += 1
      queue = Promise.resolve()
    },
  }
}
