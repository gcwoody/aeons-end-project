<script setup lang="ts">
import { computed } from 'vue'
import { getCard } from '@engine/data'
import { cardImageUrl } from '../card-images'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import { chunkCards, groupPileCards, pileRowLabel, type PileKind } from '../game/pile-layout'
import { useModalDrag } from '../game/useModalDrag'
import { getNemesisPresentation } from '../game/nemesis-presentation'

const { state, displayPlayer, closePile, playerCardInPlayActions, activatePlayerCardInPlayAction } = useGame()
const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()

const title = computed(() => {
  if (state.viewPile === 'nemesis_specific') {
    return getNemesisPresentation(state.game?.nemesis.type ?? '').specificDeck.label
  }
  if (state.viewPile === 'player_cards_in_play') return 'Player Cards in Play'
  return state.viewPile === 'deck' ? 'Deck' : 'Discard'
})
const orderLabel = computed(() => state.viewPile === 'player_cards_in_play' ? '(bottom → top)' : '(top → bottom)')
const playerCardEntries = computed(() =>
  (displayPlayer.value?.playerCardsInPlay ?? [])
    .map((cardId, cardIndex) => ({ cardId, cardIndex }))
    .filter(({ cardIndex }) => displayPlayer.value?.playerCardSupplyTargets?.[cardIndex] == null),
)
const cards = computed(() => {
  if (state.viewPile === 'nemesis_specific') return state.game?.nemesis.strikeDeck ?? []
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
</script>

<template>
  <div v-if="state.viewPile" class="overlay pile-viewer-overlay" @click.self="closePile">
    <div ref="modalEl" class="overlay-card pile-modal draggable-modal" :class="{ dragging, 'pile-modal-with-labels': usesRowLabels }" :style="{ ...modalStyle, '--pile-columns': columns }" @pointerdown="startDrag">
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
          <CardHoverPreview v-for="(cid, i) in group" :key="cid + i" :card-id="cid">
            <div
              class="pile-card"
              :class="{
                'pile-card-image': cardImageUrl(cid),
                'player-card-in-play-choice': isPlayerCardsInPlay,
                'player-card-in-play-action': isPlayerCardsInPlay && playerCardActionAvailable(cardIndexInPile(gi, i), cid),
                'player-card-in-play-disabled': isPlayerCardsInPlay && !playerCardActionAvailable(cardIndexInPile(gi, i), cid),
              }"
              @click="selectPileCard(gi, i)"
            >
              <img v-if="cardImageUrl(cid)" :src="cardImageUrl(cid)" :alt="getCard(cid).name" />
              <span v-else>{{ getCard(cid).name }}</span>
            </div>
          </CardHoverPreview>
        </div>
      </div>
      <button class="btn" @click="closePile">Close</button>
    </div>
  </div>
</template>
