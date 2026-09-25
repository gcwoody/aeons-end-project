<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'
import { createTurnOrderLabels, turnOrderActorLabel } from '../game/turn-order-labels'
import { nemesisTurnOrderTokenUrl, playerTurnOrderTokenUrl } from '../card-images'

const { state } = useGame()
const game = computed(() => state.game!)
const taken = computed(() => game.value.turnOrderDiscard)
const round = computed(() => game.value.round)
const slots = computed(() => Array.from({ length: 6 }, (_, index) => taken.value[index] ?? null))
const currentIdx = computed(() => taken.value.length - 1)
const playerLabels = computed(() => createTurnOrderLabels(game.value.players))
const actorLabel = (actor: string) => turnOrderActorLabel(actor, playerLabels.value)
function tokenUrl(actor: string | null): string | undefined {
  if (!actor) return undefined
  if (actor === 'nemesis') return nemesisTurnOrderTokenUrl()
  const playerIndex = game.value.players.findIndex(player => player.id === actor)
  return playerTurnOrderTokenUrl(playerIndex + 1)
}
</script>

<template>
  <div class="turn-order-cards">
    <div class="slots">
      <div
        v-for="(slot, index) in slots" :key="index"
        class="slot"
        :class="{ current: index === currentIdx, hidden: !slot }"
        :aria-label="slot ? `${actorLabel(slot)} turn` : 'Turn order card hidden'"
      >
        <img v-if="tokenUrl(slot)" class="turn-order-token" :src="tokenUrl(slot)" alt="" draggable="false" />
        <span v-else aria-hidden="true">?</span>
      </div>
    </div>
    <div class="turn-round">Round {{ round }}</div>
  </div>
</template>
