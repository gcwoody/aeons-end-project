<script setup lang="ts">
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'

defineOptions({ inheritAttrs: false })

defineProps<{ cardId: string }>()
</script>

<template>
  <CardHoverPreview :card-id="cardId">
    <CardSurface
      v-bind="$attrs"
      base-class="attached-quarter-card"
      size="mini"
      :card-id="cardId"
    />
  </CardHoverPreview>
</template>
