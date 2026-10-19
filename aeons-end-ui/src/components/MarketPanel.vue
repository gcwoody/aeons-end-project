<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../game/useGame'
import { cardImageUrl } from '../card-images'
import { getCard } from '@engine/data'
import { getDevelopActions, getPlayerCardInPlayActions, getPlayerCardInstanceZone } from '@engine/engine'
import CardHoverPreview from './CardHoverPreview.vue'

const { state, buyables, buyCard, developCard, resolveDecision, activatePlayerCardInPlayAction } = useGame()

const canBuy = computed(() => state.game!.currentTurn !== 'nemesis' && state.phase === 'main')
const marketDecision = computed(() => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'select_market_pile' || decision?.kind === 'select_setup_devour_pile' ||
    decision?.kind === 'select_setup_exiled_pile' ||
    decision?.kind === 'select_setup_supply_replacement'
    ? decision
    : null
})
const requiredMarketChoice = computed(() => marketDecision.value?.kind === 'select_market_pile'
  && marketDecision.value.emphasis === 'required')
const developActions = computed(() => state.game ? getDevelopActions(state.game, state.selectedPlayer) : [])
const endTurnActionAttention = (pileIndex: number) =>
  state.endTurnActionHint?.targetId === `market-pile:${pileIndex}`

function marketChoice(pileIndex: number) {
  return marketDecision.value?.candidates.find(choice => choice.pileIndex === pileIndex) ?? null
}

function displayedRemaining(pileIndex: number, fallback: number): number {
  return state.cardPileDisplayOverrides[`supply:${pileIndex}`]?.count ?? fallback
}

function onPileClick(pileIndex: number) {
  const decision = marketDecision.value
  if (decision) {
    const choice = marketChoice(pileIndex)
    if (!choice) return
    if (decision.kind === 'select_market_pile') resolveDecision({ kind: 'select_market_pile', choice })
    else if (decision.kind === 'select_setup_devour_pile') resolveDecision({ kind: 'select_setup_devour_pile', choice })
    else if (decision.kind === 'select_setup_exiled_pile') resolveDecision({ kind: 'select_setup_exiled_pile', choice })
    else resolveDecision({ kind: 'select_setup_supply_replacement', choice })
    return
  }
  if (!canBuy.value) return
  const pile = buyables.value.find(candidate => candidate.pileIndex === pileIndex)
  if (!pile || pile.remaining <= 0 || !pile.affordable) return
  buyCard(pileIndex)
}

function canDevelopSupplyPile(pileIndex: number): boolean {
  return developActions.value.some(action => action.source === 'supply' && action.index === pileIndex)
}

function onPileContextMenu(event: MouseEvent, pileIndex: number) {
  event.preventDefault()
  if (marketDecision.value || !canBuy.value || !canDevelopSupplyPile(pileIndex)) return
  developCard('supply', pileIndex)
}

interface SetCardPlacement {
  cardId: string
  instanceId: string
  ownerId: string
  cardIndex: number
}

function setCardsForPile(pileIndex: number): SetCardPlacement[] {
  return (state.game?.players ?? []).flatMap(player =>
    (player.playerCardsInPlay ?? []).flatMap((cardId, cardIndex) =>
      player.playerCardSupplyTargets?.[cardIndex] === pileIndex
        ? [{ cardId, ownerId: player.id, cardIndex,
            instanceId: getPlayerCardInstanceZone(state.game!, player.id, 'player_cards_in_play').instanceIds[cardIndex] ?? '' }]
        : [],
    ),
  )
}

function hasSetCards(pileIndex: number): boolean {
  return setCardsForPile(pileIndex).length > 0
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
          v-if="displayedRemaining(b.pileIndex, b.remaining) > 0"
          :card-id="b.cardId"
          :preview-width="280"
          :preview-height="388.03"
          :preview-delay="200"
        >
          <button
            type="button"
            class="pile"
            :data-supply-card-id="b.cardId"
            :data-supply-pile-index="b.pileIndex"
            data-card-motion-zone="supply"
            :data-card-motion-card-id="b.cardId"
            data-card-motion-owner-id=""
            :data-card-motion-key="`supply:${b.pileIndex}`"
            :class="{
              'can-buy': canBuy && !marketDecision && b.affordable,
              'decision-market-choice': !!marketChoice(b.pileIndex),
              'decision-market-choice-required': !!marketChoice(b.pileIndex) && requiredMarketChoice,
              'develop-action-available': canDevelopSupplyPile(b.pileIndex),
              'game-highlight': (!marketDecision && canBuy && b.affordable) || (!marketDecision && canDevelopSupplyPile(b.pileIndex)) || !!marketChoice(b.pileIndex),
              'game-highlight--available': !marketDecision && (canBuy && b.affordable || canDevelopSupplyPile(b.pileIndex)),
              'game-highlight--choice': !!marketChoice(b.pileIndex) && !requiredMarketChoice,
              'game-highlight--required': !!marketChoice(b.pileIndex) && requiredMarketChoice,
              'player-card-hover-feedback': (!marketDecision && canBuy && b.affordable) || (!marketDecision && canDevelopSupplyPile(b.pileIndex)) || !!marketChoice(b.pileIndex),
              'end-turn-attention': endTurnActionAttention(b.pileIndex),
            }"
            :data-main-action-id="endTurnActionAttention(b.pileIndex) ? `market-pile:${b.pileIndex}` : undefined"
            :aria-disabled="marketDecision ? !marketChoice(b.pileIndex) : !canBuy || !b.affordable"
            :disabled="marketDecision ? !marketChoice(b.pileIndex) : !canBuy"
            @click="onPileClick(b.pileIndex)"
            @contextmenu="onPileContextMenu($event, b.pileIndex)"
          >
            <img v-if="cardImageUrl(b.cardId)" :src="cardImageUrl(b.cardId)" :alt="b.cardName" draggable="false" />
            <span v-else class="cname">{{ b.cardName }}</span>
            <span class="remaining">{{ displayedRemaining(b.pileIndex, b.remaining) }}</span>
            <span
              v-if="b.developCost !== undefined"
              class="develop-cost-badge"
              :class="{ available: canDevelopSupplyPile(b.pileIndex) }"
              :aria-label="`Develop cost ${b.developCost} Aether`"
            >D {{ b.developCost }}</span>
            <CardHoverPreview
              v-for="(setCardId, setIndex) in setCardsForPile(b.pileIndex)"
              :key="`set-${setCardId.ownerId}-${setCardId.cardId}-${setCardId.cardIndex}`"
              :card-id="setCardId.cardId"
              :preview-width="280"
              :preview-height="388.03"
              :preview-delay="180"
            >
              <span
                v-if="displayedRemaining(b.pileIndex, b.remaining) > 0 && cardImageUrl(setCardId.cardId)"
                class="market-set-card-overlay"
                data-card-motion-zone="player_cards_in_play"
                :data-card-motion-card-id="setCardId.cardId"
                :data-card-motion-owner-id="setCardId.ownerId"
                :data-card-motion-key="`in-play-${setCardId.ownerId}-${setCardId.instanceId}`"
                :data-card-instance-id="setCardId.instanceId"
                :class="{
                  'market-set-card-overlay-action': setCardHasAction(setCardId),
                  'game-highlight': setCardHasAction(setCardId),
                  'game-highlight--available': setCardHasAction(setCardId),
                  'player-card-hover-feedback': setCardHasAction(setCardId),
                }"
                :style="{ '--set-card-index': setIndex }"
                @click="onSetCardClick($event, setCardId)"
              >
                <img :src="cardImageUrl(setCardId.cardId)" :alt="getCard(setCardId.cardId).name" draggable="false" />
              </span>
            </CardHoverPreview>
          </button>
        </CardHoverPreview>
        <button
          v-else-if="marketChoice(b.pileIndex) || hasSetCards(b.pileIndex)"
          type="button"
          class="pile pile-empty"
          :class="{
            'decision-market-choice': !!marketChoice(b.pileIndex),
            'decision-market-choice-required': !!marketChoice(b.pileIndex) && requiredMarketChoice,
            'has-set-card': hasSetCards(b.pileIndex),
            'game-highlight': !!marketChoice(b.pileIndex),
            'game-highlight--choice': !!marketChoice(b.pileIndex) && !requiredMarketChoice,
            'game-highlight--required': !!marketChoice(b.pileIndex) && requiredMarketChoice,
            'player-card-hover-feedback': !!marketChoice(b.pileIndex),
          }"
          :disabled="marketDecision ? !marketChoice(b.pileIndex) : false"
          @click="onPileClick(b.pileIndex)"
        >
          <template v-if="marketChoice(b.pileIndex)">
            <img v-if="cardImageUrl(b.cardId)" :src="cardImageUrl(b.cardId)" :alt="b.cardName" draggable="false" />
            <span class="remaining">0</span>
          </template>
          <CardHoverPreview
            v-for="(setCard, setIndex) in setCardsForPile(b.pileIndex)"
            :key="`set-empty-${setCard.ownerId}-${setCard.cardId}-${setCard.cardIndex}`"
            :card-id="setCard.cardId"
            :preview-width="280"
            :preview-height="388.03"
            :preview-delay="180"
          >
            <span
              v-if="cardImageUrl(setCard.cardId)"
              class="market-set-card-overlay"
              data-card-motion-zone="player_cards_in_play"
              :data-card-motion-card-id="setCard.cardId"
              :data-card-motion-owner-id="setCard.ownerId"
              :data-card-motion-key="`in-play-${setCard.ownerId}-${setCard.instanceId}`"
              :data-card-instance-id="setCard.instanceId"
              :class="{
                'market-set-card-overlay-action': setCardHasAction(setCard),
                'game-highlight': setCardHasAction(setCard),
                'game-highlight--available': setCardHasAction(setCard),
                'player-card-hover-feedback': setCardHasAction(setCard),
              }"
              :style="{ '--set-card-index': setIndex }"
              @click="onSetCardClick($event, setCard)"
            >
              <img :src="cardImageUrl(setCard.cardId)" :alt="getCard(setCard.cardId).name" draggable="false" />
            </span>
          </CardHoverPreview>
        </button>
        <div v-else class="pile pile-empty" aria-hidden="true"></div>
      </template>
    </div>
  </div>
</template>
