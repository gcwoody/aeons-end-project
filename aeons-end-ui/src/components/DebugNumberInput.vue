<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: number | string
  label: string
  min?: number
  max?: number
  step?: number
  focusInputAfterStep?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
  change: [event: Event]
}>()

const input = ref<HTMLInputElement | null>(null)

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value)) emit('update:modelValue', value)
}

function handleChange(event: Event) {
  const field = event.target as HTMLInputElement
  if (!Number.isFinite(field.valueAsNumber)) field.value = String(props.modelValue)
  emit('change', event)
}

function changeBy(direction: 1 | -1) {
  const field = input.value
  if (!field || field.disabled) return
  if (direction === 1) field.stepUp()
  else field.stepDown()
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
  if (props.focusInputAfterStep === false) field.blur()
  else field.focus({ preventScroll: true })
}
</script>

<template>
  <span class="debug-number-field">
    <input
      ref="input"
      type="number"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step ?? 1"
      :aria-label="label"
      @input="handleInput"
      @change="handleChange"
    />
    <span class="debug-number-steps">
      <button type="button" class="debug-number-step up" :aria-label="`Increase ${label}`" @click="changeBy(1)"></button>
      <button type="button" class="debug-number-step down" :aria-label="`Decrease ${label}`" @click="changeBy(-1)"></button>
    </span>
  </span>
</template>
