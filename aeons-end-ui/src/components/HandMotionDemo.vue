<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { getCard } from '@engine/data'
import { animateCardFlight, captureCardFlight, waitForHandCardReflow } from '../game/card-flight'
import HandCardRow from './HandCardRow.vue'

const surface = ref<HTMLElement | null>(null)
const playerId = ref('gallery-hand-a')
let nextIndex = 0
const cards = ref<Array<{ cardId: string; handIndex: number; presentationKey: string }>>([])
const displayedCards = computed(() => cards.value.map(card => ({
  ...card,
  typeClass: getCard(card.cardId).type,
  isSpell: getCard(card.cardId).type === 'spell',
  pending: false,
  selected: false,
  endTurnActionAttention: false,
})))

function addCard(cardId = 'crystal') {
  const handIndex = nextIndex++
  cards.value.push({ cardId, handIndex, presentationKey: `${playerId.value}:${handIndex}` })
}

function reset(count = 5) {
  cards.value = []
  for (let index = 0; index < count; index++) addCard(index % 2 ? 'spark' : 'crystal')
}

function switchHand() {
  playerId.value = playerId.value === 'gallery-hand-a' ? 'gallery-hand-b' : 'gallery-hand-a'
  reset(playerId.value === 'gallery-hand-a' ? 5 : 2)
}

async function removeCard(index: number) {
  const source = surface.value?.querySelector<HTMLElement>(`[data-hand-card-index="${index}"]`) ?? null
  const flight = captureCardFlight(source)
  const destination = surface.value?.querySelector<HTMLElement>('.gallery-hand-destination') ?? null
  const movement = animateCardFlight(flight, destination, { timing: 'hand-to-pile', destinationMode: 'overlay' })
  cards.value = cards.value.filter(card => card.handIndex !== index)
  await nextTick()
  await Promise.all([movement, waitForHandCardReflow(surface.value?.querySelector('.hand') ?? null)])
}

async function discardThree() {
  const selected = cards.value.filter((_, index) => index % 2 === 0).slice(0, 3)
  for (const card of selected) await removeCard(card.handIndex)
}

reset()
</script>

<template>
  <div ref="surface" class="gallery-hand-motion">
    <div class="gallery-hand-motion-controls">
      <button class="btn" @click="reset()">Reset hand</button>
      <button class="btn" @click="addCard()">Add card</button>
      <button class="btn" :disabled="cards.length === 0" @click="removeCard(cards[0]!.handIndex)">Play a card</button>
      <button class="btn" :disabled="cards.length === 0" @click="discardThree">Discard three</button>
      <button class="btn" @click="reset(12)">Overflow hand</button>
      <button class="btn" @click="switchHand">Switch Mage</button>
    </div>
    <div class="gallery-hand-motion-board">
      <HandCardRow
        :player-id="playerId" :hand-cards="displayedCards" :conjured-card="null"
        :can-act-main="false" :dragging-spell="false" :dragged-spell-index="null" :dragging-conjured-card="false"
        @click-hand-card="removeCard"
      />
      <div class="gallery-hand-destination">Discard</div>
    </div>
  </div>
</template>

<style scoped>
.gallery-hand-motion-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.gallery-hand-motion-board { display: grid; grid-template-columns: minmax(0, 1fr) var(--hand-card-width); gap: 16px; height: var(--hand-row-height); }
.gallery-hand-motion-board :deep(.hand) { grid-column: 1; }
.gallery-hand-destination { align-self: center; display: grid; place-items: center; width: var(--hand-card-width); height: var(--hand-card-height); border: 1px dashed var(--border); border-radius: var(--card-radius); color: var(--muted); }
</style>
