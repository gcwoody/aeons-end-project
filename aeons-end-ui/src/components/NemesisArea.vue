<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard, getNemesisDefinition } from '@engine/data'
import { canPlaceNemesisSubBoardToken, getSpendableAether, isNemesisVulnerable } from '@engine/engine'
import type { NemesisCardDef, NemesisCardInPlay } from '@engine/types'
import { compareNemesisCardsInRow } from '@engine/engine/nemesis-card-order'
import { cardImageUrl, nemesisCardBackUrl, nemesisMatImageUrl, nemesisSpecificDeckBackUrl, nemesisTokenImageUrl } from '../card-images'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import AttachedQuarterCard from './AttachedQuarterCard.vue'
import NemesisSpecificPile from './NemesisSpecificPile.vue'
import NemesisSubBoard from './NemesisSubBoard.vue'
import TurnOrderBar from './TurnOrderBar.vue'
import { useModalDrag } from '../game/useModalDrag'
import { getNemesisPresentation } from '../game/nemesis-presentation'
import { registerDismissibleOverlay } from '../game/dismissible-overlays'
import ModalBase from './ModalBase.vue'
import ModalCloseButton from './ModalCloseButton.vue'

const {
  state, nemesisDiscardActions, discardNemesisCard, resolveDecision,
  buyNemesisSpecificTopCard, openNemesisDeckPile, openNemesisDiscardPile,
  openNemesisSpecificPile, openNemesisSpecificDiscardPile, canActMain,
  placeNemesisSubBoardToken,
} = useGame()
const nemesis = computed(() => state.game!.nemesis)
const nemesisVulnerable = computed(() => isNemesisVulnerable(state.game!))
const hasUnlimitedNemesisLife = computed(() => getNemesisDefinition(nemesis.value.definitionId)?.noLifeMaximum === true)
const nemesisLifeBarMaximum = computed(() =>
  getNemesisDefinition(nemesis.value.definitionId)?.lifeLossThreshold ?? nemesis.value.maxHp,
)
const presentation = computed(() => getNemesisPresentation(nemesis.value.type, nemesis.value.difficulty))
const subBoardTokens = computed(() => nemesis.value.subBoardTokens ?? [])
const availableSubBoardRegionIds = computed(() => {
  const game = state.game
  const layout = presentation.value.subBoard.layout
  if (!game || !layout || !canActMain.value) return []
  return layout.regions
    .filter(region => canPlaceNemesisSubBoardToken(game, state.selectedPlayer, 'nemesis', region.id))
    .map(region => region.id)
})
const subBoardRegionDecision = computed(() => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'choose_one' && decision.layout === 'sub-board-region-choice' &&
    decision.options.some(option => !!option.regionId)
    ? decision
    : null
})
const selectableSubBoardRegionIds = computed(() => subBoardRegionDecision.value?.options
  .flatMap(option => !option.disabled && option.regionId ? [option.regionId] : []) ?? [])
const strikeDeckDisplay = computed(() => state.cardPileDisplayOverrides['nemesis:strike_deck'])
const specificTopCard = computed(() => {
  if (presentation.value.specificDeck.display !== 'face_up') return null
  return strikeDeckDisplay.value?.topCardId !== undefined
    ? strikeDeckDisplay.value.topCardId
    : nemesis.value.strikeDeck[0] ?? null
})
const specificDiscardTopCard = computed(() => {
  const display = state.cardPileDisplayOverrides['nemesis:strike_discard']
  return display?.topCardId !== undefined ? display.topCardId : nemesis.value.strikeDiscard[0] ?? null
})
const specificDiscardTopInstanceId = computed(() => nemesis.value.strikeDiscardInstanceIds?.[0] ?? '')
const nemesisDiscardTopCard = computed(() => {
  const display = state.cardPileDisplayOverrides['nemesis:nemesis_discard']
  return display?.topCardId !== undefined ? display.topCardId : nemesis.value.discard[0] ?? null
})
const nemesisDiscardTopInstanceId = computed(() => nemesis.value.discardInstanceIds?.[0] ?? '')
const specificDeckCardCount = computed(() => nemesis.value.type === 'crooked_mask'
  ? state.cardPileDisplayOverrides['nemesis:corruption_deck']?.count ?? nemesis.value.corruptionDeck?.length ?? 0
  : strikeDeckDisplay.value?.count ?? nemesis.value.strikeDeck.length)
const specificDiscardCount = computed(() =>
  state.cardPileDisplayOverrides['nemesis:strike_discard']?.count ?? nemesis.value.strikeDiscard.length,
)
const nemesisDiscardCount = computed(() =>
  state.cardPileDisplayOverrides['nemesis:nemesis_discard']?.count ?? nemesis.value.discard.length,
)
const nemesisDeckCount = computed(() =>
  state.cardPileDisplayOverrides['nemesis:nemesis_deck']?.count ?? nemesis.value.deck.length,
)
const canActivateSpecificTopCard = computed(() =>
  presentation.value.specificDeck.topCardAction === 'buy' && !!specificTopCard.value && canActMain.value &&
  (!presentation.value.specificDeck.primaryActionOnCard || specificTopCardAffordable.value))
const specificTopCardAffordable = computed(() => {
  const game = state.game
  const cardId = specificTopCard.value
  const player = game?.players.find(candidate => candidate.id === state.selectedPlayer)
  if (!game || !cardId || !player) return false
  const card = getCard(cardId)
  const spendType = card.type === 'gem' || card.type === 'spell' || card.type === 'relic' ? card.type : 'general'
  const cost = card.cost + (game.nemesis.type === 'the_timeless' ? 1 : 0)
  return getSpendableAether(player, spendType) >= cost
})
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
  cards.push(...nemesis.value.playArea.filter(card => card.displayRow === 'top'))
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
  return cards.sort(compareNemesisCardsInRow)
})
function isStationedNemesisCard(card: NemesisCardInPlay): boolean {
  return stationedCards.value.some(stationed => stationed.cardId === card.cardId &&
    (stationed.instanceId?.startsWith('stationed:') ||
      nemesisCardInstanceId(stationed) === nemesisCardInstanceId(card)))
}
const playCards = computed(() => [...nemesis.value.playArea]
  .filter(card => !isStationedNemesisCard(card))
  .sort(compareNemesisCardsInRow))
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
const subBoardModalOpen = ref(false)
const { modalEl: subBoardModalEl, modalStyle: subBoardModalStyle, dragging: subBoardModalDragging, startDrag: startSubBoardModalDrag } = useModalDrag()
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

function openSubBoardPreview() {
  if (presentation.value.subBoard.enabled && presentation.value.subBoard.layout) {
    subBoardModalOpen.value = true
  }
}

function closeSubBoardPreview() { subBoardModalOpen.value = false }

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

function nemesisCardStackInstanceId(card: NemesisCardInPlay, index: number): string {
  return card.underCardInstanceIds?.[index] ?? `nemesis-under:${card.placedAt}:${index}`
}

function nemesisCardStackTitle(card: NemesisCardInPlay): string {
  const names = (card.underCards ?? []).map(cardId => getCard(cardId).name)
  return names.length > 0 ? `Cards underneath: ${names.join(', ')}` : ''
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

watch(() => state.dismissibleOverlayVersion, () => {
  closeMat()
  closeSubBoardPreview()
})

const unregisterDismissibleOverlay = registerDismissibleOverlay(() => {
  if (matModalOpen.value) {
    closeMat()
    return true
  }
  if (subBoardModalOpen.value) {
    closeSubBoardPreview()
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

function subBoardTokenImageUrl(tokenId: string): string | undefined {
  return nemesisTokenImageUrl(nemesis.value.type, tokenId)
}

function activateSubBoardRegion(regionId: string) {
  if (availableSubBoardRegionIds.value.includes(regionId)) void placeNemesisSubBoardToken(regionId)
}

function selectSubBoardRegion(regionId: string) {
  const option = subBoardRegionDecision.value?.options.find(candidate =>
    !candidate.disabled && candidate.regionId === regionId,
  )
  if (option) resolveDecision({ kind: 'choose_one', optionId: option.id })
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
          <span v-if="nemesisVulnerable" class="nemesis-card-counter nemesis-vulnerable-badge">Vulnerable</span>
          <span v-if="dividedDamageAssigned('nemesis') > 0" class="damage-allocation-badge" :aria-label="`${dividedDamageAssigned('nemesis')} damage assigned`">−{{ dividedDamageAssigned('nemesis') }}</span>
        </button>
      </CardHoverPreview>
      <div v-else class="nemesis-mat-wrap"><div class="nemesis-mat-fallback">{{ nemesis.name }}</div></div>

    </section>

    <div class="nemesis-board">
      <div class="nemesis-board-upper">
        <CardHoverPreview
          v-if="presentation.subBoard.enabled && presentation.subBoard.imageUrl && presentation.subBoard.layout"
          :image-url="presentation.subBoard.imageUrl"
          :image-alt="presentation.subBoard.layout.boardName"
          :preview-width="460"
          :preview-height="460 / (presentation.subBoard.layout.imageSize.width / presentation.subBoard.layout.imageSize.height)"
          image-object-fit="fill"
          preview-class="nemesis-sub-board-hover-preview"
          :disabled="subBoardModalOpen || !!subBoardRegionDecision"
        >
          <NemesisSubBoard
            :image-url="presentation.subBoard.imageUrl"
            :layout="presentation.subBoard.layout"
            :tokens="subBoardTokens"
            :available-region-ids="availableSubBoardRegionIds"
            :selectable-region-ids="selectableSubBoardRegionIds"
            :token-image-url="subBoardTokenImageUrl"
            @activate="activateSubBoardRegion"
            @select-region="selectSubBoardRegion"
            @preview="openSubBoardPreview"
          />
        </CardHoverPreview>

        <div class="nemesis-pile-column" aria-label="Nemesis discard piles">
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" :data-card-flight-target="presentation.specificDiscard.enabled ? 'strike-discard' : undefined" :data-card-motion-zone="presentation.specificDiscard.enabled ? 'strike_discard' : undefined" data-card-motion-owner-id="nemesis" data-card-motion-key="nemesis-specific-discard-top" data-card-motion-face="front" :data-card-motion-card-id="specificDiscardTopCard ?? undefined" :data-card-instance-id="specificDiscardTopInstanceId || undefined" :class="{ 'is-unavailable': !presentation.specificDiscard.enabled, 'is-empty': !presentation.specificDiscard.enabled || specificDiscardCount === 0 }" :aria-disabled="!presentation.specificDiscard.enabled || specificDiscardCount === 0" :aria-label="`Open ${presentation.specificDiscard.label}`" @click="openNemesisSpecificDiscardPile">
            <CardHoverPreview v-if="presentation.specificDiscard.enabled && specificDiscardTopCard" :card-id="specificDiscardTopCard">
              <CardSurface base-class="nemesis-pile-card" size="pile" :card-id="specificDiscardTopCard" />
            </CardHoverPreview>
            <span v-else class="nemesis-pile-placeholder">{{ presentation.specificDiscard.enabled ? `${presentation.specificDiscard.label} 0` : 'Not used' }}</span>
            <span v-if="presentation.specificDiscard.enabled && specificDiscardCount > 0" class="nemesis-pile-count">{{ specificDiscardCount }}</span>
          </button>
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" data-card-flight-target="nemesis-discard" data-card-motion-zone="nemesis_discard" data-card-motion-owner-id="nemesis" data-card-motion-key="nemesis-discard-top" data-card-motion-face="front" :data-card-motion-card-id="nemesisDiscardTopCard ?? undefined" :data-card-instance-id="nemesisDiscardTopInstanceId || undefined" :class="{ 'is-empty': nemesisDiscardCount === 0 }" :aria-disabled="nemesisDiscardCount === 0" aria-label="Open Nemesis Discard" @click="openNemesisDiscardPile">
            <CardHoverPreview v-if="nemesisDiscardTopCard" :card-id="nemesisDiscardTopCard">
              <CardSurface base-class="nemesis-pile-card" size="pile" :card-id="nemesisDiscardTopCard" />
            </CardHoverPreview>
            <span v-else class="nemesis-pile-placeholder">Nemesis Discard {{ nemesisDiscardCount }}</span>
            <span v-if="nemesisDiscardCount > 0" class="nemesis-pile-count">{{ nemesisDiscardCount }}</span>
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
            :top-card-always-revealed="presentation.specificDeck.topCardAlwaysRevealed"
            :top-card-id="specificTopCard ?? undefined"
            :action-label="specificTopCardActionLabel"
            :action-enabled="canActivateSpecificTopCard"
            :primary-action-on-card="presentation.specificDeck.primaryActionOnCard"
            @activate="activateSpecificTopCard"
            @inspect="openNemesisSpecificPile"
          />
          <button type="button" class="nemesis-pile-slot nemesis-discard-button" :class="{ 'is-empty': nemesisDeckCount === 0 }" :aria-disabled="nemesisDeckCount === 0" aria-label="Open Nemesis Deck" @click="openNemesisDeckPile">
            <CardSurface v-if="nemesisDeckCount > 0" data-nemesis-deck-pile="true" base-class="nemesis-pile-card" size="pile" :image-url="nemesisCardBackUrl()" image-alt="Nemesis Deck card back" />
            <span v-else class="nemesis-pile-placeholder">Nemesis Deck 0</span>
            <span v-if="nemesisDeckCount > 0" class="nemesis-pile-count">{{ nemesisDeckCount }}</span>
          </button>
        </div>

        <section class="nemesis-play" aria-label="Nemesis Cards in Play">
          <div class="nemesis-play-top" aria-label="Nemesis upper row">
            <CardHoverPreview
              v-for="card in stationedCards"
              :key="nemesisCardInstanceId(card)"
              :card-id="card.cardId"
              :preview-width="210"
              :preview-height="291.02"
            >
              <div
                class="nemesis-play-card nemesis-stationed-card game-highlight"
                data-card-motion-zone="nemesis_play_area"
                data-card-motion-owner-id="nemesis"
                :data-card-motion-card-id="card.cardId"
                :data-card-motion-key="`nemesis-play-${nemesisCardInstanceId(card)}`"
                :data-card-instance-id="nemesisCardInstanceId(card)"
                :data-damage-target="card.cardType === 'minion' ? minionTargetId(card.placedAt) : undefined"
                :class="{
                  'damage-target': isDamageTarget(minionTargetId(card.placedAt)),
                  'game-highlight--choice': isDamageTarget(minionTargetId(card.placedAt)),
                  'effect-target': isMainEffectTarget(nemesisCardInstanceId(card)),
                  'game-highlight--required': isMainEffectTarget(nemesisCardInstanceId(card)),
                }"
                :data-main-action-id="isEndTurnActionCard(card) ? `nemesis-card:${nemesisCardInstanceId(card)}` : undefined"
                :aria-label="`${getCard(card.cardId).name}${card.displayRow === 'top' ? ', in play' : ', set aside'}`"
                @click="activateNemesisCard(card)"
                @contextmenu="cancelDamageTarget(minionTargetId(card.placedAt), $event)"
              >
                <img v-if="cardImageUrl(card.cardId)" :src="cardImageUrl(card.cardId)" :alt="getCard(card.cardId).name" draggable="false" />
                <div v-else class="nemesis-card-fallback">{{ getCard(card.cardId).name }}</div>
                <span v-if="nemesisTokenCounter(card)" class="nemesis-card-counter nemesis-card-token-counter">{{ nemesisTokenCounter(card) }}</span>
                <div class="nemesis-card-meta"><span v-if="cardCounter(card)" class="nemesis-card-counter">{{ cardCounter(card) }}</span></div>
              </div>
            </CardHoverPreview>
          </div>
          <div v-if="playCards.length > 0" ref="playScroll" class="nemesis-play-row nemesis-card-scroll">
            <div class="nemesis-card-track">
              <CardHoverPreview v-for="card in playCards" :key="nemesisCardInstanceId(card)" :card-id="card.cardId" :preview-width="210" :preview-height="291.02">
                <div class="nemesis-play-card game-highlight" data-card-motion-zone="nemesis_play_area" data-card-motion-owner-id="nemesis" :data-card-motion-card-id="card.cardId" :data-card-motion-key="`nemesis-play-${nemesisCardInstanceId(card)}`" :data-card-instance-id="nemesisCardInstanceId(card)" :data-damage-target="card.cardType === 'minion' ? minionTargetId(card.placedAt) : undefined" :data-main-action-id="isEndTurnActionCard(card) ? `nemesis-card:${nemesisCardInstanceId(card)}` : undefined" :class="[`nemesis-${card.cardType}`, { discardable: nemesisDiscardActions.some(action => action.instanceId === nemesisCardInstanceId(card)), 'damage-target': isDamageTarget(minionTargetId(card.placedAt)), 'effect-target': isMainEffectTarget(nemesisCardInstanceId(card)), 'game-highlight--available': nemesisDiscardActions.some(action => action.instanceId === nemesisCardInstanceId(card)), 'game-highlight--choice': isDamageTarget(minionTargetId(card.placedAt)), 'game-highlight--required': isMainEffectTarget(nemesisCardInstanceId(card)), 'end-turn-attention': isEndTurnActionCard(card) }]" @click="activateNemesisCard(card)" @contextmenu="cancelDamageTarget(minionTargetId(card.placedAt), $event)">
                  <img v-if="cardImageUrl(card.cardId)" :src="cardImageUrl(card.cardId)" :alt="getCard(card.cardId).name" draggable="false" />
                  <div v-else class="nemesis-card-fallback">{{ getCard(card.cardId).name }}</div>
                <div v-if="card.underCards?.length && (getCard(card.cardId) as NemesisCardDef).underCardDisplay !== 'attached_quarter'" class="nemesis-under-card-stack" :aria-label="nemesisCardStackTitle(card)" @click.stop>
                  <CardSurface
                    v-for="(underCardId, index) in card.underCards"
                    :key="nemesisCardStackInstanceId(card, index)"
                    base-class="nemesis-under-card"
                    size="mini"
                    :card-id="underCardId"
                    :data-card-motion-zone="'nemesis_card_stack'"
                    :data-card-motion-card-id="underCardId"
                    data-card-motion-owner-id="nemesis"
                    :data-card-motion-key="`nemesis-stack-${nemesisCardStackInstanceId(card, index)}`"
                    :data-card-instance-id="nemesisCardStackInstanceId(card, index)"
                    data-card-motion-from-zones="strike_deck"
                    :image-alt="getCard(underCardId).name"
                  />
                </div>
                <AttachedQuarterCard
                  v-if="card.underCards?.length && (getCard(card.cardId) as NemesisCardDef).underCardDisplay === 'attached_quarter'"
                  :card-id="card.underCards[0]"
                  :data-card-motion-zone="'nemesis_card_stack'"
                  :data-card-motion-card-id="card.underCards[0]"
                  data-card-motion-owner-id="nemesis"
                  :data-card-motion-key="`nemesis-stack-${nemesisCardStackInstanceId(card, 0)}`"
                  :data-card-instance-id="nemesisCardStackInstanceId(card, 0)"
                  data-card-motion-from-zones="nemesis_deck"
                  data-card-motion-face="front"
                  :image-alt="getCard(card.underCards[0]).name"
                />
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
            <span v-for="(value, name) in nemesis.counters" :key="name" class="nemesis-info-token">
              <img v-if="nemesisTokenImageUrl(nemesis.type, String(name))" :src="nemesisTokenImageUrl(nemesis.type, String(name))" :alt="`${name} token`" draggable="false" />
              <span v-else>{{ name }}</span>
              <strong>{{ value }}</strong>
            </span>
          </div>
          <div class="hp-block" data-damage-target="nemesis">
            <span class="hp-name">Nemesis</span>
            <div class="hpbar nemesis"><i :style="{ width: pct(nemesis.hp / nemesisLifeBarMaximum) }" /></div>
            <span class="hp-num"><b>{{ nemesis.hp }}</b><template v-if="!hasUnlimitedNemesisLife">/{{ nemesis.maxHp }}</template></span>
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
        <ModalCloseButton label="Close Nemesis mat" @close="closeMat" />
        <button
          type="button"
          class="mage-modal-frame mage-modal-flip-scene nemesis-mat-modal-frame"
          :aria-label="matSide === 'front' ? `Flip ${nemesis.name} mat to back` : `Show ${nemesis.name} mat front`"
          @click="matSide = matSide === 'front' ? 'back' : 'front'"
        >
          <span class="mage-modal-flip-card" :class="{ flipped: matSide === 'back' }">
            <img
              class="mage-modal-image mage-modal-face"
              :src="nemesisMatImageUrl(nemesis.type, 'front')"
              :alt="`${nemesis.name} mat front`"
              draggable="false"
            />
            <img
              class="mage-modal-image mage-modal-face mage-modal-face--back"
              :src="nemesisMatImageUrl(nemesis.type, 'back')"
              :alt="`${nemesis.name} mat back`"
              draggable="false"
            />
          </span>
        </button>
    </ModalBase>

    <ModalBase
      v-if="subBoardModalOpen && presentation.subBoard.layout && presentation.subBoard.imageUrl"
      overlay-class="mage-overlay"
      v-model:panel-ref="subBoardModalEl"
      panel-class="mage-modal draggable-modal sub-board-preview-modal"
      :panel-style="subBoardModalStyle"
      :dragging="subBoardModalDragging"
      @overlay-click="closeSubBoardPreview"
      @panel-pointerdown="startSubBoardModalDrag"
    >
      <ModalCloseButton label="Close Nemesis board preview" @close="closeSubBoardPreview" />
      <div
        class="nemesis-sub-board-modal-frame"
        :style="{ aspectRatio: String(presentation.subBoard.layout.imageSize.width / presentation.subBoard.layout.imageSize.height) }"
      >
        <NemesisSubBoard
          :image-url="presentation.subBoard.imageUrl"
          :layout="presentation.subBoard.layout"
          :tokens="subBoardTokens"
          :available-region-ids="[]"
          :token-image-url="subBoardTokenImageUrl"
        />
      </div>
    </ModalBase>

  </div>
</template>
