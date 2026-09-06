<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'

const { state, displayPlayer, closePile } = useGame()

const title = computed(() => (state.viewPile === 'deck' ? 'Deck' : 'Discard'))
const cards = computed(() =>
  state.viewPile === 'deck' ? displayPlayer.value!.deck : displayPlayer.value!.discard,
)

const deckCount = computed(() => displayPlayer.value?.deck.length ?? 0)

function chunkCards(list: string[], size: number): string[][] {
  const groups: string[][] = []
  for (let i = 0; i < list.length; i += size) groups.push(list.slice(i, i + size))
  return groups
}

const groups = computed(() => {
  if (state.viewPile !== 'discard') return chunkCards(cards.value, 5)
  if (cards.value.length === 0) return []

  // The last discard row completes the remaining deck cards to a five-card draw.
  const deckRemainder = deckCount.value % 5
  const lastGroupSize = Math.min(cards.value.length, 5 - deckRemainder)
  const splitAt = cards.value.length - lastGroupSize
  const previousGroups = chunkCards(cards.value.slice(0, splitAt), 5)
  return [...previousGroups, cards.value.slice(splitAt)]
})

function rowLabel(groupIndex: number): string {
  const isNextDraw = state.viewPile === 'deck'
    ? groupIndex === 0
    : groupIndex === groups.value.length - 1
  return isNextDraw ? 'NEXT DRAW' : 'FUTURE DRAW'
}
</script>

<template>
  <div v-if="state.viewPile" class="overlay" @click.self="closePile">
    <div class="overlay-card pile-modal">
      <h3>
        {{ title }}
        <span class="muted">(top → bottom)</span>
      </h3>
      <div v-if="cards.length === 0" class="empty">— empty —</div>
      <div v-else class="pile-rows">
        <div
          v-for="(group, gi) in groups"
          :key="gi"
          class="pile-row pile-row-labeled"
        >
          <span class="pile-row-label">{{ rowLabel(gi) }}</span>
          <CardHoverPreview v-for="(cid, i) in group" :key="cid + i" :card-id="cid">
            <div class="pile-card" :class="{ 'pile-card-image': cardImageUrl(cid) }">
              <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" />
              <span v-else>{{ getCard(cid).name }}</span>
            </div>
          </CardHoverPreview>
        </div>
      </div>
      <button class="btn" @click="closePile">Close</button>
    </div>
  </div>
</template>
