<script setup lang="ts">
import { computed, ref, reactive, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { drawCardsForPlayer, ensurePlayerDeckInstances, getPlayer, MAX_PULSE_TOKENS, putPlayerCardInDeck, toRoman } from '@engine/engine'
import { getCard, INITIAL_CARDS, ALL_MARKET_CARDS, ALL_NEMESIS_CARDS } from '@engine/data'
import type { CardDef, GameState, NemesisCardDef, PlayerState, StrikeCardDef } from '@engine/types'
import { useGame } from '../game/useGame'
import { cardImageUrl } from '../card-images'
import DebugCardPicker from './DebugCardPicker.vue'
import DebugNumberInput from './DebugNumberInput.vue'
import CardHoverPreview from './CardHoverPreview.vue'
import DebugDeckOrderModal from './DebugDeckOrderModal.vue'
import { displayMageName, displayPlayerId } from '../game/display-name'
import ModalCloseButton from './ModalCloseButton.vue'

const props = defineProps<{ logVisible: boolean }>()
const emit = defineEmits<{
  'log-visibility-change': [visible: boolean]
}>()

const { state, toggleDebug, setDebugFreeSpellCastEnabled, clearSaves } = useGame()

const panelEl = ref<HTMLElement | null>(null)
const panelPosition = reactive({ x: 24, y: 16, width: 680, height: 760 })
const interaction = ref<{
  type: 'drag' | 'resize'
  pointerX: number
  pointerY: number
  x: number
  y: number
  width: number
  height: number
} | null>(null)

const panelStyle = computed(() => ({
  left: `${panelPosition.x}px`,
  top: `${panelPosition.y}px`,
  width: `${panelPosition.width}px`,
  height: `${panelPosition.height}px`,
}))

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function clampPanelPosition() {
  if (typeof window === 'undefined') return
  panelPosition.x = clamp(panelPosition.x, 8, window.innerWidth - panelPosition.width - 8)
  panelPosition.y = clamp(panelPosition.y, 16, window.innerHeight - panelPosition.height - 16)
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest('button, input, select, textarea, option, label, a, [draggable="true"], [data-debug-resize]'),
  )
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || isInteractiveTarget(event.target) || !panelEl.value) return
  const rect = panelEl.value.getBoundingClientRect()
  interaction.value = {
    type: 'drag',
    pointerX: event.clientX,
    pointerY: event.clientY,
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  }
  event.preventDefault()
  window.addEventListener('pointermove', updateInteraction)
  window.addEventListener('pointerup', stopInteraction)
  window.addEventListener('pointercancel', stopInteraction)
}

function startResize(event: PointerEvent) {
  if (event.button !== 0 || !panelEl.value) return
  const rect = panelEl.value.getBoundingClientRect()
  interaction.value = {
    type: 'resize',
    pointerX: event.clientX,
    pointerY: event.clientY,
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  }
  event.preventDefault()
  window.addEventListener('pointermove', updateInteraction)
  window.addEventListener('pointerup', stopInteraction)
  window.addEventListener('pointercancel', stopInteraction)
}

function updateInteraction(event: PointerEvent) {
  const active = interaction.value
  if (!active || typeof window === 'undefined') return
  const deltaX = event.clientX - active.pointerX
  const deltaY = event.clientY - active.pointerY

  if (active.type === 'drag') {
    panelPosition.x = clamp(active.x + deltaX, 8, window.innerWidth - active.width - 8)
    panelPosition.y = clamp(active.y + deltaY, 8, window.innerHeight - active.height - 8)
  } else {
    panelPosition.width = clamp(active.width + deltaX, 300, window.innerWidth - panelPosition.x - 8)
    panelPosition.height = clamp(active.height + deltaY, 260, window.innerHeight - panelPosition.y - 16)
  }
  event.preventDefault()
}

function stopInteraction() {
  interaction.value = null
  window.removeEventListener('pointermove', updateInteraction)
  window.removeEventListener('pointerup', stopInteraction)
  window.removeEventListener('pointercancel', stopInteraction)
}

function handleViewportResize() {
  if (typeof window === 'undefined') return
  panelPosition.width = clamp(panelPosition.width, 300, window.innerWidth - 16)
  panelPosition.height = clamp(panelPosition.height, 260, window.innerHeight - 32)
  clampPanelPosition()
}

const players = computed(() => state.game?.players ?? [])
const nemesis = computed(() => state.game!.nemesis)
const gravehold = computed(() => state.game!.gravehold)
const currentTurnPlayerId = computed(() => {
  const activePlayer = players.value.find(player => player.id === state.game?.currentTurn)
  if (activePlayer) return activePlayer.id
  return players.value.find(player => player.id === state.selectedPlayer)?.id
    ?? players.value[0]?.id
    ?? ''
})

function isNemesisSideCard(card: CardDef): card is NemesisCardDef | StrikeCardDef {
  return card.type === 'attack' || card.type === 'minion' || card.type === 'power' || card.type === 'strike'
}

const allCards = computed<CardDef[]>(() => {
  const ids = [
    ...Object.keys(INITIAL_CARDS),
    ...Object.keys(ALL_MARKET_CARDS),
    ...Object.keys(ALL_NEMESIS_CARDS),
  ]
  return [...new Set(ids)]
    .map(cardId => getCard(cardId))
    // Nemesis-side cards belong only in the Nemesis picker, even when a search
    // query reveals types hidden from the player's initial view.
    .filter(card => !isNemesisSideCard(card))
})
const allNemesisCards = computed(() => Object.keys(ALL_NEMESIS_CARDS).filter(cardId => {
  return isNemesisSideCard(ALL_NEMESIS_CARDS[cardId]!)
}))
const allNemesisCardDefs = computed<CardDef[]>(() => allNemesisCards.value.map(cardId => getCard(cardId)))
const addPlayer = ref('')
const selectedAddPlayer = computed({
  get: () => players.value.some(player => player.id === addPlayer.value)
    ? addPlayer.value
    : currentTurnPlayerId.value,
  set: (playerId: string) => { addPlayer.value = playerId },
})
watch(
  () => [state.game, currentTurnPlayerId.value] as const,
  ([, playerId]) => { addPlayer.value = playerId },
  { immediate: true },
)
const addZone = ref<'hand' | 'discard_top' | 'deck_top'>('hand')
const addCard = ref('crystal')
const addNemesisCard = ref(allNemesisCards.value[0] ?? '')

const deckOrderModalOpen = ref(false)
const deckOrderPlayerId = ref('')
const deckOrderPlayer = computed(() =>
  players.value.find(player => player.id === deckOrderPlayerId.value)
    ?? players.value.find(player => player.id === currentTurnPlayerId.value)
    ?? players.value[0],
)

watch(
  () => [state.game, currentTurnPlayerId.value] as const,
  ([, playerId]) => {
    if (!players.value.some(player => player.id === deckOrderPlayerId.value)) {
      deckOrderPlayerId.value = playerId
    }
  },
  { immediate: true },
)

function openDeckOrderModal() {
  if (state.game && deckOrderPlayer.value) ensurePlayerDeckInstances(state.game, deckOrderPlayer.value)
  deckOrderModalOpen.value = true
}

function closeDeckOrderModal() {
  deckOrderModalOpen.value = false
}

function addCardToPlayer() {
  const playerId = selectedAddPlayer.value
  if (!playerId) return
  const card = allCards.value.find(candidate => candidate.id === addCard.value)
  if (!card) return
  const p = getPlayer(state.game!, playerId)
  if (addZone.value === 'hand') p.hand.push(addCard.value)
  else if (addZone.value === 'discard_top') p.discard.unshift(addCard.value)
  else putPlayerCardInDeck(state.game!, p, addCard.value, 'top')
}

function drawOneCardForPlayer() {
  const playerId = selectedAddPlayer.value
  if (!playerId || !state.game) return
  drawCardsForPlayer(state.game, playerId, 1)
}

function addCardToNemesis() {
  const card = ALL_NEMESIS_CARDS[addNemesisCard.value]
  if (!card || !isNemesisSideCard(card)) return
  const n = state.game!.nemesis
  if (card.type === 'attack') {
    n.deck.unshift(card.id)
    return
  }
  if (card.type === 'strike') {
    n.strikeDeck.unshift(card.id)
    return
  }
  if (card.type !== 'minion' && card.type !== 'power') return
  const placedAt = (n.cardInstanceCounter ?? n.playArea.reduce(
    (highest, item) => Math.max(highest, item.placedAt), 0,
  )) + 1
  n.cardInstanceCounter = placedAt
  n.playArea.push({
    cardId: card.id,
    cardType: card.type,
    placedAt,
    instanceId: `debug-${card.id}:${placedAt}`,
    enteredOnNemesisTurn: n.nemesisTurnNumber ?? 0,
    ...(card.type === 'minion' ? { lifeTokens: card.life ?? 0 } : { powerTokens: card.power ?? 0 }),
  })
}

function availableRegularAether(player: PlayerState): number {
  return Math.max(0, (player.bonusAether ?? 0) - (player.regularAetherSpent ?? 0))
}

function updateAether(playerId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const player = getPlayer(state.game!, playerId)
  const amount = input.valueAsNumber
  if (!Number.isFinite(amount)) {
    input.value = String(availableRegularAether(player))
    return
  }
  const targetAmount = Math.max(0, Math.floor(amount))
  player.bonusAether = targetAmount + (player.regularAetherSpent ?? 0)
  input.value = String(targetAmount)
}

function updateKnowledge(playerId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const player = getPlayer(state.game!, playerId)
  const amount = input.valueAsNumber
  player.knowledge = Number.isFinite(amount)
    ? Math.max(0, Math.floor(amount))
    : player.knowledge ?? 0
  input.value = String(player.knowledge)
}

function updatePulseTokens(playerId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const player = getPlayer(state.game!, playerId)
  const amount = input.valueAsNumber
  player.pulseTokens = Number.isFinite(amount)
    ? Math.min(MAX_PULSE_TOKENS, Math.max(0, Math.floor(amount)))
    : Math.min(MAX_PULSE_TOKENS, Math.max(0, player.pulseTokens ?? 0))
  input.value = String(player.pulseTokens)
}

const jsonText = ref('')
function loadCurrentJson() {
  jsonText.value = JSON.stringify({
    game: state.game, phase: state.phase, selectedPlayer: state.selectedPlayer,
    discardRemaining: state.discardRemaining,
  }, null, 2)
}
function applyJson() {
  try {
    const data = JSON.parse(jsonText.value)
    if (!data?.game) return
    state.game = reactive(data.game) as GameState
    state.phase = data.phase ?? 'main'
    if (state.game.currentTurn !== 'nemesis' && (state.phase === 'casting' || state.phase === 'main')) {
      state.game.currentPhase = state.phase
    }
    state.selectedPlayer = data.selectedPlayer ?? state.game.players[0]?.id ?? ''
    state.discardRemaining = data.discardRemaining ?? []
  } catch (e: any) {
    alert(`Invalid JSON: ${e.message}`)
  }
}
function copyJson() {
  navigator.clipboard.writeText(jsonText.value)
}

function updateLogVisibility(event: Event) {
  emit('log-visibility-change', (event.target as HTMLInputElement).checked)
}

onMounted(() => {
  panelPosition.x = Math.max(16, window.innerWidth - panelPosition.width - 24)
  panelPosition.y = 16
  panelPosition.height = Math.max(260, window.innerHeight - 32)
  handleViewportResize()
  window.addEventListener('resize', handleViewportResize)
})

watch(() => state.debugOpen, (open) => {
  if (open) nextTick(() => panelEl.value?.focus({ preventScroll: true }))
  else closeDeckOrderModal()
})

onBeforeUnmount(() => {
  stopInteraction()
  window.removeEventListener('resize', handleViewportResize)
})
</script>

<template>
  <div
    v-if="state.debugOpen && state.game"
    ref="panelEl"
    class="debug-panel"
    tabindex="-1"
    :class="{ interacting: interaction }"
    :style="panelStyle"
    @pointerdown="startDrag"
  >
    <div class="debug-head">
      <h3>Debug Tools</h3>
      <ModalCloseButton label="Close Debug Tools (Ctrl+D)" @close="toggleDebug()" />
    </div>

    <div class="debug-content">
      <div class="debug-section">
        <label class="debug-toggle-row">
          <input
            type="checkbox"
            :checked="state.debugFreeSpellCastEnabled"
            @change="setDebugFreeSpellCastEnabled(($event.target as HTMLInputElement).checked)"
          />
          <span>Enable free prepped spell casting</span>
        </label>
        <span class="debug-hint">Shows a control bar button during a player Main Phase.</span>
      </div>

      <div class="debug-section">
        <span class="debug-label">Deck Order Editing</span>
        <span class="debug-hint">Choose a player, then open their deck window and drag cards into draw order. The first card is drawn next.</span>
        <div class="debug-deck-controls">
          <label>
            Player
            <select v-model="deckOrderPlayerId" aria-label="Deck order player">
              <option v-for="p in players" :key="p.id" :value="p.id">
                {{ displayMageName(p.mageType) }} ({{ displayPlayerId(p.id) }})
              </option>
            </select>
          </label>
          <button class="btn small" type="button" :disabled="!deckOrderPlayer" @click="openDeckOrderModal">Edit Deck Order</button>
        </div>
      </div>

      <div class="debug-section">
        <div class="debug-row debug-vitals-row">
          <div class="debug-vital-field">
            <span>Nemesis HP</span>
            <DebugNumberInput v-model="nemesis.hp" label="Nemesis HP" :min="0" :max="nemesis.maxHp" />
          </div>
          <div class="debug-vital-field">
            <span>Gravehold HP</span>
            <DebugNumberInput v-model="gravehold.hp" label="Gravehold HP" :min="0" :max="gravehold.maxHp" />
          </div>
        </div>
      </div>

      <div v-for="p in players" :key="p.id" class="debug-section">
        <span class="debug-player">{{ displayMageName(p.mageType) }} ({{ displayPlayerId(p.id) }})</span>
        <div class="debug-row">
          <div class="debug-stat-field">
            <span>HP</span>
            <DebugNumberInput v-model="p.hp" :label="`HP for ${displayMageName(p.mageType)}`" :min="0" />
          </div>
          <div class="debug-stat-field">
            <span>Aether</span>
            <DebugNumberInput
              :model-value="availableRegularAether(p)"
              :label="`Aether for ${displayMageName(p.mageType)}`"
              :min="0"
              @change="updateAether(p.id, $event)"
            />
          </div>
          <div class="debug-stat-field">
            <span>Charge</span>
            <DebugNumberInput v-model="p.charge" :label="`Charge for ${displayMageName(p.mageType)}`" :min="0" />
          </div>
          <div class="debug-stat-field">
            <span>Knowledge</span>
            <DebugNumberInput
              :model-value="p.knowledge ?? 0"
              :label="`Knowledge for ${displayMageName(p.mageType)}`"
              :min="0"
              @change="updateKnowledge(p.id, $event)"
            />
          </div>
          <div class="debug-stat-field">
            <span>Pulse tokens</span>
            <DebugNumberInput
              :model-value="p.pulseTokens ?? 0"
              :label="`Pulse tokens for ${displayMageName(p.mageType)}`"
              :min="0"
              :max="MAX_PULSE_TOKENS"
              @change="updatePulseTokens(p.id, $event)"
            />
          </div>
        </div>
        <div class="debug-breaches">
          <button
            v-for="b in p.breaches.filter(item => item.present !== false)" :key="b.index"
            class="btn small" :class="{ on: b.opened }"
            @click="b.opened = !b.opened; b.prepSpells = []"
          >{{ toRoman(b.index) }}</button>
        </div>
      </div>

      <div class="debug-section">
        <div class="debug-row debug-add-controls">
          <label>
            Player
            <select v-model="selectedAddPlayer" aria-label="Debug card player">
              <option v-for="p in players" :key="p.id" :value="p.id">{{ displayMageName(p.mageType) }} ({{ displayPlayerId(p.id) }})</option>
            </select>
          </label>
          <button class="btn small" :disabled="!selectedAddPlayer" @click="drawOneCardForPlayer()">Draw 1 Card</button>
          <label>
            Add to
            <select v-model="addZone" aria-label="Debug card zone">
              <option value="hand">Hand</option>
              <option value="discard_top">Top of discard pile</option>
              <option value="deck_top">Top of deck</option>
            </select>
          </label>
        </div>
        <DebugCardPicker
          v-model="addCard"
          :cards="allCards"
          :initial-visible-types="['gem', 'relic', 'spell']"
          :allow-type-filter="false"
          :show-cost="false"
          :show-meta="false"
        >
          <template #search-action>
            <button class="btn small" type="button" :disabled="!selectedAddPlayer" @click="addCardToPlayer()">
              Add Card
            </button>
          </template>
        </DebugCardPicker>
        <div class="debug-card-selected" aria-live="polite">
          <CardHoverPreview v-if="cardImageUrl(addCard)" :card-id="addCard" :preview-width="210" :preview-height="291.02">
            <img :src="cardImageUrl(addCard)" :alt="getCard(addCard).name" draggable="false" />
          </CardHoverPreview>
          <div>
            <span class="debug-label">Selected</span>
            <strong>{{ getCard(addCard).name }}</strong>
          </div>
        </div>
      </div>

      <div class="debug-section">
        <DebugCardPicker
          v-model="addNemesisCard"
          :cards="allNemesisCardDefs"

          search-placeholder="Search Nemesis cards..."
          :show-cost="false"
          :global-shortcut="false"
        >
          <template #search-action>
            <button class="btn small" type="button" :disabled="!addNemesisCard" @click="addCardToNemesis()">
              Add to Nemesis
            </button>
          </template>
        </DebugCardPicker>
        <div class="debug-card-selected" aria-live="polite">
          <CardHoverPreview v-if="cardImageUrl(addNemesisCard)" :card-id="addNemesisCard" :preview-width="210" :preview-height="291.02">
            <img :src="cardImageUrl(addNemesisCard)" :alt="getCard(addNemesisCard).name" draggable="false" />
          </CardHoverPreview>
          <div>
            <span class="debug-label">Selected</span>
            <strong>{{ getCard(addNemesisCard).name }}</strong>
            <span class="debug-hint">{{ getCard(addNemesisCard).type }} card</span>
          </div>
        </div>
        <span class="debug-hint">Minion and Power cards enter play; Attack cards go to the top of the Nemesis deck; Strike cards go to the top of the Nemesis specific deck.</span>
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
        <button class="btn small" @click="clearSaves()">Clear Saves</button>
      </div>

      <div class="debug-section">
        <label class="debug-toggle-row">
          <input type="checkbox" :checked="props.logVisible" @change="updateLogVisibility" />
          <span>Show Log Panel</span>
        </label>
      </div>
    </div>

    <button
      class="debug-resize-handle"
      type="button"
      aria-label="Resize debug tools"

      data-debug-resize
      @pointerdown.stop="startResize"
    ></button>
  </div>

  <DebugDeckOrderModal
    v-if="deckOrderModalOpen && state.game"
    :player="deckOrderPlayer"
    @close="closeDeckOrderModal"
  />
</template>
