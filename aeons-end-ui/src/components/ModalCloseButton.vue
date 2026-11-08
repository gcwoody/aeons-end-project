<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
}>(), {
  label: 'Close dialog',
})

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <button
    type="button"
    class="modal-close-button"
    :aria-label="label"
    :title="label"
    data-no-modal-drag
    @click="emit('close')"
  >
  </button>
</template>
