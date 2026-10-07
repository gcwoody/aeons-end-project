<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  imageUrl?: string
  imageAlt: string
  label: string
  kind: 'mage' | 'nemesis'
  selected?: boolean
}>(), { selected: false })

const imageAspectRatio = ref<number>()

function readImageAspectRatio(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image.naturalWidth && image.naturalHeight) {
    imageAspectRatio.value = image.naturalWidth / image.naturalHeight
  }
}

watch(() => props.imageUrl, () => {
  imageAspectRatio.value = undefined
})

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="mat-preview-button game-highlight"
    :class="[
      `mat-preview-button--${kind}`,
      { 'game-highlight--choice': selected },
    ]"
    :style="imageAspectRatio ? { aspectRatio: imageAspectRatio } : undefined"
    :aria-label="label"
    @click="emit('click')"
  >
    <img v-if="imageUrl" :src="imageUrl" :alt="imageAlt" draggable="false" @load="readImageAspectRatio" />
  </button>
</template>
