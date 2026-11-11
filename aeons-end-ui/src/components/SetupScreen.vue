<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGame } from '../game/useGame'
import { displayMageName } from '../game/display-name'
import { MAGES, NEMESES, ALL_MARKET_CARDS, MARKET_SLOT_TYPES } from '@engine/data'
import type { MarketSetupConfig } from '@engine/types'
import { cardImageUrl, nemesisMatImageUrl } from '../card-images'
import { mageImageUrls } from '../mage-images'
import CardHoverPreview from './CardHoverPreview.vue'
import ModalBase from './ModalBase.vue'
import MatPreviewButton from './MatPreviewButton.vue'
import SetupCharacterInspector from './SetupCharacterInspector.vue'
import ModalCloseButton from './ModalCloseButton.vue'

const emit = defineEmits<{ (event: 'back-to-menu'): void }>()
const { state, newGame, rerollMarketTemplate } = useGame()
const selectionError = ref('')
const mageOptions = computed(() => Object.values(MAGES))
const mageWaves = computed(() => [...new Set(mageOptions.value.map(mage => mage.wave))].sort((a, b) => a - b))
const mage1Wave = ref(MAGES[state.mage1]?.wave ?? mageWaves.value[0] ?? 1)
const mage2Wave = ref(MAGES[state.mage2]?.wave ?? mageWaves.value[0] ?? 1)
const magePickerWave = ref(mage1Wave.value)
const nemesisOptions = computed(() => Object.values(NEMESES))
const nemesisWaves = computed(() => [...new Set(nemesisOptions.value.map(nemesis => nemesis.wave ?? 1))].sort((a, b) => a - b))
const nemesisWave = ref(NEMESES[state.nemesisType]?.wave ?? 1)
const nemesisPickerWave = ref(nemesisWave.value)
const nemesisPickerOptions = computed(() => nemesisOptions.value.filter(nemesis => (nemesis.wave ?? 1) === nemesisPickerWave.value))
const duplicateMage = computed(() => state.mage1 === state.mage2)
const marketCards = computed(() => Object.values(ALL_MARKET_CARDS)
  .filter(card => !card.setupOnlyNemesisSupplyFor)
  .sort((a, b) => a.type.localeCompare(b.type) || a.cost - b.cost || a.name.localeCompare(b.name)))
const marketSlotLabels = ['Gem 1', 'Gem 2', 'Gem 3', 'Relic 1', 'Relic 2', 'Spell 1', 'Spell 2', 'Spell 3', 'Spell 4']
const marketSlotTypes = MARKET_SLOT_TYPES
const replacementSlot = ref<number | null>(null)
const replacementPickerWave = ref(1)
const replacementPickerEl = ref<HTMLElement | null>(null)
const magePickerPlayer = ref<1 | 2 | null>(null)
const magePickerEl = ref<HTMLElement | null>(null)
const nemesisPickerOpen = ref(false)
const nemesisPickerEl = ref<HTMLElement | null>(null)
type SetupDropdownId = 'marketTemplate'
const activeSetupDropdown = ref<SetupDropdownId | null>(null)
const setupRootEl = ref<HTMLElement | null>(null)
const setupDropdownDirection = ref<'up' | 'down'>('up')
const setupDropdownAlignment = ref<'left' | 'right'>('left')
const setupDropdownMaxHeight = ref(0)
const inspectorTarget = ref<{ kind: 'mage'; type: string } | { kind: 'nemesis'; type: string } | null>(null)
function cardsForSlot(index: number) {
  return marketCards.value.filter(card => card.type === marketSlotTypes[index])
}
function marketCardWave(card: { set?: string }): number {
  const match = card.set?.match(/^wave(\d+)$/i)
  return match ? Number(match[1]) : 1
}
const replacementWaves = computed(() => {
  const index = replacementSlot.value
  if (index === null) return []
  return [...new Set(cardsForSlot(index).map(marketCardWave))].sort((a, b) => a - b)
})
const replacementCards = computed(() => {
  const index = replacementSlot.value
  if (index === null) return []
  return cardsForSlot(index).filter(card => marketCardWave(card) === replacementPickerWave.value)
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
    !!ALL_MARKET_CARDS[cardId] && !ALL_MARKET_CARDS[cardId].setupOnlyNemesisSupplyFor
    && ALL_MARKET_CARDS[cardId].type === marketSlotTypes[index]))

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

function closeSetupDropdown() {
  activeSetupDropdown.value = null
  setupDropdownMaxHeight.value = 0
}

async function positionSetupDropdown() {
  const dropdown = activeSetupDropdown.value
  if (!dropdown) return
  await nextTick()
  if (activeSetupDropdown.value !== dropdown) return

  const root = setupRootEl.value?.querySelector<HTMLElement>(`[data-setup-dropdown="${dropdown}"]`)
  const trigger = root?.querySelector<HTMLElement>('.setup-preview-select__trigger')
  const menu = root?.querySelector<HTMLElement>('.setup-preview-select__menu')
  if (!trigger || !menu) return

  const rect = trigger.getBoundingClientRect()
  const margin = 12
  const gap = 7
  const above = Math.max(0, rect.top - margin - gap)
  const below = Math.max(0, window.innerHeight - rect.bottom - margin - gap)
  const desiredHeight = Math.min(menu.scrollHeight, 360)
  const canFitAbove = above >= desiredHeight
  const canFitBelow = below >= desiredHeight
  const direction = canFitAbove || (!canFitBelow && above >= below) ? 'up' : 'down'
  const availableHeight = direction === 'up' ? above : below
  const menuWidth = menu.getBoundingClientRect().width
  const rightEdge = window.innerWidth - margin
  const leftAlignedOverflow = Math.max(0, margin - rect.left) + Math.max(0, rect.left + menuWidth - rightEdge)
  const rightAlignedOverflow = Math.max(0, margin - (rect.right - menuWidth)) + Math.max(0, rect.right - rightEdge)

  setupDropdownDirection.value = direction
  setupDropdownMaxHeight.value = Math.max(0, Math.min(desiredHeight, availableHeight))
  setupDropdownAlignment.value = rightAlignedOverflow < leftAlignedOverflow ? 'right' : 'left'
}

function toggleSetupDropdown(dropdown: SetupDropdownId) {
  if (activeSetupDropdown.value === dropdown) {
    closeSetupDropdown()
    return
  }
  activeSetupDropdown.value = dropdown
  void positionSetupDropdown()
}

function setupDropdownMenuClass(dropdown: SetupDropdownId) {
  if (activeSetupDropdown.value !== dropdown) return {}
  return {
    'is-open-down': setupDropdownDirection.value === 'down',
    'is-align-right': setupDropdownAlignment.value === 'right',
  }
}

function setupDropdownMenuStyle(dropdown: SetupDropdownId) {
  if (activeSetupDropdown.value !== dropdown) return undefined
  const maxHeight = setupDropdownMaxHeight.value
  return maxHeight < 12
    ? { maxHeight: `${maxHeight}px`, paddingBlock: '0', borderBlockWidth: '0' }
    : { maxHeight: `${maxHeight}px` }
}

function refreshSetupDropdownPosition() {
  if (activeSetupDropdown.value) void positionSetupDropdown()
}

function handleSetupOutsidePointerDown(event: PointerEvent) {
  const target = event.target
  if (!activeSetupDropdown.value || !(target instanceof Element)) return
  const dropdownRoot = target.closest<HTMLElement>('[data-setup-dropdown]')
  if (dropdownRoot?.dataset.setupDropdown === activeSetupDropdown.value) return
  closeSetupDropdown()
}

function toggleNemesisDifficulty() {
  state.nemesisDifficulty = state.nemesisDifficulty === 'increased' ? 'standard' : 'increased'
}

function selectMarketTemplate(mode: MarketSetupConfig['mode']) {
  state.marketMode = mode
  closeSetupDropdown()
}

randomizeSetupMages()

function randomizeNemesis(wave?: number) {
  const options = wave === undefined
    ? nemesisOptions.value
    : nemesisOptions.value.filter(nemesis => (nemesis.wave ?? 1) === wave)
  const candidates = options.filter(nemesis => nemesis.type !== state.nemesisType)
  const selected = randomChoice(candidates.length > 0 ? candidates : options)
  if (selected) {
    state.nemesisType = selected.type
    nemesisWave.value = selected.wave ?? 1
  }
}

randomizeNemesis()

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
watch(() => state.nemesisType, (type) => {
  const wave = NEMESES[type]?.wave
  if (wave !== undefined) nemesisWave.value = wave
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
  const currentCard = ALL_MARKET_CARDS[state.marketSlots[index] ?? '']
  replacementPickerWave.value = currentCard ? marketCardWave(currentCard) : 1
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
  if (magePickerCurrent.value === mageType) {
    window.dispatchEvent(new Event('card-preview-dismiss'))
    inspectorTarget.value = { kind: 'mage', type: mageType }
    return
  }
  if (player === 1) state.mage1 = mageType
  else state.mage2 = mageType
}

const magePickerOptions = computed(() => mageOptions.value.filter(mage => mage.wave === magePickerWave.value))

function openNemesisPicker() {
  nemesisPickerWave.value = NEMESES[state.nemesisType]?.wave ?? nemesisWaves.value[0] ?? 1
  nemesisPickerOpen.value = true
}

function closeNemesisPicker() {
  nemesisPickerOpen.value = false
}

function selectNemesis(nemesisType: string) {
  if (!nemesisOptions.value.some(nemesis => nemesis.type === nemesisType)) return
  if (state.nemesisType === nemesisType) {
    window.dispatchEvent(new Event('card-preview-dismiss'))
    inspectorTarget.value = { kind: 'nemesis', type: nemesisType }
    return
  }
  state.nemesisType = nemesisType
  nemesisWave.value = NEMESES[nemesisType]?.wave ?? 1
}

function handleSetupEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  // The inspector is stacked above these setup pickers and handles its own
  // Escape key event, so leave the first press to the topmost window.
  if (inspectorTarget.value) return

  if (activeSetupDropdown.value) closeSetupDropdown()
  else if (replacementSlot.value !== null) closeReplacement()
  else if (magePickerPlayer.value !== null) closeMagePicker()
  else if (nemesisPickerOpen.value) closeNemesisPicker()
  else return

  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', handleSetupEscape)
  window.addEventListener('resize', refreshSetupDropdownPosition)
  setupRootEl.value?.addEventListener('scroll', refreshSetupDropdownPosition, true)
  document.addEventListener('pointerdown', handleSetupOutsidePointerDown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleSetupEscape)
  window.removeEventListener('resize', refreshSetupDropdownPosition)
  setupRootEl.value?.removeEventListener('scroll', refreshSetupDropdownPosition, true)
  document.removeEventListener('pointerdown', handleSetupOutsidePointerDown, true)
})
</script>

<template>
  <div ref="setupRootEl" class="setup">
    <button class="btn small setup-back-button" type="button" aria-label="Back to Main Menu" @click="emit('back-to-menu')">
      ← Main Menu
    </button>
    <div class="setup-content">
      <header class="setup-header">
        <p class="setup-design-kicker">PREPARE FOR THE BREACH · PLAYER 1 + PLAYER 2</p>
        <h1>Choose Your Battle</h1>
        <p>Choose two Mages, a Nemesis and nine market cards.</p>
      </header>
      <p v-if="selectionError || duplicateMage" class="setup-error">
        {{ selectionError || 'This Mage has already been selected by another player.' }}
      </p>
      <main class="setup-layout">
      <section class="setup-mage-column setup-character-column" aria-label="Mage selection">
        <div class="setup-mage-field">
          <span class="setup-field-label">Player 1 Mage</span>
          <span class="wave-tabs" role="tablist" aria-label="Mage Wave Tabs — First Player">
            <button v-for="wave in mageWaves" :key="`p1-wave-${wave}`" type="button" role="tab" :aria-selected="mage1Wave === wave" :class="{ active: mage1Wave === wave }" @click="randomizeMage(1, wave)">Wave {{ wave }}</button>
          </span>
          <span class="setup-select-row setup-select-row--preview">
            <div id="player1-mage-select" class="setup-selected-name" role="status" aria-label="Player 1 Mage">{{ displayMageName(state.mage1) }}</div>
            <button type="button" class="btn primary small setup-random-button" aria-label="Randomize First Mage" @click="randomizeMage(1)">Reroll</button>
          </span>
        </div>
        <div class="setup-mat-stage setup-mat-stage--mage" aria-label="Player 1 Mage mat preview">
          <MatPreviewButton
            kind="mage"
            :fit-to-parent="true"
            :image-url="mage1Preview?.front"
            :image-alt="`${displayMageName(state.mage1)} mage mat`"
            label="Choose First Mage"
            @click="openMagePicker(1)"
          />
        </div>
        <div class="setup-mage-field">
          <span class="setup-field-label">Player 2 Mage</span>
          <span class="wave-tabs" role="tablist" aria-label="Mage Wave Tabs — Second Player">
            <button v-for="wave in mageWaves" :key="`p2-wave-${wave}`" type="button" role="tab" :aria-selected="mage2Wave === wave" :class="{ active: mage2Wave === wave }" @click="randomizeMage(2, wave)">Wave {{ wave }}</button>
          </span>
          <span class="setup-select-row setup-select-row--preview">
            <div id="player2-mage-select" class="setup-selected-name" role="status" aria-label="Player 2 Mage">{{ displayMageName(state.mage2) }}</div>
            <button type="button" class="btn primary small setup-random-button" aria-label="Randomize Second Mage" @click="randomizeMage(2)">Reroll</button>
          </span>
        </div>
        <div class="setup-mat-stage setup-mat-stage--mage" aria-label="Player 2 Mage mat preview">
          <MatPreviewButton
            kind="mage"
            :fit-to-parent="true"
            :image-url="mage2Preview?.front"
            :image-alt="`${displayMageName(state.mage2)} mage mat`"
            label="Choose Second Mage"
            @click="openMagePicker(2)"
          />
        </div>
      </section>

      <section class="setup-nemesis-column setup-character-column" aria-label="Nemesis selection">
        <div class="setup-mage-field">
          <span class="setup-field-label">Nemesis</span>
          <span class="wave-tabs" role="group" aria-label="Nemesis Wave Tabs">
            <button v-for="wave in nemesisWaves" :key="`nemesis-wave-${wave}`" type="button" :aria-pressed="nemesisWave === wave" :class="{ active: nemesisWave === wave }" @click="nemesisWave = wave; randomizeNemesis(wave)">Wave {{ wave }}</button>
          </span>
          <span class="setup-select-row setup-select-row--preview">
            <div id="nemesis-select" class="setup-selected-name" role="status" aria-label="Nemesis">{{ NEMESES[state.nemesisType]?.name ?? state.nemesisType }}</div>
            <button type="button" class="btn primary small setup-random-button" aria-label="Randomize Nemesis" @click="randomizeNemesis()">Reroll</button>
          </span>
        </div>
        <div class="setup-nemesis-difficulty">
          <span class="setup-field-label">Nemesis Difficulty</span>
          <button
            type="button"
            class="setup-preview-select__trigger setup-difficulty-toggle"
            :aria-label="`Nemesis Difficulty: ${state.nemesisDifficulty === 'increased' ? 'Increased' : 'Standard'}. Click to switch.`"
            :aria-pressed="state.nemesisDifficulty === 'increased'"
            @click="toggleNemesisDifficulty"
          >
            {{ state.nemesisDifficulty === 'increased' ? 'Increased' : 'Standard' }}
          </button>
        </div>
        <div class="setup-mat-stage setup-mat-stage--nemesis" aria-label="Nemesis mat preview">
          <MatPreviewButton
            kind="nemesis"
            :fit-to-parent="true"
            :image-url="nemesisPreview"
            :image-alt="`${NEMESES[state.nemesisType]?.name ?? state.nemesisType} nemesis mat`"
            label="Choose Nemesis"
            @click="openNemesisPicker"
          />
        </div>
      </section>

      <section class="market-setup" aria-label="Market Setup">
        <div class="market-setup-toolbar">
          <h2>Market Setup</h2>
          <div class="market-template-controls">
            <div
              class="setup-preview-select market-template-select"
              :class="{ 'is-open': activeSetupDropdown === 'marketTemplate' }"
              data-setup-dropdown="marketTemplate"
            >
              <button
                type="button"
                class="setup-preview-select__trigger"
                aria-label="Market Setup Template"
                aria-haspopup="listbox"
                aria-controls="market-template-options"
                :aria-expanded="activeSetupDropdown === 'marketTemplate'"
                @click="toggleSetupDropdown('marketTemplate')"
              >
                <span>Template One</span>
                <span class="setup-preview-select__chevron" aria-hidden="true"></span>
              </button>
              <div
                v-if="activeSetupDropdown === 'marketTemplate'"
                id="market-template-options"
                class="setup-preview-select__menu"
                :class="setupDropdownMenuClass('marketTemplate')"
                :style="setupDropdownMenuStyle('marketTemplate')"
                role="listbox"
                aria-label="Market Setup Templates"
              >
                <button
                  type="button"
                  role="option"
                  class="setup-preview-select__option"
                  :class="{ 'is-current': state.marketMode === 'template1' }"
                  :aria-selected="state.marketMode === 'template1'"
                  @click="selectMarketTemplate('template1')"
                >
                  <span>Template One</span>
                  <span v-if="state.marketMode === 'template1'" class="setup-preview-select__selected-mark" aria-hidden="true">✓</span>
                </button>
              </div>
            </div>
            <button
              type="button"
              class="btn primary small"
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
            :preview-height="388.03"
            :preview-delay="500"
            :disabled="inspectorTarget !== null"
          >
            <button
              type="button"
              class="market-slot-card game-highlight"
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
        <button class="btn primary setup-start-button" @click="startSelectedGame">
          Start Game
        </button>
      </div>
    </div>

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
          <ModalCloseButton label="Close market card picker" @close="closeReplacement" />
        </div>
        <p class="setup-hint">Choose one {{ replacementSlotType }}. Cards already used in another slot are unavailable.</p>
        <div class="wave-tabs mage-picker-wave-tabs" role="tablist" aria-label="Market Card Wave">
          <button
            v-for="wave in replacementWaves"
            :key="`market-picker-wave-${wave}`"
            type="button"
            role="tab"
            :aria-selected="replacementPickerWave === wave"
            :class="{ active: replacementPickerWave === wave }"
            @click="replacementPickerWave = wave"
          >Wave {{ wave }}</button>
        </div>
        <div class="market-picker-grid">
          <CardHoverPreview
            v-for="card in replacementCards"
            :key="card.id"
            :card-id="card.id"
            :preview-width="280"
            :preview-height="388.03"
            :preview-delay="500"
            :disabled="inspectorTarget !== null"
            preview-class="setup-market-picker-preview"
          >
            <button
              type="button"
              class="market-picker-card game-highlight"
              :aria-label="`Choose ${card.name}`"
              :class="{ selected: card.id === replacementCurrentId, 'game-highlight--choice': card.id === replacementCurrentId, unavailable: card.id !== replacementCurrentId && state.marketSlots.includes(card.id) }"
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
          <ModalCloseButton label="Close Mage picker" @close="closeMagePicker" />
        </div>
        <div class="wave-tabs mage-picker-wave-tabs" role="tablist" aria-label="Mage Wave">
          <button v-for="wave in mageWaves" :key="`picker-wave-${wave}`" type="button" role="tab" :aria-selected="magePickerWave === wave" :class="{ active: magePickerWave === wave }" @click="magePickerWave = wave">Wave {{ wave }}</button>
        </div>
        <p class="setup-picker-hint">Select a mat, then click the selected mat to view its details.</p>
        <div class="mage-picker-grid">
          <CardHoverPreview
            v-for="mage in magePickerOptions"
            :key="mage.type"
            :image-url="mageImageUrls(mage.type)?.front"
            :image-alt="`${displayMageName(mage.type)} mage mat`"
            :preview-width="840"
            :preview-height="604"
            :preview-delay="500"
            preview-class="mage-preview"
            :disabled="mageOptionDisabled(mage.type) || inspectorTarget !== null"
          >
            <button
              type="button"
              class="mage-picker-card game-highlight"
              :aria-label="`Choose ${displayMageName(mage.type)} Mage`"
              :class="{ selected: mage.type === magePickerCurrent, 'game-highlight--choice': mage.type === magePickerCurrent }"
              :disabled="mageOptionDisabled(mage.type)"
              @click="selectMage(mage.type)"
            >
              <img
                v-if="mageImageUrls(mage.type)?.front"
                :src="mageImageUrls(mage.type)!.front"
                :alt="`${displayMageName(mage.type)} mage mat`"
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
          <ModalCloseButton label="Close Nemesis picker" @close="closeNemesisPicker" />
        </div>
        <div class="wave-tabs mage-picker-wave-tabs" role="tablist" aria-label="Nemesis Wave">
          <button v-for="wave in nemesisWaves" :key="`nemesis-picker-wave-${wave}`" type="button" role="tab" :aria-selected="nemesisPickerWave === wave" :class="{ active: nemesisPickerWave === wave }" @click="nemesisPickerWave = wave">Wave {{ wave }}</button>
        </div>
        <p class="setup-picker-hint">Select a mat, then click the selected mat to view its details.</p>
        <div class="nemesis-picker-grid">
          <CardHoverPreview
            v-for="nemesis in nemesisPickerOptions"
            :key="nemesis.type"
            :image-url="nemesisMatImageUrl(nemesis.type, 'front')"
            :image-alt="`${nemesis.name} nemesis mat`"
            :preview-width="630"
            :preview-height="840"
            :preview-delay="500"
            image-object-fit="contain"
            preview-class="nemesis-mat-preview"
            :disabled="inspectorTarget !== null"
          >
            <button
              type="button"
              class="nemesis-picker-card game-highlight"
              :aria-label="`Choose ${nemesis.name} Nemesis`"
              :class="{ selected: nemesis.type === state.nemesisType, 'game-highlight--choice': nemesis.type === state.nemesisType }"
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

    <SetupCharacterInspector
      v-if="inspectorTarget"
      :key="`${inspectorTarget.kind}-${inspectorTarget.type}`"
      :kind="inspectorTarget.kind"
      :mage-type="inspectorTarget.kind === 'mage' ? inspectorTarget.type : undefined"
      :nemesis-type="inspectorTarget.kind === 'nemesis' ? inspectorTarget.type : undefined"
      @close="inspectorTarget = null"
    />
  </div>
</template>
