<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'

const { state, buyables, buyCard } = useGame()

const canBuy = computed(() => state.game!.currentTurn !== 'nemesis' && state.phase === 'main')
const typeClass = (t: string) => (t === 'gem' ? 'gem' : t === 'relic' ? 'relic' : 'spell')
</script>

<template>
  <div class="panel">
    <div class="panel-title">Market</div>
    <div class="market-grid">
      <div v-for="b in buyables" :key="b.cardId" class="pile">
        <span class="cname">{{ b.cardName }}</span>
        <span class="badge" :class="typeClass(b.cardType)">{{ b.cardType }}</span>
        <span class="cost">{{ b.cost }} aether</span>
        <span class="remaining">{{ b.remaining }} left</span>
        <button class="btn small" :disabled="!canBuy" @click="buyCard(b.pileIndex)">Buy</button>
      </div>
    </div>
  </div>
</template>
