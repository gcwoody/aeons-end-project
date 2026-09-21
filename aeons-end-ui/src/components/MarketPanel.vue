<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'
import { cardImageUrl } from '../card-images'
import { getCard } from '@engine/data'
import { getPlayerCardInPlayActions } from '@engine/engine'
import CardHoverPreview from './CardHoverPreview.vue'

const { state, buyables, buyCard, resolveDecision, activatePlayerCardInPlayAction } = useGame()

const canBuy = computed(() => state.game!.currentTurn !== 'nemesis' && state.phase === 'main')
const marketDecision = computed(() => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'select_market_pile' || decision?.kind === 'select_setup_devour_pile'
    ? decision
    : null
})

function marketChoice(pileIndex: number) {
  return marketDecision.value?.candidates.find(choice => choice.pileIndex === pileIndex) ?? null
}

function onPileClick(pileIndex: number) {
  const decision = marketDecision.value
  if (decision) {
    const choice = marketChoice(pileIndex)
    if (!choice) return
    if (decision.kind === 'select_market_pile') resolveDecision({ kind: 'select_market_pile', choice })
    else resolveDecision({ kind: 'select_setup_devour_pile', choice })
    return
  }
  if (!canBuy.value) return
  const pile = buyables.value.find(candidate => candidate.pileIndex === pileIndex)
  if (!pile || pile.remaining <= 0) return
  buyCard(pileIndex)
}

interface SetCardPlacement {
  cardId: string
  ownerId: string
  cardIndex: number
}

function setCardsForPile(pileIndex: number): SetCardPlacement[] {
  return (state.game?.players ?? []).flatMap(player =>
    (player.playerCardsInPlay ?? []).flatMap((cardId, cardIndex) =>
      player.playerCardSupplyTargets?.[cardIndex] === pileIndex
        ? [{ cardId, ownerId: player.id, cardIndex }]
        : [],
    ),
  )
}

function setCardHasAction(placement: SetCardPlacement): boolean {
  if (!state.game) return false
  return getPlayerCardInPlayActions(state.game, placement.ownerId)
    .some(action => action.cardIndex === placement.cardIndex && action.cardId === placement.cardId)
}

function onSetCardClick(event: MouseEvent, placement: SetCardPlacement): void {
  if (!setCardHasAction(placement)) return
  event.stopPropagation()
  activatePlayerCardInPlayAction(placement.cardIndex, placement.ownerId)
}
</script>

<template>
  <div class="panel">
    <div class="panel-title">Market</div>
    <div class="market-grid">
      <template v-for="b in buyables" :key="b.cardId">
        <CardHoverPreview
          v-if="b.remaining > 0"
          :card-id="b.cardId"
          :preview-width="280"
          :preview-height="394"
          :preview-delay="200"
        >
          <button
            type="button"
            class="pile"
            :class="{
              'can-buy': canBuy && !marketDecision,
              'decision-market-choice': !!marketChoice(b.pileIndex),
            }"
            :disabled="marketDecision ? !marketChoice(b.pileIndex) : !canBuy"
            @click="onPileClick(b.pileIndex)"
          >
            <img v-if="cardImageUrl(b.cardId)" :src="cardImageUrl(b.cardId)" :alt="b.cardName" draggable="false" />
            <span v-else class="cname">{{ b.cardName }}</span>
            <span class="remaining">{{ b.remaining }}</span>
            <CardHoverPreview
              v-for="(setCardId, setIndex) in setCardsForPile(b.pileIndex)"
              :key="`set-${setCardId.ownerId}-${setCardId.cardId}-${setCardId.cardIndex}`"
              :card-id="setCardId.cardId"
              :preview-width="280"
              :preview-height="394"
              :preview-delay="180"
            >
              <span
                v-if="b.remaining > 0 && cardImageUrl(setCardId.cardId)"
                class="market-set-card-overlay"
                :class="{ 'market-set-card-overlay-action': setCardHasAction(setCardId) }"
                :style="{ '--set-card-index': setIndex }"
                @click="onSetCardClick($event, setCardId)"
              >
                <img :src="cardImageUrl(setCardId.cardId)" :alt="getCard(setCardId.cardId).name" draggable="false" />
              </span>
            </CardHoverPreview>
          </button>
        </CardHoverPreview>
        <button
          v-else-if="marketChoice(b.pileIndex)"
          type="button"
          class="pile pile-empty decision-market-choice"
          @click="onPileClick(b.pileIndex)"
        >
          <img v-if="cardImageUrl(b.cardId)" :src="cardImageUrl(b.cardId)" :alt="b.cardName" draggable="false" />
          <span class="remaining">0</span>
        </button>
        <div v-else class="pile pile-empty" aria-hidden="true"></div>
      </template>
    </div>
  </div>
</template>
