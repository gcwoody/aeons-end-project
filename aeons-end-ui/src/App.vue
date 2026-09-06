<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useGame } from './game/useGame'
import SetupScreen from './components/SetupScreen.vue'
import GameTopArea from './components/GameTopArea.vue'
import MarketPanel from './components/MarketPanel.vue'
import PlayerArea from './components/PlayerArea.vue'
import LogPanel from './components/LogPanel.vue'
import PileModal from './components/PileModal.vue'
import CardDecisionModal from './components/CardDecisionModal.vue'
import DebugPanel from './components/DebugPanel.vue'

const {
  state, nemesisChooseTarget, undo, toggleDebug,
  closeHelp, requestExit, cancelExit, saveAndExit, exitWithoutSaving,
} = useGame()

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    undo()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    toggleDebug()
  }
  if (e.key === 'Escape' && state.game) {
    e.preventDefault()
    if (state.helpOpen) {
      closeHelp()
      return
    }
    if (state.exitPrompt) cancelExit()
    else requestExit()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <SetupScreen v-if="!state.game" />
  <div v-else class="app">
    <div class="main-col">
      <div class="top-section">
        <GameTopArea class="top-main" />
        <MarketPanel class="market-col" />
      </div>
      <PlayerArea />
    </div>
    <LogPanel class="log-col" />

    <PileModal />
    <CardDecisionModal />
    <DebugPanel />

    <div v-if="state.helpOpen" class="overlay help-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" @click.self="closeHelp">
      <div class="overlay-card help-modal">
        <div class="help-head">
          <h2 id="help-title">Game Help</h2>
          <button class="btn small" aria-label="Close game help" @click="closeHelp">Close</button>
        </div>

        <section class="help-section">
          <h3>Keyboard Shortcuts</h3>
          <div class="help-list">
            <div class="help-row"><kbd>ESC</kbd><span>Open the exit menu. Press it again to close an open dialog.</span></div>
            <div class="help-row"><kbd>Ctrl + Z</kbd><span>Undo the last player operation, up to five steps.</span></div>
            <div class="help-row"><kbd>Ctrl + D</kbd><span>Toggle Debug Tools.</span></div>
          </div>
        </section>

      </div>
    </div>

    <div v-if="state.exitPrompt" class="overlay exit-overlay">
      <div class="overlay-card">
        <h2>Exit Game?</h2>
        <p class="exit-copy">Are you sure you want to exit this game?</p>
        <div class="overlay-actions">
          <button class="btn" @click="exitWithoutSaving">Exit Without Saving</button>
          <button class="btn primary" @click="saveAndExit">Save &amp; Exit</button>
          <button class="btn" @click="cancelExit">Cancel</button>
        </div>
      </div>
    </div>

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
