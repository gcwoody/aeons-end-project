<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useGame } from '../game/useGame'

const { state } = useGame()
const collapsed = ref(true)
const box = ref<HTMLElement | null>(null)

watch(() => state.log.length, async () => {
  await nextTick()
  if (box.value) box.value.scrollTop = box.value.scrollHeight
})
</script>

<template>
  <div class="panel log-panel" :class="{ collapsed }">
    <button class="log-toggle" :aria-expanded="!collapsed" aria-label="Toggle log" @click="collapsed = !collapsed">
      <span class="log-arrow">{{ collapsed ? '◀' : '▶' }}</span>
      <span class="panel-title">Log</span>
    </button>
    <div v-if="!collapsed" ref="box" class="log">
      <div v-for="e in state.log" :key="e.id" :class="e.kind">{{ e.text }}</div>
    </div>
  </div>
</template>
