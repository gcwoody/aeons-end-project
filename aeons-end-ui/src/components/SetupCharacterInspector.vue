<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ALL_MARKET_CARDS, getCard, MAGES, NEMESES, resolveMageStartingCardId } from '@engine/data'
import type { BreachState } from '@engine/types'
import { cardImageUrl, nemesisMatImageUrl, specificDeckCardImageUrl } from '../card-images'
import { mageImageUrls } from '../mage-images'
import { getNemesisPresentation } from '../game/nemesis-presentation'
import { registerDismissibleOverlay } from '../game/dismissible-overlays'
import { displayMageName } from '../game/display-name'
import { useModalDrag } from '../game/useModalDrag'
import BreachArtwork from './BreachArtwork.vue'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import ModalBase from './ModalBase.vue'
import ModalCloseButton from './ModalCloseButton.vue'

interface InspectorZone {
  id: string
  label: string
  cards: string[]
  special?: boolean
}

const props = defineProps<{
  kind: 'mage' | 'nemesis'
  mageType?: string
  nemesisType?: string
}>()

const emit = defineEmits<{ close: [] }>()

const mage = computed(() => props.kind === 'mage' ? MAGES[props.mageType ?? ''] : undefined)
const nemesis = computed(() => props.kind === 'nemesis' ? NEMESES[props.nemesisType ?? ''] : undefined)
const mageImages = computed(() => props.mageType ? mageImageUrls(props.mageType) : undefined)
const mageSpecialCards = computed(() => {
  if (!mage.value) return []
  if (mage.value.specificDeck?.length) return mage.value.specificDeck
  return mage.value.swapZone ?? mage.value.specificDeck ?? []
})
const hasMageSpecialZone = computed(() => !!mage.value && (
  mage.value.hasSpecificDeck === true
  || (mage.value.specificDeck?.length ?? 0) > 0
  || (mage.value.swapZone?.length ?? 0) > 0
))
const mageSpecialZoneLabel = computed(() => mage.value?.specificDeckName
  ?? (mage.value?.swapZone?.length ? 'Swap Zone' : 'Special Deck'))
const mageBreachSlots = computed(() => Array.from({ length: 4 }, (_, slot) =>
  mage.value?.breaches.find(breach => breach.index === slot + 1 && breach.present !== false),
))
const nemesisUniqueCards = computed(() => {
  const definition = nemesis.value
  if (!definition) return []
  return ([1, 2, 3] as const).flatMap(tier => definition.uniqueCardIdsByTier[tier] ?? [])
})
const nemesisSpecificCards = computed(() => {
  const definition = nemesis.value
  if (!definition || definition.type === 'oracle_of_filth') return []
  const cards = definition.specificDeckBuilder?.()
    ?? definition?.corruptionDeckBuilder?.()
    ?? []
  if (definition.type !== 'twice_dead_prophet') return cards
  const prophecyOrder = new Map<string, number>([
    ['prophecy_of_ruin', 0],
    ['prophecy_of_the_storm', 1],
    ['prophecy_of_fire', 2],
  ])
  return [...cards].sort((left, right) =>
    (prophecyOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (prophecyOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
  )
})
const nemesisSpecificDiscardCards = computed(() => nemesis.value?.specificDiscardBuilder?.() ?? [])
const nemesisSpecificLabel = computed(() => nemesis.value
  ? getNemesisPresentation(nemesis.value.type).specificDeck.label
  : 'Specific Deck')
const nemesisSpecificDiscardLabel = computed(() => nemesis.value
  ? getNemesisPresentation(nemesis.value.type).specificDiscard.label
  : 'Nemesis Specific Discard')
const nemesisReplacementSupplyCards = computed(() => {
  const type = nemesis.value?.type
  if (!type) return []
  return Object.values(ALL_MARKET_CARDS)
    .filter(card => card.setupOnlyNemesisSupplyFor === type)
    .map(card => card.id)
})
const nemesisSubBoardFaces = computed(() => {
  const type = nemesis.value?.type
  if (!type) return null
  const normal = getNemesisPresentation(type).subBoard
  const increased = getNemesisPresentation(type, 'increased').subBoard
  if (!normal.enabled || !normal.imageUrl || !normal.layout) return null
  const normalFace = { imageUrl: normal.imageUrl, layout: normal.layout }
  const canFlip = Boolean(increased.enabled && increased.imageUrl && increased.layout && increased.imageUrl !== normal.imageUrl)
  return {
    normal: normalFace,
    increased: canFlip && increased.imageUrl && increased.layout
      ? { imageUrl: increased.imageUrl, layout: increased.layout }
      : normalFace,
    canFlip,
  }
})
const zones = computed<InspectorZone[]>(() => {
  if (mage.value) {
    return [
      { id: 'hand', label: 'Starting Hand', cards: mage.value.startHand },
      { id: 'deck', label: 'Starting Deck', cards: mage.value.startDeck },
      ...(hasMageSpecialZone.value
        ? [{ id: 'special', label: mageSpecialZoneLabel.value, cards: mageSpecialCards.value, special: true }]
        : []),
    ]
  }
  return [
    { id: 'nemesis-cards', label: 'Nemesis Cards', cards: nemesisUniqueCards.value },
    ...(nemesisSpecificCards.value.length > 0
      ? [{ id: 'specific-deck', label: nemesisSpecificLabel.value, cards: nemesisSpecificCards.value, special: true }]
      : []),
    ...(nemesisSpecificDiscardCards.value.length > 0
      ? [{ id: 'specific-discard', label: nemesisSpecificDiscardLabel.value, cards: nemesisSpecificDiscardCards.value, special: true }]
      : []),
    ...(nemesisReplacementSupplyCards.value.length > 0
      ? [{ id: 'replacement-supply', label: 'Replacement Supply Piles', cards: nemesisReplacementSupplyCards.value, special: true }]
      : []),
  ]
})

const matFlipped = ref(false)
const formCardPreviewSide = ref<'giver' | 'taker' | undefined>()
const subBoardFlipped = ref(false)
const subBoardModalOpen = ref(false)
const revealedBreachIndexes = ref<number[]>([])
const selectedZone = ref<InspectorZone | null>(null)
const {
  modalEl: subBoardModalEl,
  modalStyle: subBoardModalStyle,
  dragging: subBoardModalDragging,
  startDrag: startSubBoardModalDrag,
} = useModalDrag()
const zoneScrollStates = new Map<HTMLElement, { target: number; frame: number | null; expected: number }>()

watch(() => [props.kind, props.mageType, props.nemesisType] as const, () => {
  matFlipped.value = false
  formCardPreviewSide.value = undefined
  subBoardFlipped.value = false
  subBoardModalOpen.value = false
  selectedZone.value = null
})

const unregisterDismissibleOverlay = registerDismissibleOverlay(() => {
  if (subBoardModalOpen.value) {
    subBoardModalOpen.value = false
    return true
  }
  if (selectedZone.value) {
    selectedZone.value = null
    return true
  }
  emit('close')
  return true
})

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  event.preventDefault()
  event.stopPropagation()
  if (subBoardModalOpen.value) subBoardModalOpen.value = false
  else if (selectedZone.value) selectedZone.value = null
  else emit('close')
}

onMounted(() => window.addEventListener('keydown', closeOnEscape))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', closeOnEscape)
  unregisterDismissibleOverlay()
  for (const state of zoneScrollStates.values()) {
    if (state.frame !== null) cancelAnimationFrame(state.frame)
  }
  zoneScrollStates.clear()
})

function revealBreach(breach: BreachState): BreachState {
  return {
    ...breach,
    opened: breach.opened || revealedBreachIndexes.value.includes(breach.index),
  }
}

function toggleBreach(breach: BreachState) {
  if (breach.opened) return
  revealedBreachIndexes.value = revealedBreachIndexes.value.includes(breach.index)
    ? revealedBreachIndexes.value.filter(index => index !== breach.index)
    : [...revealedBreachIndexes.value, breach.index]
}

function scrollDeckHorizontally(event: WheelEvent) {
  const scroller = event.currentTarget as HTMLElement
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0 || scroller.scrollWidth <= scroller.clientWidth) return
  event.preventDefault()

  let state = zoneScrollStates.get(scroller)
  if (!state) {
    state = { target: scroller.scrollLeft, frame: null, expected: scroller.scrollLeft }
    zoneScrollStates.set(scroller, state)
  }
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
  state.target = Math.max(0, Math.min(maxScroll, state.target + delta))
  if (state.frame !== null) return

  const animate = () => {
    const currentState = zoneScrollStates.get(scroller)
    if (!currentState) return
    const currentMaxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    currentState.target = Math.max(0, Math.min(currentMaxScroll, currentState.target))
    const distance = currentState.target - scroller.scrollLeft
    if (Math.abs(distance) < 0.5) {
      scroller.scrollLeft = currentState.target
      currentState.frame = null
      zoneScrollStates.delete(scroller)
      return
    }
    currentState.expected = scroller.scrollLeft + distance * 0.2
    scroller.scrollLeft = currentState.expected
    currentState.frame = requestAnimationFrame(animate)
  }
  state.frame = requestAnimationFrame(animate)
}

function handleDeckScroll(event: Event) {
  const scroller = event.currentTarget as HTMLElement
  const state = zoneScrollStates.get(scroller)
  if (!state || Math.abs(scroller.scrollLeft - state.expected) < 1) return
  if (state.frame !== null) cancelAnimationFrame(state.frame)
  zoneScrollStates.delete(scroller)
}

function stopDeckWheelScroll(event: PointerEvent) {
  const scroller = event.currentTarget as HTMLElement
  const state = zoneScrollStates.get(scroller)
  if (!state) return
  if (state.frame !== null) cancelAnimationFrame(state.frame)
  zoneScrollStates.delete(scroller)
}

function openZone(zone: InspectorZone) {
  selectedZone.value = zone
}

function openSubBoardInspector() {
  if (!nemesisSubBoardFaces.value) return
  subBoardFlipped.value = false
  subBoardModalOpen.value = true
}

function closeSubBoardInspector() {
  subBoardModalOpen.value = false
}

function cardImage(cardId: string): string | undefined {
  if (props.kind === 'mage' && props.mageType) {
    const waveSpecificCardId = mage.value
      ? resolveMageStartingCardId(mage.value.wave, cardId)
      : cardId
    return specificDeckCardImageUrl(
      props.mageType,
      waveSpecificCardId,
      formCardPreviewSide.value ?? mage.value?.initialFormSide,
    )
  }
  return cardImageUrl(cardId)
}

function isQuFormCard(cardId: string): boolean {
  return props.kind === 'mage' && props.mageType === 'qu' && cardId === 'qus_form_card'
}

function flipFormCardPreview() {
  const currentSide = formCardPreviewSide.value ?? mage.value?.initialFormSide ?? 'giver'
  formCardPreviewSide.value = currentSide === 'giver' ? 'taker' : 'giver'
}

const isQuFormPreviewFlipped = computed(() =>
  (formCardPreviewSide.value ?? mage.value?.initialFormSide ?? 'giver') === 'taker',
)

function cardImageAlt(cardId: string): string {
  if (isQuFormCard(cardId)) {
    const side = formCardPreviewSide.value ?? mage.value?.initialFormSide ?? 'giver'
    return `Qu's Form Card — ${side === 'taker' ? 'Taker' : 'Giver'} Form`
  }
  return getCard(cardId).name
}

function activeSubBoardFace() {
  if (!nemesisSubBoardFaces.value) return null
  return subBoardFlipped.value && nemesisSubBoardFaces.value.canFlip
    ? nemesisSubBoardFaces.value.increased
    : nemesisSubBoardFaces.value.normal
}

function flipSubBoard() {
  if (!nemesisSubBoardFaces.value?.canFlip) return
  subBoardFlipped.value = !subBoardFlipped.value
}
</script>

<template>
  <ModalBase
    v-if="mage || nemesis"
    overlay-class="setup-inspector-overlay"
    :panel-class="[
      'setup-inspector-modal',
      { 'setup-inspector-modal--nemesis': !!nemesis, 'setup-inspector-modal--nemesis-cards-only': !!nemesis && zones.length === 1 },
    ]"
    panel-aria-labelledby="setup-inspector-title"
    @overlay-click="emit('close')"
  >
    <header class="setup-inspector-header">
      <h2 id="setup-inspector-title">{{ mage ? `${displayMageName(mage.type)} Mage` : nemesis?.name }}</h2>
      <ModalCloseButton label="Close character details" @close="emit('close')" />
    </header>

    <main class="setup-inspector-layout" :class="{
      'setup-inspector-layout--nemesis': !!nemesis,
      'setup-inspector-layout--nemesis-cards-only': !!nemesis && zones.length === 1,
      'setup-inspector-layout--nemesis-sub-board': !!nemesisSubBoardFaces,
    }">
      <div class="setup-inspector-mat-column">
        <section v-if="mage" class="setup-inspector-breaches" aria-label="Mage Breaches">
          <div class="setup-inspector-breach-grid">
            <div v-for="(breach, slot) in mageBreachSlots" :key="`${mage.type}-breach-slot-${slot + 1}`" class="setup-inspector-breach-slot">
              <button
                v-if="breach"
                type="button"
                class="setup-inspector-breach"
                :aria-label="breach.opened ? `Breach ${breach.index} is already open` : revealBreach(breach).opened ? `Close Breach ${breach.index}` : `Open Breach ${breach.index}`"
                :disabled="breach.opened"
                @click="toggleBreach(breach)"
              >
                <BreachArtwork
                  :breach="revealBreach(breach)"
                  :alt="`Breach ${breach.index}`"
                  :disabled="breach.opened"
                  :preview-width="315"
                  :preview-height="315"
                />
              </button>
            </div>
          </div>
        </section>

        <div class="setup-inspector-mat-area">
          <button
            v-if="mage && mageImages"
            type="button"
            class="setup-inspector-mat-scene setup-inspector-mage-mat"
            :aria-label="matFlipped ? `Show ${displayMageName(mage.type)} mat front` : `Flip ${displayMageName(mage.type)} mat to back`"
            @click="matFlipped = !matFlipped"
          >
            <span class="setup-inspector-mat-card" :class="{ flipped: matFlipped }">
              <img class="setup-inspector-mat-face" :src="mageImages.front" :alt="`${displayMageName(mage.type)} Mage mat front`" draggable="false" />
              <img class="setup-inspector-mat-face setup-inspector-mat-back" :src="mageImages.back" :alt="`${displayMageName(mage.type)} Mage mat back`" draggable="false" />
            </span>
          </button>
          <button
            v-else-if="nemesis && nemesisMatImageUrl(nemesis.type, 'front') && nemesisMatImageUrl(nemesis.type, 'back')"
            type="button"
            class="setup-inspector-mat-scene setup-inspector-nemesis-mat"
            :aria-label="matFlipped ? `Show ${nemesis.name} mat front` : `Flip ${nemesis.name} mat to back`"
            @click="matFlipped = !matFlipped"
          >
            <span class="setup-inspector-mat-card" :class="{ flipped: matFlipped }">
              <img class="setup-inspector-mat-face" :src="nemesisMatImageUrl(nemesis.type, 'front')" :alt="`${nemesis.name} mat front`" draggable="false" />
              <img class="setup-inspector-mat-face setup-inspector-mat-back" :src="nemesisMatImageUrl(nemesis.type, 'back')" :alt="`${nemesis.name} mat back`" draggable="false" />
            </span>
          </button>
        </div>
      </div>

      <div
        class="setup-inspector-zone-grid"
        :class="{
          'setup-inspector-zone-grid--mage': !!mage,
          'setup-inspector-zone-grid--nemesis': !!nemesis,
          'setup-inspector-zone-grid--nemesis-cards-only': !!nemesis && zones.length === 1,
        }"
      >
        <section
          v-if="nemesis && nemesisSubBoardFaces"
          class="setup-inspector-zone setup-inspector-sub-board-inspector"
          aria-label="Nemesis Sub-board Inspector"
          role="button"
          tabindex="0"
          @click="openSubBoardInspector"
          @keydown.enter.prevent="openSubBoardInspector"
          @keydown.space.prevent="openSubBoardInspector"
        >
          <h3>Sub-board</h3>
          <div class="setup-inspector-sub-board-thumbnail">
            <img
              :src="nemesisSubBoardFaces.normal.imageUrl"
              :alt="nemesisSubBoardFaces.normal.layout.boardName"
              draggable="false"
            />
          </div>
        </section>
        <section
          v-for="zone in zones"
          :key="zone.id"
          class="setup-inspector-zone"
          :class="{ 'setup-inspector-zone--special': zone.special }"
          :aria-label="zone.label"
          role="button"
          tabindex="0"
          @click="openZone(zone)"
          @keydown.enter.prevent="openZone(zone)"
          @keydown.space.prevent="openZone(zone)"
        >
          <h3>{{ zone.label }}</h3>
          <p v-if="zone.cards.length === 0" class="muted">No cards in this zone.</p>
          <div v-else class="setup-inspector-card-grid" @wheel="scrollDeckHorizontally" @scroll="handleDeckScroll" @pointerdown="stopDeckWheelScroll">
            <div class="setup-inspector-card-row" :class="{ 'setup-inspector-card-row--centered': zone.cards.length <= 5 }">
              <CardSurface
                v-for="(cardId, index) in zone.cards"
                :key="`${cardId}-${index}`"
                base-class="setup-inspector-card"
                size="pile"
                :card-id="cardId"
                :image-url="cardImage(cardId)"
                :image-alt="cardImageAlt(cardId)"
              />
            </div>
          </div>
        </section>
      </div>
    </main>

    <Teleport to="body">
      <ModalBase
        v-if="selectedZone"
        overlay-class="setup-inspector-deck-overlay"
        panel-class="setup-inspector-deck-modal"
        panel-aria-labelledby="setup-inspector-deck-title"
        @overlay-click="selectedZone = null"
      >
        <ModalCloseButton label="Close card zone" @close="selectedZone = null" />
        <h2 id="setup-inspector-deck-title">{{ selectedZone.label }}</h2>
        <div class="setup-inspector-deck-scroller" @wheel="scrollDeckHorizontally" @scroll="handleDeckScroll" @pointerdown="stopDeckWheelScroll">
          <div class="setup-inspector-deck-row">
            <CardHoverPreview
              v-for="(cardId, index) in selectedZone.cards"
              :key="`${selectedZone.id}-${cardId}-${index}`"
              :card-id="cardId"
              :image-url="cardImage(cardId)"
              :image-alt="cardImageAlt(cardId)"
              :preview-width="315"
              :preview-delay="500"
            >
              <button
                v-if="isQuFormCard(cardId)"
                type="button"
                class="mage-modal-flip-scene setup-inspector-form-flip-scene"
                :aria-label="`Flip ${cardImageAlt(cardId)}`"
                @click.stop="flipFormCardPreview"
              >
                <span class="mage-modal-flip-card" :class="{ flipped: isQuFormPreviewFlipped }">
                  <img
                    class="mage-modal-image mage-modal-face"
                    :src="specificDeckCardImageUrl('qu', cardId, 'giver')"
                    alt="Qu's Form Card — Giver Form"
                    draggable="false"
                  />
                  <img
                    class="mage-modal-image mage-modal-face mage-modal-face--back"
                    :src="specificDeckCardImageUrl('qu', cardId, 'taker')"
                    alt="Qu's Form Card — Taker Form"
                    draggable="false"
                  />
                </span>
              </button>
              <CardSurface
                v-else
                base-class="setup-inspector-large-card"
                size="large"
                :card-id="cardId"
                :image-url="cardImage(cardId)"
                :image-alt="cardImageAlt(cardId)"
              />
            </CardHoverPreview>
          </div>
        </div>
      </ModalBase>
      <ModalBase
        v-if="subBoardModalOpen && nemesisSubBoardFaces"
        overlay-class="setup-inspector-sub-board-overlay"
        v-model:panel-ref="subBoardModalEl"
        panel-class="mage-modal draggable-modal setup-inspector-sub-board-modal"
        :panel-style="subBoardModalStyle"
        :dragging="subBoardModalDragging"
        panel-aria-labelledby="setup-inspector-sub-board-modal-title"
        @overlay-click="closeSubBoardInspector"
        @panel-pointerdown="startSubBoardModalDrag"
      >
        <ModalCloseButton label="Close Worldsplitter Track inspector" @close="closeSubBoardInspector" />
        <button
          v-if="nemesisSubBoardFaces.canFlip"
          type="button"
          class="nemesis-sub-board-modal-frame mage-modal-flip-scene setup-inspector-sub-board-flip-frame"
          :style="{ aspectRatio: String(nemesisSubBoardFaces.normal.layout.imageSize.width / nemesisSubBoardFaces.normal.layout.imageSize.height) }"
          :aria-label="`Flip sub-board to ${subBoardFlipped ? 'normal' : 'increased difficulty'} side`"
          @click="flipSubBoard"
        >
          <span class="mage-modal-flip-card" :class="{ flipped: subBoardFlipped }">
            <img
              class="mage-modal-image mage-modal-face"
              :src="nemesisSubBoardFaces.normal.imageUrl"
              :alt="nemesisSubBoardFaces.normal.layout.boardName"
              draggable="false"
            />
            <img
              class="mage-modal-image mage-modal-face mage-modal-face--back"
              :src="nemesisSubBoardFaces.increased.imageUrl"
              :alt="nemesisSubBoardFaces.increased.layout.boardName"
              draggable="false"
            />
          </span>
        </button>
        <div
          v-else
          class="nemesis-sub-board-modal-frame setup-inspector-sub-board-static-frame"
          :style="{ aspectRatio: String(nemesisSubBoardFaces.normal.layout.imageSize.width / nemesisSubBoardFaces.normal.layout.imageSize.height) }"
        >
          <img
            class="setup-inspector-sub-board-static-image"
            :src="nemesisSubBoardFaces.normal.imageUrl"
            :alt="nemesisSubBoardFaces.normal.layout.boardName"
            draggable="false"
          />
        </div>
        <p id="setup-inspector-sub-board-modal-title" class="setup-inspector-sub-board-side">{{ activeSubBoardFace()?.layout.boardName }}</p>
      </ModalBase>
    </Teleport>
  </ModalBase>
</template>
