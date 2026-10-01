import { onUnmounted, ref } from 'vue'

interface PointerReorderOptions {
  getKeys: () => string[]
  reorder: (keys: string[]) => void
  enabled: () => boolean
  itemSelector?: string
  dragThreshold?: number
}

function pointerSortLayoutRect(element: HTMLElement): { left: number; top: number; width: number; height: number } {
  const offsetParent = element.offsetParent
  if (!(offsetParent instanceof HTMLElement)) {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }
  const parentRect = offsetParent.getBoundingClientRect()
  return {
    // offsetLeft/Top describe the item's layout slot and ignore the FLIP
    // transform currently animating it toward that slot.
    left: parentRect.left + offsetParent.clientLeft + element.offsetLeft - offsetParent.scrollLeft,
    top: parentRect.top + offsetParent.clientTop + element.offsetTop - offsetParent.scrollTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  }
}

/** Shared pointer-captured sorting for cards and tokens; avoids native drag ghosts. */
export function usePointerReorder(options: PointerReorderOptions) {
  const draggingKey = ref<string | null>(null)
  const draggingPointerId = ref<number | null>(null)
  const pointerStart = ref<{ x: number; y: number } | null>(null)
  const dragged = ref(false)
  const captureElement = ref<HTMLElement | null>(null)
  let clickResetTimer: number | undefined

  function removeGlobalListeners(): void {
    window.removeEventListener('pointermove', onGlobalPointerMove, true)
    window.removeEventListener('pointerup', onGlobalPointerUp, true)
    window.removeEventListener('pointercancel', onGlobalPointerCancel, true)
    window.removeEventListener('lostpointercapture', onLostPointerCapture, true)
    window.removeEventListener('blur', onWindowBlur)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function clearDrag(pointerId?: number, cancelled = false, releaseCapture = true): void {
    const activePointerId = draggingPointerId.value
    if (activePointerId === null || (pointerId !== undefined && activePointerId !== pointerId)) return

    // Clear the id before releasing capture so the resulting lostpointercapture
    // event cannot run this cleanup twice.
    draggingPointerId.value = null
    const element = captureElement.value
    captureElement.value = null
    pointerStart.value = null
    draggingKey.value = null
    removeGlobalListeners()

    if (releaseCapture && element?.isConnected && element.hasPointerCapture(activePointerId)) {
      try {
        element.releasePointerCapture(activePointerId)
      } catch {
        // The browser may already have released capture during pointerup/cancel.
      }
    }

    if (cancelled) {
      dragged.value = false
      return
    }

    // A pointerup outside the item can leave no click event to consume this
    // flag. Keep it through the current pointer event sequence, then expire it.
    if (dragged.value) {
      if (clickResetTimer !== undefined) window.clearTimeout(clickResetTimer)
      clickResetTimer = window.setTimeout(() => {
        dragged.value = false
        clickResetTimer = undefined
      }, 100)
    }
  }

  function onGlobalPointerMove(event: PointerEvent): void {
    if (draggingPointerId.value !== event.pointerId) return
    // Some browsers miss pointerup when the mouse is released outside the
    // viewport. The first move after re-entry reports buttons=0; end the stale
    // drag before it can remain visually attached to the pointer.
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      clearDrag(event.pointerId)
      return
    }

    if (!draggingKey.value || !pointerStart.value) return
    const distance = Math.hypot(event.clientX - pointerStart.value.x, event.clientY - pointerStart.value.y)
    if (distance < (options.dragThreshold ?? 4)) return

    event.preventDefault()
    if (!dragged.value) {
      const currentCaptureTarget = captureElement.value
      const stableCaptureTarget = currentCaptureTarget?.closest<HTMLElement>('.pointer-sort-row')
      if (stableCaptureTarget && stableCaptureTarget !== currentCaptureTarget) {
        try {
          stableCaptureTarget.setPointerCapture(event.pointerId)
          captureElement.value = stableCaptureTarget
        } catch {
          // Keep the original capture if the browser rejects the transfer.
        }
      }
    }
    dragged.value = true
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    const target = hit instanceof Element
      ? hit.closest<HTMLElement>(options.itemSelector ?? '[data-sort-key]')
      : null
    const targetKey = target?.dataset.sortKey
    if (!target || !targetKey || targetKey === draggingKey.value) return

    const keys = options.getKeys()
    const from = keys.indexOf(draggingKey.value)
    const to = keys.indexOf(targetKey)
    if (from < 0 || to < 0) return

    const rect = pointerSortLayoutRect(target)
    const deltaX = (event.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width / 2)
    const deltaY = (event.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height / 2)
    const insertAfter = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX >= 0 : deltaY >= 0
    let insertionIndex = to + (insertAfter ? 1 : 0)
    const [moved] = keys.splice(from, 1)
    if (!moved) return
    if (from < insertionIndex) insertionIndex -= 1
    if (from === insertionIndex) return

    keys.splice(insertionIndex, 0, moved)
    options.reorder(keys)
  }

  function onGlobalPointerUp(event: PointerEvent): void {
    // Let the browser perform the implicit capture release after dispatching
    // pointerup so it can keep the click target consistent with the gesture.
    clearDrag(event.pointerId, false, false)
  }

  function onGlobalPointerCancel(event: PointerEvent): void {
    clearDrag(event.pointerId, true, false)
  }

  function onLostPointerCapture(event: PointerEvent): void {
    // The first real drag movement transfers capture from the item to its
    // stable row. Ignore the old item's expected capture-loss notification.
    if (captureElement.value?.hasPointerCapture(event.pointerId)) return
    clearDrag(event.pointerId, true, false)
  }

  function onWindowBlur(): void {
    clearDrag(undefined, true)
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') clearDrag(undefined, true)
  }

  function onPointerDown(event: PointerEvent, key: string): void {
    if (!options.enabled() || event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
    if (clickResetTimer !== undefined) {
      window.clearTimeout(clickResetTimer)
      clickResetTimer = undefined
    }
    clearDrag(undefined, true)
    const item = event.currentTarget
    // Keep ordinary clicks targeted at their card. Once the pointer actually
    // starts moving, capture transfers to the stable row before sorting begins.
    try {
      item.setPointerCapture(event.pointerId)
    } catch {
      return
    }
    draggingKey.value = key
    draggingPointerId.value = event.pointerId
    pointerStart.value = { x: event.clientX, y: event.clientY }
    dragged.value = false
    captureElement.value = item
    window.addEventListener('pointermove', onGlobalPointerMove, true)
    window.addEventListener('pointerup', onGlobalPointerUp, true)
    window.addEventListener('pointercancel', onGlobalPointerCancel, true)
    window.addEventListener('lostpointercapture', onLostPointerCapture, true)
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  /** Consume the completed drag so the click generated after pointerup is ignored. */
  function consumeDragged(): boolean {
    const didDrag = dragged.value
    dragged.value = false
    if (clickResetTimer !== undefined) {
      window.clearTimeout(clickResetTimer)
      clickResetTimer = undefined
    }
    return didDrag
  }

  onUnmounted(() => {
    clearDrag(undefined, true)
    if (clickResetTimer !== undefined) window.clearTimeout(clickResetTimer)
  })

  return { draggingKey, onPointerDown, consumeDragged }
}
