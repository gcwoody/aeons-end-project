<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PlayerState } from '@engine/types'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'
import { displayMageName } from '../game/display-name'
import { chunkCards } from '../game/pile-layout'
import { useModalDrag } from '../game/useModalDrag'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import ModalBase from './ModalBase.vue'

const props = defineProps<{
  player?: PlayerState
}>()

const emit = defineEmits<{
  close: []
}>()

const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()
const draggedIndex = ref<number | null>(null)

const cards = computed(() => props.player?.deck ?? [])
const groups = computed(() => chunkCards(cards.value))
const columns = computed(() => Math.max(1, Math.min(5, Math.max(0, ...groups.value.map(group => group.length)))))

function cardIndexInDeck(groupIndex: number, cardIndex: number): number {
  return groups.value.slice(0, groupIndex).reduce((total, group) => total + group.length, 0) + cardIndex
}

function startCardDrag(index: number, event: DragEvent) {
  draggedIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function dropCard(targetIndex: number, event: DragEvent) {
  event.preventDefault()
  const sourceIndex = draggedIndex.value
    ?? Number.parseInt(event.dataTransfer?.getData('text/plain') ?? '', 10)
  const deck = props.player?.deck
  if (deck && Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < deck.length) {
    const cardId = deck[sourceIndex]
    if (cardId) {
      deck.splice(sourceIndex, 1)
      deck.splice(Math.min(targetIndex, deck.length), 0, cardId)
    }
  }
  draggedIndex.value = null
}

function endCardDrag() {
  draggedIndex.value = null
}
</script>

<template>
  <ModalBase
    v-if="player"
    overlay-class="debug-deck-order-overlay"
    v-model:panel-ref="modalEl"
    :panel-class="['pile-modal', 'draggable-modal', 'debug-deck-order-modal']"
    :panel-style="{ ...modalStyle, '--pile-columns': columns }"
    :dragging="dragging"
    panel-aria-labelledby="debug-deck-order-title"
    @overlay-click="emit('close')"
    @panel-pointerdown="startDrag"
  >
    <h3 id="debug-deck-order-title">
      {{ displayMageName(player.mageType) }} Deck
      <span class="muted">(top → bottom)</span>
    </h3>
    <p class="debug-deck-order-hint">Drag a card onto another card to change the draw order.</p>
    <div v-if="cards.length === 0" class="empty">— empty —</div>
    <div v-else class="pile-rows">
      <div v-for="(group, groupIndex) in groups" :key="groupIndex" class="pile-row">
        <CardHoverPreview
          v-for="(cardId, cardIndex) in group"
          :key="`${cardId}-${cardIndexInDeck(groupIndex, cardIndex)}`"
          :card-id="cardId"
          :preview-width="210"
          :preview-height="315"
        >
          <CardSurface
            base-class="pile-card"
            size="pile"
            class="pile-card-image debug-deck-order-card"
            :class="{ dragging: draggedIndex === cardIndexInDeck(groupIndex, cardIndex) }"
            :card-id="cardId"
            :image-url="cardImageUrl(cardId)"
            :image-alt="getCard(cardId).name"
            :aria-label="`Deck position ${cardIndexInDeck(groupIndex, cardIndex) + 1}: ${getCard(cardId).name}`"
            draggable="true"
            data-no-modal-drag
            @dragstart="startCardDrag(cardIndexInDeck(groupIndex, cardIndex), $event)"
            @dragover.prevent
            @drop="dropCard(cardIndexInDeck(groupIndex, cardIndex), $event)"
            @dragend="endCardDrag"
          />
        </CardHoverPreview>
      </div>
    </div>
    <button class="btn" type="button" @click="emit('close')">Close</button>
  </ModalBase>
</template>
