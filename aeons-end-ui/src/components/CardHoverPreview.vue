<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
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
}>()

const visible = ref(false)
const position = ref({ left: 0, top: 0 })
const previewSize = ref({
  width: props.previewWidth ?? 210,
  height: props.previewHeight ?? 315,
})
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
  clearTimeout(showTimer)
  previewSize.value = {
    width: props.previewWidth ?? 210,
    height: props.previewHeight ?? 315,
  }
  anchor.value = { x: event.clientX, y: event.clientY }
  updatePosition(event.clientX, event.clientY)
  showTimer = setTimeout(() => {
    visible.value = true
    window.addEventListener('wheel', resizePreview, { passive: false })
  }, props.previewDelay ?? 500)
}

function resizePreview(event: WheelEvent) {
  event.preventDefault()
  const scale = event.deltaY < 0 ? 1.1 : 0.9
  const width = previewSize.value.width * scale
  const ratio = (props.previewHeight ?? 315) / (props.previewWidth ?? 210)
  const height = width * ratio
  previewSize.value = { width, height }
  updatePosition(anchor.value.x, anchor.value.y)
}

function stopPreview() {
  clearTimeout(showTimer)
  showTimer = undefined
  visible.value = false
  window.removeEventListener('wheel', resizePreview)
}

onBeforeUnmount(stopPreview)
</script>

<template>
  <span
    class="card-hover-wrap"
    @mouseenter="startPreview"
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
