<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import type { NemesisCardInPlay } from '@engine/types'
import { cardImageUrl, nemesisCardBackUrl, nemesisMatImageUrl, nemesisSpecificDeckBackUrl, nemesisTokenImageUrl } from '../card-images'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import NemesisSpecificPile from './NemesisSpecificPile.vue'
import TurnOrderBar from './TurnOrderBar.vue'
import { useModalDrag } from '../game/useModalDrag'
import { getNemesisPresentation } from '../game/nemesis-presentation'
import { registerDismissibleOverlay } from '../game/dismissible-overlays'
import ModalBase from './ModalBase.vue'

const {
  state, nemesisDiscardActions, discardNemesisCard, resolveDecision,
  buyNemesisSpecificTopCard, openNemesisDeckPile, openNemesisDiscardPile,
  openNemesisSpecificPile, openNemesisSpecificDiscardPile, canActMain,
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
const pct = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`
function measureMat(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalHeight) matRatio.value = image.naturalWidth / image.naturalHeight
}
const playCards = computed(() => [...nemesis.value.playArea].sort((a, b) => a.placedAt - b.placedAt))
const damageDecision = computed(() => state.game?.pendingDecision?.kind === 'select_damage_target'
  ? state.game.pendingDecision : null)
const mainEffectDecision = computed(() => state.game?.pendingDecision?.kind === 'confirm_nemesis_effect'
  ? state.game.pendingDecision : null)
const matPreviewHeight = 840
const matPreviewWidth = computed(() => matPreviewHeight * matRatio.value)
const matSide = ref<'front' | 'back'>('front')
const matModalOpen = ref(false)
const { modalEl: matModalEl, modalStyle: matModalStyle, dragging: matDragging, startDrag: startMatDrag } = useModalDrag()

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

watch(() => state.dismissibleOverlayVersion, closeMat)

const unregisterDismissibleOverlay = registerDismissibleOverlay(() => {
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

    <div class="nemesis-board">
      <div class="nemesis-info-bar" role="region" aria-label="Nemesis Info Bar">
        <div class="nemesis-info-region nemesis-info-nemesis" aria-label="Nemesis Info">
          <div v-if="Object.keys(nemesis.counters).length > 0" class="nemesis-info-counters" aria-label="Token Info">
            <span v-for="(value, name) in nemesis.counters" :key="name" class="nemesis-info-token" :title="`${name} tokens`">
              <img v-if="nemesisTokenImageUrl(nemesis.type, String(name))" :src="nemesisTokenImageUrl(nemesis.type, String(name))" :alt="`${name} token`" draggable="false" />
              <span v-else>{{ name }}</span>
              <strong>{{ value }}</strong>
            </span>
          </div>
          <div class="hp-block">
            <span class="hp-name">Nemesis</span>
            <div class="hpbar nemesis"><i :style="{ width: pct(nemesis.hp / nemesis.maxHp) }" /></div>
            <span class="hp-num"><b>{{ nemesis.hp }}</b>/{{ nemesis.maxHp }}</span>
          </div>
        </div>
        <div class="nemesis-info-region nemesis-info-turn-order" aria-label="Turn Order Cards">
          <TurnOrderBar />
        </div>
        <div class="nemesis-info-region nemesis-info-gravehold" aria-label="Gravehold Info">
          <div class="hp-block">
            <span class="hp-name">Gravehold</span>
            <div class="hpbar grave"><i :style="{ width: pct(state.game!.gravehold.hp / state.game!.gravehold.maxHp) }" /></div>
            <span class="hp-num"><b>{{ state.game!.gravehold.hp }}</b>/{{ state.game!.gravehold.maxHp }}</span>
          </div>
        </div>
      </div>

      <div class="nemesis-board-lower">
        <div class="nemesis-pile-column" aria-label="Nemesis discard piles">
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" :class="{ 'is-unavailable': !presentation.specificDiscard.enabled }" :aria-label="`Open ${presentation.specificDiscard.label}`" :title="presentation.specificDiscard.label" @click="openNemesisSpecificDiscardPile">
            <CardHoverPreview v-if="presentation.specificDiscard.enabled && nemesis.strikeDiscard[0]" :card-id="nemesis.strikeDiscard[0]">
              <CardSurface base-class="nemesis-pile-card" size="pile" :card-id="nemesis.strikeDiscard[0]" />
            </CardHoverPreview>
            <span v-else class="nemesis-pile-placeholder">{{ presentation.specificDiscard.enabled ? `${presentation.specificDiscard.label} 0` : 'Not used' }}</span>
            <span v-if="presentation.specificDiscard.enabled && nemesis.strikeDiscard.length > 0" class="nemesis-pile-count">{{ nemesis.strikeDiscard.length }}</span>
          </button>
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" aria-label="Open Nemesis Discard" title="Nemesis Discard" @click="openNemesisDiscardPile">
            <CardHoverPreview v-if="nemesis.discard[0]" :card-id="nemesis.discard[0]">
              <CardSurface base-class="nemesis-pile-card" size="pile" :card-id="nemesis.discard[0]" />
            </CardHoverPreview>
            <span v-else class="nemesis-pile-placeholder">Nemesis Discard 0</span>
            <span v-if="nemesis.discard.length > 0" class="nemesis-pile-count">{{ nemesis.discard.length }}</span>
          </button>
        </div>

        <div class="nemesis-pile-column" aria-label="Nemesis decks">
          <NemesisSpecificPile
            :label="presentation.specificDeck.label"
            :enabled="presentation.specificDeck.enabled"
            :card-count="nemesis.strikeDeck.length"
            :back-image-url="nemesisSpecificDeckBackUrl(nemesis.type)"
            :display="presentation.specificDeck.display"
            :top-card-id="specificTopCard ?? undefined"
            :action-label="specificTopCardActionLabel"
            :action-enabled="canActivateSpecificTopCard"
            @activate="activateSpecificTopCard"
            @inspect="openNemesisSpecificPile"
          />
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" aria-label="Open Nemesis Deck" title="Nemesis Deck" @click="openNemesisDeckPile">
            <CardSurface v-if="nemesis.deck.length > 0" base-class="nemesis-pile-card" size="pile" :image-url="nemesisCardBackUrl()" image-alt="Nemesis Deck card back" />
            <span v-else class="nemesis-pile-placeholder">Nemesis Deck 0</span>
            <span v-if="nemesis.deck.length > 0" class="nemesis-pile-count">{{ nemesis.deck.length }}</span>
          </button>
        </div>

        <section v-if="presentation.subBoard.enabled" class="nemesis-sub-board" aria-label="Nemesis Sub Board" :style="{ '--sub-board-ratio': presentation.subBoard.aspectRatio }">
          <img v-if="presentation.subBoard.imageUrl" :src="presentation.subBoard.imageUrl" alt="Nemesis Sub Board" draggable="false" />
          <span v-else class="nemesis-section-title">Nemesis Sub Board</span>
        </section>

        <section class="nemesis-play" aria-label="Nemesis Cards in Play">
          <div class="nemesis-play-top" aria-hidden="true"></div>
          <div v-if="playCards.length > 0" ref="playScroll" class="nemesis-play-row nemesis-card-scroll">
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
        </section>
      </div>
    </div>

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

  </div>
</template>
