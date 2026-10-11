<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import type { NemesisCardDef, NemesisCardInPlay } from '@engine/types'
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
const specificDeckCardCount = computed(() => nemesis.value.type === 'crooked_mask'
  ? nemesis.value.corruptionDeck?.length ?? 0
  : nemesis.value.strikeDeck.length)
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
const stationedCards = computed(() => {
  const cards = [...(nemesis.value.setAsideCards ?? [])]
  const resetCardId = nemesis.value.turnOrderDeckResetCardId
  if (resetCardId && !cards.some(card => card.cardId === resetCardId &&
    (!nemesis.value.turnOrderDeckResetCardInstanceId ||
      card.instanceId === nemesis.value.turnOrderDeckResetCardInstanceId))) {
    cards.push({
      cardId: resetCardId,
      cardType: 'power',
      placedAt: -1,
      instanceId: nemesis.value.turnOrderDeckResetCardInstanceId ?? `stationed:${resetCardId}`,
    })
  }
  return cards.sort((a, b) => a.placedAt - b.placedAt)
})
function isStationedNemesisCard(card: NemesisCardInPlay): boolean {
  return stationedCards.value.some(stationed => stationed.cardId === card.cardId &&
    (stationed.instanceId?.startsWith('stationed:') ||
      nemesisCardInstanceId(stationed) === nemesisCardInstanceId(card)))
}
const playCards = computed(() => [...nemesis.value.playArea]
  .filter(card => !isStationedNemesisCard(card))
  .sort((a, b) => a.placedAt - b.placedAt))
const damageDecision = computed(() => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'select_damage_target' || decision?.kind === 'allocate_divided_damage'
    ? decision
    : null
})
const dividedDamageDecision = computed(() => damageDecision.value?.kind === 'allocate_divided_damage'
  ? damageDecision.value : null)
const dividedDamageAllocation = computed(() => state.game?.pendingEffect?.dividedDamageAllocation ?? null)
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

function dividedDamageAssigned(targetId: string): number {
  return state.game?.pendingEffect?.dividedDamageAllocation?.amounts[targetId] ?? 0
}

function minionTargetId(placedAt: number): string {
  return `minion:${placedAt}`
}

function chooseDamageTarget(targetId: string) {
  if (dividedDamageDecision.value) {
    resolveDecision({ kind: 'allocate_divided_damage', action: 'add', targetId })
    return
  }
  const target = damageDecision.value?.targets.find(candidate => candidate.id === targetId)
  if (target && damageDecision.value?.kind === 'select_damage_target') {
    resolveDecision({ kind: 'select_damage_target', target })
  }
}

function cancelDamageTarget(targetId: string, event: MouseEvent) {
  if (!dividedDamageDecision.value) return
  event.preventDefault()
  event.stopPropagation()
  resolveDecision({ kind: 'allocate_divided_damage', action: 'remove', targetId })
}

function isMainEffectTarget(instanceId: string): boolean {
  return mainEffectDecision.value?.instanceId === instanceId
}

function confirmMainEffect(card: NemesisCardInPlay) {
  if (!mainEffectDecision.value || !isMainEffectTarget(card.instanceId ?? `${card.cardId}:${card.placedAt}`)) return
  resolveDecision({ kind: 'confirm_nemesis_effect', accepted: true })
}

function nemesisCardInstanceId(card: NemesisCardInPlay): string {
  return card.instanceId ?? `${card.cardId}:${card.placedAt}`
}

function isEndTurnActionCard(card: NemesisCardInPlay): boolean {
  return state.endTurnActionHint?.targetId === `nemesis-card:${nemesisCardInstanceId(card)}`
}

function activateNemesisCard(card: NemesisCardInPlay) {
  const targetId = minionTargetId(card.placedAt)
  if (isDamageTarget(targetId)) {
    chooseDamageTarget(targetId)
    return
  }
  if (isMainEffectTarget(card.instanceId ?? `${card.cardId}:${card.placedAt}`)) {
    confirmMainEffect(card)
    return
  }
  if (nemesisDiscardActions.value.some(action => action.instanceId === nemesisCardInstanceId(card))) {
    discardAction(card)
  }
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
  const action = nemesisDiscardActions.value.find(item => item.instanceId === nemesisCardInstanceId(card))
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

function nemesisTokenCounter(card: NemesisCardInPlay): string | null {
  if (card.cardType !== 'minion') return null
  const definition = getCard(card.cardId) as NemesisCardDef
  if (definition.nemesisTokens == null) return null
  return `Token ${card.nemesisTokens ?? card.powerTokens ?? definition.nemesisTokens}`
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
        <button
          class="nemesis-mat-wrap game-highlight"
          :class="{
            'damage-target': isDamageTarget('nemesis'),
            'game-highlight--choice': isDamageTarget('nemesis'),
          }"
          :aria-label="`Open ${nemesis.name} mat`"
          @click="isDamageTarget('nemesis') ? chooseDamageTarget('nemesis') : openMat()"
          @contextmenu="cancelDamageTarget('nemesis', $event)"
        >
          <img class="nemesis-mat-image" :src="nemesisMatImageUrl(nemesis.type, 'front')" :alt="`${nemesis.name} mat`" draggable="false" @load="measureMat" />
          <span v-if="dividedDamageAssigned('nemesis') > 0" class="damage-allocation-badge" :aria-label="`${dividedDamageAssigned('nemesis')} damage assigned`">−{{ dividedDamageAssigned('nemesis') }}</span>
        </button>
      </CardHoverPreview>
      <div v-else class="nemesis-mat-wrap"><div class="nemesis-mat-fallback">{{ nemesis.name }}</div></div>

    </section>

    <div class="nemesis-board">
      <div class="nemesis-board-upper">
        <div class="nemesis-pile-column" aria-label="Nemesis discard piles">
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" :class="{ 'is-unavailable': !presentation.specificDiscard.enabled, 'is-empty': !presentation.specificDiscard.enabled || nemesis.strikeDiscard.length === 0 }" :aria-disabled="!presentation.specificDiscard.enabled || nemesis.strikeDiscard.length === 0" :aria-label="`Open ${presentation.specificDiscard.label}`" :title="presentation.specificDiscard.label" @click="openNemesisSpecificDiscardPile">
            <CardHoverPreview v-if="presentation.specificDiscard.enabled && nemesis.strikeDiscard[0]" :card-id="nemesis.strikeDiscard[0]">
              <CardSurface base-class="nemesis-pile-card" size="pile" :card-id="nemesis.strikeDiscard[0]" />
            </CardHoverPreview>
            <span v-else class="nemesis-pile-placeholder">{{ presentation.specificDiscard.enabled ? `${presentation.specificDiscard.label} 0` : 'Not used' }}</span>
            <span v-if="presentation.specificDiscard.enabled && nemesis.strikeDiscard.length > 0" class="nemesis-pile-count">{{ nemesis.strikeDiscard.length }}</span>
          </button>
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" :class="{ 'is-empty': nemesis.discard.length === 0 }" :aria-disabled="nemesis.discard.length === 0" aria-label="Open Nemesis Discard" title="Nemesis Discard" @click="openNemesisDiscardPile">
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
            :card-count="specificDeckCardCount"
            :back-image-url="nemesisSpecificDeckBackUrl(nemesis.type)"
            :flight-source="nemesis.type === 'crooked_mask' ? 'corruption-deck' : 'nemesis-specific-deck'"
            :display="presentation.specificDeck.display"
            :top-card-id="specificTopCard ?? undefined"
            :action-label="specificTopCardActionLabel"
            :action-enabled="canActivateSpecificTopCard"
            @activate="activateSpecificTopCard"
            @inspect="openNemesisSpecificPile"
          />
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" :class="{ 'is-empty': nemesis.deck.length === 0 }" :aria-disabled="nemesis.deck.length === 0" aria-label="Open Nemesis Deck" title="Nemesis Deck" @click="openNemesisDeckPile">
            <CardSurface v-if="nemesis.deck.length > 0" data-nemesis-deck-pile="true" base-class="nemesis-pile-card" size="pile" :image-url="nemesisCardBackUrl()" image-alt="Nemesis Deck card back" />
            <span v-else class="nemesis-pile-placeholder">Nemesis Deck 0</span>
            <span v-if="nemesis.deck.length > 0" class="nemesis-pile-count">{{ nemesis.deck.length }}</span>
          </button>
        </div>

        <section v-if="presentation.subBoard.enabled" class="nemesis-sub-board" aria-label="Nemesis Sub Board" :style="{ '--sub-board-ratio': presentation.subBoard.aspectRatio }">
          <img v-if="presentation.subBoard.imageUrl" :src="presentation.subBoard.imageUrl" alt="Nemesis Sub Board" draggable="false" />
          <span v-else class="nemesis-section-title">Nemesis Sub Board</span>
        </section>

        <section class="nemesis-play" aria-label="Nemesis Cards in Play">
          <div class="nemesis-play-top" aria-label="Nemesis cards set aside">
            <CardHoverPreview
              v-for="card in stationedCards"
              :key="nemesisCardInstanceId(card)"
              :card-id="card.cardId"
              :preview-width="210"
              :preview-height="291.02"
            >
              <div class="nemesis-play-card nemesis-stationed-card" :aria-label="`${getCard(card.cardId).name}, set aside`">
                <img v-if="cardImageUrl(card.cardId)" :src="cardImageUrl(card.cardId)" :alt="getCard(card.cardId).name" draggable="false" />
                <div v-else class="nemesis-card-fallback">{{ getCard(card.cardId).name }}</div>
              </div>
            </CardHoverPreview>
            <div v-if="dividedDamageDecision && dividedDamageAllocation" class="divided-damage-instructions" role="status" aria-live="polite">
              <strong>Damage assigned: {{ dividedDamageAllocation.total - dividedDamageAllocation.remaining }}/{{ dividedDamageAllocation.total }}</strong>
              <span>Left-click to assign unassigned damage. Right-click to cancel 1 damage. Click the casting spell again to resolve.</span>
            </div>
          </div>
          <div v-if="playCards.length > 0" ref="playScroll" class="nemesis-play-row nemesis-card-scroll">
            <div class="nemesis-card-track">
              <CardHoverPreview v-for="card in playCards" :key="nemesisCardInstanceId(card)" :card-id="card.cardId" :preview-width="210" :preview-height="291.02">
                <div class="nemesis-play-card game-highlight" :data-damage-target="card.cardType === 'minion' ? minionTargetId(card.placedAt) : undefined" :data-main-action-id="isEndTurnActionCard(card) ? `nemesis-card:${nemesisCardInstanceId(card)}` : undefined" :class="[`nemesis-${card.cardType}`, { discardable: nemesisDiscardActions.some(action => action.instanceId === nemesisCardInstanceId(card)), 'damage-target': isDamageTarget(minionTargetId(card.placedAt)), 'effect-target': isMainEffectTarget(nemesisCardInstanceId(card)), 'game-highlight--available': nemesisDiscardActions.some(action => action.instanceId === nemesisCardInstanceId(card)), 'game-highlight--choice': isDamageTarget(minionTargetId(card.placedAt)), 'game-highlight--required': isMainEffectTarget(nemesisCardInstanceId(card)), 'end-turn-attention': isEndTurnActionCard(card) }]" @click="activateNemesisCard(card)" @contextmenu="cancelDamageTarget(minionTargetId(card.placedAt), $event)">
                  <img v-if="cardImageUrl(card.cardId)" :src="cardImageUrl(card.cardId)" :alt="getCard(card.cardId).name" draggable="false" />
                  <div v-else class="nemesis-card-fallback">{{ getCard(card.cardId).name }}</div>
                  <span v-if="dividedDamageAssigned(minionTargetId(card.placedAt)) > 0" class="damage-allocation-badge" :aria-label="`${dividedDamageAssigned(minionTargetId(card.placedAt))} damage assigned`">−{{ dividedDamageAssigned(minionTargetId(card.placedAt)) }}</span>
                  <span v-if="nemesisTokenCounter(card)" class="nemesis-card-counter nemesis-card-token-counter">{{ nemesisTokenCounter(card) }}</span>
                  <div class="nemesis-card-meta"><span v-if="cardCounter(card)" class="nemesis-card-counter">{{ cardCounter(card) }}</span></div>
                </div>
              </CardHoverPreview>
            </div>
          </div>
        </section>
      </div>

      <div class="nemesis-info-bar" role="region" aria-label="Nemesis Info Bar">
        <div class="nemesis-info-region nemesis-info-nemesis" aria-label="Nemesis Info">
          <div v-if="Object.keys(nemesis.counters).length > 0" class="nemesis-info-counters" aria-label="Token Info">
            <span v-for="(value, name) in nemesis.counters" :key="name" class="nemesis-info-token" :title="`${name} tokens`">
              <img v-if="nemesisTokenImageUrl(nemesis.type, String(name))" :src="nemesisTokenImageUrl(nemesis.type, String(name))" :alt="`${name} token`" draggable="false" />
              <span v-else>{{ name }}</span>
              <strong>{{ value }}</strong>
            </span>
          </div>
          <div class="hp-block" data-damage-target="nemesis">
            <span class="hp-name">Nemesis</span>
            <div class="hpbar nemesis"><i :style="{ width: pct(nemesis.hp / nemesis.maxHp) }" /></div>
            <span class="hp-num"><b>{{ nemesis.hp }}</b>/{{ nemesis.maxHp }}</span>
          </div>
        </div>
        <div class="nemesis-info-region nemesis-info-turn-order" aria-label="Turn Order Cards">
          <TurnOrderBar />
        </div>
        <div class="nemesis-info-region nemesis-info-gravehold" aria-label="Gravehold Info">
          <div class="hp-block" data-damage-target="gravehold">
            <span class="hp-name">Gravehold</span>
            <div class="hpbar grave"><i :style="{ width: pct(state.game!.gravehold.hp / state.game!.gravehold.maxHp) }" /></div>
            <span class="hp-num"><b>{{ state.game!.gravehold.hp }}</b>/{{ state.game!.gravehold.maxHp }}</span>
          </div>
        </div>
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
