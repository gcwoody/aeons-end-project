<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useGame } from '../game/useGame'

const { state } = useGame()
const box = ref<HTMLElement | null>(null)

watch(() => state.log.length, async () => {
  await nextTick()
  if (box.value) box.value.scrollTop = box.value.scrollHeight
})
</script>

<template>
  <div class="panel">
    <div class="panel-title">Log</div>
    <div ref="box" class="log">
      <div v-for="e in state.log" :key="e.id" :class="e.kind">{{ e.text }}</div>
    </div>
  </div>
</template>
