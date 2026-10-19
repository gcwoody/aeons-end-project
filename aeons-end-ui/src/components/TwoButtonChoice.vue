<script setup lang="ts">
import type { DecisionOption } from '@engine/types'

defineProps<{ options: DecisionOption[] }>()

const emit = defineEmits<{
  select: [optionId: string]
}>()
</script>

<template>
  <div class="decision-options two-button-choice-options" data-ui-component="Decision.TwoButtonChoice">
    <button
      v-for="option in options"
      :key="option.id"
      class="btn primary decision-option"
      :class="{ unavailable: option.disabled }"
      :disabled="option.disabled"
      @click="emit('select', option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.two-button-choice-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--two-button-choice-gap, 10px);
  width: min(var(--two-button-choice-width, 420px), calc(100vw - 48px));
  margin: 18px auto 0;
}

.two-button-choice-options .decision-option {
  display: flex;
  min-width: 0;
  min-height: var(--two-button-choice-button-height, 56px);
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  font-size: var(--two-button-choice-font-size, 14px);
  white-space: normal;
  line-height: 1.4;
  text-align: center;
}
</style>
