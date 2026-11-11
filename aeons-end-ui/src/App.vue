<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useGame } from './game/useGame'
import MainMenu from './components/MainMenu.vue'
import SetupScreen from './components/SetupScreen.vue'
import GameTopArea from './components/GameTopArea.vue'
import MarketPanel from './components/MarketPanel.vue'
import PlayerArea from './components/PlayerArea.vue'
import LogPanel from './components/LogPanel.vue'
import DamageFeedbackLayer from './components/DamageFeedbackLayer.vue'
import PileModal from './components/PileModal.vue'
import CardDecisionModal from './components/CardDecisionModal.vue'
import DebugPanel from './components/DebugPanel.vue'
import UiGallery from './components/UiGallery.vue'
import ModalBase from './components/ModalBase.vue'
import ModalCloseButton from './components/ModalCloseButton.vue'
import { useGameTheme } from './game/useGameTheme'
import { useModalDrag } from './game/useModalDrag'
import { dismissTopmostOverlay } from './game/dismissible-overlays'

const {
  state, newGame, undo, toggleDebug, selectPlayer, openPile, closePile,
  closeHelp, requestExit, cancelExit, returnToMainMenu,
  toMainPhase, requestEndTurn, resolveDecision, canRequestEndTurn, playAllGems,
  canConfirmRepeatedSpell, confirmRepeatedSpell,
} = useGame()

const { modalEl: helpModalEl, modalStyle: helpModalStyle, dragging: helpDragging, startDrag: startHelpDrag } = useModalDrag()
const { modalEl: exitModalEl, modalStyle: exitModalStyle, dragging: exitDragging, startDrag: startExitDrag } = useModalDrag()
const { modalEl: gameoverModalEl, modalStyle: gameoverModalStyle, dragging: gameoverDragging, startDrag: startGameoverDrag } = useModalDrag()
const routeParams = new URLSearchParams(window.location.search)
const isUiGallery = routeParams.get('ui-gallery') === '1'
const isGameBackgroundPreview = routeParams.get('board-bg-preview') === '1'
const { activeTheme: gameBackgroundTheme, applyThemeForGameEntry } = useGameTheme()
const gameBackgroundChoices = [
  { id: 'original', label: 'Original' },
  { id: 'aether', label: 'Aether Glow' },
  { id: 'violet', label: 'Violet Rift' },
  { id: 'ember', label: 'Ember Tide' },
  { id: 'jade', label: 'Jade Pulse' },
  { id: 'moonlight', label: 'Moonlight' },
  { id: 'custom', label: 'Custom' },
] as const
type GameBackgroundChoice = typeof gameBackgroundChoices[number]['id']
const selectedGameBackground = ref<GameBackgroundChoice>('aether')
const customAetherCore = ref('#6f9cff')
const customAetherEcho = ref('#9a68d2')
const customAetherX = ref(52)
const customAetherY = ref(45)
const customAetherIntensity = ref(56)
const customAetherSpread = ref(52)
function colorWithAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16))
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`
}
const customAetherStyle = computed(() => ({
  '--custom-aether-core': colorWithAlpha(customAetherCore.value, .08 + customAetherIntensity.value / 100 * .5),
  '--custom-aether-echo': colorWithAlpha(customAetherEcho.value, .04 + customAetherIntensity.value / 100 * .32),
  '--custom-aether-x': `${customAetherX.value}%`,
  '--custom-aether-y': `${customAetherY.value}%`,
  '--custom-aether-spread': `${customAetherSpread.value}%`,
}))
function resetCustomAether() {
  customAetherCore.value = '#6f9cff'
  customAetherEcho.value = '#9a68d2'
  customAetherX.value = 52
  customAetherY.value = 45
  customAetherIntensity.value = 56
  customAetherSpread.value = 52
}
const logVisible = ref(false)
const launchScreen = ref<'main-menu' | 'setup'>('main-menu')

watch(() => state.game, (game, previousGame) => {
  if (game && !previousGame) applyThemeForGameEntry()
  if (!game && previousGame) launchScreen.value = 'main-menu'
})

function setLogVisibility(visible: boolean) {
  logVisible.value = visible
}

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented) return
  if (state.debugOpen && isDebugTextInputTarget(e.target)) {
    if (e.key === 'Escape') {
      e.preventDefault()
      toggleDebug()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (!e.shiftKey) cycleDisplayedPlayer()
      return
    }
    // Ctrl+D is also a browser bookmark shortcut. Keep it from stealing input
    // while a Debug Tools text field is active; Ctrl+Z remains native text undo.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') e.preventDefault()
    return
  }
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
  if (!state.game || e.ctrlKey || e.metaKey || e.altKey) return

  if (e.key.toLowerCase() === 'a') {
    if (e.repeat || isEditableTarget(e.target) || state.viewPile || state.helpOpen ||
      state.exitPrompt || state.debugOpen || state.cardMotionBatchActive || state.turnTransitionActive) return
    e.preventDefault()
    void playAllGems()
    return
  }

  if (e.key === 'Tab') {
    // Keep native Tab behavior available while editing a field, but do not
    // let any board control become the keyboard-focused object.
    if (isEditableTarget(e.target)) return
    e.preventDefault()
    // Tab is the game's player-view shortcut rather than native focus
    // navigation. Clear the element that was clicked before switching views,
    // otherwise the browser keeps its white focus ring on the old card/button.
    clearActiveElementFocus()
    if (!e.shiftKey) cycleDisplayedPlayer()
    return
  }

  // Deliberately use the physical Digit keys, never the numeric keypad.
  if (e.code.startsWith('Digit')) {
    // Number inputs in Debug Tools own digit keys while focused. Do not let
    // the global player-view shortcuts consume those keystrokes.
    if (isEditableTarget(e.target)) return
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
  if (e.code === 'Space' && !e.shiftKey && canConfirmRepeatedSpell()) {
    e.preventDefault()
    if (e.repeat || isEditableTarget(e.target) || state.viewPile || state.helpOpen ||
      state.exitPrompt || state.debugOpen) return
    confirmRepeatedSpell()
    return
  }
  if (e.code === 'Space' && !e.shiftKey && state.game?.pendingDecision?.kind === 'confirm_nemesis_draw') {
    e.preventDefault()
    if (e.repeat || !canConfirmNemesisDrawWithSpace()) return
    resolveDecision({ kind: 'confirm_nemesis_draw', accepted: true })
    return
  }
  if (e.code === 'Space' && !e.shiftKey && canConfirmNemesisEffectWithSpace()) {
    e.preventDefault()
    if (e.repeat) return
    resolveDecision({ kind: 'confirm_nemesis_effect', accepted: true })
    return
  }
  if (e.code === 'Space' && !e.shiftKey && canConfirmPlayerCardEffectWithSpace()) {
    e.preventDefault()
    if (e.repeat) return
    resolveDecision({ kind: 'confirm_player_card_effect', accepted: true })
    return
  }
  if (e.code === 'Space' && !e.shiftKey && canConfirmDividedDamageWithSpace()) {
    e.preventDefault()
    if (e.repeat) return
    resolveDecision({ kind: 'allocate_divided_damage', action: 'confirm' })
    return
  }
  if (e.code === 'Space' && !e.shiftKey && canAdvancePhaseWithSpace()) {
    e.preventDefault()
    if (e.repeat) return
    if (state.phase === 'casting') toMainPhase()
    else requestEndTurn()
    return
  }
  if (e.key === 'Escape' && state.game) {
    e.preventDefault()
    if (state.helpOpen) {
      closeHelp()
      return
    }
    if (state.viewPile) {
      closePile()
      return
    }
    if (state.exitPrompt) {
      cancelExit()
      return
    }
    if (dismissTopmostOverlay()) {
      return
    }
    // Nemesis Main's red-highlighted card is an inline confirmation rather
    // than a dialog, so it is safe to save and resume at that point. Keep all
    // actual decisions and suspended effects modal until the player answers.
    if ((state.game.pendingDecision || state.game.pendingEffect) && !canConfirmNemesisEffectWithSpace()) {
      return
    }
    if (state.debugOpen) {
      toggleDebug()
      return
    }
    if (state.phase === 'gameover') {
      returnToMainMenu()
      return
    }
    requestExit()
  }
}

/** Match the visible Confirm button for a revealed Nemesis card. */
function canConfirmNemesisDrawWithSpace(): boolean {
  const game = state.game
  const decision = game?.pendingDecision
  return !!game
    && decision?.kind === 'confirm_nemesis_draw'
    && (decision.source === 'specific_deck' || !state.nemesisDrawRevealAnimating)
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
}

/** Match the red-highlighted Nemesis card awaiting Main Phase confirmation. */
function canConfirmNemesisEffectWithSpace(): boolean {
  const game = state.game
  return !!game
    && state.phase === 'nemesis_main'
    && game.currentTurn === 'nemesis'
    && game.pendingDecision?.kind === 'confirm_nemesis_effect'
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
}

/** Match the required board-card confirmation at the end of a player's Casting Phase. */
function canConfirmPlayerCardEffectWithSpace(): boolean {
  const game = state.game
  const decision = game?.pendingDecision
  return !!game
    && state.phase === 'casting'
    && decision?.kind === 'confirm_player_card_effect'
    && game.currentTurn === decision.playerId
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
}

/** Match the second-click confirmation for a completed divided-damage allocation. */
function canConfirmDividedDamageWithSpace(): boolean {
  const game = state.game
  const pendingSpell = game?.pendingEffect?.pendingSpellCast
  const allocation = game?.pendingEffect?.dividedDamageAllocation
  return !!game
    && game.pendingDecision?.kind === 'allocate_divided_damage'
    && allocation?.remaining === 0
    && !!pendingSpell
    && pendingSpell.breachIndex >= 0
    && pendingSpell.spellIndex >= 0
    && pendingSpell.playerId === state.selectedPlayer
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
}

/** Match the visible phase-advance buttons without bypassing an open interaction. */
function canAdvancePhaseWithSpace(): boolean {
  const game = state.game
  if (state.phase === 'main') return canRequestEndTurn.value
  return !!game
    && state.phase === 'casting'
    && state.selectedPlayer === game.currentTurn
    && !game.pendingDecision
    && !game.pendingEffect
    && !state.cardMotionBatchActive
    && !state.turnTransitionActive
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

function isDebugTextInputTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && !!target.closest('.debug-panel input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), .debug-panel textarea, .debug-panel [contenteditable="true"]')
}

function clearActiveElementFocus() {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) activeElement.blur()
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

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (state.game) applyThemeForGameEntry()
  if (isGameBackgroundPreview && !state.game) {
    // Give a direct preview URL a real board without touching the user's active tab or saved games.
    newGame('mist', 'brama', 'rageborne', 'standard')
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <UiGallery v-if="isUiGallery" class="ui-gold-theme" />
  <MainMenu
    v-else-if="!state.game && launchScreen === 'main-menu'"
    class="ui-gold-theme"
    @start-game="launchScreen = 'setup'"
  />
  <SetupScreen
    v-else-if="!state.game"
    class="ui-gold-theme"
    @back-to-menu="launchScreen = 'main-menu'"
  />
  <div
    v-else
    class="app ui-gold-theme"
    :class="[
      { 'card-motion-batch-active': state.cardMotionBatchActive, 'without-log': !logVisible },
      isGameBackgroundPreview ? 'game-background-preview' : '',
      isGameBackgroundPreview
        ? `game-background-preview--${selectedGameBackground}`
        : `game-background-theme--${gameBackgroundTheme}`,
    ]"
    :style="isGameBackgroundPreview && selectedGameBackground === 'custom' ? customAetherStyle : undefined"
  >
    <div v-if="isGameBackgroundPreview" class="game-background-preview-toolbar">
      <label for="game-background-choice">Board background</label>
      <select id="game-background-choice" v-model="selectedGameBackground" aria-label="Select game background">
        <option v-for="choice in gameBackgroundChoices" :key="choice.id" :value="choice.id">{{ choice.label }}</option>
      </select>
    </div>
    <div v-if="isGameBackgroundPreview && selectedGameBackground === 'custom'" class="game-background-preview-tuner" aria-label="Custom Aether Glow controls">
      <div class="game-background-preview-tuner__colors">
        <label>
          <span>Core color</span>
          <input v-model="customAetherCore" type="color" aria-label="Aether core color" />
        </label>
        <label>
          <span>Echo color</span>
          <input v-model="customAetherEcho" type="color" aria-label="Aether echo color" />
        </label>
      </div>
      <label class="game-background-preview-tuner__range">
        <span><span>Glow X</span><output>{{ customAetherX }}%</output></span>
        <input v-model.number="customAetherX" type="range" min="0" max="100" aria-label="Aether glow horizontal position" />
      </label>
      <label class="game-background-preview-tuner__range">
        <span><span>Glow Y</span><output>{{ customAetherY }}%</output></span>
        <input v-model.number="customAetherY" type="range" min="0" max="100" aria-label="Aether glow vertical position" />
      </label>
      <label class="game-background-preview-tuner__range">
        <span><span>Intensity</span><output>{{ customAetherIntensity }}%</output></span>
        <input v-model.number="customAetherIntensity" type="range" min="0" max="100" aria-label="Aether glow intensity" />
      </label>
      <label class="game-background-preview-tuner__range">
        <span><span>Spread</span><output>{{ customAetherSpread }}%</output></span>
        <input v-model.number="customAetherSpread" type="range" min="25" max="85" aria-label="Aether glow spread" />
      </label>
      <button class="game-background-preview-tuner__reset" type="button" @click="resetCustomAether">Reset controls</button>
    </div>
    <div class="main-col">
      <div class="top-section">
        <GameTopArea class="top-main" />
        <MarketPanel class="market-col" />
      </div>
      <PlayerArea />
    </div>
    <LogPanel v-if="logVisible" class="log-col" />
    <DamageFeedbackLayer />
    <div v-if="state.cardMotionBatchActive" class="card-motion-shield" aria-hidden="true" />
    <div v-if="state.turnTransitionActive" class="turn-transition-shield" aria-hidden="true" />

    <PileModal />
    <CardDecisionModal />
    <DebugPanel :log-visible="logVisible" @log-visibility-change="setLogVisibility" />

    <ModalBase
      v-if="state.helpOpen"
      overlay-class="help-overlay"
      v-model:panel-ref="helpModalEl"
      panel-class="help-modal draggable-modal"
      :panel-style="helpModalStyle"
      :dragging="helpDragging"
      panel-aria-labelledby="help-title"
      @overlay-click="closeHelp"
      @panel-pointerdown="startHelpDrag"
    >
        <div class="help-head">
          <h2 id="help-title">Game Help</h2>
          <ModalCloseButton label="Close game help" @close="closeHelp" />
        </div>

        <section class="help-section">
          <h3>Keyboard Shortcuts</h3>
          <div class="help-list">
            <div class="help-row"><kbd>ESC</kbd><span>Open the exit menu. Press it again to close an open dialog.</span></div>
            <div class="help-row"><kbd>Ctrl + Z</kbd><span>Undo the last player operation, up to fifty steps.</span></div>
            <div class="help-row"><kbd>Ctrl + D</kbd><span>Toggle Debug Tools.</span></div>
            <div class="help-row"><kbd>A</kbd><span>Play all Gems in the current Mage's hand.</span></div>
            <div class="help-row"><kbd>1–4</kbd><span>Switch the mage currently shown on the board.</span></div>
            <div class="help-row"><kbd>Tab</kbd><span>Cycle through the players shown on the board.</span></div>
            <div class="help-row"><kbd>Q</kbd><span>View the shown mage's deck.</span></div>
            <div class="help-row"><kbd>W</kbd><span>View the shown mage's discard pile.</span></div>
            <div class="help-row"><kbd>Space</kbd><span>Choose Yes in a Yes/No decision; otherwise activate the only available decision button (including Skip), confirm a repeated spell cast or required player card, confirm a revealed Nemesis card, confirm completed divided damage allocation, resolve the highlighted Nemesis card, start Main Phase, or end the current Main Phase.</span></div>
          </div>
        </section>

        <section class="help-section">
          <h3>Card Previews</h3>
          <div class="help-list">
            <div class="help-row"><kbd>Mouse Wheel</kbd><span>Scroll while a card preview is visible to zoom in or out.</span></div>
          </div>
        </section>

    </ModalBase>

    <ModalBase
      v-if="state.exitPrompt"
      overlay-class="exit-overlay"
      v-model:panel-ref="exitModalEl"
      panel-class="draggable-modal"
      :panel-style="exitModalStyle"
      :dragging="exitDragging"
      @overlay-click="cancelExit"
      @panel-pointerdown="startExitDrag"
    >
        <h2>Exit Game?</h2>
        <p class="exit-copy">Your game is saved automatically as you play. You can resume it from the main menu.</p>
        <div class="overlay-actions">
          <button class="btn primary" @click="returnToMainMenu">Return to Main Menu</button>
          <button class="btn" @click="cancelExit">Cancel</button>
        </div>
    </ModalBase>

    <ModalBase
      v-if="state.phase === 'gameover'"
      overlay-class="overlay"
      v-model:panel-ref="gameoverModalEl"
      panel-class="draggable-modal"
      :panel-style="gameoverModalStyle"
      :dragging="gameoverDragging"
      @overlay-click="returnToMainMenu"
      @panel-pointerdown="startGameoverDrag"
    >
        <h2 class="gameover-title">{{ state.game.winner === 'players' ? 'Victory!' : 'Defeat…' }}</h2>
        <button class="btn primary" @click="returnToMainMenu">Back to Main Menu</button>
    </ModalBase>
  </div>
</template>
