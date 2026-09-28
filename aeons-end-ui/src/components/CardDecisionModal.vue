<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard, MAGES } from '@engine/data'
import type { CardChoice, CollectiveCardChoice, PendingDecision, PendingDecisionAnswer, SpecificDeckPlacement, TurnOrderCardChoice } from '@engine/types'
import { cardImageUrl, specificDeckCardImageUrl } from '../card-images'
import { mageImageUrls } from '../mage-images'
import { useGame } from '../game/useGame'
import { createTurnOrderLabels, turnOrderActorLabel } from '../game/turn-order-labels'
import { useModalDrag } from '../game/useModalDrag'
import { displayMageName, formatMageNamesInText } from '../game/display-name'
import CardSelectionPanel, { type CardSelectionItem } from './CardSelectionPanel.vue'
import LargeCardChoicePanel, { type LargeCardChoiceOption } from './LargeCardChoicePanel.vue'
import ModalBase from './ModalBase.vue'
import MageAbilityChoice from './MageAbilityChoice.vue'
import CardSurface from './CardSurface.vue'

const {
  state, resolveDecision, confirmPendingPreppedSpells,
  isBoardCardSelectionActive, confirmPendingBoardCards, skipPendingBoardCards,
} = useGame()
const { modalEl, modalStyle, dragging, startDrag, resetModalPosition } = useModalDrag()
const selectedCardKeys = ref<string[]>([])
const selectedTurnOrder = ref<number[]>([])

const decision = computed(() => state.game?.pendingDecision ?? null)
const decisionFormPreview = computed(() => {
  const preview = decision.value?.cardPreview
  if (!preview) return null
  return {
    ...preview,
    imageUrl: specificDeckCardImageUrl(preview.mageType, preview.cardId, preview.formSide),
  }
})
const isDirectBoardCardDecision = computed(() => isBoardCardSelectionActive())
const revealedCardId = computed(() => {
  const current = decision.value
  if (current?.kind !== 'choose_one' || state.game?.pendingEffect?.awaiting?.kind !== 'reveal_top_cards') return null
  return state.game.pendingEffect.revealedTopCard?.cardId ?? null
})
const revealedCardOwnerId = computed(() => state.game?.pendingEffect?.revealedTopCard?.playerId ?? null)
type DirectBoardCardDecision = Extract<PendingDecision, { kind: 'select_cards' | 'select_collective_cards' }>
const boardCardDecision = computed<DirectBoardCardDecision | null>(() => {
  const current = decision.value
  if (!current || !isDirectBoardCardDecision.value) return null
  return current.kind === 'select_cards' || current.kind === 'select_collective_cards' ? current : null
})
const isDirectMarketDecision = computed(() =>
  decision.value?.kind === 'select_market_pile' || decision.value?.kind === 'select_setup_devour_pile',
)
const isLargeSpecificDeckSelection = computed(() =>
  decision.value?.kind === 'select_cards'
    && decision.value.source === 'specific_deck'
    && (state.game?.pendingEffect?.specificDeckReveal?.mode === 'put_one_into_play'
      || state.game?.pendingEffect?.awaiting?.kind === 'select_breach_upgrade_card'),
)
const isLargeCardSelection = computed(() =>
  decision.value?.kind === 'choose_one' && decision.value.layout === 'large-card-selection',
)
const isLargeCardChoice = computed(() =>
  decision.value?.kind === 'choose_one' && decision.value.layout === 'large-card-choice',
)
const largeCardChoices = computed<LargeCardChoiceOption[]>(() => {
  if (!isLargeCardChoice.value || decision.value?.kind !== 'choose_one') return []
  return decision.value.options.flatMap(option => option.cardId ? [{
    id: option.id,
    cardId: option.cardId,
    cardName: getCard(option.cardId).name,
    disabled: option.disabled,
    disabledReason: option.disabled ? 'This option is not available right now.' : undefined,
  }] : [])
})
const isMageAbilityChoice = computed(() =>
  decision.value?.kind === 'choose_one' && decision.value.layout === 'mage-ability',
)
const abilitySourceMage = computed(() =>
  state.game?.players.find(player => player.id === state.game?.pendingEffect?.sourcePlayerId) ?? null,
)
const abilitySourceMageMat = computed(() =>
  abilitySourceMage.value ? mageImageUrls(abilitySourceMage.value.mageType)?.front : undefined,
)
const showsPlayerLife = computed(() => {
  const current = decision.value
  const awaiting = state.game?.pendingEffect?.awaiting
  return (current?.kind === 'select_player_target' && awaiting?.kind === 'deal_player_damage')
    || (current?.kind === 'select_life_target' && awaiting?.kind === 'gain_life')
})

watch(() => decision.value?.id, () => {
  selectedCardKeys.value = []
  selectedTurnOrder.value = []
  // Each decision is a new modal context. Do not carry a position dragged
  // for a previous decision into the next one.
  resetModalPosition()
})

const turnOrderLabels = computed(() => createTurnOrderLabels(state.game?.players ?? []))

const specificDeckName = computed(() => {
  const current = decision.value
  const ownerId = current?.kind === 'select_cards' && current.source === 'specific_deck'
    ? current.ownerId ?? state.game?.pendingEffect?.specificDeckReveal?.playerId
    : state.game?.pendingEffect?.specificDeckReveal?.playerId
  const mageType = state.game?.players.find(player => player.id === ownerId)?.mageType
  return MAGES[mageType ?? '']?.specificDeckName ?? 'Specific Deck'
})

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

function placeSpecificDeckCard(cardId: string, placement: SpecificDeckPlacement) {
  if (decision.value?.kind !== 'place_specific_deck_card') return
  answer({ kind: 'place_specific_deck_card', cardId, placement })
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

function collectiveChoiceKey(choice: CollectiveCardChoice): string {
  return `${choice.playerId}:${choiceKey(choice.choice)}`
}

const selectionItems = computed<CardSelectionItem[]>(() => {
  if (decision.value?.kind === 'select_cards') {
    return decision.value.candidates.map(choice => ({
      key: choiceKey(choice),
      cardId: choice.cardId,
      cardName: choice.cardName,
      groupKey: choice.zone,
      groupLabel: choice.zone === 'hand' ? 'HAND'
        : choice.zone === 'discard' ? 'DISCARD PILE'
          : choice.zone === 'deck' ? 'DECK'
          : choice.zone === 'swap_zone' ? 'SWAP ZONE'
            : choice.zone === 'specific_deck' ? specificDeckName.value : 'PLAYED THIS TURN',
      disabled: choice.disabled,
      disabledReason: choice.disabledReason ?? (choice.disabled ? 'Not enough Knowledge to install this upgrade.' : undefined),
    }))
  }
  if (decision.value?.kind === 'select_collective_cards') {
    return decision.value.candidates.map(choice => ({
      key: collectiveChoiceKey(choice),
      cardId: choice.choice.cardId,
      cardName: choice.choice.cardName,
      groupKey: choice.playerId,
      groupLabel: `${playerName(choice.playerId)} HAND`,
    }))
  }
  if (isLargeCardSelection.value && decision.value?.kind === 'choose_one') {
    return decision.value.options.flatMap(option => option.cardId ? [{
      key: largeCardOptionKey(option.id),
      cardId: option.cardId,
      cardName: getCard(option.cardId).name,
      groupKey: 'options',
      groupLabel: '',
      disabled: option.disabled,
      disabledReason: option.disabled ? 'This option is not available right now.' : undefined,
    }] : [])
  }
  return []
})

const decisionColumns = computed(() => {
  const groupCounts = new Map<string, number>()
  for (const item of selectionItems.value) groupCounts.set(item.groupKey, (groupCounts.get(item.groupKey) ?? 0) + 1)
  return Math.max(1, Math.min(5, Math.max(0, ...[...groupCounts.values()].map(count => Math.min(5, count)))))
})
const cardSelectionMinimum = computed(() => {
  if (isLargeCardSelection.value) return 1
  return decision.value && 'min' in decision.value ? decision.value.min : 0
})
const cardSelectionMaximum = computed(() => {
  if (isLargeCardSelection.value) return 1
  return decision.value && 'max' in decision.value ? decision.value.max : 0
})
function decisionPrompt(prompt: string): string {
  return formatMageNamesInText(prompt, state.game?.players.map(player => player.mageType) ?? [])
}

function largeCardOptionKey(optionId: string): string {
  return `large-option:${optionId}`
}

function chooseLargeCard(optionId: string) {
  if (!isLargeCardChoice.value || decision.value?.kind !== 'choose_one') return
  const option = decision.value.options.find(candidate => candidate.id === optionId && !candidate.disabled)
  if (option) answer({ kind: 'choose_one', optionId: option.id })
}

function confirmSelectedCards() {
  if (isLargeCardSelection.value && decision.value?.kind === 'choose_one') {
    if (selectedCardKeys.value.length !== 1) return
    const option = decision.value.options.find(candidate =>
      largeCardOptionKey(candidate.id) === selectedCardKeys.value[0] && !candidate.disabled && candidate.cardId)
    if (option) answer({ kind: 'choose_one', optionId: option.id })
    return
  }
  if (decision.value?.kind === 'select_cards') {
    const choices = decision.value.candidates.filter(choice => selectedCardKeys.value.includes(choiceKey(choice)))
    if (choices.length < decision.value.min || choices.length > decision.value.max) return
    resolveDecision({ kind: 'select_cards', choices })
    return
  }
  if (decision.value?.kind === 'select_collective_cards') {
    const choices = decision.value.candidates.filter(choice => selectedCardKeys.value.includes(collectiveChoiceKey(choice)))
    if (choices.length < decision.value.min || choices.length > decision.value.max) return
    resolveDecision({ kind: 'select_collective_cards', choices })
  }
}

function skipSelectedCards() {
  if (decision.value?.kind === 'select_cards' && decision.value.min === 0) {
    resolveDecision({ kind: 'select_cards', choices: [] })
  } else if (decision.value?.kind === 'select_collective_cards' && decision.value.min === 0) {
    resolveDecision({ kind: 'select_collective_cards', choices: [] })
  }
}

function playerName(playerId: string): string {
  const player = state.game?.players.find(candidate => candidate.id === playerId)
  return displayMageName(player?.mageType ?? playerId.replace(/^wave\d+_/i, ''))
}

function playerTargetLabel(playerId: string): string {
  if (decision.value?.kind === 'select_player_target' && decision.value.prompt === 'Choose a player to suffer damage') {
    return `Attack ${playerName(playerId)}`
  }
  return playerName(playerId)
}

function lifeTargetName(target: { kind: string; playerId?: string }): string {
  if (target.kind === 'player') return playerName(target.playerId ?? '')
  return target.kind === 'gravehold' ? 'Gravehold' : 'Nemesis'
}

function playerLifeLabel(playerId: string): string {
  const player = state.game?.players.find(candidate => candidate.id === playerId)
  return player ? `HP ${player.hp}/${player.maxHp}` : ''
}

function answer(kind: PendingDecisionAnswer) {
  resolveDecision(kind)
}

function skipPreppedSpell() {
  if (decision.value?.kind !== 'select_prepped_spell' || !decision.value.allowSkip) return
  answer({ kind: 'select_prepped_spell', choice: null })
}

function confirmNemesisDraw() {
  if (!decision.value || decision.value.kind !== 'confirm_nemesis_draw') return
  answer({ kind: 'confirm_nemesis_draw', accepted: true })
}

function onDecisionKeydown(event: KeyboardEvent) {
  if (event.code !== 'Space' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  const currentDecision = decision.value
  if (!currentDecision || currentDecision.kind === 'confirm_nemesis_draw' || currentDecision.kind === 'confirm_nemesis_effect') return
  if (state.helpOpen || state.viewPile || state.exitPrompt || state.debugOpen) return
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return

  const confirmButton = Array.from(modalEl.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    .find(button => button.textContent?.replace(/\s+/g, ' ').trim() === 'Confirm')
  if (!confirmButton) return

  event.preventDefault()
  if (event.repeat || confirmButton.disabled) return
  confirmButton.click()
}

onMounted(() => document.addEventListener('keydown', onDecisionKeydown, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onDecisionKeydown, true))
</script>

<template>
  <ModalBase
    v-if="decision?.kind === 'confirm_nemesis_draw'"
    overlay-class="decision-overlay nemesis-reveal-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    panel-class="nemesis-reveal-modal draggable-modal"
    :panel-style="modalStyle"
    :dragging="dragging"
    @panel-pointerdown="startDrag"
  >
      <h2>{{ decision.source === 'specific_deck' ? 'Nemesis Specific Deck Draw' : 'Nemesis Draw' }}</h2>
      <p class="decision-hint">
        {{ decision.source === 'specific_deck'
          ? 'A card was drawn from the Nemesis specific deck. Reveal it, then click Confirm to resolve it.'
          : 'A Nemesis card was drawn. Reveal it, then click Confirm to continue.' }}
      </p>
      <div class="nemesis-reveal-card">
        <img v-if="cardImageUrl(decision.cardId)" :src="cardImageUrl(decision.cardId)" :alt="getCard(decision.cardId).name" draggable="false" />
        <span v-else>{{ getCard(decision.cardId).name }}</span>
      </div>
      <div class="overlay-actions">
        <button class="btn primary confirm-button" @click="confirmNemesisDraw">
          Confirm
        </button>
      </div>
  </ModalBase>

  <ModalBase
    v-if="isDirectMarketDecision"
    overlay-class="decision-overlay non-blocking-decision-overlay non-blocking-market-selection-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    panel-class="decision-modal non-blocking-selection-modal draggable-modal"
    :panel-style="modalStyle"
    :dragging="dragging"
    @panel-pointerdown="startDrag"
  >
      <h2>{{ decisionPrompt(decision?.prompt ?? '') }}</h2>
      <p class="decision-hint">Select a highlighted supply pile directly in the Market.</p>
  </ModalBase>

  <ModalBase
    v-if="decision?.kind === 'select_prepped_spells'"
    overlay-class="decision-overlay non-blocking-decision-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    panel-class="decision-modal non-blocking-prepped-modal draggable-modal"
    :panel-style="modalStyle"
    :dragging="dragging"
    @panel-pointerdown="startDrag"
  >
      <h2>{{ decisionPrompt(decision.prompt) }}</h2>
      <p class="decision-hint">Select prepped spells directly on the player boards. You can switch players while this panel remains open.</p>
      <div class="decision-footer">
        <span class="stat">{{ state.pendingPreppedSpells.length }}/{{ decision.max }} chosen prepped spells</span>
        <button
          class="btn primary"
          :disabled="state.pendingPreppedSpells.length < decision.min || state.pendingPreppedSpells.length > decision.max"
          @click="confirmPendingPreppedSpells"
        >
          Confirm
        </button>
      </div>
  </ModalBase>

  <ModalBase
    v-if="decision?.kind === 'select_prepped_spell' && decision.allowSkip"
    overlay-class="decision-overlay non-blocking-decision-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    panel-class="decision-modal non-blocking-prepped-modal draggable-modal"
    :panel-style="modalStyle"
    :dragging="dragging"
    @panel-pointerdown="startDrag"
  >
      <h2>{{ decisionPrompt(decision.prompt) }}</h2>
      <p class="decision-hint">Select a highlighted prepped spell on the player board to cast it, or skip to finish.</p>
      <div class="decision-footer">
        <button class="btn" @click="skipPreppedSpell">Skip</button>
      </div>
  </ModalBase>

  <ModalBase
    v-if="decision?.kind === 'select_conjure_breach'"
    overlay-class="decision-overlay non-blocking-decision-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    panel-class="decision-modal non-blocking-prepped-modal draggable-modal"
    :panel-style="modalStyle"
    :dragging="dragging"
    @panel-pointerdown="startDrag"
  >
      <h2>Conjure</h2>
      <p class="decision-hint">
        {{ decision.candidates.length > 0
          ? 'Drag the highlighted card from your hand to a highlighted Breach, or skip to leave it on top of your deck.'
          : 'No eligible Breach is available. Skip to leave the highlighted card on top of your deck.' }}
      </p>
      <div class="decision-footer">
        <button class="btn" @click="answer({ kind: 'select_conjure_breach', choice: null })">Skip</button>
      </div>
  </ModalBase>

  <ModalBase
    v-if="boardCardDecision"
    overlay-class="decision-overlay non-blocking-decision-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    panel-class="decision-modal non-blocking-selection-modal draggable-modal"
    :panel-style="modalStyle"
    :dragging="dragging"
    @panel-pointerdown="startDrag"
  >
      <h2>{{ boardCardDecision.prompt }}</h2>
      <p class="decision-hint">Select highlighted cards directly on the player boards. You can switch players while this panel remains open.</p>
      <div class="decision-footer">
        <span class="stat">{{ state.pendingBoardCards.length }} / {{ boardCardDecision.max }} selected</span>
        <div class="decision-footer-actions">
          <button v-if="boardCardDecision.min === 0" class="btn" @click="skipPendingBoardCards">Skip</button>
          <button
            class="btn primary"
            :disabled="state.pendingBoardCards.length < boardCardDecision.min || state.pendingBoardCards.length > boardCardDecision.max"
            @click="confirmPendingBoardCards"
          >
            Confirm
          </button>
        </div>
      </div>
  </ModalBase>

  <ModalBase
    v-if="decision && !isDirectBoardCardDecision && decision.kind !== 'select_breach' && decision.kind !== 'select_exhaust_breach' && decision.kind !== 'select_conjure_breach' && decision.kind !== 'confirm_prepped_effect' && decision.kind !== 'select_prepped_spell' && decision.kind !== 'select_prepped_spells' && decision.kind !== 'select_market_pile' && decision.kind !== 'select_setup_devour_pile' && decision.kind !== 'confirm_nemesis_draw' && decision.kind !== 'confirm_nemesis_effect' && decision.kind !== 'select_damage_target'"
    overlay-class="decision-overlay"
    :blocking="true"
    v-model:panel-ref="modalEl"
    :panel-class="isMageAbilityChoice ? 'decision-modal mage-ability-modal draggable-modal' : 'decision-modal draggable-modal'"
    :panel-style="{ ...modalStyle, '--decision-columns': decisionColumns }"
    :dragging="dragging"
    @panel-pointerdown="startDrag"
  >
      <h2>{{ decisionPrompt(decision.prompt) }}</h2>
      <CardSurface
        v-if="decisionFormPreview"
        base-class="decision-form-card"
        size="large"
        :card-id="decisionFormPreview.cardId"
        :image-url="decisionFormPreview.imageUrl"
        :image-alt="`${getCard(decisionFormPreview.cardId).name} — ${decisionFormPreview.formSide === 'taker' ? 'Taker' : 'Giver'} Form`"
      />

      <template v-if="decision.kind === 'choose_one' && revealedCardId">
        <p class="decision-hint" v-if="revealedCardOwnerId">
          {{ playerName(revealedCardOwnerId) }} revealed this card from the top of their deck.
        </p>
        <p class="decision-hint" v-else>
          A card was revealed from the top of a deck.
        </p>
        <div class="reveal-top-card">
          <img v-if="cardImageUrl(revealedCardId)" :src="cardImageUrl(revealedCardId)" :alt="getCard(revealedCardId).name" draggable="false" />
          <span v-else>{{ getCard(revealedCardId).name }}</span>
        </div>
        <div class="decision-options">
          <button
            v-for="option in decision.options"
            :key="option.id"
            class="btn primary decision-option"
            :class="{ unavailable: option.disabled }"
            :disabled="option.disabled"
            @click="answer({ kind: 'choose_one', optionId: option.id })"
          >
            {{ option.label }}
          </button>
        </div>
      </template>

      <template v-else-if="decision.kind === 'place_specific_deck_card'">
        <p class="decision-hint">Choose a card and return it to the top or bottom of {{ specificDeckName }}. The selected card leaves this reveal immediately.</p>
        <div class="specific-deck-placement-grid">
          <div
            v-for="(card, index) in decision.cards"
            :key="`${card.cardId}:${index}`"
            class="specific-deck-placement-card"
            :style="{ gridColumn: String(card.slot + 1) }"
          >
            <div class="specific-deck-reveal-card">
              <img
                v-if="cardImageUrl(card.cardId)"
                :src="cardImageUrl(card.cardId)"
                :alt="card.cardName"
                draggable="false"
              />
              <span v-else>{{ card.cardName }}</span>
            </div>
            <div class="specific-deck-placement-actions">
              <button
                class="btn decision-option"
                type="button"
                @click="placeSpecificDeckCard(card.cardId, 'top')"
              >
                Return to Top
              </button>
              <button
                class="btn decision-option"
                type="button"
                @click="placeSpecificDeckCard(card.cardId, 'bottom')"
              >
                Return to Bottom
              </button>
            </div>
          </div>
        </div>
      </template>

      <MageAbilityChoice
        v-else-if="decision.kind === 'choose_one' && decision.layout === 'mage-ability'"
        :mage-mat-url="abilitySourceMageMat"
        :mage-name="playerName(abilitySourceMage?.id ?? '')"
        :options="decision.options"
        @select="answer({ kind: 'choose_one', optionId: $event })"
      />

      <LargeCardChoicePanel
        v-else-if="isLargeCardChoice"
        :choices="largeCardChoices"
        @choose="chooseLargeCard"
      />

      <CardSelectionPanel
        v-else-if="decision.kind === 'select_cards' || decision.kind === 'select_collective_cards' || isLargeCardSelection"
        :key="decision.id"
        v-model:selected-keys="selectedCardKeys"
        :choices="selectionItems"
        :min="cardSelectionMinimum"
        :max="cardSelectionMaximum"
        :large-cards="isLargeSpecificDeckSelection || isLargeCardSelection"
        :group-labels="!isLargeCardSelection"
        @confirm="confirmSelectedCards"
        @skip="skipSelectedCards"
      />

      <div
        v-else-if="decision.kind === 'choose_one'"
        class="decision-options"
        :class="{ 'stacked-panels': decision.layout === 'stacked-panels' }"
      >
        <button
          v-for="option in decision.options"
          :key="option.id"
          class="btn primary decision-option"
          :class="{ unavailable: option.disabled }"
          :disabled="option.disabled"
          :title="option.disabled ? 'This option is not available right now.' : undefined"
          @click="answer({ kind: 'choose_one', optionId: option.id })"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-else-if="decision.kind === 'choose_optional'" class="decision-options">
        <button
          class="btn primary decision-option"
          :class="{ unavailable: decision.accept.disabled }"
          :disabled="decision.accept.disabled"
          :title="decision.accept.disabled ? 'This option is not available right now.' : undefined"
          @click="answer({ kind: 'choose_optional', accepted: true })"
        >
          {{ decision.accept.label }}
        </button>
        <button class="btn decision-option" @click="answer({ kind: 'choose_optional', accepted: false })">
          {{ decision.skip.label }}
        </button>
      </div>

      <template v-else-if="decision.kind === 'reorder_turn_order'">
        <p class="decision-hint">Choose the order of the revealed cards from top to bottom.</p>
        <div class="turn-order-reveal-cards">
          <button
            v-for="card in decision.cards"
            :key="card.index"
            class="turn-order-reveal-card"
            :class="{ selected: turnOrderCardPosition(card.index) !== null, nemesis: card.cardId === 'nemesis' }"
            @click="toggleTurnOrderCard(card)"
          >
            <span class="turn-order-reveal-index">{{ turnOrderCardPosition(card.index) ?? '—' }}</span>
            <span>{{ turnOrderCardLabel(card.cardId) }}</span>
          </button>
        </div>
        <p class="turn-order-reveal-order">
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

      <template v-else-if="decision.kind === 'select_turn_order_card'">
        <p class="decision-hint">Choose a player's turn order card from the discard pile.</p>
        <div class="turn-order-reveal-cards">
          <button
            v-for="card in decision.cards"
            :key="card.index"
            class="turn-order-reveal-card"
            @click="answer({ kind: 'select_turn_order_card', choice: card })"
          >
            {{ turnOrderCardLabel(card.cardId) }}
          </button>
        </div>
      </template>

      <template v-else-if="decision.kind === 'choose_turn_order_position'">
        <p class="decision-hint">Choose where to place the revealed turn order card.</p>
        <div class="decision-options">
          <button class="btn primary decision-option" @click="answer({ kind: 'choose_turn_order_position', position: 'top' })">
            Place on Top
          </button>
          <button class="btn decision-option" @click="answer({ kind: 'choose_turn_order_position', position: 'bottom' })">
            Place on Bottom
          </button>
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
          class="btn primary decision-option player-target-option"
          @click="answer({ kind: 'select_player_target', target })"
        >
          <span>{{ playerTargetLabel(target.playerId) }}</span>
          <span v-if="showsPlayerLife" class="player-target-vitals">{{ playerLifeLabel(target.playerId) }}</span>
        </button>
      </div>

      <div v-else-if="decision.kind === 'select_life_target'" class="decision-options">
        <button
          v-for="target in decision.targets"
          :key="target.kind === 'player' ? target.playerId : target.kind"
          class="btn primary decision-option player-target-option"
          @click="answer({ kind: 'select_life_target', target })"
        >
          <span>{{ lifeTargetName(target) }}</span>
          <span v-if="showsPlayerLife && target.kind === 'player'" class="player-target-vitals">{{ playerLifeLabel(target.playerId ?? '') }}</span>
        </button>
      </div>

  </ModalBase>
</template>
