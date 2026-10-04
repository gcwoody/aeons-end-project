<script setup lang="ts">
import type { PlayerTargetRef } from '@engine/types'

export interface PlayerDiscardChoiceItem {
  target: PlayerTargetRef
  mageName: string
  handCount: number
  tokenUrl?: string
}

export interface PlayerDiscardActionSummary {
  minAmount: number
  maxAmount: number
  drawAmount: number
}

const props = defineProps<{
  choices: PlayerDiscardChoiceItem[]
  action: PlayerDiscardActionSummary
}>()

const emit = defineEmits<{ select: [target: PlayerTargetRef] }>()

function discardText(): string {
  const { minAmount, maxAmount } = props.action
  const amountText = minAmount === maxAmount
    ? `${maxAmount} card${maxAmount === 1 ? '' : 's'}`
    : minAmount === 0
      ? `up to ${maxAmount} cards`
      : `${minAmount}–${maxAmount} cards`
  return `Discard ${amountText}`
}

function actionText(): string {
  const discard = discardText()
  const drawAmount = Math.max(0, props.action.drawAmount)
  if (drawAmount === 0) return `${discard}.`
  return `${discard} and then draw ${drawAmount} card${drawAmount === 1 ? '' : 's'}.`
}

function accessibleLabel(choice: PlayerDiscardChoiceItem): string {
  return `Choose ${choice.mageName}, Hand ${choice.handCount}`
}
</script>

<template>
  <div class="player-discard-choice" data-ui-component="Decision.PlayerDiscardChoice">
    <p class="decision-hint player-discard-summary">{{ actionText() }}</p>
    <div class="decision-options discard-player-targets">
      <button
        v-for="choice in choices"
        :key="choice.target.playerId"
        class="char-btn discard-target-choice"
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
        <span class="chand">Hand <strong>{{ choice.handCount }}</strong></span>
      </button>
    </div>
  </div>
</template>
