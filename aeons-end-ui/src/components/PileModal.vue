<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import { groupPileCards, pileRowLabel } from '../game/pile-layout'

const { state, displayPlayer, closePile } = useGame()

const title = computed(() => (state.viewPile === 'deck' ? 'Deck' : 'Discard'))
const cards = computed(() =>
  state.viewPile === 'deck' ? displayPlayer.value!.deck : displayPlayer.value!.discard,
)

const deckCount = computed(() => displayPlayer.value?.deck.length ?? 0)

const groups = computed(() => {
  return state.viewPile ? groupPileCards(cards.value, state.viewPile, deckCount.value) : []
})

function rowLabel(groupIndex: number): string {
  return state.viewPile ? pileRowLabel(state.viewPile, groupIndex, groups.value.length) : ''
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
