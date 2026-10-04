<script setup lang="ts">
import type { LifeTargetRef } from '@engine/types'

export interface PlayerLifeChoiceItem {
  target: Extract<LifeTargetRef, { kind: 'player' }>
  mageName: string
  hp: number | null
  tokenUrl?: string
  amount: number
}

defineProps<{
  choices: PlayerLifeChoiceItem[]
}>()

const emit = defineEmits<{ select: [target: Extract<LifeTargetRef, { kind: 'player' }>] }>()

function accessibleLabel(choice: PlayerLifeChoiceItem): string {
  const hp = choice.hp === null ? '' : `, HP ${choice.hp}`
  return `Heal ${choice.mageName}${hp}, gain ${choice.amount} life`
}
</script>

<template>
  <div class="player-life-choice" data-ui-component="Decision.PlayerLifeChoice">
    <p class="decision-hint life-choice-summary">
      <strong class="life-choice-amount">{{ choices[0]?.amount ?? 0 }} life</strong>
      <span>&nbsp;will be gained. Hover over a Mage to preview the recovery.</span>
    </p>
    <div class="decision-options life-player-targets">
      <button
        v-for="choice in choices"
        :key="choice.target.playerId"
        class="char-btn player-target-option damage-target-choice life-target-choice"
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
        <span class="life-choice-gain" aria-hidden="true">+{{ choice.amount }}</span>
      </button>
    </div>
  </div>
</template>
