<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  imageUrl?: string
  imageAlt: string
  label: string
  kind: 'mage' | 'nemesis'
  selected?: boolean
  fitToParent?: boolean
}>(), { selected: false, fitToParent: false })

const imageAspectRatio = ref<number>()
const stageSize = ref({ width: 0, height: 0 })
const buttonEl = ref<HTMLButtonElement | null>(null)
let stageObserver: ResizeObserver | undefined

const previewButtonStyle = computed(() => {
  const fallbackRatio = props.kind === 'mage' ? 840 / 604 : .75
  const aspectRatio = imageAspectRatio.value ?? fallbackRatio
  if (props.fitToParent && stageSize.value.width > 0 && stageSize.value.height > 0) {
    const width = Math.min(stageSize.value.width, stageSize.value.height * aspectRatio)
    return { width: `${width}px`, height: `${width / aspectRatio}px`, aspectRatio }
  }
  return imageAspectRatio.value ? { aspectRatio } : undefined
})

function observeStage() {
  const stage = buttonEl.value?.parentElement
  if (!stage || !props.fitToParent) return
  if (typeof ResizeObserver === 'undefined') {
    const rect = stage.getBoundingClientRect()
    stageSize.value = { width: rect.width, height: rect.height }
    return
  }
  stageObserver?.disconnect()
  stageObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    stageSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  stageObserver.observe(stage)
}

function readImageAspectRatio(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image.naturalWidth && image.naturalHeight) {
    imageAspectRatio.value = image.naturalWidth / image.naturalHeight
  }
}

watch(() => props.imageUrl, () => {
  imageAspectRatio.value = undefined
})

watch(() => props.fitToParent, () => observeStage())

onMounted(observeStage)
onBeforeUnmount(() => stageObserver?.disconnect())

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    ref="buttonEl"
    type="button"
    class="mat-preview-button game-highlight"
    :class="[
      `mat-preview-button--${kind}`,
      { 'game-highlight--choice': selected },
    ]"
    :style="previewButtonStyle"
    :aria-label="label"
    @click="emit('click')"
  >
    <img v-if="imageUrl" :src="imageUrl" :alt="imageAlt" draggable="false" @load="readImageAspectRatio" />
  </button>
</template>
