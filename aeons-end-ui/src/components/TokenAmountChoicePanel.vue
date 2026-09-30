<script setup lang="ts">
import { computed } from 'vue'
import type { TokenAmountChoiceSummary } from '@engine/types'
import DebugNumberInput from './DebugNumberInput.vue'

const props = defineProps<{
  tokenName: string
  tokenImageUrl: string
  minAmount: number
  maxAmount: number
  modelValue: number
  summary?: TokenAmountChoiceSummary
}>()

const emit = defineEmits<{
  'update:modelValue': [amount: number]
  confirm: []
}>()

const isValidAmount = computed(() => Number.isInteger(props.modelValue)
  && props.modelValue >= props.minAmount
  && props.modelValue <= props.maxAmount)
const summaryText = computed(() => {
  if (!props.summary) return ''
  const amount = props.summary.baseAmount + props.modelValue * (props.summary.amountPerToken ?? 1)
  return props.summary.template.replace(/\{amount\}/g, String(amount))
})
</script>

<template>
  <div class="token-amount-choice" data-ui-component="Decision.TokenAmountChoice">
    <div class="token-amount-choice-control">
      <img :src="tokenImageUrl" :alt="`${tokenName} token`" draggable="false" />
      <DebugNumberInput
        :model-value="modelValue"
        :label="`${tokenName} token amount`"
        :min="minAmount"
        :max="maxAmount"
        :step="1"
        :focus-input-after-step="false"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
    <p v-if="summaryText" class="token-amount-choice-summary" aria-live="polite">{{ summaryText }}</p>
    <div class="overlay-actions">
      <button class="btn primary confirm-button" :disabled="!isValidAmount" @click="emit('confirm')">
        Confirm
      </button>
    </div>
  </div>
</template>

<style scoped>
.token-amount-choice { display: grid; justify-items: center; gap: 16px; min-width: min(340px, 78vw); margin-top: 18px; }
.token-amount-choice-control { display: flex; align-items: center; justify-content: center; gap: 12px; }
.token-amount-choice-control img { width: 52px; height: 52px; object-fit: contain; }
.token-amount-choice-control :deep(.debug-number-field) { flex-basis: 92px; width: 92px; height: 44px; }
.token-amount-choice-control :deep(.debug-number-field input) { width: 92px; height: 44px; padding-inline: 22px; font-size: 20px; font-weight: 700; text-align: center; }
.token-amount-choice-control :deep(.debug-number-steps) { top: 8px; right: 5px; bottom: 8px; justify-content: center; }
.token-amount-choice-summary { max-width: min(520px, calc(100vw - 48px)); margin: 0; color: var(--text); font-size: 13px; font-weight: 700; line-height: 1.4; text-align: center; white-space: normal; }
.token-amount-choice .overlay-actions { margin-top: 0; }
</style>
