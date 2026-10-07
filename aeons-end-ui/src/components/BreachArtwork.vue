<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { BreachState, Direction } from '@engine/types'
import { breachPresentation } from '../breach-images'
import { trackBreachMotion } from '../game/breach-motion'
import CardHoverPreview from './CardHoverPreview.vue'

const props = defineProps<{
  breach: BreachState
  ownerId?: string
  alt: string
  disabled?: boolean
  previewWidth?: number
  previewHeight?: number
}>()

const presentation = () => breachPresentation(props.breach)
const tokenImage = ref<HTMLImageElement | null>(null)
const flipCard = ref<HTMLElement | null>(null)
const flip = ref<{
  front: ReturnType<typeof breachPresentation>
  back: ReturnType<typeof breachPresentation>
  axis: [number, number]
} | null>(null)
let activeAnimation: Animation | null = null

const directionDegrees: Record<Direction, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
}

const flipAxis: Record<Direction, [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
}

function motionDuration(property: string, fallback: number): number {
  const token = getComputedStyle(document.documentElement).getPropertyValue(property).trim()
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return fallback
  if (token.endsWith('ms')) return value
  if (token.endsWith('s')) return value * 1000
  return fallback
}

function breachAt(opened: boolean, focusDirection: Direction) {
  return breachPresentation({ ...props.breach, opened, focusDirection })
}

async function animateFocus(start: number, delta: number) {
  await nextTick()
  const image = tokenImage.value
  if (!image || delta === 0) return
  const animation = trackBreachMotion(image.animate([
    { transform: `rotate(${start}deg)` },
    { transform: `rotate(${start + delta}deg)` },
  ], {
    duration: motionDuration('--breach-focus-duration', 280),
    easing: 'cubic-bezier(.25, .8, .25, 1)',
  }))
  activeAnimation = animation
  try {
    await animation.finished
  } catch {
    // A later focus or unmount can cancel this animation.
  } finally {
    if (activeAnimation === animation) activeAnimation = null
  }
}

async function animateOpen() {
  await nextTick()
  const card = flipCard.value
  const currentFlip = flip.value
  if (!card || !currentFlip) return
  const [x, y] = currentFlip.axis
  const axis = `rotate3d(${x}, ${y}, 0, `
  const animation = trackBreachMotion(card.animate([
    { transform: `${axis}0deg)` },
    { transform: `${axis}180deg)` },
  ], {
    duration: motionDuration('--breach-open-duration', 560),
    easing: 'cubic-bezier(.4, 0, .2, 1)',
  }))
  activeAnimation = animation
  try {
    await animation.finished
  } catch {
    // A later state change or unmount can cancel this animation.
  } finally {
    if (activeAnimation === animation) activeAnimation = null
    if (flipCard.value === card) flip.value = null
  }
}

watch(
  () => ({
    ownerId: props.ownerId,
    opened: props.breach.opened,
    focusDirection: props.breach.focusDirection,
    focusCount: props.breach.focusCount,
  }),
  (next, previous) => {
    // Player view changes reuse the same indexed Breach components. A new
    // owner's saved orientation is a view update, not a Breach action.
    if (next.ownerId !== previous.ownerId) {
      activeAnimation?.cancel()
      activeAnimation = null
      flip.value = null
      return
    }

    if (next.opened && !previous.opened) {
      activeAnimation?.cancel()
      flip.value = {
        front: breachAt(false, previous.focusDirection),
        back: breachAt(true, next.focusDirection),
        axis: flipAxis[previous.focusDirection],
      }
      void animateOpen()
      return
    }

    if (!next.opened && !previous.opened && next.focusDirection !== previous.focusDirection) {
      activeAnimation?.cancel()
      const start = breachAt(false, previous.focusDirection).rotation
      const clockwiseDelta = (directionDegrees[next.focusDirection] - directionDegrees[previous.focusDirection] + 360) % 360
      const delta = next.focusCount > previous.focusCount
        ? clockwiseDelta
        : ((clockwiseDelta + 540) % 360) - 180
      void animateFocus(start, delta)
    }
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => activeAnimation?.cancel())
</script>

<template>
  <div class="breach-artwork">
    <img
      ref="tokenImage"
      class="breach-token"
      :class="{ 'breach-token-hidden': !!flip }"
      :src="presentation().imageUrl"
      :alt="alt"
      :style="{ transform: `rotate(${presentation().rotation}deg)` }"
      draggable="false"
    />
    <div v-if="flip" class="breach-flip-scene" :style="{ perspective: 'var(--breach-open-perspective)' }">
      <div ref="flipCard" class="breach-flip-card">
        <img
          class="breach-flip-face breach-flip-front"
          :src="flip.front.imageUrl"
          :alt="`${alt} before opening`"
          :style="{ transform: `rotate(${flip.front.rotation}deg)` }"
          draggable="false"
        />
        <img
          class="breach-flip-face breach-flip-back"
          :src="flip.back.imageUrl"
          :alt="`${alt} open`"
          :style="{ transform: `rotate3d(${flip.axis[0]}, ${flip.axis[1]}, 0, 180deg)` }"
          draggable="false"
        />
      </div>
    </div>
  </div>
  <CardHoverPreview
    :image-url="presentation().imageUrl"
    :image-alt="alt"
    :image-rotation="presentation().rotation"
    :preview-width="previewWidth ?? 315"
    :preview-height="previewHeight ?? 315"
    :disabled="disabled || !!flip"
    image-object-fit="fill"
    preview-class="breach-preview"
  >
    <span class="breach-hover-target" aria-hidden="true"></span>
  </CardHoverPreview>
</template>
