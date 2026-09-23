<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ inheritAttrs: true })

const props = withDefaults(defineProps<{
  wheelScale?: number
  overflowAnchor?: 'start' | 'end'
}>(), {
  wheelScale: 1.1,
  overflowAnchor: 'start',
})

const zoneElement = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const overflowDistance = ref(0)
let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

function alignEndAnchoredCards(zone: HTMLElement) {
  if (props.overflowAnchor !== 'end' || zone.scrollWidth <= zone.clientWidth) return
  const viewport = zone.getBoundingClientRect()
  const track = zone.querySelector<HTMLElement>('.zone-card-track')
  if (!track) return
  const firstVisibleCard = [...track.querySelectorAll<HTMLElement>('.card')]
    .map(card => card.getBoundingClientRect())
    .find(card => card.right > viewport.left + 1 && card.left < viewport.right - 1)
  if (!firstVisibleCard) return
  const delta = viewport.left - firstVisibleCard.left
  if (Math.abs(delta) < 1) return
  const maxScroll = Math.max(0, zone.scrollWidth - zone.clientWidth)
  zone.scrollLeft = Math.max(-maxScroll, Math.min(0, zone.scrollLeft - delta))
}

function updateOverflow() {
  const zone = zoneElement.value
  if (!zone) return
  const track = zone.querySelector<HTMLElement>('.zone-card-track')
  const contentWidth = track?.getBoundingClientRect().width ?? zone.scrollWidth
  overflowDistance.value = Math.max(0, contentWidth - zone.clientWidth)
  overflowing.value = overflowDistance.value > 1
}

function observeOverflow() {
  const zone = zoneElement.value
  if (!zone) return
  updateOverflow()
  resizeObserver = new ResizeObserver(() => {
    updateOverflow()
    if (props.overflowAnchor === 'end') {
      requestAnimationFrame(() => alignEndAnchoredCards(zone))
    }
  })
  resizeObserver.observe(zone)
  for (const child of zone.children) resizeObserver.observe(child)
  mutationObserver = new MutationObserver(() => {
    for (const child of zone.children) resizeObserver?.observe(child)
    nextTick(() => {
      updateOverflow()
      alignEndAnchoredCards(zone)
    })
  })
  mutationObserver.observe(zone, { childList: true, subtree: true })
}

function handleWheel(event: WheelEvent) {
  const zone = event.currentTarget
  if (!(zone instanceof HTMLElement) || zone.scrollWidth <= zone.clientWidth || event.deltaY === 0) return
  event.preventDefault()
  event.stopPropagation()
  const maxScroll = Math.max(0, zone.scrollWidth - zone.clientWidth)
  const isRtl = getComputedStyle(zone).direction === 'rtl'
  if (isRtl) {
    // Chromium exposes RTL overflow as a negative scrollLeft range. Keeping
    // the range explicit prevents the end-anchored Played track from jumping
    // outside its viewport when the wheel moves it.
    zone.scrollLeft = Math.max(
      -maxScroll,
      Math.min(0, zone.scrollLeft - event.deltaY * props.wheelScale),
    )
    alignEndAnchoredCards(zone)
    return
  }
  zone.scrollLeft = Math.min(
    Math.max(0, zone.scrollLeft + event.deltaY * props.wheelScale),
    maxScroll,
  )
}

watch(overflowing, async (isOverflowing) => {
  if (!isOverflowing) return
  await nextTick()
  const zone = zoneElement.value
  if (!zone) return
  // End-anchored scrollers use RTL so their natural scroll range is
  // [-maxScroll, 0]. Start at the end edge, then align the first visible card
  // to the viewport boundary so no card is left half-clipped.
  zone.scrollLeft = 0
  if (props.overflowAnchor === 'end') alignEndAnchoredCards(zone)
})

onMounted(observeOverflow)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
})
</script>

<template>
  <div
    ref="zoneElement"
    class="zone-scroller"
    :class="{ 'is-overflowing': overflowing, 'is-end-anchored': props.overflowAnchor === 'end' }"
    :style="{ '--zone-overflow-distance': `${overflowDistance}px` }"
    @wheel="handleWheel"
  >
    <slot />
  </div>
</template>
