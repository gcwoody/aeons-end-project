type CardPreviewWheelHandler = (event: WheelEvent) => void

let activeHandler: CardPreviewWheelHandler | null = null
let listenerAttached = false

function handleWheel(event: WheelEvent) {
  activeHandler?.(event)
}

function attachListener() {
  if (listenerAttached || typeof window === 'undefined') return
  // Install once as soon as the preview module loads so active previews get
  // first claim on wheel input, ahead of board-level horizontal scrollers.
  window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
  listenerAttached = true
}

attachListener()

export function setActiveCardPreviewWheelHandler(handler: CardPreviewWheelHandler | null) {
  attachListener()
  activeHandler = handler
}

export function clearActiveCardPreviewWheelHandler(handler: CardPreviewWheelHandler) {
  if (activeHandler === handler) activeHandler = null
}
