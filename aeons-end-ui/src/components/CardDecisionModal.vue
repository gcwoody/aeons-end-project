<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCard, MAGES } from '@engine/data'
import type { CardChoice, CollectiveCardChoice, LifeTargetRef, PendingDecision, PendingDecisionAnswer, PlayerTargetRef, SpecificDeckPlacement, TurnOrderCardChoice } from '@engine/types'
import {
  cardImageUrl,
  nemesisTurnOrderTokenUrl,
  playerTurnOrderTokenUrl,
  pulseTokenImageUrl,
  specificDeckCardImageUrl,
} from '../card-images'
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
import TwoButtonChoice from './TwoButtonChoice.vue'
import TokenAmountChoicePanel from './TokenAmountChoicePanel.vue'
import TurnOrderToken from './TurnOrderToken.vue'
import TurnOrderTokenRow, { type TurnOrderTokenItem } from './TurnOrderTokenRow.vue'
import PlayerDamageChoice, { type PlayerDamageChoiceItem } from './PlayerDamageChoice.vue'
import PlayerDiscardChoice, { type PlayerDiscardActionSummary, type PlayerDiscardChoiceItem } from './PlayerDiscardChoice.vue'
import PlayerLifeChoice, { type PlayerLifeChoiceItem } from './PlayerLifeChoice.vue'
import PreppedSpellChoicePanel from './PreppedSpellChoicePanel.vue'

const {
  state, resolveDecision, isImmediatePreppedSpellCast, confirmPendingPreppedSpells, skipPendingPreppedSpells,
  isBoardCardSelectionActive, confirmPendingBoardCards, skipPendingBoardCards,
} = useGame()
const { modalEl, modalStyle, dragging, startDrag, resetModalPosition } = useModalDrag()
const selectedCardKeys = ref<string[]>([])
const selectedCardOrderKeys = ref<string[]>([])
const selectedTurnOrder = ref<number[]>([])
const selectedTokenAmount = ref(0)

const decision = computed(() => state.game?.pendingDecision ?? null)
const immediatePreppedSpellCast = computed(isImmediatePreppedSpellCast)
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
  if (current?.kind === 'confirm_revealed_card') return current.cardId
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
    && ((state.game?.pendingEffect?.specificDeckReveal?.mode === 'put_one_into_play'
      && decision.value.layout !== 'instant-card-choice')
      || state.game?.pendingEffect?.awaiting?.kind === 'select_breach_upgrade_card'),
)
const isInstantCardChoice = computed(() =>
  decision.value?.kind === 'select_cards' && decision.value.layout === 'instant-card-choice',
)
const instantCardChoices = computed<LargeCardChoiceOption[]>(() => {
  const current = decision.value
  if (!isInstantCardChoice.value || current?.kind !== 'select_cards') return []
  return current.candidates.map(choice => ({
    id: choiceKey(choice),
    cardId: choice.cardId,
    cardName: choice.cardName,
    disabled: choice.disabled,
    disabledReason: choice.disabledReason,
  }))
})
const isLargeCardSelection = computed(() =>
  decision.value?.kind === 'choose_one' && decision.value.layout === 'large-card-selection',
)
const isLargeCardChoice = computed(() =>
  decision.value?.kind === 'choose_one' && decision.value.layout === 'large-card-choice',
)
const isTwoButtonChoice = computed(() =>
  decision.value?.kind === 'choose_one' && decision.value.layout === 'two-button-choice',
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
const isPlayerDamageChoice = computed(() =>
  decision.value?.kind === 'select_player_target'
    && state.game?.pendingEffect?.awaiting?.kind === 'deal_player_damage',
)
const playerDamageChoices = computed<PlayerDamageChoiceItem[]>(() => {
  const current = decision.value
  if (current?.kind !== 'select_player_target' || !isPlayerDamageChoice.value) return []
  return current.targets.map(target => {
    const player = state.game?.players.find(candidate => candidate.id === target.playerId)
    return {
      target,
      mageName: playerName(target.playerId),
      hp: player?.hp ?? null,
      tokenUrl: turnOrderTokenUrl(target.playerId),
      damage: playerDamageAmount(target.playerId),
    }
  })
})
const isPlayerLifeChoice = computed(() => {
  const current = decision.value
  return current?.kind === 'select_life_target'
    && state.game?.pendingEffect?.awaiting?.kind === 'gain_life'
    && current.targets.length > 1
    && current.targets.every(target => target.kind === 'player')
})
const playerLifeChoices = computed<PlayerLifeChoiceItem[]>(() => {
  const current = decision.value
  const effect = state.game?.pendingEffect?.awaiting
  if (current?.kind !== 'select_life_target' || effect?.kind !== 'gain_life' || !isPlayerLifeChoice.value) return []
  return current.targets.flatMap(target => {
    if (target.kind !== 'player') return []
    const player = state.game?.players.find(candidate => candidate.id === target.playerId)
    return [{
      target,
      mageName: playerName(target.playerId),
      hp: player?.hp ?? null,
      tokenUrl: turnOrderTokenUrl(target.playerId),
      amount: effect.amount,
    }]
  })
})
const isPlayerDiscardChoice = computed(() =>
  decision.value?.kind === 'select_player_target'
    && decision.value.playerDiscardAction !== undefined,
)
const playerDiscardAction = computed<PlayerDiscardActionSummary | null>(() => {
  const current = decision.value
  return current?.kind === 'select_player_target' ? current.playerDiscardAction ?? null : null
})
const playerDiscardChoices = computed<PlayerDiscardChoiceItem[]>(() => {
  const current = decision.value
  if (current?.kind !== 'select_player_target' || !isPlayerDiscardChoice.value) return []
  return current.targets.map(target => {
    const player = state.game?.players.find(candidate => candidate.id === target.playerId)
    return {
      target,
      mageName: playerName(target.playerId),
      handCount: player?.hand.length ?? 0,
      tokenUrl: turnOrderTokenUrl(target.playerId),
    }
  })
})

watch(() => decision.value?.id, () => {
  selectedCardKeys.value = []
  selectedCardOrderKeys.value = decision.value?.kind === 'select_cards' && decision.value.reorderable
    ? decision.value.candidates.map(choiceKey)
    : []
  selectedTurnOrder.value = decision.value?.kind === 'reorder_turn_order'
    ? decision.value.cards.map(card => card.index)
    : []
  selectedTokenAmount.value = decision.value?.kind === 'choose_token_amount'
    ? decision.value.minAmount
    : 0
  // Each decision is a new modal context. Do not carry a position dragged
  // for a previous decision into the next one.
  resetModalPosition()
}, { immediate: true })

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

function turnOrderTokenUrl(cardId: string): string | undefined {
  if (cardId === 'nemesis') return nemesisTurnOrderTokenUrl()
  const playerIndex = state.game?.players.findIndex(player => player.id === cardId) ?? -1
  return playerIndex >= 0 ? playerTurnOrderTokenUrl(playerIndex + 1) : undefined
}

function turnOrderTokenItem(card: TurnOrderCardChoice): TurnOrderTokenItem {
  return {
    key: String(card.index),
    label: turnOrderCardLabel(card.cardId),
    tokenUrl: turnOrderTokenUrl(card.cardId),
  }
}

const reorderTurnOrderItems = computed<TurnOrderTokenItem[]>(() => {
  const current = decision.value
  if (!current || current.kind !== 'reorder_turn_order') return []
  return selectedTurnOrder.value
    .map(index => current.cards.find(card => card.index === index))
    .filter((card): card is TurnOrderCardChoice => !!card)
    .map(turnOrderTokenItem)
})

const selectTurnOrderItems = computed<TurnOrderTokenItem[]>(() => {
  const current = decision.value
  if (!current || current.kind !== 'select_turn_order_card') return []
  return current.cards.map(turnOrderTokenItem)
})

function reorderTurnOrder(keys: string[]) {
  if (decision.value?.kind !== 'reorder_turn_order') return
  selectedTurnOrder.value = keys.map(Number).filter(index => Number.isInteger(index))
}

function chooseTurnOrderCard(item: TurnOrderTokenItem) {
  const current = decision.value
  if (!current || current.kind !== 'select_turn_order_card') return
  const card = current.cards.find(candidate => String(candidate.index) === item.key)
  if (card) answer({ kind: 'select_turn_order_card', choice: card })
}

function confirmTurnOrder() {
  if (!decision.value || decision.value.kind !== 'reorder_turn_order') return
  if (selectedTurnOrder.value.length !== decision.value.cards.length) return
  answer({ kind: 'reorder_turn_order', order: [...selectedTurnOrder.value] })
}

function placeSpecificDeckCard(cardId: string, slot: number, placement: SpecificDeckPlacement) {
  if (decision.value?.kind !== 'place_specific_deck_card') return
  answer({ kind: 'place_specific_deck_card', cardId, slot, placement })
}

function resetTurnOrder() {
  if (decision.value?.kind !== 'reorder_turn_order') return
  selectedTurnOrder.value = decision.value.cards.map(card => card.index)
}

function choiceKey(choice: CardChoice): string {
  return `${choice.zone}:${choice.index}:${choice.cardId}`
}

function collectiveChoiceKey(choice: CollectiveCardChoice): string {
  return `${choice.playerId}:${choiceKey(choice.choice)}`
}

function collectiveZoneLabel(zone: CardChoice['zone']): string {
  if (zone === 'discard') return 'DISCARD PILE'
  if (zone === 'played_this_turn') return 'PLAYED THIS TURN'
  if (zone === 'player_cards_in_play') return 'PLAYER CARDS IN PLAY'
  return zone.replace(/_/g, ' ').toUpperCase()
}

function cardMotionZone(zone: CardChoice['zone']): string | undefined {
  if (zone === 'played_this_turn') return 'played'
  if (zone === 'swap_zone') return 'swap'
  if (zone === 'hand' || zone === 'discard') return zone
  return undefined
}

const selectionItems = computed<CardSelectionItem[]>(() => {
  if (decision.value?.kind === 'select_cards') {
    const current = decision.value
    const items = current.candidates.map(choice => ({
      key: choiceKey(choice),
      cardId: choice.cardId,
      cardName: choice.cardName,
      motionZone: cardMotionZone(choice.zone),
      motionOwnerId: state.game?.pendingEffect?.effectPlayerId
        ?? state.game?.pendingEffect?.sourcePlayerId
        ?? state.selectedPlayer,
      groupKey: choice.zone,
      groupLabel: choice.zone === 'hand' ? 'HAND'
        : choice.zone === 'discard' ? 'DISCARD PILE'
          : choice.zone === 'deck' ? 'DECK'
          : choice.zone === 'swap_zone' ? 'SWAP ZONE'
            : choice.zone === 'specific_deck' ? specificDeckName.value : 'PLAYED THIS TURN',
      disabled: choice.disabled,
      disabledReason: choice.disabledReason ?? (choice.disabled ? 'Not enough Knowledge to install this upgrade.' : undefined),
      highlight: choice.highlight ?? (selectedCardKeys.value.includes(choiceKey(choice)) ? undefined : current.targetHighlight),
    }))
    if (current.reorderable) {
      const order = new Map(selectedCardOrderKeys.value.map((key, index) => [key, index]))
      items.sort((a, b) => (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.key) ?? Number.MAX_SAFE_INTEGER))
    }
    return items
  }
  if (decision.value?.kind === 'select_collective_cards') {
    return decision.value.candidates.map(choice => ({
      key: collectiveChoiceKey(choice),
      cardId: choice.choice.cardId,
      cardName: choice.choice.cardName,
      motionZone: cardMotionZone(choice.choice.zone),
      motionOwnerId: choice.playerId,
      groupKey: choice.playerId,
      groupLabel: `${playerName(choice.playerId)} ${collectiveZoneLabel(choice.choice.zone)}`,
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

function chooseInstantCardChoice(choiceId: string) {
  const current = decision.value
  if (!isInstantCardChoice.value || current?.kind !== 'select_cards') return
  const choice = current.candidates.find(candidate => choiceKey(candidate) === choiceId && !candidate.disabled)
  if (choice) answer({ kind: 'select_cards', choices: [choice] })
}

function reorderSelectionCards(keys: string[]) {
  const current = decision.value
  if (current?.kind !== 'select_cards' || !current.reorderable) return
  const validKeys = new Set(current.candidates.map(choiceKey))
  const next = keys.filter((key, index) => validKeys.has(key) && keys.indexOf(key) === index)
  for (const choice of current.candidates) {
    const key = choiceKey(choice)
    if (!next.includes(key)) next.push(key)
  }
  selectedCardOrderKeys.value = next
}

function orderedSelectionChoices(): CardChoice[] {
  const current = decision.value
  if (current?.kind !== 'select_cards' || !current.reorderable) return []
  const byKey = new Map(current.candidates.map(choice => [choiceKey(choice), choice]))
  return selectedCardOrderKeys.value.flatMap(key => {
    const choice = byKey.get(key)
    return choice ? [choice] : []
  })
}

const selectedDiscardChoiceOrderMatters = computed(() => {
  const kind = state.game?.pendingEffect?.awaiting?.kind
  return kind === 'discard_cards' ||
    kind === 'draw_and_discard_cards' ||
    kind === 'discard_noncorruption_cards' ||
    kind === 'discard_noncorruptions_and_gain_corruptions' ||
    kind === 'discard_prepped_spells' ||
    kind === 'discard_cards_collectively' ||
    kind === 'deal_gravehold_damage_with_gem_discard' ||
    kind === 'devouring_wave_discard_and_gain' ||
    kind === 'reveal_top_cards_for_discard'
})

function selectedChoicesInClickOrder<T>(
  candidates: readonly T[], selectedKeys: readonly string[], keyFor: (candidate: T) => string,
): T[] {
  if (!selectedDiscardChoiceOrderMatters.value) {
    const selected = new Set(selectedKeys)
    return candidates.filter(candidate => selected.has(keyFor(candidate)))
  }
  const byKey = new Map(candidates.map(candidate => [keyFor(candidate), candidate]))
  return selectedKeys.flatMap(key => {
    const candidate = byKey.get(key)
    return candidate ? [candidate] : []
  })
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
    const choices = selectedChoicesInClickOrder(
      decision.value.candidates, selectedCardKeys.value, choiceKey,
    )
    if (choices.length < decision.value.min || choices.length > decision.value.max) return
    resolveDecision({
      kind: 'select_cards', choices,
      ...(decision.value.reorderable ? { order: orderedSelectionChoices() } : {}),
    })
    return
  }
  if (decision.value?.kind === 'select_collective_cards') {
    const choices = selectedChoicesInClickOrder(
      decision.value.candidates, selectedCardKeys.value, collectiveChoiceKey,
    )
    if (choices.length < decision.value.min || choices.length > decision.value.max) return
    resolveDecision({ kind: 'select_collective_cards', choices })
  }
}

function skipSelectedCards() {
  if (decision.value?.kind === 'select_cards' && decision.value.min === 0) {
    resolveDecision({
      kind: 'select_cards', choices: [],
      ...(decision.value.reorderable ? { order: orderedSelectionChoices() } : {}),
    })
  } else if (decision.value?.kind === 'select_collective_cards' && decision.value.min === 0) {
    resolveDecision({ kind: 'select_collective_cards', choices: [] })
  }
}

function playerName(playerId: string): string {
  const player = state.game?.players.find(candidate => candidate.id === playerId)
  return displayMageName(player?.mageType ?? playerId.replace(/^wave\d+_/i, ''))
}

function playerDamageAmount(playerId: string): number | null {
  const current = decision.value
  if (current?.kind !== 'select_player_target') return null
  const savedAmount = current.damageAmounts?.[playerId]
  if (typeof savedAmount === 'number' && Number.isFinite(savedAmount)) return savedAmount
  const awaiting = state.game?.pendingEffect?.awaiting
  // Older saves can contain a pending damage decision without the newer
  // per-player amounts. Literal effects can still be previewed exactly.
  return awaiting?.kind === 'deal_player_damage' && typeof awaiting.amount === 'number'
    ? awaiting.amount
    : null
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

function choosePlayerDamageTarget(target: PlayerTargetRef) {
  answer({ kind: 'select_player_target', target })
}

function choosePlayerLifeTarget(target: LifeTargetRef) {
  answer({ kind: 'select_life_target', target })
}

function choosePlayerDiscardTarget(target: PlayerTargetRef) {
  answer({ kind: 'select_player_target', target })
}

function skipPreppedSpell() {
  if (decision.value?.kind !== 'select_prepped_spell' || !decision.value.allowSkip) return
  answer({ kind: 'select_prepped_spell', choice: null })
}

function confirmNemesisDraw() {
  if (!decision.value || decision.value.kind !== 'confirm_nemesis_draw') return
  if (decision.value.source !== 'specific_deck' && state.nemesisDrawRevealAnimating) return
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
    v-if="decision?.kind === 'confirm_nemesis_draw' && decision.source === 'specific_deck'"
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

  <div
    v-else-if="decision?.kind === 'confirm_nemesis_draw'"
    class="decision-overlay nemesis-reveal-overlay nemesis-draw-reveal-screen"
    role="dialog"
    aria-modal="true"
    :aria-label="`${getCard(decision.cardId).name} revealed. Click anywhere or press Space to continue.`"
    @click="confirmNemesisDraw"
  >
    <div class="nemesis-reveal-card">
      <img v-if="cardImageUrl(decision.cardId)" :src="cardImageUrl(decision.cardId)" :alt="getCard(decision.cardId).name" draggable="false" />
      <span v-else>{{ getCard(decision.cardId).name }}</span>
    </div>
  </div>

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
      <p v-if="immediatePreppedSpellCast" class="decision-hint">Click a highlighted prepped spell on any player board to cast it, or skip. You can switch players while this panel remains open.</p>
      <p v-else class="decision-hint">Select a highlighted prepped spell directly on any player board. You can switch players while this panel remains open.</p>
      <PreppedSpellChoicePanel
        :selected-count="state.pendingPreppedSpells.length"
        :min="decision.min"
        :max="decision.max"
        :allow-skip="decision.min === 0"
        :confirm-selection="!immediatePreppedSpellCast"
        @skip="skipPendingPreppedSpells"
        @confirm="confirmPendingPreppedSpells"
      />
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
    v-if="decision && !isDirectBoardCardDecision && decision.kind !== 'select_breach' && decision.kind !== 'select_exhaust_breach' && decision.kind !== 'select_conjure_breach' && decision.kind !== 'confirm_prepped_effect' && decision.kind !== 'select_prepped_spell' && decision.kind !== 'select_prepped_spells' && decision.kind !== 'select_market_pile' && decision.kind !== 'select_setup_devour_pile' && decision.kind !== 'confirm_nemesis_draw' && decision.kind !== 'confirm_nemesis_effect' && decision.kind !== 'select_damage_target' && decision.kind !== 'allocate_divided_damage'"
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

      <TokenAmountChoicePanel
        v-if="decision.kind === 'choose_token_amount'"
        token-name="Pulse"
        :token-image-url="pulseTokenImageUrl()"
        :min-amount="decision.minAmount"
        :max-amount="decision.maxAmount"
        :summary="decision.summary"
        v-model="selectedTokenAmount"
        @confirm="answer({ kind: 'choose_token_amount', amount: selectedTokenAmount })"
      />

      <template v-else-if="decision.kind === 'confirm_revealed_card' && revealedCardId">
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
          <button class="btn primary decision-option" @click="answer({ kind: 'confirm_revealed_card', accepted: true })">
            Confirm
          </button>
        </div>
      </template>

      <template v-else-if="decision.kind === 'choose_one' && revealedCardId">
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
                @click="placeSpecificDeckCard(card.cardId, card.slot, 'top')"
              >
                Return to Top
              </button>
              <button
                class="btn decision-option"
                type="button"
                @click="placeSpecificDeckCard(card.cardId, card.slot, 'bottom')"
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

      <TwoButtonChoice
        v-else-if="isTwoButtonChoice && decision.kind === 'choose_one'"
        :options="decision.options"
        @select="answer({ kind: 'choose_one', optionId: $event })"
      />

      <LargeCardChoicePanel
        v-else-if="isLargeCardChoice"
        :choices="largeCardChoices"
        @choose="chooseLargeCard"
      />

      <LargeCardChoicePanel
        v-else-if="isInstantCardChoice"
        :choices="instantCardChoices"
        @choose="chooseInstantCardChoice"
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
        :reorderable="decision.kind === 'select_cards' && decision.reorderable === true"
        @reorder="reorderSelectionCards"
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
        <p class="decision-hint">Drag the revealed turn order tokens into the order you want, from top to bottom.</p>
        <TurnOrderTokenRow
          :items="reorderTurnOrderItems"
          :draggable-items="true"
          aria-label="Revealed turn order tokens"
          @reorder="reorderTurnOrder"
        />
        <div class="decision-footer turn-order-decision-footer">
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
        <TurnOrderTokenRow
          :items="selectTurnOrderItems"
          aria-label="Player turn order cards in the discard pile"
          @choose="chooseTurnOrderCard"
        />
      </template>

      <template v-else-if="decision.kind === 'choose_turn_order_position'">
        <p class="decision-hint">Choose where to place the revealed turn order card.</p>
        <TurnOrderToken
          :token-url="turnOrderTokenUrl(decision.cardId)"
          :label="turnOrderCardLabel(decision.cardId)"
        />
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
        <TurnOrderToken
          :token-url="turnOrderTokenUrl(decision.cardId)"
          :label="turnOrderCardLabel(decision.cardId)"
        />
        <p class="turn-order-reveal-note">The card will remain on top of the turn order deck.</p>
        <div class="decision-footer">
          <button class="btn primary" @click="answer({ kind: 'confirm_turn_order_reveal', accepted: true })">
            Continue
          </button>
        </div>
      </template>

      <template v-else-if="decision.kind === 'select_player_target' && isPlayerDamageChoice">
        <PlayerDamageChoice :choices="playerDamageChoices" @select="choosePlayerDamageTarget" />
      </template>

      <template v-else-if="decision.kind === 'select_life_target' && isPlayerLifeChoice">
        <PlayerLifeChoice :choices="playerLifeChoices" @select="choosePlayerLifeTarget" />
      </template>

      <template v-else-if="decision.kind === 'select_player_target' && isPlayerDiscardChoice && playerDiscardAction">
        <PlayerDiscardChoice
          :choices="playerDiscardChoices"
          :action="playerDiscardAction"
          @select="choosePlayerDiscardTarget"
        />
      </template>

      <div v-else-if="decision.kind === 'select_player_target' && !isPlayerDiscardChoice" class="decision-options">
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

      <div v-else-if="decision.kind === 'select_life_target' && !isPlayerLifeChoice" class="decision-options">
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
