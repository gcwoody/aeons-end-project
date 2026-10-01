<script setup lang="ts">
withDefaults(defineProps<{
  tokenUrl?: string
  label: string
  hidden?: boolean
}>(), {
  hidden: false,
})
</script>

<template>
  <div
    class="turn-order-token-surface"
    :class="{ hidden: hidden || !tokenUrl }"
    role="img"
    :aria-label="label"
  >
    <img
      v-if="tokenUrl && !hidden"
      class="turn-order-token-image"
      :src="tokenUrl"
      alt=""
      draggable="false"
    />
    <span v-else aria-hidden="true">?</span>
  </div>
</template>
