<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { getPlayer, toRoman } from '@engine/engine'
import { getCard, INITIAL_CARDS, MARKET_CARDS } from '@engine/data'
import type { GameState } from '@engine/types'
import { useGame } from '../game/useGame'

const { state, toggleDebug, clearSave } = useGame()

const g = computed(() => state.game!)
const p1 = computed(() => getPlayer(state.game!, 'p1'))
const p2 = computed(() => getPlayer(state.game!, 'p2'))
const nemesis = computed(() => state.game!.nemesis)
const gravehold = computed(() => state.game!.gravehold)

const allCards = computed(() => [...Object.keys(INITIAL_CARDS), ...Object.keys(MARKET_CARDS)])
const addPlayer = ref<'p1' | 'p2'>('p1')
const addZone = ref<'hand' | 'deck' | 'discard'>('hand')
const addCard = ref('crystal')

function addCardToPlayer() {
  const p = getPlayer(state.game!, addPlayer.value)
  p[addZone.value].push(addCard.value)
}

function giveAether(playerId: 'p1' | 'p2') {
  getPlayer(state.game!, playerId).bonusAether += 3
}

const jsonText = ref('')
function loadCurrentJson() {
  jsonText.value = JSON.stringify({
    game: state.game, phase: state.phase, selectedPlayer: state.selectedPlayer,
    pendingNemesis: state.pendingNemesis, discardRemaining: state.discardRemaining,
    pendingRelic: state.pendingRelic,
  }, null, 2)
}
function applyJson() {
  try {
    const data = JSON.parse(jsonText.value)
    if (!data?.game) return
    state.game = reactive(data.game) as GameState
    state.phase = data.phase ?? 'main'
    state.selectedPlayer = data.selectedPlayer ?? 'p1'
    state.pendingNemesis = data.pendingNemesis ?? null
    state.discardRemaining = data.discardRemaining ?? []
    state.pendingRelic = data.pendingRelic ?? null
  } catch (e: any) {
    alert(`Invalid JSON: ${e.message}`)
  }
}
function copyJson() {
  navigator.clipboard.writeText(jsonText.value)
}
</script>

<template>
  <div v-if="state.debugOpen && state.game" class="debug-panel">
    <div class="debug-head">
      <h3>Debug Tools</h3>
      <button class="btn small" @click="toggleDebug()">Close (Ctrl+D)</button>
    </div>

    <div class="debug-section">
      <span class="debug-label">Nemesis HP</span>
      <input type="number" v-model.number="nemesis.hp" min="0" :max="nemesis.maxHp" />
      <span class="debug-label">Gravehold HP</span>
      <input type="number" v-model.number="gravehold.hp" min="0" :max="gravehold.maxHp" />
    </div>

    <div v-for="p in [p1, p2]" :key="p.id" class="debug-section">
      <span class="debug-player">{{ p.mageType }} ({{ p.id }})</span>
      <div class="debug-row">
        <label>HP <input type="number" v-model.number="p.hp" min="0" /></label>
        <label>Charge <input type="number" v-model.number="p.charge" min="0" /></label>
      </div>
      <div class="debug-breaches">
        <button
          v-for="b in p.breaches" :key="b.index"
          class="btn small" :class="{ on: b.opened }"
          @click="b.opened = !b.opened; b.prepSpell = null"
        >{{ toRoman(b.index) }}</button>
      </div>
      <button class="btn small" @click="giveAether(p.id)">+3 bonus aether</button>
    </div>

    <div class="debug-section">
      <span class="debug-label">Add card</span>
      <select v-model="addCard">
        <option v-for="cid in allCards" :key="cid" :value="cid">{{ cid }} — {{ getCard(cid).name }}</option>
      </select>
      <select v-model="addPlayer">
        <option value="p1">p1</option>
        <option value="p2">p2</option>
      </select>
      <select v-model="addZone">
        <option value="hand">hand</option>
        <option value="deck">deck</option>
        <option value="discard">discard</option>
      </select>
      <button class="btn small" @click="addCardToPlayer()">Add</button>
    </div>

    <div class="debug-section">
      <span class="debug-label">State JSON (export / import)</span>
      <textarea v-model="jsonText" rows="6" spellcheck="false"></textarea>
      <div class="debug-row">
        <button class="btn small" @click="loadCurrentJson()">Load Current</button>
        <button class="btn small" @click="applyJson()">Apply</button>
        <button class="btn small" @click="copyJson()">Copy</button>
      </div>
    </div>

    <div class="debug-section">
      <button class="btn small" @click="clearSave()">Clear Save</button>
    </div>
  </div>
</template>
