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
import { useModalDrag } from './game/useModalDrag'

const {
  state, undo, toggleDebug, selectPlayer, openPile, closePile,
  closeHelp, requestExit, cancelExit, saveAndExit, exitWithoutSaving, returnToMainMenu,
  toMainPhase, endTurn, resolveDecision,
} = useGame()

const { modalEl: helpModalEl, modalStyle: helpModalStyle, dragging: helpDragging, startDrag: startHelpDrag } = useModalDrag()
const { modalEl: exitModalEl, modalStyle: exitModalStyle, dragging: exitDragging, startDrag: startExitDrag } = useModalDrag()
const { modalEl: gameoverModalEl, modalStyle: gameoverModalStyle, dragging: gameoverDragging, startDrag: startGameoverDrag } = useModalDrag()

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    undo()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    toggleDebug()
    return
  }
  if (!state.game || e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return

  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    cycleDisplayedPlayer()
    return
  }

  // Deliberately use the physical Digit keys, never the numeric keypad.
  if (e.code.startsWith('Digit')) {
    const playerIndex = Number(e.code.slice('Digit'.length)) - 1
    const player = state.game.players[playerIndex]
    if (player) {
      e.preventDefault()
      selectPlayer(player.id)
    }
    return
  }
  if (e.key.toLowerCase() === 'q') {
    e.preventDefault()
    togglePlayerPile('deck')
    return
  }
  if (e.key.toLowerCase() === 'w') {
    e.preventDefault()
    togglePlayerPile('discard')
    return
  }
  if (e.code === 'Space' && !e.shiftKey && canConfirmNemesisDrawWithSpace()) {
    e.preventDefault()
    if (e.repeat) return
    resolveDecision({ kind: 'confirm_nemesis_draw', accepted: true })
    return
  }
  if (e.code === 'Space' && !e.shiftKey && canAdvancePhaseWithSpace()) {
    e.preventDefault()
    if (e.repeat) return
    if (state.phase === 'casting') toMainPhase()
    else endTurn()
    return
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

/** Match the visible Confirm button for a revealed Nemesis card. */
function canConfirmNemesisDrawWithSpace(): boolean {
  const game = state.game
  return !!game
    && game.pendingDecision?.kind === 'confirm_nemesis_draw'
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
}

/** Match the visible phase-advance buttons without bypassing an open interaction. */
function canAdvancePhaseWithSpace(): boolean {
  const game = state.game
  return !!game
    && (state.phase === 'casting' || state.phase === 'main')
    && state.selectedPlayer === game.currentTurn
    && !game.pendingDecision
    && !game.pendingEffect
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

function togglePlayerPile(pile: 'deck' | 'discard') {
  if (state.viewPile === pile) closePile()
  else openPile(pile)
}

function cycleDisplayedPlayer() {
  const players = state.game?.players ?? []
  if (players.length === 0) return
  const currentIndex = players.findIndex(player => player.id === state.selectedPlayer)
  const nextIndex = (currentIndex + 1 + players.length) % players.length
  selectPlayer(players[nextIndex]!.id)
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
      <div ref="helpModalEl" class="overlay-card help-modal draggable-modal" :class="{ dragging: helpDragging }" :style="helpModalStyle" @pointerdown="startHelpDrag">
        <div class="help-head">
          <h2 id="help-title">Game Help</h2>
          <button class="btn small" aria-label="Close game help" @click="closeHelp">Close</button>
        </div>

        <section class="help-section">
          <h3>Keyboard Shortcuts</h3>
          <div class="help-list">
            <div class="help-row"><kbd>ESC</kbd><span>Open the exit menu. Press it again to close an open dialog.</span></div>
            <div class="help-row"><kbd>Ctrl + Z</kbd><span>Undo the last player operation, up to ten steps.</span></div>
            <div class="help-row"><kbd>Ctrl + D</kbd><span>Toggle Debug Tools.</span></div>
            <div class="help-row"><kbd>1–4</kbd><span>Switch the mage currently shown on the board.</span></div>
            <div class="help-row"><kbd>Tab</kbd><span>Cycle through the players shown on the board.</span></div>
            <div class="help-row"><kbd>Q</kbd><span>View the shown mage's deck.</span></div>
            <div class="help-row"><kbd>W</kbd><span>View the shown mage's discard pile.</span></div>
            <div class="help-row"><kbd>Space</kbd><span>Confirm a revealed Nemesis card, start Main Phase, or end the current Main Phase.</span></div>
          </div>
        </section>

      </div>
    </div>

    <div v-if="state.exitPrompt" class="overlay exit-overlay">
      <div ref="exitModalEl" class="overlay-card draggable-modal" :class="{ dragging: exitDragging }" :style="exitModalStyle" @pointerdown="startExitDrag">
        <h2>Exit Game?</h2>
        <p class="exit-copy">Are you sure you want to exit this game?</p>
        <div class="overlay-actions">
          <button class="btn" @click="exitWithoutSaving">Exit Without Saving</button>
          <button class="btn primary" @click="saveAndExit">Save &amp; Exit</button>
          <button class="btn" @click="cancelExit">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="state.phase === 'gameover'" class="overlay">
      <div ref="gameoverModalEl" class="overlay-card draggable-modal" :class="{ dragging: gameoverDragging }" :style="gameoverModalStyle" @pointerdown="startGameoverDrag">
        <h2 class="gameover-title">{{ state.game.winner === 'players' ? 'Victory!' : 'Defeat…' }}</h2>
        <button class="btn primary" @click="returnToMainMenu">Back to Main Menu</button>
      </div>
    </div>
  </div>
</template>
