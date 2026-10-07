<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'

const { state } = useGame()
const impacts = computed(() => state.damageImpacts)

function targetKind(targetId: string): 'player' | 'nemesis' | 'gravehold' | 'minion' {
  if (targetId.startsWith('player:')) return 'player'
  if (targetId.startsWith('minion:')) return 'minion'
  return targetId === 'gravehold' ? 'gravehold' : 'nemesis'
}
</script>

<template>
  <div class="damage-feedback-layer" aria-hidden="true">
    <div
      v-for="impact in impacts"
      :key="impact.id"
      class="damage-impact"
      :class="[`damage-impact-${targetKind(impact.targetId)}`, `damage-impact--${impact.kind}`]"
      :style="{
        left: `${impact.left}px`,
        top: `${impact.top}px`,
        width: `${impact.width}px`,
        height: `${impact.height}px`,
        '--damage-number-stack': impact.stackIndex,
      }"
    >
      <span class="damage-impact-aura" />
      <span class="damage-impact-number">{{ impact.kind === 'damage' ? '−' : '+' }}{{ impact.amount }}</span>
    </div>
  </div>
</template>
