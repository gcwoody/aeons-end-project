import { nextTick } from 'vue'

const activeBreachMotions = new Set<Animation>()

/** Register a Breach animation so phase coordination can wait for its finish. */
export function trackBreachMotion(animation: Animation): Animation {
  activeBreachMotions.add(animation)
  void animation.finished.then(
    () => activeBreachMotions.delete(animation),
    () => activeBreachMotions.delete(animation),
  )
  return animation
}

/** Wait for motions started by reactive Breach updates in the current render. */
export async function waitForBreachMotions(onStart?: () => void): Promise<boolean> {
  await nextTick()
  let waitedForMotion = false
  while (activeBreachMotions.size > 0) {
    if (!waitedForMotion) {
      waitedForMotion = true
      onStart?.()
    }
    const motions = [...activeBreachMotions]
    await Promise.all(motions.map(motion => motion.finished.catch(() => undefined)))
  }
  return waitedForMotion
}
