<script setup lang="ts">
import type { DecisionOption } from '@engine/types'

const props = defineProps<{
  mageMatUrl?: string
  mageName: string
  options: DecisionOption[]
}>()

const emit = defineEmits<{
  select: [optionId: string]
}>()
</script>

<template>
  <div class="mage-ability-choice-layout" data-ui-component="Decision.MageAbilityChoice">
    <div v-if="props.mageMatUrl" class="mage-ability-choice-mat-frame">
      <img
        class="mage-ability-choice-mat"
        :src="props.mageMatUrl"
        :alt="`${props.mageName} Mage mat`"
        draggable="false"
      />
    </div>
    <div class="decision-options stacked-panels mage-ability-choice-options">
      <button
        v-for="option in props.options"
        :key="option.id"
        class="btn primary decision-option mage-ability-choice-button"
        :class="{ unavailable: option.disabled }"
        :disabled="option.disabled"

        type="button"
        @click="emit('select', option.id)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
