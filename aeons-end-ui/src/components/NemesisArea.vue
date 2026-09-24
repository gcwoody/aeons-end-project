<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import type { NemesisCardInPlay } from '@engine/types'
import { cardImageUrl, nemesisMatImageUrl } from '../card-images'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import NemesisSpecificPile from './NemesisSpecificPile.vue'
import { chunkCards } from '../game/pile-layout'
import { useModalDrag } from '../game/useModalDrag'
import { getNemesisPresentation } from '../game/nemesis-presentation'
import { registerDismissibleOverlay } from '../game/dismissible-overlays'
import ModalBase from './ModalBase.vue'

const {
  state, nemesisDiscardActions, discardNemesisCard, resolveDecision,
  buyNemesisSpecificTopCard, openNemesisSpecificPile, openNemesisSpecificDiscardPile, canActMain,
} = useGame()
const nemesis = computed(() => state.game!.nemesis)
const presentation = computed(() => getNemesisPresentation(nemesis.value.type))
const specificTopCard = computed(() => presentation.value.specificDeck.display === 'face_up'
  ? nemesis.value.strikeDeck[0] ?? null
  : null)
const canActivateSpecificTopCard = computed(() =>
  presentation.value.specificDeck.topCardAction === 'buy' && !!specificTopCard.value && canActMain.value)
const specificTopCardActionLabel = computed(() => {
  if (presentation.value.specificDeck.topCardAction !== 'buy' || !specificTopCard.value) return undefined
  return `Buy ${getCard(specificTopCard.value).name} from the ${presentation.value.specificDeck.label}`
})
const matRatio = ref(1036 / 1384)
function measureMat(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalHeight) matRatio.value = image.naturalWidth / image.naturalHeight
}
const playCards = computed(() => [...nemesis.value.playArea].sort((a, b) => a.placedAt - b.placedAt))
const discardCards = computed(() => nemesis.value.discard)
const discardRows = computed(() => chunkCards(discardCards.value))
const discardColumns = computed(() => Math.max(1, Math.min(5, Math.max(0, ...discardRows.value.map(row => row.length)))))
const damageDecision = computed(() => state.game?.pendingDecision?.kind === 'select_damage_target'
  ? state.game.pendingDecision : null)
const mainEffectDecision = computed(() => state.game?.pendingDecision?.kind === 'confirm_nemesis_effect'
  ? state.game.pendingDecision : null)
const matPreviewHeight = 840
const matPreviewWidth = computed(() => matPreviewHeight * matRatio.value)
const matSide = ref<'front' | 'back'>('front')
const matModalOpen = ref(false)
const discardModalOpen = ref(false)
const { modalEl: matModalEl, modalStyle: matModalStyle, dragging: matDragging, startDrag: startMatDrag } = useModalDrag()
const { modalEl: discardModalEl, modalStyle: discardModalStyle, dragging: discardDragging, startDrag: startDiscardDrag } = useModalDrag()

const playScroll = ref<HTMLElement | null>(null)
let scrollTarget = 0
let scrollFrame: number | null = null

function animatePlayScroll() {
  const element = playScroll.value
  if (!element) { scrollFrame = null; return }
  const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
  scrollTarget = Math.max(0, Math.min(scrollTarget, maxScroll))
  const distance = scrollTarget - element.scrollLeft
  if (Math.abs(distance) < 0.5) {
    element.scrollLeft = scrollTarget
    scrollFrame = null
    return
  }
  element.scrollLeft += distance * 0.2
  scrollFrame = requestAnimationFrame(animatePlayScroll)
}

function handlePlayWheel(event: WheelEvent) {
  const element = event.target instanceof Element
    ? event.target.closest<HTMLElement>('.nemesis-card-scroll') : null
  if (!element || element !== playScroll.value || element.scrollWidth <= element.clientWidth || event.deltaY === 0) return
  event.preventDefault()
  event.stopPropagation()
  if (scrollFrame === null) scrollTarget = element.scrollLeft
  const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
  scrollTarget = Math.max(0, Math.min(maxScroll, scrollTarget + event.deltaY * 1.1))
  if (scrollFrame === null) scrollFrame = requestAnimationFrame(animatePlayScroll)
}

function openMat() {
  if (damageDecision.value) return
  matSide.value = 'front'
  matModalOpen.value = true
}

function isDamageTarget(targetId: string): boolean {
  return damageDecision.value?.targets.some(target => target.id === targetId) ?? false
}

function chooseDamageTarget(targetId: string) {
  const target = damageDecision.value?.targets.find(candidate => candidate.id === targetId)
  if (target) resolveDecision({ kind: 'select_damage_target', target })
}

function isMainEffectTarget(instanceId: string): boolean {
  return mainEffectDecision.value?.instanceId === instanceId
}

function confirmMainEffect(card: NemesisCardInPlay) {
  if (!mainEffectDecision.value || !isMainEffectTarget(card.instanceId ?? `${card.cardId}:${card.placedAt}`)) return
  resolveDecision({ kind: 'confirm_nemesis_effect', accepted: true })
}

function closeMat() { matModalOpen.value = false }
function closeDiscard() { discardModalOpen.value = false }

watch(() => state.dismissibleOverlayVersion, () => {
  closeMat()
  closeDiscard()
})

const unregisterDismissibleOverlay = registerDismissibleOverlay(() => {
  if (discardModalOpen.value) {
    closeDiscard()
    return true
  }
  if (matModalOpen.value) {
    closeMat()
    return true
  }
  return false
})
onBeforeUnmount(unregisterDismissibleOverlay)

function discardAction(card: NemesisCardInPlay) {
  const action = nemesisDiscardActions.value.find(item => item.instanceId === card.instanceId)
  if (action) discardNemesisCard(action.instanceId)
}

function activateSpecificTopCard() {
  if (canActivateSpecificTopCard.value) buyNemesisSpecificTopCard()
}

function cardCounter(card: NemesisCardInPlay): string | null {
  if (card.cardType === 'minion' && card.lifeTokens != null) return `Life ${card.lifeTokens}`
  if (card.cardType === 'power' && card.powerTokens != null) return `Power ${card.powerTokens}`
  return null
}

onMounted(() => window.addEventListener('wheel', handlePlayWheel, { capture: true, passive: false }))
onBeforeUnmount(() => {
  window.removeEventListener('wheel', handlePlayWheel, true)
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <div class="nemesis-area" :style="{ '--nemesis-mat-ratio': matRatio }">
    <section class="nemesis-mat-column" aria-label="Nemesis Mainboard">
      <CardHoverPreview
        v-if="nemesisMatImageUrl(nemesis.type, 'front')"
        :image-url="nemesisMatImageUrl(nemesis.type, 'front')"
        :image-alt="`${nemesis.name} mat`"
        :preview-width="matPreviewWidth"
        :preview-height="matPreviewHeight"
        :preview-delay="200"
        image-object-fit="contain"
        preview-class="nemesis-mat-preview"
      >
        <button class="nemesis-mat-wrap" :class="{ 'damage-target': isDamageTarget('nemesis') }" :aria-label="`Open ${nemesis.name} mat`" @click="isDamageTarget('nemesis') ? chooseDamageTarget('nemesis') : openMat()">
          <img class="nemesis-mat-image" :src="nemesisMatImageUrl(nemesis.type, 'front')" :alt="`${nemesis.name} mat`" draggable="false" @load="measureMat" />
        </button>
      </CardHoverPreview>
      <div v-else class="nemesis-mat-wrap"><div class="nemesis-mat-fallback">{{ nemesis.name }}</div></div>

    </section>

    <section v-if="presentation.subBoard.enabled" class="nemesis-sub-board" aria-label="Nemesis Sub Board" :style="{ '--sub-board-ratio': presentation.subBoard.aspectRatio }">
      <img v-if="presentation.subBoard.imageUrl" :src="presentation.subBoard.imageUrl" alt="Nemesis Sub Board" draggable="false" />
      <span v-else class="nemesis-section-title">Nemesis Sub Board</span>
    </section>

    <section class="nemesis-content-column">
      <div class="nemesis-assets-row">
        <div class="nemesis-asset fury-asset" aria-label="Token Info">
          <span class="nemesis-section-title">Token Info</span>
          <div v-for="(value, name) in nemesis.counters" :key="name" class="nemesis-token"><span>{{ name }}</span><strong>{{ value }}</strong></div>
        </div>
        <div class="nemesis-asset" aria-label="Nemesis Deck">
          <span class="nemesis-section-title">Nemesis Deck</span><strong>{{ nemesis.deck.length }}</strong>
        </div>
        <button class="nemesis-asset nemesis-discard-button" aria-label="Open Nemesis Discard" @click="discardModalOpen = true">
          <span class="nemesis-section-title">Nemesis Discard</span><strong>{{ nemesis.discard.length }}</strong>
        </button>
        <NemesisSpecificPile
          :label="presentation.specificDeck.label"
          :enabled="presentation.specificDeck.enabled"
          :card-count="nemesis.strikeDeck.length"
          :display="presentation.specificDeck.display"
          :top-card-id="specificTopCard ?? undefined"
          :action-label="specificTopCardActionLabel"
          :action-enabled="canActivateSpecificTopCard"
          @activate="activateSpecificTopCard"
          @inspect="openNemesisSpecificPile"
        />
        <button
          v-if="presentation.specificDiscard.enabled"
          class="nemesis-asset nemesis-discard-button"
          :aria-label="`Open ${presentation.specificDiscard.label}`"
          @click="openNemesisSpecificDiscardPile"
        >
          <span class="nemesis-section-title">{{ presentation.specificDiscard.label }}</span>
          <strong>{{ nemesis.strikeDiscard.length }}</strong>
        </button>
        <div v-else class="nemesis-asset is-unavailable" aria-label="Nemesis Specific Discard">
          <span class="nemesis-section-title">{{ presentation.specificDiscard.label }}</span>
          <span class="asset-subtext">Not used</span>
        </div>
      </div>

      <div class="nemesis-play">
        <div v-if="playCards.length === 0" class="empty">— empty —</div>
        <div v-else ref="playScroll" class="nemesis-card-scroll">
          <div class="nemesis-card-track">
            <CardHoverPreview v-for="card in playCards" :key="card.instanceId ?? `${card.cardId}:${card.placedAt}`" :card-id="card.cardId" :preview-width="210" :preview-height="315">
              <div class="nemesis-play-card" :class="[`nemesis-${card.cardType}`, { discardable: nemesisDiscardActions.some(action => action.instanceId === card.instanceId), 'damage-target': isDamageTarget(`minion:${card.placedAt}`), 'effect-target': isMainEffectTarget(card.instanceId ?? `${card.cardId}:${card.placedAt}`) }]" @click="isDamageTarget(`minion:${card.placedAt}`) ? chooseDamageTarget(`minion:${card.placedAt}`) : confirmMainEffect(card)">
                <img v-if="cardImageUrl(card.cardId)" :src="cardImageUrl(card.cardId)" :alt="getCard(card.cardId).name" draggable="false" />
                <div v-else class="nemesis-card-fallback">{{ getCard(card.cardId).name }}</div>
                <div class="nemesis-card-meta"><span>{{ cardCounter(card) }}</span><button v-if="nemesisDiscardActions.some(action => action.instanceId === card.instanceId)" class="btn small" data-card-preview-disabled @click.stop="discardAction(card)">To Discard</button></div>
              </div>
            </CardHoverPreview>
          </div>
        </div>
      </div>
    </section>

    <ModalBase
      v-if="matModalOpen"
      overlay-class="mage-overlay"
      v-model:panel-ref="matModalEl"
      panel-class="mage-modal draggable-modal"
      :panel-style="matModalStyle"
      :dragging="matDragging"
      @overlay-click="closeMat"
      @panel-pointerdown="startMatDrag"
    >
        <div class="mage-modal-frame nemesis-mat-modal-frame">
          <img class="mage-modal-image" :src="nemesisMatImageUrl(nemesis.type, matSide)" :alt="`${nemesis.name} mat ${matSide}`" draggable="false" />
        </div>
        <div class="overlay-actions">
          <button class="btn" @click="matSide = matSide === 'front' ? 'back' : 'front'">{{ matSide === 'front' ? 'Flip to Back' : 'Show Front' }}</button>
          <button class="btn" @click="closeMat">Close</button>
        </div>
    </ModalBase>

    <ModalBase
      v-if="discardModalOpen"
      overlay-class="decision-overlay"
      v-model:panel-ref="discardModalEl"
      panel-class="pile-modal pile-modal-no-labels draggable-modal"
      :panel-style="{ ...discardModalStyle, '--pile-columns': discardColumns }"
      :dragging="discardDragging"
      @overlay-click="closeDiscard"
      @panel-pointerdown="startDiscardDrag"
    >
        <h3>Nemesis Discard <span class="muted">(top → bottom)</span></h3>
        <div v-if="discardCards.length === 0" class="empty">— empty —</div>
        <div v-else class="pile-rows" :style="{ '--pile-columns': discardColumns }">
          <div v-for="(group, rowIndex) in discardRows" :key="rowIndex" class="pile-row">
            <CardHoverPreview v-for="(cardId, cardIndex) in group" :key="`${cardId}:${cardIndex}`" :card-id="cardId">
              <div class="pile-card" :class="{ 'pile-card-image': cardImageUrl(cardId) }">
                <img v-if="cardImageUrl(cardId)" :src="cardImageUrl(cardId)" :alt="getCard(cardId).name" />
                <span v-else>{{ getCard(cardId).name }}</span>
              </div>
            </CardHoverPreview>
          </div>
        </div>
        <button class="btn" @click="closeDiscard">Close</button>
    </ModalBase>
  </div>
</template>
