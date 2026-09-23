export type DismissibleOverlayHandler = () => boolean

const handlers: DismissibleOverlayHandler[] = []

export function registerDismissibleOverlay(handler: DismissibleOverlayHandler): () => void {
  handlers.push(handler)
  return () => {
    const index = handlers.indexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
}

export function dismissTopmostOverlay(): boolean {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (handlers[index]?.()) return true
  }
  return false
}
