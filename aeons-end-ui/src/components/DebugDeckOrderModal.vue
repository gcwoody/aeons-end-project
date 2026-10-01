<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PlayerState } from '@engine/types'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'
import { displayMageName } from '../game/display-name'
import { useModalDrag } from '../game/useModalDrag'
import { usePointerReorder } from '../game/usePointerReorder'
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
interface DeckEntry {
  key: string
  cardId: string
}

const deckEntries = ref<DeckEntry[]>([])
let nextDeckEntryKey = 0

watch(() => ({ playerId: props.player?.id, cards: [...(props.player?.deck ?? [])] }), ({ cards: currentCards }) => {
  const reusable = new Map<string, DeckEntry[]>()
  for (const entry of deckEntries.value) {
    const matching = reusable.get(entry.cardId) ?? []
    matching.push(entry)
    reusable.set(entry.cardId, matching)
  }
  deckEntries.value = currentCards.map(cardId => reusable.get(cardId)?.shift() ?? ({
    key: `deck-card-${++nextDeckEntryKey}`,
    cardId,
  }))
}, { immediate: true })

const cards = computed(() => deckEntries.value)
const columns = computed(() => Math.max(1, Math.min(5, cards.value.length)))

function reorderDeck(keys: string[]): void {
  const deck = props.player?.deck
  if (!deck || keys.length !== deckEntries.value.length) return
  const entriesByKey = new Map(deckEntries.value.map(entry => [entry.key, entry]))
  const reordered = keys.map(key => entriesByKey.get(key)).filter((entry): entry is DeckEntry => !!entry)
  if (reordered.length !== deckEntries.value.length) return
  deck.splice(0, deck.length, ...reordered.map(entry => entry.cardId))
  deckEntries.value = reordered
}

const { draggingKey, onPointerDown } = usePointerReorder({
  getKeys: () => deckEntries.value.map(entry => entry.key),
  reorder: reorderDeck,
  enabled: () => true,
})
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
    <TransitionGroup
      v-else
      name="pointer-sort"
      tag="div"
      class="pile-rows pointer-sort-row debug-deck-order-grid"
      :class="{ 'is-dragging': draggingKey !== null }"
    >
      <CardHoverPreview
        v-for="(entry, index) in cards"
        :key="entry.key"
        class="pointer-sort-item"
        :class="{ 'is-dragging': draggingKey === entry.key }"
        :data-sort-key="entry.key"
        :card-id="entry.cardId"
        :disabled="draggingKey !== null"
        :preview-width="210"
        :preview-height="315"
        @pointerdown="onPointerDown($event, entry.key)"
      >
        <CardSurface
          base-class="pile-card"
          size="pile"
          class="pile-card-image debug-deck-order-card"
          :card-id="entry.cardId"
          :image-url="cardImageUrl(entry.cardId)"
          :image-alt="getCard(entry.cardId).name"
          :aria-label="`Deck position ${index + 1}: ${getCard(entry.cardId).name}`"
          data-no-modal-drag
        />
      </CardHoverPreview>
    </TransitionGroup>
    <button class="btn" type="button" @click="emit('close')">Close</button>
  </ModalBase>
</template>
