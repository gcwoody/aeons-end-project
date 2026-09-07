<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getCard } from '@engine/data'
import type { CardChoice, PendingDecisionAnswer, TurnOrderCardChoice } from '@engine/types'
import { cardImageUrl } from '../card-images'
import { useGame } from '../game/useGame'
import { chunkCards, groupPileCards, pileRowLabel } from '../game/pile-layout'
import { createTurnOrderLabels, turnOrderActorLabel } from '../game/turn-order-labels'
import { useModalDrag } from '../game/useModalDrag'

const { state, resolveDecision } = useGame()
const { modalEl, modalStyle, dragging, startDrag } = useModalDrag()
const selectedCards = ref<CardChoice[]>([])
const selectedTurnOrder = ref<number[]>([])

const decision = computed(() => state.game?.pendingDecision ?? null)

interface DecisionCardRow {
  key: string
  label: string
  choices: CardChoice[]
}

interface DecisionCardZone {
  key: string
  rows: DecisionCardRow[]
}

const cardZones = computed(() => {
  if (!decision.value || decision.value.kind !== 'select_cards') return []
  const candidates = decision.value.candidates
  const zones: DecisionCardZone[] = []
  const hand = candidates.filter(choice => choice.zone === 'hand')
  const discard = candidates.filter(choice => choice.zone === 'discard')
  const other = candidates.filter(choice => choice.zone !== 'hand' && choice.zone !== 'discard')

  const handRows = chunkCards(hand).map((choices, index) => ({
    key: `hand:${index}`, label: 'HAND', choices,
  }))
  if (handRows.length > 0) {
    zones.push({ key: 'hand', rows: handRows })
  }

  const deckCount = state.game?.players.find(player => player.id === decision.value!.playerId)?.deck.length ?? 0
  const discardGroups = groupPileCards(discard, 'discard', deckCount)
  let discardOffset = 0
  const discardRows: DecisionCardRow[] = []
  for (const [index, choices] of discardGroups.entries()) {
    discardRows.push({
      key: `discard:${index}`,
      label: `DISCARD · ${pileRowLabel('discard', index, discardGroups.length)}`,
      choices: discard.slice(discardOffset, discardOffset + choices.length),
    })
    discardOffset += choices.length
  }
  if (discardRows.length > 0) {
    zones.push({ key: 'discard', rows: discardRows })
  }

  const otherRows = chunkCards(other).map((choices, index) => ({
    key: `other:${index}`, label: 'PLAYED THIS TURN', choices,
  }))
  if (otherRows.length > 0) {
    zones.push({ key: 'other', rows: otherRows })
  }
  return zones
})

watch(() => decision.value?.id, () => {
  selectedCards.value = []
  selectedTurnOrder.value = []
})

const turnOrderLabels = computed(() => createTurnOrderLabels(state.game?.players ?? []))

function turnOrderCardLabel(cardId: string): string {
  return turnOrderActorLabel(cardId, turnOrderLabels.value)
}

function turnOrderCardPosition(index: number): number | null {
  const position = selectedTurnOrder.value.indexOf(index)
  return position < 0 ? null : position + 1
}

function toggleTurnOrderCard(card: TurnOrderCardChoice) {
  const position = selectedTurnOrder.value.indexOf(card.index)
  if (position >= 0) {
    selectedTurnOrder.value = selectedTurnOrder.value.filter(index => index !== card.index)
  } else {
    selectedTurnOrder.value = [...selectedTurnOrder.value, card.index]
  }
}

function confirmTurnOrder() {
  if (!decision.value || decision.value.kind !== 'reorder_turn_order') return
  if (selectedTurnOrder.value.length !== decision.value.cards.length) return
  answer({ kind: 'reorder_turn_order', order: [...selectedTurnOrder.value] })
}

function resetTurnOrder() {
  selectedTurnOrder.value = []
}

function selectedTurnOrderLabel(): string {
  const currentDecision = decision.value
  if (!currentDecision || currentDecision.kind !== 'reorder_turn_order') return ''
  return selectedTurnOrder.value
    .map(index => turnOrderCardLabel(currentDecision.cards.find(card => card.index === index)?.cardId ?? ''))
    .join(' → ')
}

function choiceKey(choice: CardChoice): string {
  return `${choice.zone}:${choice.index}:${choice.cardId}`
}

function isSelected(choice: CardChoice): boolean {
  return selectedCards.value.some(selected => choiceKey(selected) === choiceKey(choice))
}

function toggleCard(choice: CardChoice) {
  if (isSelected(choice)) {
    selectedCards.value = selectedCards.value.filter(selected => choiceKey(selected) !== choiceKey(choice))
    return
  }
  if (!decision.value || decision.value.kind !== 'select_cards') return
  if (selectedCards.value.length >= decision.value.max) return
  selectedCards.value.push(choice)
}

function confirmCards() {
  if (!decision.value || decision.value.kind !== 'select_cards') return
  if (selectedCards.value.length < decision.value.min || selectedCards.value.length > decision.value.max) return
  const answer: PendingDecisionAnswer = { kind: 'select_cards', choices: [...selectedCards.value] }
  resolveDecision(answer)
}

function playerName(playerId: string): string {
  const player = state.game?.players.find(candidate => candidate.id === playerId)
  return player ? `${player.mageType} (${player.id.toUpperCase()})` : playerId
}

function lifeTargetName(target: { kind: string; playerId?: string }): string {
  if (target.kind === 'player') return playerName(target.playerId ?? '')
  return target.kind === 'gravehold' ? 'Gravehold' : 'Nemesis'
}

function answer(kind: PendingDecisionAnswer) {
  resolveDecision(kind)
}
</script>

<template>
  <div v-if="decision && decision.kind !== 'confirm_prepped_effect' && decision.kind !== 'select_prepped_spell'" class="overlay decision-overlay">
    <div ref="modalEl" class="overlay-card decision-modal draggable-modal" :class="{ dragging }" :style="modalStyle" @pointerdown="startDrag">
      <h2>{{ decision.prompt }}</h2>

      <div v-if="decision.kind === 'choose_one'" class="decision-options">
        <button
          v-for="option in decision.options"
          :key="option.id"
          class="btn primary decision-option"
          @click="answer({ kind: 'choose_one', optionId: option.id })"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-else-if="decision.kind === 'choose_optional'" class="decision-options">
        <button class="btn primary decision-option" @click="answer({ kind: 'choose_optional', accepted: true })">
          {{ decision.accept.label }}
        </button>
        <button class="btn decision-option" @click="answer({ kind: 'choose_optional', accepted: false })">
          {{ decision.skip.label }}
        </button>
      </div>

      <template v-else-if="decision.kind === 'select_cards'">
        <div v-for="zone in cardZones" :key="zone.key" class="decision-card-zone">
          <div
            v-for="group in zone.rows"
            :key="group.key"
            class="pile-row pile-row-labeled decision-card-row"
            :style="{ '--choice-columns': group.choices.length }"
          >
            <span class="pile-row-label">{{ group.label }}</span>
            <button
              v-for="choice in group.choices"
              :key="choiceKey(choice)"
              class="decision-card-choice"
              :class="{ selected: isSelected(choice) }"
              @click="toggleCard(choice)"
            >
              <img v-if="cardImageUrl(choice.cardId)" :src="cardImageUrl(choice.cardId)" :alt="choice.cardName" />
              <span v-else>{{ choice.cardName }}</span>
            </button>
          </div>
        </div>
        <div class="decision-footer">
          <span class="stat">Selected {{ selectedCards.length }} / {{ decision.max }}</span>
          <div class="decision-footer-actions">
            <button v-if="decision.min === 0" class="btn" @click="answer({ kind: 'select_cards', choices: [] })">
              Skip
            </button>
            <button
              class="btn primary"
              :disabled="selectedCards.length < decision.min || selectedCards.length > decision.max"
              @click="confirmCards"
            >
              Confirm
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="decision.kind === 'reorder_turn_order'">
        <p class="decision-hint">Choose the order of the reviewed cards from top to bottom.</p>
        <div class="turn-order-review-cards">
          <button
            v-for="card in decision.cards"
            :key="card.index"
            class="turn-order-review-card"
            :class="{ selected: turnOrderCardPosition(card.index) !== null, nemesis: card.cardId === 'nemesis' }"
            @click="toggleTurnOrderCard(card)"
          >
            <span class="turn-order-review-index">{{ turnOrderCardPosition(card.index) ?? '—' }}</span>
            <span>{{ turnOrderCardLabel(card.cardId) }}</span>
          </button>
        </div>
        <p class="turn-order-review-order">
          Top →
          <template v-if="selectedTurnOrder.length > 0">
            {{ selectedTurnOrderLabel() }}
          </template>
          <span v-else> choose cards </span>
          → Bottom
        </p>
        <div class="decision-footer">
          <span class="stat">Order {{ selectedTurnOrder.length }} / {{ decision.cards.length }}</span>
          <div class="decision-footer-actions">
            <button class="btn" @click="resetTurnOrder">Reset</button>
            <button
              class="btn primary"
              :disabled="selectedTurnOrder.length !== decision.cards.length"
              @click="confirmTurnOrder"
            >
              Return Cards
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="decision.kind === 'confirm_turn_order_reveal'">
        <p class="decision-hint">Flare revealed the top card of the turn order deck.</p>
        <div class="turn-order-reveal-card" :class="{ nemesis: decision.cardId === 'nemesis' }">
          {{ turnOrderCardLabel(decision.cardId) }}
        </div>
        <p class="turn-order-reveal-note">The card will remain on top of the turn order deck.</p>
        <div class="decision-footer">
          <button class="btn primary" @click="answer({ kind: 'confirm_turn_order_reveal', accepted: true })">
            Continue
          </button>
        </div>
      </template>

      <div v-else-if="decision.kind === 'select_player_target'" class="decision-options">
        <button
          v-for="target in decision.targets"
          :key="target.playerId"
          class="btn primary decision-option"
          @click="answer({ kind: 'select_player_target', target })"
        >
          {{ playerName(target.playerId) }}
        </button>
      </div>

      <div v-else-if="decision.kind === 'select_life_target'" class="decision-options">
        <button
          v-for="target in decision.targets"
          :key="target.kind === 'player' ? target.playerId : target.kind"
          class="btn primary decision-option"
          @click="answer({ kind: 'select_life_target', target })"
        >
          {{ lifeTargetName(target) }}
        </button>
      </div>

      <div v-else-if="decision.kind === 'select_damage_target'" class="decision-options">
        <button
          v-for="target in decision.targets"
          :key="target.id"
          class="btn primary decision-option"
          @click="answer({ kind: 'select_damage_target', target })"
        >
          {{ target.label }}
        </button>
      </div>
    </div>
  </div>
</template>
