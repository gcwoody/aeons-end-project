import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

interface DragSession {
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

/** Add bounded pointer dragging to a flex-centered modal without changing its layout. */
export function useModalDrag() {
  const modalEl = ref<HTMLElement | null>(null)
  const offset = reactive({ x: 0, y: 0 })
  const dragging = ref(false)
  let session: DragSession | null = null

  const modalStyle = computed(() => ({
    left: `${offset.x}px`,
    top: `${offset.y}px`,
  }))

  function clamp(value: number, min: number, max: number): number {
    const upper = Math.max(min, max)
    return Math.min(Math.max(value, min), upper)
  }

  function startDrag(event: PointerEvent) {
    if (event.button !== 0 || !modalEl.value || typeof window === 'undefined') return
    const target = event.target
    if (target instanceof Element && target.closest('button, input, select, textarea, option, label, a, img, [data-no-modal-drag]')) return

    const rect = modalEl.value.getBoundingClientRect()
    const baseLeft = (window.innerWidth - rect.width) / 2
    const baseTop = (window.innerHeight - rect.height) / 2
    session = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: rect.left - baseLeft,
      offsetY: rect.top - baseTop,
      width: rect.width,
      height: rect.height,
    }
    dragging.value = true
    event.preventDefault()
    window.addEventListener('pointermove', updateDrag)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }

  function updateDrag(event: PointerEvent) {
    if (!session || typeof window === 'undefined') return
    const baseLeft = (window.innerWidth - session.width) / 2
    const baseTop = (window.innerHeight - session.height) / 2
    const minX = 8 - baseLeft
    const maxX = window.innerWidth - session.width - 8 - baseLeft
    const minY = 8 - baseTop
    const maxY = window.innerHeight - session.height - 8 - baseTop
    offset.x = clamp(session.offsetX + event.clientX - session.pointerX, minX, maxX)
    offset.y = clamp(session.offsetY + event.clientY - session.pointerY, minY, maxY)
    event.preventDefault()
  }

  function stopDrag() {
    session = null
    dragging.value = false
    window.removeEventListener('pointermove', updateDrag)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
  }

  function clampToViewport() {
    const element = modalEl.value
    if (!element || typeof window === 'undefined') return
    const width = element.offsetWidth
    const height = element.offsetHeight
    const baseLeft = (window.innerWidth - width) / 2
    const baseTop = (window.innerHeight - height) / 2
    offset.x = clamp(offset.x, 8 - baseLeft, window.innerWidth - width - 8 - baseLeft)
    offset.y = clamp(offset.y, 8 - baseTop, window.innerHeight - height - 8 - baseTop)
  }

  function resetModalPosition() {
    offset.x = 0
    offset.y = 0
    requestAnimationFrame(clampToViewport)
  }

  let resizeObserver: ResizeObserver | null = null
  watch(modalEl, (element) => {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (!element) return
    // Move focus into every draggable modal as soon as it is mounted. Without
    // this, the button that opened the modal keeps the browser focus ring
    // visible behind the overlay and keyboard shortcuts can leave a stale
    // outline on the underlying board.
    element.tabIndex = -1
    requestAnimationFrame(() => element.focus({ preventScroll: true }))
    if (typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(clampToViewport)
    resizeObserver.observe(element)
    requestAnimationFrame(clampToViewport)
  })

  onMounted(() => window.addEventListener('resize', clampToViewport))
  onBeforeUnmount(() => {
    stopDrag()
    resizeObserver?.disconnect()
    window.removeEventListener('resize', clampToViewport)
  })

  return { modalEl, modalStyle, dragging, startDrag, resetModalPosition }
}
