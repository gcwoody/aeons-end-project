<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import { useGame } from '../game/useGame'

const { state } = useGame()

const nemesis = computed(() => state.game!.nemesis)
const discTop = computed(() =>
  nemesis.value.discard[0] ? getCard(nemesis.value.discard[0]).name : null,
)
</script>

<template>
  <div class="nemesis-area">
    <div class="nemesis-piles">
      <div class="pile-box">
        <span class="pile-label">Discard</span>
        <span class="pile-count">{{ nemesis.discard.length }}</span>
        <span v-if="discTop" class="pile-top">{{ discTop }}</span>
      </div>
      <div class="pile-box">
        <span class="pile-label">Deck</span>
        <span class="pile-count">{{ nemesis.deck.length }}</span>
      </div>
    </div>

    <div class="nemesis-play">
      <span class="panel-title">Nemesis Play Area</span>
      <div v-if="nemesis.playArea.length === 0" class="empty">— empty —</div>
      <div v-else class="play-cards">
        <div v-for="c in nemesis.playArea" :key="c.cardId + c.placedAt" class="play-card">
          {{ getCard(c.cardId).name }}
          <span v-if="c.lifeTokens != null"> · Life {{ c.lifeTokens }}</span>
          <span v-if="c.powerTokens != null"> · Power {{ c.powerTokens }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
