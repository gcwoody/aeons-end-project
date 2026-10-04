<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  selectedCount: number
  min: number
  max: number
  allowSkip?: boolean
}>(), {
  allowSkip: false,
})

const emit = defineEmits<{
  confirm: []
  skip: []
}>()

const canConfirm = computed(() =>
  props.selectedCount >= props.min
  && props.selectedCount <= props.max
  && !(props.allowSkip && props.selectedCount === 0))
</script>

<template>
  <div class="decision-footer prepped-spell-choice-footer">
    <span class="stat">Selected {{ selectedCount }}/{{ max }}</span>
    <div class="prepped-spell-choice-actions">
      <button v-if="allowSkip" class="btn" type="button" @click="emit('skip')">Skip</button>
      <button class="btn primary" type="button" :disabled="!canConfirm" @click="emit('confirm')">Confirm</button>
    </div>
  </div>
</template>

<style scoped>
.prepped-spell-choice-actions { display: flex; gap: 8px; }
</style>
