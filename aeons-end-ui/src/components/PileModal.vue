<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import { useGame } from '../game/useGame'

const { state, displayPlayer, closePile } = useGame()

const title = computed(() => (state.viewPile === 'deck' ? 'Deck' : 'Discard'))
const cards = computed(() =>
  state.viewPile === 'deck' ? displayPlayer.value!.deck : displayPlayer.value!.discard,
)
// Columns of 5 cards; first column holds the top of the pile.
const columns = computed(() => {
  const cols: string[][] = []
  for (let i = 0; i < cards.value.length; i += 5) cols.push(cards.value.slice(i, i + 5))
  return cols
})
</script>

<template>
  <div v-if="state.viewPile" class="overlay" @click.self="closePile">
    <div class="overlay-card pile-modal">
      <h3>{{ title }} <span class="muted">(top → bottom)</span></h3>
      <div v-if="cards.length === 0" class="empty">— empty —</div>
      <div v-else class="pile-cols">
        <div v-for="(col, ci) in columns" :key="ci" class="pile-col">
          <div v-for="(cid, i) in col" :key="cid + i" class="pile-card">
            {{ getCard(cid).name }}
          </div>
        </div>
      </div>
      <button class="btn" @click="closePile">Close</button>
    </div>
  </div>
</template>
