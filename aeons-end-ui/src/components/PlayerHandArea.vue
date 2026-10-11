<script setup lang="ts">
import { getCard } from '@engine/data'
import { playerCardBackUrl } from '../card-images'
import HandCardRow from './HandCardRow.vue'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import FaceUpPileCard from './FaceUpPileCard.vue'
import MageBoard from './MageBoard.vue'
import PileCountBadge from './PileCountBadge.vue'
import TokenBadge from './TokenBadge.vue'

interface HandCardDisplay {
  cardId: string
  instanceId?: string
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

defineProps<{
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
  discardTopInstanceId?: string
  pendingBoardDiscardArrival: { cardId: string; count: number; instanceId: string; sourceZone: string } | null
  recallAvailable: boolean
  recallActionAttention: boolean
  handCards: HandCardDisplay[]
  conjuredCard: { cardId: string; instanceId?: string; typeClass: string } | null
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
  'click-conjured-card': []
  'start-hand-spell-drag': [index: number, event: PointerEvent]
  'start-conjured-spell-drag': [event: PointerEvent]
  'open-deck': []
  'open-discard': []
}>()

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
      data-card-flight-source="mage-specific-deck"
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
    <HandCardRow
      :player-id="playerId"
      :hand-cards="handCards"
      :conjured-card="conjuredCard"
      :can-act-main="canActMain"
      :dragging-spell="draggingSpell"
      :dragged-spell-index="draggedSpellIndex"
      :dragging-conjured-card="draggingConjuredCard"
      @click-hand-card="emit('click-hand-card', $event)"
      @click-conjured-card="emit('click-conjured-card')"
      @start-hand-spell-drag="(index, event) => emit('start-hand-spell-drag', index, event)"
      @start-conjured-spell-drag="emit('start-conjured-spell-drag', $event)"
    />
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
          data-card-motion-zone="discard"
          data-card-motion-from-zones="swap,develop,breach,played"
          data-card-motion-after-zones="swap"
          :data-card-motion-card-id="discardTopCard"
          :data-card-motion-owner-id="playerId"
          :data-card-motion-key="`discard-${playerId}-top`"
          :data-card-instance-id="discardTopInstanceId"
          :card-id="discardTopCard"
          :image-alt="getCard(discardTopCard).name"
        />
      </CardHoverPreview>
      <CardSurface
        v-if="pendingBoardDiscardArrival"
        :card-id="pendingBoardDiscardArrival.cardId"
        base-class="player-pile-card"
        size="pile"
        class="player-discard-flight-target"
        data-card-motion-zone="discard"
        :data-card-motion-from-zones="pendingBoardDiscardArrival.sourceZone"
        :data-card-motion-after-zones="pendingBoardDiscardArrival.sourceZone === 'swap' ? 'swap' : undefined"
        :data-card-motion-card-id="pendingBoardDiscardArrival.cardId"
        :data-card-motion-owner-id="playerId"
        :data-card-motion-key="`discard-${playerId}-arrival`"
        :data-card-instance-id="pendingBoardDiscardArrival.instanceId"
      />
      <PileCountBadge :count="discardCount" label="Discard" />
    </div>
  </div>
</template>
