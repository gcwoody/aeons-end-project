<script setup lang="ts">
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'
import CardHoverPreview from './CardHoverPreview.vue'

const props = defineProps<{
  cardId: string
  ariaLabel: string
  primaryEnabled?: boolean
  displayClass?: string
}>()

const emit = defineEmits<{
  primary: []
  inspect: []
}>()

function inspect(event: MouseEvent) {
  event.preventDefault()
  emit('inspect')
}
</script>

<template>
  <CardHoverPreview :card-id="cardId" :preview-width="210" :preview-height="291.02">
    <button
      type="button"
      class="face-up-pile-card"
      :class="[displayClass, { 'is-primary-action': primaryEnabled }]"
      :aria-label="ariaLabel"
      @click="emit('primary')"
      @contextmenu="inspect"
    >
      <img v-if="cardImageUrl(cardId)" :src="cardImageUrl(cardId)" :alt="getCard(cardId).name" draggable="false" />
      <span v-else>{{ getCard(cardId).name }}</span>
    </button>
  </CardHoverPreview>
</template>
