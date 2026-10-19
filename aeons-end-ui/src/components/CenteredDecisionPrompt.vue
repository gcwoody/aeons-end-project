<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import { useModalDrag } from '../game/useModalDrag'
import CardSurface from './CardSurface.vue'
import ModalBase from './ModalBase.vue'

const props = withDefaults(defineProps<{
  title: string
  message?: string
  previewCardIds?: string[]
  highlightedPreviewCardId?: string
  allowBoardInteraction?: boolean
}>(), {
  message: '',
  previewCardIds: () => [],
  highlightedPreviewCardId: '',
  allowBoardInteraction: false,
})

const previewCards = computed(() => props.previewCardIds.map(cardId => ({
  cardId,
  cardName: getCard(cardId).name,
})))
const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()
</script>

<template>
  <ModalBase
    overlay-class="decision-overlay non-blocking-decision-overlay non-blocking-market-selection-overlay centered-decision-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    :panel-class="[
      'decision-modal non-blocking-selection-modal centered-decision-modal draggable-modal',
      { 'centered-decision-modal--pass-through': allowBoardInteraction },
    ]"
    :panel-style="modalStyle"
    :dragging="dragging"
    :panel-aria-labelledby="'centered-decision-prompt-title'"
    @panel-pointerdown="startDrag"
  >
    <h2 id="centered-decision-prompt-title">{{ title }}</h2>
    <p v-if="message" class="decision-hint">{{ message }}</p>
    <div v-if="previewCards.length" class="centered-decision-preview-cards">
      <CardSurface
        v-for="card in previewCards"
        :key="card.cardId"
        base-class="centered-decision-preview-card"
        size="large"
        :card-id="card.cardId"
        :image-alt="card.cardName"
        :class="card.cardId === highlightedPreviewCardId ? ['game-highlight', 'game-highlight--choice'] : undefined"
      />
    </div>
    <slot />
    <div v-if="$slots.actions" class="centered-decision-actions">
      <slot name="actions" />
    </div>
  </ModalBase>
</template>
