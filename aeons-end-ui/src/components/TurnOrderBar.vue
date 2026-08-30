<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'

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
const actorLabel = (a: string) => (a === 'nemesis' ? 'NEM' : a.toUpperCase())
const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`
</script>

<template>
  <div class="turn-order-bar">
    <div class="slots">
      <div
        v-for="(s, i) in slots" :key="i"
        class="slot"
        :class="{ done: !!s, current: i === currentIdx, nemesis: s === 'nemesis' }"
      >
        {{ s ? actorLabel(s) : '?' }}
      </div>
    </div>
    <div class="turn-hp">
      <div class="hp-block">
        <span class="hp-name">Nemesis</span>
        <div class="hpbar nemesis"><i :style="{ width: pct(nemesis.hp / nemesis.maxHp) }" /></div>
        <span class="hp-num"><b>{{ nemesis.hp }}</b>/{{ nemesis.maxHp }}</span>
        <span class="hp-extra">Fury {{ nemesis.furyTokens }}</span>
      </div>
      <div class="hp-block">
        <span class="hp-name">Gravehold</span>
        <div class="hpbar grave"><i :style="{ width: pct(gravehold.hp / gravehold.maxHp) }" /></div>
        <span class="hp-num"><b>{{ gravehold.hp }}</b>/{{ gravehold.maxHp }}</span>
      </div>
      <div class="hp-block round">Round {{ round }}</div>
    </div>
  </div>
</template>
