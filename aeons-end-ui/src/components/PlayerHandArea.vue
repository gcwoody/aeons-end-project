<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import { playerCardBackUrl } from '../card-images'
import { animateHandCardReflow, captureHandCardPositions } from '../game/card-flight'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import FaceUpPileCard from './FaceUpPileCard.vue'
import MageBoard from './MageBoard.vue'
import PileCountBadge from './PileCountBadge.vue'
import TokenBadge from './TokenBadge.vue'

interface HandCardDisplay {
  cardId: string
  handIndex?: number
  presentationKey?: string
  typeClass: string
  isSpell: boolean
  pending: boolean
  selected: boolean
  endTurnActionAttention: boolean
}

interface PlayerInPlayCardDisplay {
  cardId: string
  cardIndex: number
  typeClass: string
  actionAvailable: boolean
  endTurnActionAttention: boolean
  powerTokens: number
}

const props = defineProps<{
  playerId: string
  mageType: string
  mageFormSide?: 'giver' | 'taker'
  hasSpecificDeck: boolean
  specificDeckName: string
  specificDeckCards: string[]
  specificDeckTopImage?: string
  specificDeckBackImage?: string
  specificDeckTopIsVisible: boolean
  canBuyFirethorn: boolean
  specificDeckActionAttention: boolean
  playerCardsInPlay: PlayerInPlayCardDisplay[]
  deckCount: number
  discardCount: number
  discardTopCard: string | null
  recallAvailable: boolean
  recallActionAttention: boolean
  handCards: HandCardDisplay[]
  conjuredCard: { cardId: string; typeClass: string } | null
  canActMain: boolean
  draggingSpell: boolean
  draggedSpellIndex: number | null
  draggingConjuredCard: boolean
}>()

const emit = defineEmits<{
  'click-specific-deck': []
  'open-specific-deck': []
  'click-player-card': [index: number]
  'click-hand-card': [index: number]
  'start-hand-spell-drag': [index: number, event: PointerEvent]
  'start-conjured-spell-drag': [event: PointerEvent]
  'open-deck': []
  'open-discard': []
}>()

const handElement = ref<HTMLElement | null>(null)
const handOffset = ref(0)
const handGainReflowActive = ref(false)
const handPlayerSwitchActive = ref(false)
const handCardVisualKeys = ref<string[]>([])
let previousHandCardVisuals: Array<{
  cardId: string
  handIndex: number
  presentationKey?: string
  visualKey: string
}> = []
let nextHandVisualKey = 0
let handScrollTarget = 0
let handScrollFrame: number | null = null
let handAlignmentFrame: number | null = null
let handResizeObserver: ResizeObserver | null = null
let handGainReflowTimer: ReturnType<typeof setTimeout> | null = null
let handVisualPlayerId: string | null = null
let pendingHandReflowPositions: Map<string, { left: number; top: number }> | null = null
let lastRenderedHandCardPositions = new Map<string, { left: number; top: number }>()

function animateHandScroll() {
  const hand = handElement.value
  if (!hand) {
    handScrollFrame = null
    return
  }
  const maxScroll = Math.max(0, hand.scrollWidth - hand.clientWidth)
  handScrollTarget = Math.min(Math.max(0, handScrollTarget), maxScroll)
  const distance = handScrollTarget - hand.scrollLeft
  if (Math.abs(distance) < 0.5) {
    hand.scrollLeft = handScrollTarget
    handScrollFrame = null
    return
  }
  hand.scrollLeft += distance * 0.2
  handScrollFrame = requestAnimationFrame(animateHandScroll)
}

function handleHandWheel(event: WheelEvent) {
  const target = event.target
  const hand = target instanceof Element ? target.closest<HTMLElement>('.hand') : null
  if (!hand || hand !== handElement.value || hand.scrollWidth <= hand.clientWidth || event.deltaY === 0) return
  event.preventDefault()
  event.stopPropagation()
  if (handScrollFrame === null) handScrollTarget = hand.scrollLeft
  const maxScroll = Math.max(0, hand.scrollWidth - hand.clientWidth)
  handScrollTarget = Math.min(Math.max(0, handScrollTarget + event.deltaY * 1.1), maxScroll)
  if (handScrollFrame === null) handScrollFrame = requestAnimationFrame(animateHandScroll)
}

function updateHandAlignment() {
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  handAlignmentFrame = requestAnimationFrame(() => {
    handAlignmentFrame = null
    const hand = handElement.value
    if (!hand || typeof window === 'undefined') return
    const cards = [...hand.querySelectorAll<HTMLElement>('.card')]
    const gap = Number.parseFloat(getComputedStyle(hand).gap) || 0
    const cardWidth = cards.reduce((total, card) => total + card.getBoundingClientRect().width, 0)
    const contentWidth = cardWidth + Math.max(0, cards.length - 1) * gap
    const rightPadding = Number.parseFloat(getComputedStyle(hand).paddingRight) || 0
    const handRect = hand.getBoundingClientRect()
    const desiredOffset = window.innerWidth / 2 - handRect.left - contentWidth / 2
    const maxOffset = Math.max(0, hand.clientWidth - rightPadding - contentWidth)
    handOffset.value = Math.round(Math.min(Math.max(0, desiredOffset), maxOffset))
  })
}

onMounted(() => {
  window.addEventListener('resize', updateHandAlignment)
  if (handElement.value && typeof ResizeObserver !== 'undefined') {
    handResizeObserver = new ResizeObserver(updateHandAlignment)
    handResizeObserver.observe(handElement.value)
  }
  void nextTick(() => {
    updateHandAlignment()
    requestAnimationFrame(() => { lastRenderedHandCardPositions = captureHandCardPositions(handElement.value) })
  })
})

watch(
  () => [props.mageType, props.handCards.map(card => card.cardId).join('|'), props.conjuredCard?.cardId],
  () => nextTick(updateHandAlignment),
)

function reconcileHandCardVisualKeys() {
  const cards = props.handCards
  const previousPositions = lastRenderedHandCardPositions
  const previousCardCount = previousHandCardVisuals.length
  const playerChanged = handVisualPlayerId !== null && handVisualPlayerId !== props.playerId
  const stagedDiscardPresentation = cards.some(card => !!card.presentationKey) &&
    previousHandCardVisuals.some(card => !!card.presentationKey)
  const keys: Array<string | undefined> = Array(cards.length)
  const usedPrevious = new Set<number>()
  const usedNext = new Set<number>()

  // During a staged discard, source indexes remain stable even while the
  // hand is being shortened one card at a time.
  cards.forEach((card, nextIndex) => {
    if (!card.presentationKey) return
    const previousIndex = previousHandCardVisuals.findIndex((previous, index) =>
      !usedPrevious.has(index) && previous.cardId === card.cardId && previous.handIndex === card.handIndex)
    if (previousIndex < 0) return
    keys[nextIndex] = previousHandCardVisuals[previousIndex]!.visualKey
    usedPrevious.add(previousIndex)
    usedNext.add(nextIndex)
  })

  const oldIndexes = previousHandCardVisuals.flatMap((_, index) => usedPrevious.has(index) ? [] : [index])
  const newIndexes = cards.flatMap((_, index) => usedNext.has(index) ? [] : [index])
  const rows = oldIndexes.length + 1
  const columns = newIndexes.length + 1
  const lengths = Array.from({ length: rows }, () => Array<number>(columns).fill(0))
  for (let oldPosition = oldIndexes.length - 1; oldPosition >= 0; oldPosition--) {
    for (let newPosition = newIndexes.length - 1; newPosition >= 0; newPosition--) {
      const previous = previousHandCardVisuals[oldIndexes[oldPosition]!]!
      const next = cards[newIndexes[newPosition]!]!
      lengths[oldPosition]![newPosition] = previous.cardId === next.cardId
        ? lengths[oldPosition + 1]![newPosition + 1]! + 1
        : Math.max(lengths[oldPosition + 1]![newPosition]!, lengths[oldPosition]![newPosition + 1]!)
    }
  }
  let oldPosition = 0
  let newPosition = 0
  while (oldPosition < oldIndexes.length && newPosition < newIndexes.length) {
    const previousIndex = oldIndexes[oldPosition]!
    const nextIndex = newIndexes[newPosition]!
    if (previousHandCardVisuals[previousIndex]!.cardId === cards[nextIndex]!.cardId) {
      keys[nextIndex] = previousHandCardVisuals[previousIndex]!.visualKey
      oldPosition++
      newPosition++
    } else if (lengths[oldPosition + 1]![newPosition]! >= lengths[oldPosition]![newPosition + 1]!) {
      oldPosition++
    } else {
      newPosition++
    }
  }

  handCardVisualKeys.value = cards.map((card, index) => keys[index] ?? `hand-card-${++nextHandVisualKey}`)
  previousHandCardVisuals = cards.map((card, index) => ({
    cardId: card.cardId,
    handIndex: card.handIndex ?? index,
    presentationKey: card.presentationKey,
    visualKey: handCardVisualKeys.value[index]!,
  }))
  handVisualPlayerId = props.playerId

  if (!playerChanged && !stagedDiscardPresentation &&
    cards.length !== previousCardCount && previousPositions.size > 0) {
    pendingHandReflowPositions ??= new Map(previousPositions)
  }
}

watch(
  () => props.handCards.map(card => `${card.cardId}\u001f${card.handIndex ?? ''}\u001f${card.presentationKey ?? ''}`).join('\u001e'),
  reconcileHandCardVisualKeys,
  { immediate: true, flush: 'sync' },
)

const renderedHandCards = computed(() => props.handCards.map((card, index) => ({
  ...card,
  handIndex: card.handIndex ?? index,
  visualKey: handCardVisualKeys.value[index] ?? `hand-card-${index}`,
})))

onUpdated(() => {
  const positions = pendingHandReflowPositions
  pendingHandReflowPositions = null
  if (positions && !handPlayerSwitchActive.value) animateHandCardReflow(handElement.value, positions)
  lastRenderedHandCardPositions = captureHandCardPositions(handElement.value)
})

watch(() => props.playerId, () => {
  handPlayerSwitchActive.value = true
  pendingHandReflowPositions = null
  handGainReflowActive.value = false
  if (handGainReflowTimer) clearTimeout(handGainReflowTimer)
  handGainReflowTimer = null

  // A different Mage's hand is a new view, not a set of cards moving within
  // the same hand. Reset visual identity so TransitionGroup cannot animate the
  // previous Mage's cards out while the new Mage's cards animate in.
  previousHandCardVisuals = []
  handCardVisualKeys.value = []
  reconcileHandCardVisualKeys()

  void nextTick(() => {
    updateHandAlignment()
    requestAnimationFrame(() => { handPlayerSwitchActive.value = false })
  })
}, { flush: 'sync' })

watch(() => [props.playerId, props.handCards.length] as const, ([playerId, length], [previousPlayerId, previousLength]) => {
  if (playerId !== previousPlayerId) return
  if (length <= previousLength) return
  handGainReflowActive.value = true
  if (handGainReflowTimer) clearTimeout(handGainReflowTimer)
  const durationToken = getComputedStyle(document.documentElement)
    .getPropertyValue('--hand-gain-reflow-duration').trim()
  const durationValue = Number.parseFloat(durationToken)
  const duration = durationToken.endsWith('ms')
    ? durationValue
    : durationToken.endsWith('s') ? durationValue * 1000 : 220
  handGainReflowTimer = setTimeout(() => {
    handGainReflowActive.value = false
    handGainReflowTimer = null
  }, duration + 80)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateHandAlignment)
  handResizeObserver?.disconnect()
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  if (handScrollFrame !== null) cancelAnimationFrame(handScrollFrame)
  if (handGainReflowTimer) clearTimeout(handGainReflowTimer)
})
</script>

<template>
  <div
    class="hand-row"
    :class="{
      'has-specific-deck': hasSpecificDeck,
      'has-player-cards-in-play': playerCardsInPlay.length > 0,
    }"
  >
    <MageBoard :mage-type="mageType" />
    <div
      v-if="hasSpecificDeck"
      class="deck-pile clickable player-specific-deck-pile game-highlight"
      :class="{ 'has-cards': specificDeckCards.length > 0, 'is-empty': specificDeckCards.length === 0, 'end-turn-attention': specificDeckActionAttention }"
      :data-main-action-id="specificDeckActionAttention ? `specific-deck:${playerId}` : undefined"
      :aria-label="canBuyFirethorn ? 'Buy the top Firethorn for 5 Aether' : `Open ${specificDeckName}`"
      :aria-disabled="specificDeckCards.length === 0"
      @click="specificDeckCards.length > 0 && emit('click-specific-deck')"
    >
      <CardHoverPreview
        v-if="mageType === 'qu' && specificDeckCards.length > 0"
        class="player-specific-deck-preview"
        :card-id="specificDeckCards[0]"
        :image-url="specificDeckTopImage"
        :image-alt="`Qu's Form Card — ${mageFormSide === 'taker' ? 'Taker' : 'Giver'} Form`"
      >
        <CardSurface
          base-class="player-pile-card"
          size="pile"
          class="player-specific-deck-face-up"
          :image-url="specificDeckTopImage"
          :image-alt="`Qu's Form Card — ${mageFormSide === 'taker' ? 'Taker' : 'Giver'} Form`"
        />
      </CardHoverPreview>
      <FaceUpPileCard
        v-else-if="specificDeckTopIsVisible && specificDeckCards.length > 0"
        :card-id="specificDeckCards[0]!"
        :ariaLabel="`Open ${specificDeckName}`"
        :primaryEnabled="true"
        display-class="player-specific-deck-face-up"
        @inspect="emit('open-specific-deck')"
      />
      <CardSurface
        v-else-if="!specificDeckTopIsVisible && specificDeckCards.length > 0 && specificDeckBackImage"
        base-class="player-pile-card"
        size="pile"
        class="specific-deck-back"
        :image-url="specificDeckBackImage"
        :image-alt="specificDeckName"
      />
      <PileCountBadge :count="specificDeckCards.length" label="Specific" />
    </div>
    <div v-if="playerCardsInPlay.length > 0" class="player-cards-in-play-pile" aria-label="Player cards in play">
      <div class="player-card-stack">
        <CardHoverPreview
          v-for="(card, index) in playerCardsInPlay"
          :key="`player-in-play-${card.cardId}-${card.cardIndex}`"
          :card-id="card.cardId"
        >
          <CardSurface
            :card-id="card.cardId"
            size="mini"
            class="player-in-play-card"
            :class="[card.typeClass, {
              'in-play-action': card.actionAvailable,
              'game-highlight': card.actionAvailable,
              'game-highlight--available': card.actionAvailable,
              'end-turn-attention': card.endTurnActionAttention,
            }]"
            :data-main-action-id="card.endTurnActionAttention ? `player-card-in-play:${playerId}:${card.cardIndex}` : undefined"
            :style="{ '--stack-index': index }"
            @click="emit('click-player-card', index)"
          >
            <template #overlay>
              <TokenBadge
                v-if="card.powerTokens > 0"
                label="Power"
                :count="card.powerTokens"
                tone="power"
                placement="card"
              />
            </template>
          </CardSurface>
        </CardHoverPreview>
      </div>
    </div>
    <div
      class="deck-pile clickable player-deck-pile game-highlight"
      :class="{ 'has-cards': deckCount > 0, 'is-empty': deckCount === 0 }"
      data-card-flight-target="deck"
      :aria-disabled="deckCount === 0"
      @click="deckCount > 0 && emit('open-deck')"
    >
      <CardSurface
        v-if="deckCount > 0"
        base-class="player-pile-card"
        size="pile"
        :image-url="playerCardBackUrl()"
        image-alt="Player deck"
      />
      <PileCountBadge :count="deckCount" label="Deck" />
    </div>
    <div
      ref="handElement"
      class="hand"
      :class="{
        'hand-gain-reflow': handGainReflowActive,
        'hand-player-switch': handPlayerSwitchActive,
      }"
      :style="{ '--hand-offset': `${handOffset}px` }"
      @wheel="handleHandWheel"
    >
      <div
        v-for="card in renderedHandCards"
        :key="`${playerId}:${card.visualKey}`"
        class="hand-card-entry"
        :data-hand-card-visual-key="card.visualKey"
      >
        <CardHoverPreview :card-id="card.cardId">
          <CardSurface
            :card-id="card.cardId"
            size="hand"
            :data-hand-card-index="card.handIndex"
            :data-hand-card-id="card.cardId"
            data-card-flight-target="hand"
            :class="[card.typeClass, {
              dragging: draggingSpell && draggedSpellIndex === card.handIndex,
              'spell-draggable': canActMain && card.isSpell,
              'pending-board-card': card.pending,
              'pending-board-card-selected': card.pending && card.selected,
              'game-highlight': card.pending,
              'game-highlight--choice': card.pending && !card.selected,
              'game-highlight--selected': card.pending && card.selected,
              'end-turn-attention': card.endTurnActionAttention,
            }]"
            :data-main-action-id="card.endTurnActionAttention ? `hand-card:${playerId}:${card.handIndex}` : undefined"
            draggable="false"
            @click="emit('click-hand-card', card.handIndex)"
            @pointerdown="emit('start-hand-spell-drag', card.handIndex, $event)"
          />
        </CardHoverPreview>
      </div>
      <div v-if="conjuredCard" :key="`${playerId}:pending-conjured-spell`" class="hand-card-entry">
        <CardHoverPreview :card-id="conjuredCard.cardId">
          <CardSurface
            :card-id="conjuredCard.cardId"
            size="hand"
            :class="[conjuredCard.typeClass, 'pending-board-card', 'pending-conjure-card', 'spell-draggable', 'game-highlight', 'game-highlight--choice', {
              dragging: draggingSpell && draggingConjuredCard,
            }]"
            draggable="false"
            @pointerdown="emit('start-conjured-spell-drag', $event)"
          />
        </CardHoverPreview>
      </div>
    </div>
    <div
      class="discard-pile clickable player-discard-pile game-highlight"
      data-card-flight-zone="discard"
      :class="{ 'has-cards': discardCount > 0, 'is-empty': discardCount === 0, 'recall-action-available': recallAvailable, 'end-turn-attention': recallActionAttention }"
      :data-main-action-id="recallActionAttention ? `discard-pile:${playerId}` : undefined"
      :aria-disabled="discardCount === 0"
      :title="recallAvailable ? 'Recall is available from this Discard' : undefined"
      @click="discardCount > 0 && emit('open-discard')"
      @contextmenu.prevent="discardCount > 0 && emit('open-discard')"
    >
      <CardHoverPreview v-if="discardTopCard" :card-id="discardTopCard">
        <CardSurface
          base-class="player-pile-card"
          size="pile"
          class="player-discard-top-card"
          :class="recallAvailable ? ['game-highlight', 'game-highlight--context'] : undefined"
          data-card-flight-target="discard"
          :data-discard-top-card="discardTopCard"
          :card-id="discardTopCard"
          :image-alt="getCard(discardTopCard).name"
        />
      </CardHoverPreview>
      <PileCountBadge :count="discardCount" label="Discard" />
    </div>
  </div>
</template>
