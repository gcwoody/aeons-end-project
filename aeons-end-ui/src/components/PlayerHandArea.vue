<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import { playerCardBackUrl } from '../card-images'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import FaceUpPileCard from './FaceUpPileCard.vue'
import MageBoard from './MageBoard.vue'
import PileCountBadge from './PileCountBadge.vue'
import TokenBadge from './TokenBadge.vue'

interface HandCardDisplay {
  cardId: string
  typeClass: string
  isSpell: boolean
  pending: boolean
  selected: boolean
}

interface PlayerInPlayCardDisplay {
  cardId: string
  cardIndex: number
  typeClass: string
  actionAvailable: boolean
  powerTokens: number
}

const props = defineProps<{
  mageType: string
  mageFormSide?: 'giver' | 'taker'
  hasSpecificDeck: boolean
  specificDeckName: string
  specificDeckCards: string[]
  specificDeckTopImage?: string
  specificDeckBackImage?: string
  specificDeckTopIsVisible: boolean
  canBuyFirethorn: boolean
  playerCardsInPlay: PlayerInPlayCardDisplay[]
  deckCount: number
  discardCount: number
  discardTopCard: string | null
  recallAvailable: boolean
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
let handScrollTarget = 0
let handScrollFrame: number | null = null
let handAlignmentFrame: number | null = null
let handResizeObserver: ResizeObserver | null = null

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
  nextTick(updateHandAlignment)
})

watch(
  () => [props.mageType, props.handCards.map(card => card.cardId).join('|'), props.conjuredCard?.cardId],
  () => nextTick(updateHandAlignment),
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateHandAlignment)
  handResizeObserver?.disconnect()
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  if (handScrollFrame !== null) cancelAnimationFrame(handScrollFrame)
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
      class="deck-pile clickable player-specific-deck-pile"
      :class="{ 'has-cards': specificDeckCards.length > 0 }"
      :aria-label="canBuyFirethorn ? 'Buy the top Firethorn for 5 Aether' : `Open ${specificDeckName}`"
      @click="emit('click-specific-deck')"
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
              'in-play-action': playerCardsInPlay.length === 1 && card.actionAvailable,
            }]"
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
    <div class="deck-pile clickable player-deck-pile" :class="{ 'has-cards': deckCount > 0 }" @click="emit('open-deck')">
      <CardSurface
        v-if="deckCount > 0"
        base-class="player-pile-card"
        size="pile"
        :image-url="playerCardBackUrl()"
        image-alt="Player deck"
      />
      <PileCountBadge :count="deckCount" label="Deck" />
    </div>
    <div ref="handElement" class="hand" :style="{ '--hand-offset': `${handOffset}px` }" @wheel="handleHandWheel">
      <CardHoverPreview v-for="(card, index) in handCards" :key="card.cardId + index" :card-id="card.cardId">
        <CardSurface
          :card-id="card.cardId"
          size="hand"
          :data-hand-card-index="index"
          :data-hand-card-id="card.cardId"
          :class="[card.typeClass, {
            dragging: draggingSpell && draggedSpellIndex === index,
            'spell-draggable': canActMain && card.isSpell,
            'pending-board-card': card.pending,
            'pending-board-card-selected': card.pending && card.selected,
          }]"
          draggable="false"
          @click="emit('click-hand-card', index)"
          @pointerdown="emit('start-hand-spell-drag', index, $event)"
        />
      </CardHoverPreview>
      <CardHoverPreview v-if="conjuredCard" :card-id="conjuredCard.cardId">
        <CardSurface
          :card-id="conjuredCard.cardId"
          size="hand"
          :class="[conjuredCard.typeClass, 'pending-board-card', 'pending-conjure-card', 'spell-draggable', {
            dragging: draggingSpell && draggingConjuredCard,
          }]"
          draggable="false"
          @pointerdown="emit('start-conjured-spell-drag', $event)"
        />
      </CardHoverPreview>
    </div>
    <div
      class="discard-pile clickable player-discard-pile"
      :class="{ 'has-cards': discardCount > 0, 'recall-action-available': recallAvailable }"
      :title="recallAvailable ? 'Recall is available from this Discard' : undefined"
      @click="emit('open-discard')"
      @contextmenu.prevent="emit('open-discard')"
    >
      <CardHoverPreview v-if="discardTopCard" :card-id="discardTopCard">
        <CardSurface
          base-class="player-pile-card"
          size="pile"
          class="player-discard-top-card"
          :data-discard-top-card="discardTopCard"
          :card-id="discardTopCard"
          :image-alt="getCard(discardTopCard).name"
        />
      </CardHoverPreview>
      <PileCountBadge :count="discardCount" label="Discard" />
    </div>
  </div>
</template>
