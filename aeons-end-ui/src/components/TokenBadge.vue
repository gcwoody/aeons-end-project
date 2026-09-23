<script setup lang="ts">
type TokenTone = 'power' | 'aether' | 'neutral'
type TokenPlacement = 'inline' | 'card'

withDefaults(defineProps<{
  label: string
  count: number | string
  tone?: TokenTone
  placement?: TokenPlacement
}>(), {
  tone: 'neutral',
  placement: 'inline',
})
</script>

<template>
  <span
    class="token-badge"
    :class="[`token-badge--${tone}`, `token-badge--${placement}`]"
  >
    {{ label }} {{ count }}
  </span>
</template>
