<script setup lang="ts">
withDefaults(defineProps<{
  count: number
  label: string
}>(), {
  count: 0,
  label: 'Pile',
})
</script>

<template>
  <span v-if="count > 0" class="player-pile-count">{{ count }}</span>
  <span v-else class="player-empty-pile-label">{{ label }} 0</span>
</template>