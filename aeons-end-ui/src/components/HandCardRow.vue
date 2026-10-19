<script setup lang="ts">
import { computed, onBeforeUnmount, onBeforeUpdate, onMounted, onUpdated, ref } from 'vue'
import { animateHandCardReflow, cancelHandCardReflow, captureHandCardPositions } from '../game/card-flight'
import type { HandCardPositionSnapshot } from '../game/card-flight'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'

interface HandCardDisplay {
  cardId: string
  instanceId?: string
  handIndex?: number
  presentationKey?: string
  typeClass: string
  isSpell: boolean
  pending: boolean
  selected: boolean
  repeatConfirmation?: boolean
  endTurnActionAttention: boolean
  heldForPlay?: boolean
}

const props = defineProps<{
  playerId: string
  handCards: HandCardDisplay[]
  conjuredCard: { cardId: string; instanceId?: string; typeClass: string } | null
  canActMain: boolean
  draggingSpell: boolean
  draggedSpellIndex: number | null
  draggingConjuredCard: boolean
}>()

const emit = defineEmits<{
  'click-hand-card': [index: number]
  'click-conjured-card': []
  'start-hand-spell-drag': [index: number, event: PointerEvent]
  'start-conjured-spell-drag': [event: PointerEvent]
}>()

const handElement = ref<HTMLElement | null>(null)
const handCardVisualKeys = ref<string[]>([])
let previousHandCardVisuals: Array<{
  cardId: string
  handIndex: number
  instanceId?: string
  presentationKey?: string
  visualKey: string
}> = []
let nextHandVisualKey = 0
let handScrollTarget = 0
let handScrollFrame: number | null = null
let handAlignmentFrame: number | null = null
let handResizeObserver: ResizeObserver | null = null
let handVisualPlayerId: string | null = null
let pendingHandReflowPositions: HandCardPositionSnapshot | null = null
let handPlayerChanged = false
let handGainingCards = false
let lastHandLayout = ''

function sameCardCopy(
  left: { instanceId?: string; cardId: string },
  right: { instanceId?: string; cardId: string },
): boolean {
  return left.instanceId && right.instanceId
    ? left.instanceId === right.instanceId
    : left.cardId === right.cardId
}

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
    layoutHand(captureHandCardPositions(handElement.value))
  })
}

function layoutHand(previousPositions: HandCardPositionSnapshot, animate = true) {
  const hand = handElement.value
  if (!hand) return
  const entries = [...hand.querySelectorAll<HTMLElement>('.hand-card-entry')]
  const style = getComputedStyle(hand)
  const gap = Number.parseFloat(style.gap) || 0
  // Slot dimensions do not include selected-state or in-flight transforms.
  const contentWidth = entries.reduce((total, entry) => total + entry.offsetWidth, 0) +
    Math.max(0, entries.length - 1) * gap
  const rightPadding = Number.parseFloat(style.paddingRight) || 0
  const handRect = hand.getBoundingClientRect()
  const desiredOffset = window.innerWidth / 2 - handRect.left - contentWidth / 2
  const maxOffset = Math.max(0, hand.clientWidth - rightPadding - contentWidth)
  hand.style.setProperty('--hand-offset', `${Math.round(Math.min(Math.max(0, desiredOffset), maxOffset))}px`)
  handScrollTarget = Math.min(handScrollTarget, Math.max(0, hand.scrollWidth - hand.clientWidth))

  // Only layout changes restart movement. Selection, highlights and other
  // reactive updates must not extend an already running animation.
  const layout = `${handRect.left}:${handRect.top}:${hand.scrollLeft}|` + entries.map(entry =>
    `${entry.dataset.handCardVisualKey}:${entry.offsetLeft}:${entry.offsetTop}:${entry.offsetWidth}`,
  ).join('|')
  if (layout === lastHandLayout) return
  lastHandLayout = layout
  if (animate) animateHandCardReflow(hand, previousPositions, handGainingCards)
  else cancelHandCardReflow(hand)
}

onMounted(() => {
  window.addEventListener('resize', updateHandAlignment)
  if (handElement.value && typeof ResizeObserver !== 'undefined') {
    handResizeObserver = new ResizeObserver(updateHandAlignment)
    handResizeObserver.observe(handElement.value)
  }
  layoutHand(new Map(), false)
})

function reconcileHandCardVisualKeys() {
  const cards = props.handCards
  const departingKeys = new Set([...handElement.value?.querySelectorAll<HTMLElement>('[data-hand-card-departing]') ?? []]
    .map(entry => entry.dataset.handCardVisualKey))
  const keys: Array<string | undefined> = Array(cards.length)
  const usedPrevious = new Set<number>()
  const usedNext = new Set<number>()

  // Staged discards preserve the original source indexes. When returning to
  // live indexes, match in order so duplicate cards cannot cross each other.
  cards.forEach((card, nextIndex) => {
    if (!card.presentationKey) return
    const previousIndex = previousHandCardVisuals.findIndex((previous, index) =>
      !usedPrevious.has(index) && !departingKeys.has(previous.visualKey) &&
      sameCardCopy(previous, card) && previous.handIndex === card.handIndex)
    if (previousIndex < 0) return
    keys[nextIndex] = previousHandCardVisuals[previousIndex]!.visualKey
    usedPrevious.add(previousIndex)
    usedNext.add(nextIndex)
  })

  const oldIndexes = previousHandCardVisuals.flatMap((card, index) =>
    usedPrevious.has(index) || departingKeys.has(card.visualKey) ? [] : [index])
  const newIndexes = cards.flatMap((_, index) => usedNext.has(index) ? [] : [index])
  const rows = oldIndexes.length + 1
  const columns = newIndexes.length + 1
  const lengths = Array.from({ length: rows }, () => Array<number>(columns).fill(0))
  for (let oldPosition = oldIndexes.length - 1; oldPosition >= 0; oldPosition--) {
    for (let newPosition = newIndexes.length - 1; newPosition >= 0; newPosition--) {
      const previous = previousHandCardVisuals[oldIndexes[oldPosition]!]!
      const next = cards[newIndexes[newPosition]!]!
      lengths[oldPosition]![newPosition] = sameCardCopy(previous, next)
        ? lengths[oldPosition + 1]![newPosition + 1]! + 1
        : Math.max(lengths[oldPosition + 1]![newPosition]!, lengths[oldPosition]![newPosition + 1]!)
    }
  }
  let oldPosition = 0
  let newPosition = 0
  while (oldPosition < oldIndexes.length && newPosition < newIndexes.length) {
    const previousIndex = oldIndexes[oldPosition]!
    const nextIndex = newIndexes[newPosition]!
    if (sameCardCopy(previousHandCardVisuals[previousIndex]!, cards[nextIndex]!)) {
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
    instanceId: card.instanceId,
    handIndex: card.handIndex ?? index,
    presentationKey: card.presentationKey,
    visualKey: handCardVisualKeys.value[index]!,
  }))
  handVisualPlayerId = props.playerId

}

reconcileHandCardVisualKeys()

onBeforeUpdate(() => {
  handPlayerChanged = handVisualPlayerId !== props.playerId
  handGainingCards = !handPlayerChanged && props.handCards.length > previousHandCardVisuals.length
  // Read the real screen positions immediately before Vue patches the slots,
  // including the current progress of an interrupted animation or scroll.
  pendingHandReflowPositions = captureHandCardPositions(handElement.value)
  if (handPlayerChanged) {
    previousHandCardVisuals = []
    handScrollTarget = 0
    if (handScrollFrame !== null) cancelAnimationFrame(handScrollFrame)
    handScrollFrame = null
    if (handElement.value) handElement.value.scrollLeft = 0
  }
  reconcileHandCardVisualKeys()
})

const renderedHandCards = computed(() => props.handCards.map((card, index) => ({
  ...card,
  handIndex: card.handIndex ?? index,
  visualKey: handCardVisualKeys.value[index] ?? `hand-card-${index}`,
})))
const hasHighlightedHandCard = computed(() => renderedHandCards.value.some(card =>
  card.pending || card.repeatConfirmation,
))

onUpdated(() => {
  const positions = pendingHandReflowPositions
  pendingHandReflowPositions = null
  layoutHand(positions ?? new Map(), !handPlayerChanged)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateHandAlignment)
  handResizeObserver?.disconnect()
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  if (handScrollFrame !== null) cancelAnimationFrame(handScrollFrame)
  cancelHandCardReflow(handElement.value)
})
</script>

<template>
    <div
      ref="handElement"
      class="hand"
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
            :data-card-instance-id="card.instanceId"
            :data-held-play-card="card.heldForPlay ? 'true' : undefined"
            data-card-flight-target="hand"
            data-card-motion-zone="hand"
            :data-card-motion-card-id="card.cardId"
            :data-card-motion-owner-id="playerId"
            :data-card-motion-key="`hand-${playerId}-${card.visualKey}`"
            :class="[card.typeClass, {
              dragging: draggingSpell && draggedSpellIndex === card.handIndex,
              'spell-draggable': canActMain && card.isSpell,
              'held-play-card': card.heldForPlay,
              'pending-board-card': card.pending,
              'pending-board-card-selected': card.pending && card.selected,
              'game-highlight': card.pending || card.repeatConfirmation,
              'game-highlight--choice': card.pending && !card.selected,
              'game-highlight--selected': card.pending && card.selected,
              'game-highlight--required': card.repeatConfirmation,
              'player-card-hover-feedback': !card.heldForPlay && (card.pending || card.repeatConfirmation || (canActMain && !hasHighlightedHandCard)),
              'end-turn-attention': card.endTurnActionAttention,
            }]"
            :aria-disabled="card.heldForPlay || undefined"
            :data-main-action-id="card.endTurnActionAttention ? `hand-card:${playerId}:${card.handIndex}` : undefined"
            draggable="false"
            @click="!card.heldForPlay && emit('click-hand-card', card.handIndex)"
            @pointerdown="!card.heldForPlay && emit('start-hand-spell-drag', card.handIndex, $event)"
          />
        </CardHoverPreview>
      </div>
      <div v-if="conjuredCard" :key="`${playerId}:pending-conjured-spell`" class="hand-card-entry" data-hand-card-visual-key="pending-conjured-spell">
        <CardHoverPreview :card-id="conjuredCard.cardId">
          <CardSurface
            :card-id="conjuredCard.cardId"
            size="hand"
            data-card-motion-zone="conjure"
            :data-card-motion-card-id="conjuredCard.cardId"
            :data-card-motion-owner-id="playerId"
            :data-card-motion-key="`${playerId}:conjure:${conjuredCard.instanceId ?? conjuredCard.cardId}`"
            :data-card-instance-id="conjuredCard.instanceId"
            :class="[conjuredCard.typeClass, 'pending-board-card', 'pending-conjure-card', 'spell-draggable', 'game-highlight', 'game-highlight--choice', 'player-card-hover-feedback', {
              dragging: draggingSpell && draggingConjuredCard,
            }]"
            draggable="false"
            @click="emit('click-conjured-card')"
            @pointerdown="emit('start-conjured-spell-drag', $event)"
          />
        </CardHoverPreview>
      </div>
    </div>
</template>
