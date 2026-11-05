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

const props = defineProps<{
  choices: PlayerDamageChoiceItem[]
  allocation?: { total: number; remaining: number }
}>()
const emit = defineEmits<{
  select: [target: PlayerTargetRef]
  allocate: [target: PlayerTargetRef]
  remove: [target: PlayerTargetRef]
  confirm: []
}>()

const summary = computed(() => {
  if (props.allocation) {
    const assigned = props.allocation.total - props.allocation.remaining
    return {
      amount: `${props.allocation.total} damage`,
      detail: ` assigned ${assigned}/${props.allocation.total}. Left-click to assign 1 damage; right-click to cancel 1 damage.`,
    }
  }

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
  if (props.allocation) {
    return `Assign damage to ${choice.mageName}${hp}, currently assigned ${choice.damage ?? 0}`
  }
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
        :class="{ 'damage-allocation-choice': allocation, 'has-assigned-damage': allocation && (choice.damage ?? 0) > 0 }"
        :aria-label="accessibleLabel(choice)"
        :title="allocation ? 'Left-click to assign 1 damage; right-click to cancel 1 damage' : undefined"
        @click="allocation
          ? (allocation.remaining > 0 && emit('allocate', choice.target))
          : emit('select', choice.target)"
        @contextmenu.prevent="allocation && (choice.damage ?? 0) > 0 && emit('remove', choice.target)"
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
        <span
          v-if="choice.damage !== null && (!allocation || choice.damage > 0)"
          class="damage-choice-loss"
          :class="{ 'damage-choice-assigned': allocation }"
          aria-hidden="true"
        >−{{ choice.damage }}</span>
      </button>
    </div>
    <div v-if="allocation" class="decision-footer">
      <span class="stat">Assigned {{ allocation.total - allocation.remaining }}/{{ allocation.total }}</span>
      <button class="btn primary" type="button" :disabled="allocation.remaining > 0" @click="emit('confirm')">Confirm</button>
    </div>
  </div>
</template>
