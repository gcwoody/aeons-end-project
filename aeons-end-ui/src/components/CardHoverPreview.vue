<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, watch } from 'vue'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'

const props = defineProps<{
  cardId?: string
  imageUrl?: string
  imageAlt?: string
  imageRotation?: number
  previewWidth?: number
  previewHeight?: number
  previewDelay?: number
  imageObjectFit?: 'cover' | 'contain' | 'fill'
  previewClass?: string
  disabled?: boolean
}>()

const visible = ref(false)
const position = ref({ left: 0, top: 0 })
const cardPreviewHeightRatio = 88 / 63.5
function getPreviewSize() {
  const width = props.previewWidth ?? 210
  return {
    width,
    // Card previews always use the physical card ratio even if a legacy call
    // site still passes its former 2:3 height. Non-card art previews have no
    // cardId and keep their explicit dimensions.
    height: props.cardId
      ? width * cardPreviewHeightRatio
      : props.previewHeight ?? width * cardPreviewHeightRatio,
  }
}
const previewSize = ref(getPreviewSize())
const anchor = ref({ x: 0, y: 0 })
let showTimer: ReturnType<typeof setTimeout> | undefined

function updatePosition(clientX: number, clientY: number) {
  const previewWidth = previewSize.value.width
  const previewHeight = previewSize.value.height
  const gap = 12
  const left = Math.min(
    Math.max(previewWidth / 2 + gap, clientX),
    Math.max(previewWidth / 2 + gap, window.innerWidth - previewWidth / 2 - gap),
  )
  const top = Math.min(
    Math.max(previewHeight / 2 + gap, clientY),
    Math.max(previewHeight / 2 + gap, window.innerHeight - previewHeight / 2 - gap),
  )
  position.value = { left, top }
}

function startPreview(event: MouseEvent) {
  if (props.disabled || isSpellDragging()) return
  // A set-next-to-supply Treasure is rendered inside the supply card's own
  // preview wrapper. Dismiss every other wrapper first so only the card under
  // the pointer can own the preview, even while moving between nested cards.
  window.dispatchEvent(new Event('card-preview-dismiss'))
  clearTimeout(showTimer)
  previewSize.value = getPreviewSize()
  anchor.value = { x: event.clientX, y: event.clientY }
  updatePosition(event.clientX, event.clientY)
  showTimer = setTimeout(() => {
    visible.value = true
    // Capture the wheel before board/hand scroll handlers. Once a preview is
    // visible, the pointer is over the card preview interaction, so wheel
    // input must resize it instead of scrolling the source hand horizontally.
    window.addEventListener('wheel', resizePreview, { capture: true, passive: false })
  }, props.previewDelay ?? 500)
}

function isPreviewDisabledTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-card-preview-disabled]'))
}

function isNestedPreviewEvent(event: MouseEvent): boolean {
  const current = event.currentTarget
  const target = event.target
  if (!(current instanceof Element) || !(target instanceof Element)) return false
  const nearestPreview = target.closest('.card-hover-wrap')
  return Boolean(nearestPreview && nearestPreview !== current)
}

function isSpellDragging(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('spell-dragging')
}

function handleMouseOver(event: MouseEvent) {
  // Nested CardHoverPreview wrappers are used by Treasure cards placed over a
  // supply pile. Let the innermost wrapper own the hover event so the supply
  // card and the Treasure cannot open competing previews.
  if (isNestedPreviewEvent(event)) return
  if (props.disabled || isSpellDragging() || isPreviewDisabledTarget(event.target)) {
    stopPreview()
    return
  }
  if (visible.value || showTimer) return
  startPreview(event)
}

function resizePreview(event: WheelEvent) {
  event.preventDefault()
  event.stopPropagation()
  const scale = event.deltaY < 0 ? 1.1 : 0.9
  const width = previewSize.value.width * scale
  const defaultSize = getPreviewSize()
  const ratio = defaultSize.height / defaultSize.width
  const height = width * ratio
  previewSize.value = { width, height }
  updatePosition(anchor.value.x, anchor.value.y)
}

function stopPreview() {
  clearTimeout(showTimer)
  showTimer = undefined
  visible.value = false
  window.removeEventListener('wheel', resizePreview, true)
}

function dismissFromSpellDrag() {
  stopPreview()
}

onMounted(() => {
  window.addEventListener('card-preview-dismiss', dismissFromSpellDrag)
})

onBeforeUnmount(() => {
  stopPreview()
  window.removeEventListener('card-preview-dismiss', dismissFromSpellDrag)
})
watch(() => props.disabled, (disabled) => {
  if (disabled) stopPreview()
})
</script>

<template>
  <span
    class="card-hover-wrap"
    @mouseover="handleMouseOver"
    @mouseleave="stopPreview"
  >
    <slot />
    <Teleport to="body">
      <div
        v-if="visible"
        class="card-hover-preview"
        :class="props.previewClass"
        :style="{
          left: `${position.left}px`,
          top: `${position.top}px`,
          width: `${previewSize.width}px`,
          height: `${previewSize.height}px`,
        }"
      >
        <img
          v-if="props.imageUrl || (props.cardId && cardImageUrl(props.cardId))"
          :src="props.imageUrl ?? cardImageUrl(props.cardId!)"
          :alt="props.imageAlt ?? (props.cardId ? getCard(props.cardId).name : '')"
          :style="{
            transform: `rotate(${props.imageRotation ?? 0}deg)`,
            objectFit: props.imageObjectFit ?? 'cover',
          }"
          draggable="false"
        />
        <div v-else-if="props.cardId" class="card-hover-fallback">
          <strong>{{ getCard(props.cardId).name }}</strong>
        </div>
      </div>
    </Teleport>
  </span>
</template>
