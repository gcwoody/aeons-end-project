<script setup lang="ts">
import { computed, ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { getPlayer, toRoman } from '@engine/engine'
import { getCard, INITIAL_CARDS, MARKET_CARDS, NEMESIS_CARDS } from '@engine/data'
import type { GameState } from '@engine/types'
import { useGame } from '../game/useGame'

const { state, toggleDebug, clearSaves } = useGame()

const panelEl = ref<HTMLElement | null>(null)
const panelPosition = reactive({ x: 24, y: 24, width: 380, height: 600 })
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
  panelPosition.y = clamp(panelPosition.y, 8, window.innerHeight - panelPosition.height - 8)
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest('button, input, select, textarea, option, label, a, [data-debug-resize]'),
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
    panelPosition.height = clamp(active.height + deltaY, 260, window.innerHeight - panelPosition.y - 8)
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
  panelPosition.height = clamp(panelPosition.height, 260, window.innerHeight - 16)
  clampPanelPosition()
}

const players = computed(() => state.game?.players ?? [])
const nemesis = computed(() => state.game!.nemesis)
const gravehold = computed(() => state.game!.gravehold)

const allCards = computed(() => [...Object.keys(INITIAL_CARDS), ...Object.keys(MARKET_CARDS)])
const allNemesisCards = computed(() => Object.keys(NEMESIS_CARDS).filter(cardId => {
  const card = getCard(cardId)
  return card.type === 'attack' || card.type === 'minion' || card.type === 'power'
}))
const addPlayer = ref('')
const addZone = ref<'hand' | 'deck' | 'discard'>('hand')
const addCard = ref('crystal')
const addNemesisCard = ref(allNemesisCards.value[0] ?? '')

function addCardToPlayer() {
  if (!addPlayer.value) return
  const p = getPlayer(state.game!, addPlayer.value)
  p[addZone.value].push(addCard.value)
}

function addCardToNemesis() {
  const card = NEMESIS_CARDS[addNemesisCard.value]
  if (!card) return
  const n = state.game!.nemesis
  if (card.type === 'attack') {
    n.deck.unshift(card.id)
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

function giveAether(playerId: string) {
  getPlayer(state.game!, playerId).bonusAether += 3
}

const jsonText = ref('')
function loadCurrentJson() {
  jsonText.value = JSON.stringify({
    game: state.game, phase: state.phase, selectedPlayer: state.selectedPlayer,
    pendingNemesis: state.pendingNemesis, discardRemaining: state.discardRemaining,
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
    state.pendingNemesis = data.pendingNemesis ?? null
    state.discardRemaining = data.discardRemaining ?? []
  } catch (e: any) {
    alert(`Invalid JSON: ${e.message}`)
  }
}
function copyJson() {
  navigator.clipboard.writeText(jsonText.value)
}

onMounted(() => {
  panelPosition.x = Math.max(16, window.innerWidth - panelPosition.width - 24)
  panelPosition.y = 24
  handleViewportResize()
  window.addEventListener('resize', handleViewportResize)
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
    :class="{ interacting: interaction }"
    :style="panelStyle"
    @pointerdown="startDrag"
  >
    <div class="debug-head">
      <h3>Debug Tools</h3>
      <button class="btn small" @click="toggleDebug()">Close (Ctrl+D)</button>
    </div>

    <div class="debug-content">
      <div class="debug-section">
        <span class="debug-label">Nemesis HP</span>
        <input type="number" v-model.number="nemesis.hp" min="0" :max="nemesis.maxHp" />
        <span class="debug-label">Gravehold HP</span>
        <input type="number" v-model.number="gravehold.hp" min="0" :max="gravehold.maxHp" />
      </div>

      <div v-for="p in players" :key="p.id" class="debug-section">
        <span class="debug-player">{{ p.mageType }} ({{ p.id }})</span>
        <div class="debug-row">
          <label>HP <input type="number" v-model.number="p.hp" min="0" /></label>
          <label>Charge <input type="number" v-model.number="p.charge" min="0" /></label>
        </div>
        <div class="debug-breaches">
          <button
            v-for="b in p.breaches.filter(item => item.present !== false)" :key="b.index"
            class="btn small" :class="{ on: b.opened }"
            @click="b.opened = !b.opened; b.prepSpells = []"
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
          <option v-for="p in players" :key="p.id" :value="p.id">{{ p.mageType }} ({{ p.id }})</option>
        </select>
        <select v-model="addZone">
          <option value="hand">hand</option>
          <option value="deck">deck</option>
          <option value="discard">discard</option>
        </select>
        <button class="btn small" @click="addCardToPlayer()">Add</button>
      </div>

      <div class="debug-section">
        <span class="debug-label">Add Nemesis card</span>
        <select v-model="addNemesisCard">
          <option v-for="cid in allNemesisCards" :key="cid" :value="cid">
            {{ cid }} — {{ getCard(cid).name }} ({{ getCard(cid).type }})
          </option>
        </select>
        <span class="debug-hint">Minion and Power cards enter play; Attack cards go to the top of the Nemesis deck.</span>
        <button class="btn small" @click="addCardToNemesis()">Add to Nemesis</button>
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
    </div>

    <button
      class="debug-resize-handle"
      type="button"
      aria-label="Resize debug tools"
      title="Drag to resize"
      data-debug-resize
      @pointerdown.stop="startResize"
    ></button>
  </div>
</template>
