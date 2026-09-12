<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGame } from '../game/useGame'
import { createTurnOrderLabels, turnOrderActorLabel } from '../game/turn-order-labels'

const { state } = useGame()

const game = computed(() => state.game!)
const taken = computed(() => game.value.turnOrderDiscard)
const nemesis = computed(() => game.value.nemesis)
const gravehold = computed(() => game.value.gravehold)
const round = computed(() => game.value.round)

const slots = computed(() => {
  const arr: (string | null)[] = []
  for (let i = 0; i < 6; i++) arr.push(taken.value[i] ?? null)
  return arr
})
const currentIdx = computed(() => taken.value.length - 1)
const playerLabels = computed(() => createTurnOrderLabels(game.value.players))
const actorLabel = (a: string) => turnOrderActorLabel(a, playerLabels.value)
const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`

const contentEl = ref<HTMLElement | null>(null)
const compactRightHp = ref(false)
const layout = ref({ '--turn-left-width': '40%', '--turn-slot-width': '32px' })
let observer: ResizeObserver | undefined
function updateLayout() {
  const bounds = contentEl.value?.getBoundingClientRect()
  if (!bounds) return
  const gap = 24
  const sideMinimum = window.innerWidth < 1400 ? 60 : 96
  const desiredCenter = window.innerWidth / 2 - bounds.left
  // Reserve readable HP information before choosing the six slot widths.
  const availableHalf = Math.min(desiredCenter, bounds.width - desiredCenter) - gap - sideMinimum
  const slotWidth = Math.max(24, Math.min(58, (availableHalf * 2 - 20) / 6))
  const slotsHalf = (slotWidth * 6 + 20) / 2
  const center = Math.max(slotsHalf + gap + sideMinimum,
    Math.min(desiredCenter, bounds.width - slotsHalf - gap - sideMinimum))
  compactRightHp.value = bounds.width - center - slotsHalf - gap < 160
  layout.value = {
    '--turn-left-width': `${Math.max(0, center - slotsHalf - gap)}px`,
    '--turn-slot-width': `${slotWidth}px`,
  }
}
onMounted(() => {
  observer = new ResizeObserver(updateLayout)
  if (contentEl.value) observer.observe(contentEl.value)
  window.addEventListener('resize', updateLayout)
  updateLayout()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', updateLayout)
})
</script>

<template>
  <div class="turn-order-bar">
    <div ref="contentEl" class="turn-status-content" :style="layout">
      <div class="turn-side turn-side-left">
        <div class="hp-block">
          <span class="hp-name">Nemesis</span>
          <div class="hpbar nemesis"><i :style="{ width: pct(nemesis.hp / nemesis.maxHp) }" /></div>
          <span class="hp-num"><b>{{ nemesis.hp }}</b>/{{ nemesis.maxHp }}</span>
        </div>
      </div>
      <div class="slots">
        <div
          v-for="(s, i) in slots" :key="i"
          class="slot"
          :class="{ done: !!s, current: i === currentIdx, nemesis: s === 'nemesis' }"
        >
          {{ s ? actorLabel(s) : '?' }}
        </div>
      </div>
      <div class="turn-side turn-side-right" :class="{ 'compact-hp': compactRightHp }">
        <div class="hp-block">
          <span class="hp-name">Gravehold</span>
          <div class="hpbar grave"><i :style="{ width: pct(gravehold.hp / gravehold.maxHp) }" /></div>
          <span class="hp-num"><b>{{ gravehold.hp }}</b>/{{ gravehold.maxHp }}</span>
        </div>
      </div>
    </div>
    <div class="turn-round">Round {{ round }}</div>
  </div>
</template>
