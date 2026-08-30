<script setup lang="ts">
import { ref, watch } from 'vue'
import { getCard } from '@engine/data'
import { useGame } from '../game/useGame'

const { state, relicDiscard } = useGame()
const selected = ref<number[]>([])

watch(() => state.pendingRelic, () => { selected.value = [] })

function toggle(i: number) {
  const idx = selected.value.indexOf(i)
  if (idx === -1) {
    if (selected.value.length >= (state.pendingRelic?.discardCount ?? 0)) return
    selected.value.push(i)
  } else {
    selected.value.splice(idx, 1)
  }
}

function confirm() {
  relicDiscard(selected.value)
  selected.value = []
}
</script>

<template>
  <div v-if="state.pendingRelic" class="overlay">
    <div class="overlay-card relic-modal">
      <h3>Relic Effect</h3>
      <p>Discard {{ state.pendingRelic.discardCount }} of the drawn cards (the rest go to your hand).</p>
      <div class="relic-cards">
        <div
          v-for="(cid, i) in state.pendingRelic.drawn" :key="cid + i"
          class="card small clickable" :class="{ selected: selected.includes(i) }"
          @click="toggle(i)"
        >
          <div class="cname">{{ getCard(cid).name }}</div>
        </div>
      </div>
      <div class="overlay-actions">
        <span class="stat">Selected {{ selected.length }}/{{ state.pendingRelic.discardCount }}</span>
        <button
          class="btn primary"
          :disabled="selected.length !== state.pendingRelic.discardCount"
          @click="confirm"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
