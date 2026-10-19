<script setup lang="ts">
import { cardImageUrl } from '../card-images'

export interface LargeCardChoiceOption {
  id: string
  cardId: string
  cardName: string
  disabled?: boolean
  disabledReason?: string
  motionZone?: string
  motionOwnerId?: string
  motionInstanceId?: string
}

defineProps<{
  choices: LargeCardChoiceOption[]
}>()

const emit = defineEmits<{
  choose: [optionId: string]
}>()
</script>

<template>
  <div class="large-card-choice-panel">
    <div class="large-card-choice-grid">
      <button
        v-for="choice in choices"
        :key="choice.id"
        class="decision-card-choice large-card-choice"
        type="button"
        :aria-label="`Choose ${choice.cardName}`"
        :disabled="choice.disabled"
        :data-card-motion-zone="choice.motionZone"
        :data-card-motion-card-id="choice.motionZone ? choice.cardId : undefined"
        :data-card-motion-owner-id="choice.motionOwnerId"
        :data-card-motion-key="choice.motionZone ? `decision-${choice.id}` : undefined"
        :data-card-instance-id="choice.motionInstanceId"
        :data-card-motion-suppress-flight="choice.motionInstanceId ? 'true' : undefined"
        @click="emit('choose', choice.id)"
      >
        <img
          v-if="cardImageUrl(choice.cardId)"
          :src="cardImageUrl(choice.cardId)"
          :alt="choice.cardName"
          draggable="false"
        />
        <span v-else>{{ choice.cardName }}</span>
      </button>
    </div>
  </div>
</template>
