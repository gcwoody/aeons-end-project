<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerTargetRef } from '@engine/types'

export interface PlayerDamageChoiceItem {
  target: PlayerTargetRef
  mageName: string
  hp: number | null
  tokenUrl?: string
  damage: number | null
}

const props = defineProps<{ choices: PlayerDamageChoiceItem[] }>()
const emit = defineEmits<{ select: [target: PlayerTargetRef] }>()

const summary = computed(() => {
  const amounts = props.choices
    .map(choice => choice.damage)
    .filter((amount): amount is number => amount !== null)
  if (amounts.length === 0) {
    return { amount: '', detail: 'Hover over a Mage to preview the damage.' }
  }

  const unique = [...new Set(amounts)]
  if (unique.length === 1) {
    return { amount: `${unique[0]} damage`, detail: '\u00a0will be dealt. Hover over a Mage to preview the loss.' }
  }

  return {
    amount: `${Math.min(...unique)}–${Math.max(...unique)} damage`,
    detail: '\u00a0will be dealt, depending on the Mage. Hover to preview the loss.',
  }
})

function accessibleLabel(choice: PlayerDamageChoiceItem): string {
  const hp = choice.hp === null ? '' : `, HP ${choice.hp}`
  const damage = choice.damage === null ? '' : `, suffer ${choice.damage} damage`
  return `Attack ${choice.mageName}${hp}${damage}`
}
</script>

<template>
  <div class="player-damage-choice" data-ui-component="Decision.PlayerDamageChoice">
    <p class="decision-hint damage-choice-summary">
      <template v-if="summary.amount">
        <strong class="damage-choice-amount">{{ summary.amount }}</strong><span class="damage-choice-detail">{{ summary.detail }}</span>
      </template>
      <template v-else>{{ summary.detail }}</template>
    </p>
    <div class="decision-options damage-player-targets">
      <button
        v-for="choice in choices"
        :key="choice.target.playerId"
        class="char-btn player-target-option damage-target-choice"
        :aria-label="accessibleLabel(choice)"
        @click="emit('select', choice.target)"
      >
        <img
          v-if="choice.tokenUrl"
          class="char-turn-token"
          :src="choice.tokenUrl"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <span class="cn">{{ choice.mageName }}</span>
        <span v-if="choice.hp !== null" class="chp">HP <strong>{{ choice.hp }}</strong></span>
        <span v-if="choice.damage !== null" class="damage-choice-loss" aria-hidden="true">−{{ choice.damage }}</span>
      </button>
    </div>
  </div>
</template>
