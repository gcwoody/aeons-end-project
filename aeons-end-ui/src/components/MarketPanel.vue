<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'
import { cardImageUrl } from '../card-images'
import CardHoverPreview from './CardHoverPreview.vue'

const { state, buyables, buyCard } = useGame()

const canBuy = computed(() => state.game!.currentTurn !== 'nemesis' && state.phase === 'main')

function onBuy(pileIndex: number) {
  if (!canBuy.value) return
  const pile = buyables.value.find(candidate => candidate.pileIndex === pileIndex)
  if (!pile || pile.remaining <= 0) return
  buyCard(pileIndex)
}
</script>

<template>
  <div class="panel">
    <div class="panel-title">Market</div>
    <div class="market-grid">
      <template v-for="b in buyables" :key="b.cardId">
        <CardHoverPreview
          v-if="b.remaining > 0"
          :card-id="b.cardId"
          :preview-width="280"
          :preview-height="394"
          :preview-delay="200"
        >
          <button
            type="button"
            class="pile"
            :class="{ 'can-buy': canBuy }"
            :disabled="!canBuy"
            @click="onBuy(b.pileIndex)"
          >
            <img v-if="cardImageUrl(b.cardId)" :src="cardImageUrl(b.cardId)" :alt="b.cardName" draggable="false" />
            <span v-else class="cname">{{ b.cardName }}</span>
            <span class="remaining">{{ b.remaining }}</span>
          </button>
        </CardHoverPreview>
        <div v-else class="pile pile-empty" aria-hidden="true"></div>
      </template>
    </div>
  </div>
</template>
