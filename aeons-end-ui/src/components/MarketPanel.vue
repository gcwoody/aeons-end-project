<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'
import { cardImageUrl } from '../card-images'

const { state, buyables, buyCard } = useGame()

const canBuy = computed(() => state.game!.currentTurn !== 'nemesis' && state.phase === 'main')

function onBuy(pileIndex: number) {
  if (!canBuy.value) return
  buyCard(pileIndex)
}
</script>

<template>
  <div class="panel">
    <div class="panel-title">Market</div>
    <div class="market-grid">
      <button
        v-for="b in buyables" :key="b.cardId"
        type="button"
        class="pile"
        :class="[b.cardType, { 'can-buy': canBuy }]"
        :title="`${b.cardName} · ${b.cost} aether`"
        @click="onBuy(b.pileIndex)"
      >
        <img v-if="cardImageUrl(b.cardId)" :src="cardImageUrl(b.cardId)" :alt="b.cardName" draggable="false" />
        <span v-else class="cname">{{ b.cardName }}</span>
        <span class="remaining">{{ b.remaining }}</span>
      </button>
    </div>
  </div>
</template>
