<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'

defineOptions({ inheritAttrs: true })

const props = withDefaults(defineProps<{
  cardId?: string
  imageUrl?: string
  imageAlt?: string
  imageFit?: 'cover' | 'contain' | 'fill' | 'none'
  baseClass?: string
  size?: 'hand' | 'mini' | 'pile' | 'fill'
}>(), {
  baseClass: 'card',
  size: 'hand',
})

const imageSource = computed(() => {
  if (props.imageUrl) return props.imageUrl
  if (!props.cardId) return ''
  return cardImageUrl(props.cardId) ?? ''
})

const cardName = computed(() => {
  if (!props.cardId) return props.imageAlt ?? ''
  return getCard(props.cardId).name
})

const imageAlt = computed(() => props.imageAlt ?? cardName.value)
const rootClasses = computed(() => [
  props.baseClass,
  `card-surface--${props.size}`,
  { 'card-image': Boolean(imageSource.value) },
])
</script>

<template>
  <div class="card-surface" :class="rootClasses">
    <img v-if="imageSource" :src="imageSource" :alt="imageAlt" :style="imageFit ? { objectFit: imageFit } : undefined" draggable="false" />
    <slot v-else>
      <span class="cname">{{ cardName }}</span>
    </slot>
    <slot name="overlay" />
  </div>
</template>