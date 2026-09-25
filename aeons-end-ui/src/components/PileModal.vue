<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { getCard, MAGES } from '@engine/data'
import { cardImageUrl, nemesisCardBackUrl, nemesisSpecificDeckBackUrl, specificDeckBackUrl } from '../card-images'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import ModalBase from './ModalBase.vue'
import { chunkCards, groupPileCards, pileRowLabel, type PileKind } from '../game/pile-layout'
import { useModalDrag } from '../game/useModalDrag'
import { getNemesisPresentation } from '../game/nemesis-presentation'
import { registerDismissibleOverlay } from '../game/dismissible-overlays'

const { state, displayPlayer, closePile, playerCardInPlayActions, activatePlayerCardInPlayAction } = useGame()
const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()

const unregisterDismissibleOverlay = registerDismissibleOverlay(() => {
  if (!state.viewPile) return false
  closePile()
  return true
})
onBeforeUnmount(unregisterDismissibleOverlay)

const title = computed(() => {
  if (state.viewPile === 'specific_deck') {
    return MAGES[displayPlayer.value?.mageType ?? '']?.specificDeckName ?? 'Specific Deck'
  }
  if (state.viewPile === 'nemesis_specific') {
    return getNemesisPresentation(state.game?.nemesis.type ?? '').specificDeck.label
  }
  if (state.viewPile === 'nemesis_specific_discard') {
    return getNemesisPresentation(state.game?.nemesis.type ?? '').specificDiscard.label
  }
  if (state.viewPile === 'nemesis_deck') return 'Nemesis Deck'
  if (state.viewPile === 'nemesis_discard') return 'Nemesis Discard'
  if (state.viewPile === 'player_cards_in_play') return 'Player Cards in Play'
  return state.viewPile === 'deck' ? 'Deck' : 'Discard'
})
const orderLabel = computed(() => state.viewPile === 'player_cards_in_play' ? '(bottom → top)' : '(top → bottom)')
const isSpecificDeck = computed(() => state.viewPile === 'specific_deck')
const isNemesisFaceDown = computed(() => state.viewPile === 'nemesis_deck'
  || (state.viewPile === 'nemesis_specific'
    && getNemesisPresentation(state.game?.nemesis.type ?? '').specificDeck.display !== 'face_up'))
const specificDeckFaceUp = computed(() =>
  MAGES[displayPlayer.value?.mageType ?? '']?.specificDeckDisplay === 'face_up',
)
const specificDeckBackImage = computed(() =>
  specificDeckBackUrl(MAGES[displayPlayer.value?.mageType ?? '']?.specificDeckBack ?? 'player'),
)
const faceDownBackImage = computed(() => {
  if (state.viewPile === 'nemesis_deck') return nemesisCardBackUrl()
  if (state.viewPile === 'nemesis_specific') return nemesisSpecificDeckBackUrl(state.game?.nemesis.type ?? '')
  return specificDeckBackImage.value
})
const knownSpecificDeckCards = computed(() => new Set(displayPlayer.value?.knownSpecificDeckCards ?? []))
const playerCardEntries = computed(() =>
  (displayPlayer.value?.playerCardsInPlay ?? [])
    .map((cardId, cardIndex) => ({ cardId, cardIndex }))
    .filter(({ cardIndex }) => displayPlayer.value?.playerCardSupplyTargets?.[cardIndex] == null),
)
const cards = computed(() => {
  if (state.viewPile === 'specific_deck') return displayPlayer.value?.specificDeck ?? []
  if (state.viewPile === 'nemesis_specific') return state.game?.nemesis.strikeDeck ?? []
  if (state.viewPile === 'nemesis_specific_discard') return state.game?.nemesis.strikeDiscard ?? []
  if (state.viewPile === 'nemesis_deck') return state.game?.nemesis.deck ?? []
  if (state.viewPile === 'nemesis_discard') return state.game?.nemesis.discard ?? []
  if (state.viewPile === 'player_cards_in_play') return playerCardEntries.value.map(entry => entry.cardId)
  return state.viewPile === 'deck' ? displayPlayer.value?.deck ?? [] : displayPlayer.value?.discard ?? []
})

const deckCount = computed(() => displayPlayer.value?.deck.length ?? 0)
const playerPileKind = computed<PileKind | null>(() =>
  state.viewPile === 'deck' || state.viewPile === 'discard' ? state.viewPile : null,
)

const groups = computed(() => {
  if (!state.viewPile) return []
  // Player piles retain their draw forecast. Face-up Nemesis specific piles
  // are informational, so they remain in simple top-to-bottom order.
  return playerPileKind.value
    ? groupPileCards(cards.value, playerPileKind.value, deckCount.value)
    : chunkCards(cards.value)
})

const columns = computed(() => Math.max(1, Math.min(5, Math.max(0, ...groups.value.map(group => group.length)))))

function rowLabel(groupIndex: number): string {
  return playerPileKind.value ? pileRowLabel(playerPileKind.value, groupIndex, groups.value.length) : ''
}

const usesRowLabels = computed(() => playerPileKind.value !== null)

const isPlayerCardsInPlay = computed(() => state.viewPile === 'player_cards_in_play')

function playerCardActionAvailable(index: number, cardId: string): boolean {
  return playerCardInPlayActions.value.some(action => action.cardIndex === index && action.cardId === cardId)
}

function cardIndexInPile(groupIndex: number, cardIndex: number): number {
  const visibleIndex = groups.value.slice(0, groupIndex).reduce((total, group) => total + group.length, 0) + cardIndex
  return isPlayerCardsInPlay.value
    ? playerCardEntries.value[visibleIndex]?.cardIndex ?? visibleIndex
    : visibleIndex
}

function selectPileCard(groupIndex: number, cardIndex: number) {
  if (!isPlayerCardsInPlay.value) return
  const index = cardIndexInPile(groupIndex, cardIndex)
  const cardId = cards.value[index]
  if (!cardId || !playerCardActionAvailable(index, cardId)) return
  closePile()
  activatePlayerCardInPlayAction(index)
}

function isKnownSpecificDeckCard(cardId: string): boolean {
  return knownSpecificDeckCards.value.has(cardId)
}

function isFaceVisible(cardId: string): boolean {
  return !isNemesisFaceDown.value && (!isSpecificDeck.value || specificDeckFaceUp.value || isKnownSpecificDeckCard(cardId))
}
</script>

<template>
  <ModalBase
    v-if="state.viewPile"
    overlay-class="pile-viewer-overlay"
    v-model:panel-ref="modalEl"
    :panel-class="['pile-modal', 'draggable-modal', { 'pile-modal-with-labels': usesRowLabels }]"
    :panel-style="{ ...modalStyle, '--pile-columns': columns }"
    :dragging="dragging"
    @overlay-click="closePile"
    @panel-pointerdown="startDrag"
  >
      <h3>
        {{ title }}
        <span class="muted">{{ orderLabel }}</span>
      </h3>
      <div v-if="cards.length === 0" class="empty">— empty —</div>
      <div v-else class="pile-rows">
        <div
          v-for="(group, gi) in groups"
          :key="gi"
          class="pile-row"
          :class="{ 'pile-row-labeled': usesRowLabels }"
        >
          <span v-if="usesRowLabels" class="pile-row-label">{{ rowLabel(gi) }}</span>
          <template v-for="(cid, i) in group" :key="cid + i">
          <CardHoverPreview v-if="isFaceVisible(cid)" :card-id="cid">
            <CardSurface
              base-class="pile-card"
              size="pile"
              :card-id="cid"
              :image-alt="getCard(cid).name"
              :class="{
                'pile-card-image': cardImageUrl(cid),
                'player-card-in-play-choice': isPlayerCardsInPlay,
                'player-card-in-play-action': isPlayerCardsInPlay && playerCardActionAvailable(cardIndexInPile(gi, i), cid),
                'player-card-in-play-disabled': isPlayerCardsInPlay && !playerCardActionAvailable(cardIndexInPile(gi, i), cid),
              }"
              @click="selectPileCard(gi, i)"
            />
          </CardHoverPreview>
          <CardHoverPreview
            v-else
            :image-url="faceDownBackImage"
            :image-alt="`${title} card back`"
          >
            <CardSurface
              base-class="pile-card"
              size="pile"
              class="pile-card-image specific-deck-unknown-card"
              :image-url="faceDownBackImage"
              :image-alt="`${title} card back`"
            >
              <span v-if="!faceDownBackImage">Unknown card</span>
            </CardSurface>
          </CardHoverPreview>
          </template>
        </div>
      </div>
      <button class="btn" @click="closePile">Close</button>
  </ModalBase>
</template>
