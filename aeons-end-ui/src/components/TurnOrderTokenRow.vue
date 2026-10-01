<script setup lang="ts">
import { usePointerReorder } from '../game/usePointerReorder'
import TurnOrderToken from './TurnOrderToken.vue'

export interface TurnOrderTokenItem {
  key: string
  label: string
  tokenUrl?: string
  hidden?: boolean
}

const props = withDefaults(defineProps<{
  items: TurnOrderTokenItem[]
  draggableItems?: boolean
  ariaLabel?: string
}>(), {
  draggableItems: false,
  ariaLabel: 'Turn order tokens',
})

const emit = defineEmits<{
  (event: 'reorder', keys: string[]): void
  (event: 'choose', item: TurnOrderTokenItem): void
}>()

const { draggingKey, onPointerDown } = usePointerReorder({
  getKeys: () => props.items.map(item => item.key),
  reorder: keys => emit('reorder', keys),
  enabled: () => props.draggableItems,
})
</script>

<template>
  <TransitionGroup
    name="pointer-sort"
    tag="div"
    class="pointer-sort-row turn-order-token-row"
    :class="{ 'is-dragging': draggingKey !== null }"
    :aria-label="ariaLabel"
  >
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="turn-order-token-choice"
      :class="{
        'pointer-sort-item': draggableItems,
        'is-dragging': draggingKey === item.key,
      }"
      :data-sort-key="draggableItems ? item.key : undefined"
      :aria-label="item.label"
      @click="!draggableItems && emit('choose', item)"
      @pointerdown="onPointerDown($event, item.key)"
    >
      <TurnOrderToken :token-url="item.tokenUrl" :label="item.label" :hidden="item.hidden" />
    </button>
  </TransitionGroup>
</template>
