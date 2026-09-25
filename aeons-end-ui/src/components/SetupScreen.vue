<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useGame } from '../game/useGame'
import { useModalDrag } from '../game/useModalDrag'
import { MAGES, NEMESES, ALL_MARKET_CARDS, MARKET_SLOT_TYPES } from '@engine/data'
import type { MarketSetupConfig } from '@engine/types'
import { cardImageUrl, nemesisMatImageUrl } from '../card-images'
import { mageImageUrls } from '../mage-images'
import CardHoverPreview from './CardHoverPreview.vue'
import ModalBase from './ModalBase.vue'

const {
  state, newGame, resumeGame,
  rerollMarketTemplate,
  requestDeleteSave, cancelDeleteSave, deleteSave,
} = useGame()
const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()
const selectionError = ref('')
const mageOptions = computed(() => Object.values(MAGES))
const mageWaves = computed(() => [...new Set(mageOptions.value.map(mage => mage.wave))].sort((a, b) => a - b))
const mage1Wave = ref(MAGES[state.mage1]?.wave ?? mageWaves.value[0] ?? 1)
const mage2Wave = ref(MAGES[state.mage2]?.wave ?? mageWaves.value[0] ?? 1)
const magePickerWave = ref(mage1Wave.value)
const mage1Options = computed(() => mageOptions.value.filter(mage => mage.wave === mage1Wave.value))
const player2MageOptions = computed(() => mageOptions.value.filter(mage => mage.wave === mage2Wave.value && mage.type !== state.mage1))
const nemesisOptions = computed(() => Object.values(NEMESES))
const duplicateMage = computed(() => state.mage1 === state.mage2)
const marketCards = computed(() => Object.values(ALL_MARKET_CARDS)
  .sort((a, b) => a.type.localeCompare(b.type) || a.cost - b.cost || a.name.localeCompare(b.name)))
const marketSlotLabels = ['Gem 1', 'Gem 2', 'Gem 3', 'Relic 1', 'Relic 2', 'Spell 1', 'Spell 2', 'Spell 3', 'Spell 4']
const marketSlotTypes = MARKET_SLOT_TYPES
const replacementSlot = ref<number | null>(null)
const replacementPickerEl = ref<HTMLElement | null>(null)
const magePickerPlayer = ref<1 | 2 | null>(null)
const magePickerEl = ref<HTMLElement | null>(null)
const nemesisPickerOpen = ref(false)
const nemesisPickerEl = ref<HTMLElement | null>(null)
function cardsForSlot(index: number) {
  return marketCards.value.filter(card => card.type === marketSlotTypes[index])
}
const replacementCards = computed(() => {
  const index = replacementSlot.value
  if (index === null) return []
  return cardsForSlot(index)
})
const replacementSlotLabel = computed(() => replacementSlot.value === null ? '' : marketSlotLabels[replacementSlot.value]!)
const replacementSlotType = computed(() => replacementSlot.value === null ? '' : marketSlotTypes[replacementSlot.value]!)
const replacementCurrentId = computed(() => replacementSlot.value === null ? '' : state.marketSlots[replacementSlot.value] ?? '')
const mage1Preview = computed(() => mageImageUrls(state.mage1))
const mage2Preview = computed(() => mageImageUrls(state.mage2))
const nemesisPreview = computed(() => nemesisMatImageUrl(state.nemesisType, 'front'))
const magePickerTitle = computed(() => magePickerPlayer.value === null
  ? ''
  : `Choose Player ${magePickerPlayer.value} Mage`)
const magePickerCurrent = computed(() => magePickerPlayer.value === 1 ? state.mage1 : magePickerPlayer.value === 2 ? state.mage2 : '')
const nemesisPickerTitle = 'Choose Nemesis'
const marketSetupValid = computed(() => state.marketSlots.length === 9
  && new Set(state.marketSlots).size === 9
  && state.marketSlots.every((cardId, index) =>
    !!ALL_MARKET_CARDS[cardId] && ALL_MARKET_CARDS[cardId].type === marketSlotTypes[index]))

function randomChoice<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)]
}

function randomizeMage(player: 1 | 2, wave?: number) {
  const currentOtherMage = player === 1 ? state.mage2 : state.mage1
  const currentMage = player === 1 ? state.mage1 : state.mage2
  const waveCandidates = mageOptions.value.filter(mage =>
    (wave === undefined || mage.wave === wave) && mage.type !== currentOtherMage)
  const alternatives = waveCandidates.filter(mage => mage.type !== currentMage)
  const candidates = alternatives.length > 0
    ? alternatives
    : waveCandidates
  const selected = randomChoice(candidates)
  if (!selected) return
  if (player === 1) {
    state.mage1 = selected.type
    mage1Wave.value = selected.wave
  } else {
    state.mage2 = selected.type
    mage2Wave.value = selected.wave
  }
}

function randomizeSetupMages() {
  const first = randomChoice(mageOptions.value)
  if (!first) return
  const second = randomChoice(mageOptions.value.filter(mage => mage.type !== first.type))
  if (!second) return
  state.mage1 = first.type
  state.mage2 = second.type
  mage1Wave.value = first.wave
  mage2Wave.value = second.wave
}

randomizeSetupMages()

function randomizeNemesis() {
  const candidates = nemesisOptions.value.filter(nemesis => nemesis.type !== state.nemesisType)
  const selected = randomChoice(candidates.length > 0 ? candidates : nemesisOptions.value)
  if (selected) state.nemesisType = selected.type
}

watch(() => [state.mage1, state.mage2, state.marketMode, ...state.marketSlots], () => {
  selectionError.value = ''
})

watch(() => state.mage1, (type) => {
  const wave = MAGES[type]?.wave
  if (wave !== undefined) mage1Wave.value = wave
})
watch(() => state.mage2, (type) => {
  const wave = MAGES[type]?.wave
  if (wave !== undefined) mage2Wave.value = wave
})

function startSelectedGame() {
  selectionError.value = duplicateMage.value
    ? 'This Mage has already been selected by another player.'
    : !marketSetupValid.value ? 'Market Setup must contain nine different cards.' : ''
  if (selectionError.value) return
  const marketSetup: MarketSetupConfig = {
    mode: 'template1',
    slots: [...state.marketSlots],
  }
  newGame(state.mage1, state.mage2, state.nemesisType, state.nemesisDifficulty, marketSetup)
}

function openReplacement(index: number) {
  replacementSlot.value = index
}

function closeReplacement() {
  replacementSlot.value = null
}

watch(replacementSlot, (slot) => {
  if (slot === null) return
  nextTick(() => replacementPickerEl.value?.focus({ preventScroll: true }))
})

watch(magePickerPlayer, (player) => {
  if (player === null) return
  nextTick(() => magePickerEl.value?.focus({ preventScroll: true }))
})

watch(nemesisPickerOpen, (open) => {
  if (!open) return
  nextTick(() => nemesisPickerEl.value?.focus({ preventScroll: true }))
})

function replaceMarketCard(cardId: string) {
  const index = replacementSlot.value
  if (index === null) return
  if (!replacementCards.value.some(card => card.id === cardId)) return
  state.marketSlots[index] = cardId
  replacementSlot.value = null
}

function openMagePicker(player: 1 | 2) {
  magePickerPlayer.value = player
  magePickerWave.value = MAGES[player === 1 ? state.mage1 : state.mage2]?.wave ?? mageWaves.value[0] ?? 1
}

function closeMagePicker() {
  magePickerPlayer.value = null
}

function mageOptionDisabled(mageType: string) {
  if (magePickerPlayer.value === null || mageType === magePickerCurrent.value) return false
  const otherMage = magePickerPlayer.value === 1 ? state.mage2 : state.mage1
  return mageType === otherMage
}

function selectMage(mageType: string) {
  const player = magePickerPlayer.value
  if (player === null || mageOptionDisabled(mageType)) return
  if (player === 1) state.mage1 = mageType
  else state.mage2 = mageType
  magePickerPlayer.value = null
}

const magePickerOptions = computed(() => mageOptions.value.filter(mage => mage.wave === magePickerWave.value))

function openNemesisPicker() {
  nemesisPickerOpen.value = true
}

function closeNemesisPicker() {
  nemesisPickerOpen.value = false
}

function selectNemesis(nemesisType: string) {
  if (!nemesisOptions.value.some(nemesis => nemesis.type === nemesisType)) return
  state.nemesisType = nemesisType
  nemesisPickerOpen.value = false
}

function saveTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function turnLabel(turn: string): string {
  return turn === 'nemesis' ? 'Nemesis' : turn.toUpperCase()
}
</script>

<template>
  <div class="setup">
    <header class="setup-header">
      <h1>Aeon's End — Digital Demo</h1>
      <p>Two players vs one Nemesis · Six turn-order cards</p>
    </header>
    <p v-if="selectionError || duplicateMage" class="setup-error">
      {{ selectionError || 'This Mage has already been selected by another player.' }}
    </p>
    <main class="setup-layout">
      <section class="setup-mage-column setup-character-column" aria-label="Mage selection">
        <div class="setup-mage-field">
          <label for="player1-mage-select">Player 1 Mage</label>
          <span class="wave-tabs" role="tablist" aria-label="Mage Wave Tabs — First Player">
            <button v-for="wave in mageWaves" :key="`p1-wave-${wave}`" type="button" role="tab" :aria-selected="mage1Wave === wave" :class="{ active: mage1Wave === wave }" @click="randomizeMage(1, wave)">Wave {{ wave }}</button>
          </span>
          <span class="setup-select-row">
          <select id="player1-mage-select" v-model="state.mage1" aria-label="Player 1 Mage">
            <option v-for="mage in mage1Options" :key="mage.type" :value="mage.type">
              {{ mage.type }}
            </option>
          </select>
          <button type="button" class="btn small setup-random-button" aria-label="Randomize First Mage" @click="randomizeMage(1)">Reroll</button>
          </span>
        </div>
        <button
          type="button"
          class="setup-preview-card setup-mage-preview"
          @click="openMagePicker(1)"
        >
          <span class="sr-only">Choose First Mage</span>
          <img v-if="mage1Preview" :src="mage1Preview.front" :alt="`${state.mage1} mage mat`" draggable="false" />
        </button>
        <div class="setup-mage-field">
          <label for="player2-mage-select">Player 2 Mage</label>
          <span class="wave-tabs" role="tablist" aria-label="Mage Wave Tabs — Second Player">
            <button v-for="wave in mageWaves" :key="`p2-wave-${wave}`" type="button" role="tab" :aria-selected="mage2Wave === wave" :class="{ active: mage2Wave === wave }" @click="randomizeMage(2, wave)">Wave {{ wave }}</button>
          </span>
          <span class="setup-select-row">
          <select id="player2-mage-select" v-model="state.mage2" aria-label="Player 2 Mage">
            <option v-for="mage in player2MageOptions" :key="mage.type" :value="mage.type">
              {{ mage.type }}
            </option>
          </select>
          <button type="button" class="btn small setup-random-button" aria-label="Randomize Second Mage" @click="randomizeMage(2)">Reroll</button>
          </span>
        </div>
        <button
          type="button"
          class="setup-preview-card setup-mage-preview"
          @click="openMagePicker(2)"
        >
          <span class="sr-only">Choose Second Mage</span>
          <img v-if="mage2Preview" :src="mage2Preview.front" :alt="`${state.mage2} mage mat`" draggable="false" />
        </button>
      </section>

      <section class="setup-nemesis-column setup-character-column" aria-label="Nemesis selection">
        <label>
          Nemesis
          <span class="setup-select-row">
          <select v-model="state.nemesisType" aria-label="Nemesis">
            <option v-for="nemesis in nemesisOptions" :key="nemesis.type" :value="nemesis.type">
              {{ nemesis.name }}
            </option>
          </select>
          <button type="button" class="btn small setup-random-button" aria-label="Randomize Nemesis" @click="randomizeNemesis">Reroll</button>
          </span>
        </label>
        <label>
          Nemesis Difficulty
          <select v-model="state.nemesisDifficulty" aria-label="Nemesis Difficulty">
            <option value="standard">Standard</option>
            <option value="increased">Increased</option>
          </select>
        </label>
        <button
          type="button"
          class="setup-preview-card setup-nemesis-preview nemesis-preview-card"
          aria-label="Choose Nemesis"
          @click="openNemesisPicker"
        >
          <img v-if="nemesisPreview" :src="nemesisPreview" :alt="`${state.nemesisType} nemesis mat`" draggable="false" />
        </button>
      </section>

      <section class="market-setup" aria-label="Market Setup">
        <div class="market-setup-toolbar">
          <h2>Market Setup</h2>
          <div class="market-template-controls">
            <select v-model="state.marketMode" aria-label="Market Setup Template">
              <option value="template1">Template One</option>
            </select>
            <button
              type="button"
              class="btn small"
              aria-label="Refresh semi-random market"
              @click="rerollMarketTemplate"
            >
              Reroll
            </button>
          </div>
        </div>
        <p class="setup-hint">Template One: Gems ≤3 / 4 / ≥5 Aether · Relics ≤3 / ≥4 Aether · Spells 3 / 4 / 5 / ≥6 Aether.</p>
        <div class="market-slot-grid">
          <CardHoverPreview
            v-for="(label, index) in marketSlotLabels"
            :key="label"
            :card-id="state.marketSlots[index]"
            :preview-width="280"
            :preview-height="394"
            :preview-delay="200"
          >
            <button
              type="button"
              class="market-slot-card"
              :aria-label="`${label}: ${ALL_MARKET_CARDS[state.marketSlots[index]]?.name ?? 'Choose a card'}. Click to replace.`"
              @click="openReplacement(index)"
            >
              <img
                v-if="cardImageUrl(state.marketSlots[index])"
                :src="cardImageUrl(state.marketSlots[index])"
                :alt="ALL_MARKET_CARDS[state.marketSlots[index]]?.name ?? 'Market card'"
                draggable="false"
              />
              <span v-else class="market-slot-missing">Choose a card</span>
            </button>
          </CardHoverPreview>
        </div>
      </section>
    </main>
    <div class="setup-start-row">
      <button class="btn primary" style="font-size: 15px; padding: 10px 28px" @click="startSelectedGame">
        Start Game
      </button>
    </div>
    <section class="save-list" aria-label="Saved Games">
      <h2>Saved Games ({{ state.saves.length }})</h2>
      <p v-if="!state.hasSave" class="muted">No saved games found.</p>
      <article v-for="save in state.saves" :key="save.id" class="save-entry">
        <div>
          <strong>{{ save.players.join(' + ') }} vs {{ save.nemesisType }}</strong>
          <span class="save-details">
            Round {{ save.round }} · Turn {{ save.turn }} · Current: {{ turnLabel(save.currentTurn) }} · {{ saveTime(save.updatedAt) }}
          </span>
        </div>
        <div class="save-actions">
          <button class="btn" @click="resumeGame(save.id)">Resume Game</button>
          <button class="btn danger" @click="requestDeleteSave(save.id)">Delete</button>
        </div>
      </article>
    </section>

    <ModalBase
      v-if="state.deleteSaveId"
      overlay-class="save-delete-overlay"
      v-model:panel-ref="modalEl"
      panel-class="draggable-modal"
      :panel-style="modalStyle"
      :dragging="dragging"
      @overlay-click="cancelDeleteSave"
      @panel-pointerdown="startDrag"
    >
        <h2>Delete Saved Game?</h2>
        <p class="exit-copy">Are you sure you want to delete this saved game?</p>
        <div class="overlay-actions">
          <button class="btn danger" @click="deleteSave(state.deleteSaveId!)">Delete</button>
          <button class="btn" @click="cancelDeleteSave">Cancel</button>
        </div>
    </ModalBase>

    <ModalBase
      v-if="replacementSlot !== null"
      overlay-class="setup-market-overlay"
      v-model:panel-ref="replacementPickerEl"
      panel-class="setup-market-picker"
      panel-aria-labelledby="market-picker-title"
      @overlay-click="closeReplacement"
    >
        <div class="setup-market-picker-head">
          <h2 id="market-picker-title">Choose {{ replacementSlotLabel }}</h2>
          <button type="button" class="btn small" aria-label="Close market card picker" @click="closeReplacement">Close</button>
        </div>
        <p class="setup-hint">Choose one {{ replacementSlotType }}. Cards already used in another slot are unavailable.</p>
        <div class="market-picker-grid">
          <CardHoverPreview
            v-for="card in replacementCards"
            :key="card.id"
            :card-id="card.id"
            :preview-width="280"
            :preview-height="394"
            :preview-delay="200"
          >
            <button
              type="button"
              class="market-picker-card"
              :aria-label="`Choose ${card.name}`"
              :class="{ selected: card.id === replacementCurrentId, unavailable: card.id !== replacementCurrentId && state.marketSlots.includes(card.id) }"
              :disabled="card.id !== replacementCurrentId && state.marketSlots.includes(card.id)"
              @click="replaceMarketCard(card.id)"
            >
              <img v-if="cardImageUrl(card.id)" :src="cardImageUrl(card.id)" :alt="card.name" draggable="false" />
            </button>
          </CardHoverPreview>
        </div>
    </ModalBase>

    <ModalBase
      v-if="magePickerPlayer !== null"
      overlay-class="setup-mage-overlay"
      v-model:panel-ref="magePickerEl"
      panel-class="setup-mage-picker"
      panel-aria-labelledby="mage-picker-title"
      @overlay-click="closeMagePicker"
    >
        <div class="setup-market-picker-head">
          <h2 id="mage-picker-title">{{ magePickerTitle }}</h2>
          <button type="button" class="btn small" aria-label="Close Mage picker" @click="closeMagePicker">Close</button>
        </div>
        <div class="wave-tabs mage-picker-wave-tabs" role="tablist" aria-label="Mage Wave">
          <button v-for="wave in mageWaves" :key="`picker-wave-${wave}`" type="button" role="tab" :aria-selected="magePickerWave === wave" :class="{ active: magePickerWave === wave }" @click="magePickerWave = wave">Wave {{ wave }}</button>
        </div>
        <div class="mage-picker-grid">
          <CardHoverPreview
            v-for="mage in magePickerOptions"
            :key="mage.type"
            :image-url="mageImageUrls(mage.type)?.front"
            :image-alt="`${mage.type} mage mat`"
            :preview-width="840"
            :preview-height="604"
            :preview-delay="200"
            preview-class="mage-preview"
            :disabled="mageOptionDisabled(mage.type)"
          >
            <button
              type="button"
              class="mage-picker-card"
              :aria-label="`Choose ${mage.type} Mage`"
              :class="{ selected: mage.type === magePickerCurrent }"
              :disabled="mageOptionDisabled(mage.type)"
              @click="selectMage(mage.type)"
            >
              <img
                v-if="mageImageUrls(mage.type)?.front"
                :src="mageImageUrls(mage.type)!.front"
                :alt="`${mage.type} mage mat`"
                draggable="false"
              />
            </button>
          </CardHoverPreview>
        </div>
    </ModalBase>

    <ModalBase
      v-if="nemesisPickerOpen"
      overlay-class="setup-nemesis-overlay"
      v-model:panel-ref="nemesisPickerEl"
      panel-class="setup-nemesis-picker"
      panel-aria-labelledby="nemesis-picker-title"
      @overlay-click="closeNemesisPicker"
    >
        <div class="setup-market-picker-head">
          <h2 id="nemesis-picker-title">{{ nemesisPickerTitle }}</h2>
          <button type="button" class="btn small" aria-label="Close Nemesis picker" @click="closeNemesisPicker">Close</button>
        </div>
        <div class="nemesis-picker-grid">
          <CardHoverPreview
            v-for="nemesis in nemesisOptions"
            :key="nemesis.type"
            :image-url="nemesisMatImageUrl(nemesis.type, 'front')"
            :image-alt="`${nemesis.name} nemesis mat`"
            :preview-width="630"
            :preview-height="840"
            :preview-delay="200"
            image-object-fit="contain"
            preview-class="nemesis-mat-preview"
          >
            <button
              type="button"
              class="nemesis-picker-card"
              :aria-label="`Choose ${nemesis.name} Nemesis`"
              :class="{ selected: nemesis.type === state.nemesisType }"
              @click="selectNemesis(nemesis.type)"
            >
              <img
                v-if="nemesisMatImageUrl(nemesis.type, 'front')"
                :src="nemesisMatImageUrl(nemesis.type, 'front')"
                :alt="`${nemesis.name} nemesis mat`"
                draggable="false"
              />
            </button>
          </CardHoverPreview>
        </div>
    </ModalBase>
  </div>
</template>
