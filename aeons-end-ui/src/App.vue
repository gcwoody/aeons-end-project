<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useGame } from './game/useGame'
import SetupScreen from './components/SetupScreen.vue'
import TurnOrderBar from './components/TurnOrderBar.vue'
import NemesisArea from './components/NemesisArea.vue'
import MarketPanel from './components/MarketPanel.vue'
import PlayerArea from './components/PlayerArea.vue'
import LogPanel from './components/LogPanel.vue'
import PileModal from './components/PileModal.vue'
import DebugPanel from './components/DebugPanel.vue'

const { state, nemesisChooseTarget, undo, toggleDebug } = useGame()

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    undo()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    toggleDebug()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <SetupScreen v-if="!state.game" />
  <div v-else class="app">
    <div class="main-col">
      <TurnOrderBar />
      <div class="top-section">
        <div class="top-main">
          <NemesisArea />
        </div>
        <MarketPanel class="market-col" />
      </div>
      <PlayerArea />
    </div>
    <LogPanel class="log-col" />

    <PileModal />
    <DebugPanel />

    <div v-if="state.phase === 'nemesis_target' && state.pendingNemesis" class="overlay">
      <div class="overlay-card">
        <h2>Nemesis Attack</h2>
        <p>Drew: {{ state.pendingNemesis.cardName }} ({{ state.pendingNemesis.damage }} dmg)</p>
        <div class="overlay-actions">
          <button class="btn" @click="nemesisChooseTarget('p1')">Attack P1</button>
          <button class="btn" @click="nemesisChooseTarget('p2')">Attack P2</button>
          <button class="btn" @click="nemesisChooseTarget('gravehold')">Attack Gravehold</button>
        </div>
      </div>
    </div>

    <div v-if="state.phase === 'gameover'" class="overlay">
      <div class="overlay-card">
        <h2>{{ state.game.winner === 'players' ? 'Victory!' : 'Defeat…' }}</h2>
        <p>Winner: {{ state.game.winner }} · Nemesis {{ state.game.nemesis.hp }}/{{ state.game.nemesis.maxHp }}</p>
        <button class="btn primary" @click="state.game = null; state.phase = 'setup'">New Game</button>
      </div>
    </div>
  </div>
</template>
