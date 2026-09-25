<script setup lang="ts">
import { computed } from 'vue'
import type { BreachState } from '@engine/types'
import { breachPresentation } from '../breach-images'
import CardHoverPreview from './CardHoverPreview.vue'

const props = defineProps<{
  breach: BreachState
  alt: string
  disabled?: boolean
  previewWidth?: number
  previewHeight?: number
}>()

const presentation = computed(() => breachPresentation(props.breach))
</script>

<template>
  <img
    class="breach-token"
    :src="presentation.imageUrl"
    :alt="alt"
    :style="{ transform: `rotate(${presentation.rotation}deg)` }"
    draggable="false"
  />
  <CardHoverPreview
    :image-url="presentation.imageUrl"
    :image-alt="alt"
    :image-rotation="presentation.rotation"
    :preview-width="previewWidth ?? 315"
    :preview-height="previewHeight ?? 315"
    :disabled="disabled"
    image-object-fit="fill"
    preview-class="breach-preview"
  >
    <span class="breach-hover-target" aria-hidden="true"></span>
  </CardHoverPreview>
</template>
