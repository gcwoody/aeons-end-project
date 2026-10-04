<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getCastableSpells, getBreachActionCosts, getPreppedSpellChoices, getSpellBreachTargets,
  getSpellDamagePreviewRange, getSupplyMechanics, getGameZoneVisibility, canGainCharge,
  getDevelopZoneCards, getDevelopActions, getTrinketDeckCards, isTrinketDeckCardRevealed,
} from '@engine/engine'
import { getCard, MAGES } from '@engine/data'
import { cardImageUrl, mageTokenImageUrl, playerCardBackUrl, playerTurnOrderTokenUrl, specificDeckBackUrl, specificDeckCardImageUrl, trinketDeckBackUrl } from '../card-images'
import type { BreachState, CardChoice, PlayerState } from '@engine/types'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import CardSurface from './CardSurface.vue'
import { displayMageName } from '../game/display-name'
import PileCountBadge from './PileCountBadge.vue'
import PlayerControls from './PlayerControls.vue'
import PlayerBreachArea from './PlayerBreachArea.vue'
import PlayerZoneArea from './PlayerZoneArea.vue'
import PlayerHandArea from './PlayerHandArea.vue'
import { breachPresentation } from '../breach-images'
import { mageImageUrls } from '../mage-images'
import { preloadImages } from '../image-preloader'

const {
  state, displayPlayer, isCurrentSelected, canActMain, canRepositionPrepped, canCast,
  canActivateAbilityInMain,
  aetherInfo, prepSpell, focusBreach, openBreach, gainCharge, activateAbility,
  debugCastAnyPreppedSpell,
  activatePreppedCardAction, activatePreppedSpellAction, preppedCardActions,
  activatePlayerCardInPlayAction, playerCardInPlayActions,
  isPendingPreppedSpellSelected, togglePendingPreppedSpell,
  getBoardCardSelection, isPendingBoardCardSelected, togglePendingBoardCard,
  playCard, playAllGems, castSpell, movePreppedSpell, returnPreppedSpellToHand, requestEndTurn, toMainPhase,
  gainFirethornTopCard,
  selectPlayer, clickDiscardCard, openPile, openSpecificDeckPile, openTrinketDeckPile, openPlayerCardsInPlayPile, resolveDecision, toggleHelp,
  getRecallActionsForPlayer, developCard,
} = useGame()

const players = computed(() => state.game?.players ?? [])
const player = computed(() => displayPlayer.value!)
const playerAreaTurnArrival = ref(false)
const turnMarkerArrivalPlayerId = ref<string | null>(null)
let playerAreaTurnArrivalFrame: number | null = null
const handIncrease = ref<Record<string, number>>({})
const handIncreaseTimers = new Map<string, ReturnType<typeof setTimeout>>()
let imageWarmupTimer: ReturnType<typeof setTimeout> | null = null
const trinketDeckCards = computed(() => state.game ? getTrinketDeckCards(state.game) : [])
const trinketDeckTopCardKnown = computed(() => state.game ? isTrinketDeckCardRevealed(state.game, 0) : false)

function visiblePlayerImageUrls(candidate: PlayerState): string[] {
  const urls = new Set<string>()
  const addUrl = (url?: string) => { if (url) urls.add(url) }
  const addCard = (cardId: string) => addUrl(cardImageUrl(cardId))

  addUrl(mageImageUrls(candidate.mageType)?.front)
  for (const breach of candidate.breaches) {
    if (breach.present === false) continue
    addUrl(breachPresentation(breach).imageUrl)
    breach.installedUpgrades?.forEach(addCard)
    if (breach.attachedRelic) addCard(breach.attachedRelic.cardId)
    breach.prepSpells.forEach((cardId, index) => {
      if (breach.preppedSpellFaceDown?.[index]) addUrl(playerCardBackUrl())
      else addCard(cardId)
    })
  }

  candidate.hand.forEach(addCard)
  candidate.playedThisTurn.forEach(addCard)
  candidate.swapZone?.forEach(addCard)
  candidate.developZone?.forEach(addCard)
  candidate.playerCardsInPlay?.forEach((cardId, index) => {
    if (candidate.playerCardSupplyTargets?.[index] == null) addCard(cardId)
  })
  if (candidate.discard[0]) addCard(candidate.discard[0])
  if (candidate.deck.length > 0) addUrl(playerCardBackUrl())

  const specificDeck = candidate.specificDeck ?? []
  const mageDefinition = MAGES[candidate.mageType]
  const specificDeckIsVisible = mageDefinition?.specificDeckDisplay === 'face_up'
    || mageDefinition?.specificDeckDisplay === 'top_revealed'
  if (specificDeck[0] && specificDeckIsVisible) {
    addUrl(specificDeckCardImageUrl(candidate.mageType, specificDeck[0], candidate.mageFormSide))
  } else if (specificDeck.length > 0 && mageDefinition?.specificDeckBack) {
    addUrl(specificDeckBackUrl(mageDefinition.specificDeckBack))
  }

  return [...urls]
}

watch(
  () => {
    const playerImages = [...players.value]
      .sort((left, right) => Number(left.id === state.selectedPlayer) - Number(right.id === state.selectedPlayer))
      .flatMap(visiblePlayerImageUrls)
    const developImages = state.game
      ? getDevelopZoneCards(state.game).flatMap(cardId => {
        const url = cardImageUrl(cardId)
        return url ? [url] : []
      })
      : []
    const trinketDeckImages = state.game
      ? [trinketDeckBackUrl(), ...(trinketDeckTopCardKnown.value && trinketDeckCards.value[0]
        ? [cardImageUrl(trinketDeckCards.value[0])].filter((url): url is string => !!url)
        : [])]
      : []
    return [...new Set([...playerImages, ...developImages, ...trinketDeckImages])]
  },
  (imageUrls) => {
    if (imageWarmupTimer) clearTimeout(imageWarmupTimer)
    imageWarmupTimer = setTimeout(() => {
      imageWarmupTimer = null
      void preloadImages(imageUrls)
    }, 0)
  },
  { immediate: true, flush: 'post' },
)

function clearHandIncrease(playerId: string) {
  const timer = handIncreaseTimers.get(playerId)
  if (timer) clearTimeout(timer)
  handIncreaseTimers.delete(playerId)
  delete handIncrease.value[playerId]
}

function clearAllHandIncreases() {
  for (const playerId of handIncreaseTimers.keys()) clearHandIncrease(playerId)
  handIncrease.value = {}
}

watch(
  () => ({
    game: state.game,
    selectedPlayer: state.selectedPlayer,
    hands: state.game?.players.map(candidate => ({ id: candidate.id, count: candidate.hand.length })) ?? [],
    drawPhaseHandGainTotals: { ...state.drawPhaseHandGainTotals },
  }),
  (current, previous) => {
    if (current.game !== previous.game) {
      clearAllHandIncreases()
      return
    }
    if (current.selectedPlayer !== previous.selectedPlayer) clearHandIncrease(current.selectedPlayer)
    const previousCounts = new Map(previous.hands.map(({ id, count }) => [id, count]))
    for (const { id, count } of current.hands) {
      const delta = count - (previousCounts.get(id) ?? count)
      const drawPhaseGain = (current.drawPhaseHandGainTotals[id] ?? 0) - (previous.drawPhaseHandGainTotals[id] ?? 0)
      const visibleGain = delta - drawPhaseGain
      if (delta < 0) clearHandIncrease(id)
      if (visibleGain <= 0 || id === current.selectedPlayer) continue
      handIncrease.value[id] = (handIncrease.value[id] ?? 0) + visibleGain
      const timer = handIncreaseTimers.get(id)
      if (timer) clearTimeout(timer)
      handIncreaseTimers.set(id, setTimeout(() => clearHandIncrease(id), 3000))
    }
  },
)
const aether = computed(() => aetherInfo(player.value))
const ready = computed(() => player.value.charge >= player.value.chargeThreshold)
const canAffordCharge = computed(() => !!state.game && canGainCharge(state.game, player.value.id))
const hasPreppedSpell = computed(() => !!state.game && getPreppedSpellChoices(state.game).length > 0)
const abilityNeedsPreppedSpell = computed(() =>
  MAGES[player.value?.mageType ?? '']?.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') ?? false,
)
const isMain = computed(() => state.phase === 'main')
const isCasting = computed(() => state.phase === 'casting')
const isDiscard = computed(() => state.phase === 'discard_order' && state.selectedPlayer === state.game?.currentTurn)
const discardTopCard = computed(() => {
  const override = state.discardTopDisplayOverride
  return override?.playerId === player.value.id
    ? override.cardId
    : player.value.discard[0] ?? null
})
const eligibleRecallActions = computed(() => getRecallActionsForPlayer(player.value.id))
const hasRecallAction = computed(() => eligibleRecallActions.value.length > 0)
const showPulseTokens = computed(() => !!state.game && getSupplyMechanics(state.game).includes('pulse_token'))
const swapZoneOwners = computed(() => players.value.filter(candidate =>
  (candidate.swapZone?.length ?? 0) > 0 || MAGES[candidate.mageType]?.hasSwapZone === true ||
  (MAGES[candidate.mageType]?.swapZone?.length ?? 0) > 0,
))
const developZoneCards = computed(() => state.game ? getDevelopZoneCards(state.game) : [])
const mageDefinition = computed(() => MAGES[player.value?.mageType ?? ''])
const gameZoneVisibility = computed(() => state.game
  ? getGameZoneVisibility(state.game)
  : { swap: false, develop: false })
const hasSpecialZoneRow = computed(() => gameZoneVisibility.value.swap || gameZoneVisibility.value.develop)
const hasSwapZone = computed(() => hasSpecialZoneRow.value)
const hasDevelopZone = computed(() => hasSpecialZoneRow.value)
const developActions = computed(() => state.game ? getDevelopActions(state.game, state.selectedPlayer) : [])
const controlPlayers = computed(() => players.value.map((candidate, playerIndex) => ({
  id: candidate.id,
  mageName: displayMageName(candidate.mageType),
  turnOrderTokenUrl: playerTurnOrderTokenUrl(playerIndex + 1),
  hp: candidate.hp,
  charge: candidate.charge,
  chargeThreshold: candidate.chargeThreshold,
  handCount: visibleHandCount(candidate),
  handGain: handIncrease.value[candidate.id] ?? 0,
  exhausted: candidate.exhausted,
  selected: state.selectedPlayer === candidate.id,
  currentTurn: state.game?.currentTurn === candidate.id,
  turnMarkerArrival: turnMarkerArrivalPlayerId.value === candidate.id,
})))
const hasSpecificDeck = computed(() => mageDefinition.value?.hasSpecificDeck === true)
const specificDeckName = computed(() => mageDefinition.value?.specificDeckName ?? 'Specific Deck')
const specificDeckFaceUp = computed(() => mageDefinition.value?.specificDeckDisplay === 'face_up')
const specificDeckTopRevealed = computed(() => mageDefinition.value?.specificDeckDisplay === 'top_revealed')
const specificDeckTopIsVisible = computed(() => specificDeckFaceUp.value || specificDeckTopRevealed.value)
const specificDeckCards = computed(() => player.value.specificDeck ?? [])
const specificDeckTopImage = computed(() => specificDeckCards.value[0]
  ? specificDeckCardImageUrl(player.value.mageType, specificDeckCards.value[0], player.value.mageFormSide)
  : undefined)
const canBuyFirethorn = computed(() => player.value.mageType === 'inco' &&
  specificDeckCards.value.length > 0 && canActMain.value)
const doomTokenImage = computed(() => mageTokenImageUrl('doom_token_transparent'))
const doomTokenLabel = computed(() => `Doom tokens: ${Math.min(player.value.doomTokens ?? 0, 5)} of 5`)
const doomTokenTrack = computed(() => mageDefinition.value?.tracksDoom && doomTokenImage.value
  ? { imageUrl: doomTokenImage.value, label: doomTokenLabel.value, count: player.value.doomTokens ?? 0 }
  : null)
const knowledgeCount = computed(() => mageDefinition.value?.tracksKnowledge
  ? player.value.knowledge ?? 0
  : null)
const playerCardPlacementsInPlay = computed(() =>
  (player.value.playerCardsInPlay ?? [])
    .map((cardId, cardIndex) => ({ cardId, cardIndex }))
    .filter(({ cardIndex }) => player.value.playerCardSupplyTargets?.[cardIndex] == null),
)
const playerCardsInPlay = computed(() => playerCardPlacementsInPlay.value.map(({ cardId }) => cardId))
const specificDeckBackImage = computed(() =>
  mageDefinition.value?.specificDeckBack
    ? specificDeckBackUrl(mageDefinition.value.specificDeckBack)
    : undefined,
)
function onSpecificDeckClick() {
  if (canBuyFirethorn.value) {
    gainFirethornTopCard()
    return
  }
  openSpecificDeckPile()
}
const draggingSpell = ref(false)
const draggedSpellId = ref<string | null>(null)
const draggedSpellIndex = ref<number | null>(null)
const draggedPreppedSpell = ref<{ breachIndex: number; spellIndex: number } | null>(null)
const draggedConjuredCard = ref(false)
// A real drag should not also trigger the click handler when the pointer is
// released. A short click still activates a while-prepped spell normally.
const suppressSpellClick = ref(false)
const dragPosition = ref({ x: 0, y: 0 })
let dragPointerId = -1
let dragStartX = 0
let dragStartY = 0
let dragCardWidth = 122
let dragCardHeight = 178
const phaseLabel = computed(() => {
  if (state.phase === 'casting' && state.game?.pendingEffect?.preppedPhase === 'casting_phase_end') {
    return 'End of Casting Phase · End Point'
  }
  return ({
    setup: 'Setup',
    casting: 'Casting Phase · Spell Selection',
    main: 'Main Phase · Action',
    discard_order: 'Discard Phase · Card Order',
    nemesis_main: 'Nemesis Main Phase',
    nemesis_draw: 'Nemesis Draw Phase',
    gameover: 'Game Over',
  }[state.phase])
})

const DIR: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

const conjuredCard = computed(() => {
  const decision = state.game?.pendingDecision
  const revealed = state.game?.pendingEffect?.conjuredCard
  return decision?.kind === 'select_conjure_breach' && revealed?.playerId === player.value.id
    && revealed.cardId === decision.cardId ? revealed : null
})

const conjureBreachChoice = (b: BreachState) => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'select_conjure_breach'
    ? decision.candidates.find(choice => choice.playerId === player.value.id && choice.breachIndex === b.index) ?? null
    : null
}

function visibleHandCount(candidate: PlayerState): number {
  const revealed = state.game?.pendingEffect?.conjuredCard
  return candidate.hand.length + (state.game?.pendingDecision?.kind === 'select_conjure_breach'
    && revealed?.playerId === candidate.id ? 1 : 0)
}

const canPrep = (b: BreachState, cardId = draggedSpellId.value ?? '') => {
  const game = state.game
  return !!game && !!cardId && canActMain.value
    && getSpellBreachTargets(game, player.value.id, { kind: 'hand', cardId }).includes(b.index)
}

const canMovePreppedSpellTo = (
  b: BreachState,
  source = draggedPreppedSpell.value,
) => {
  const game = state.game
  return !!game && canRepositionPrepped.value && !!source
    && getSpellBreachTargets(game, player.value.id, {
      kind: 'prepped', breachIndex: source.breachIndex, spellIndex: source.spellIndex,
    }).includes(b.index)
}

const canMovePreppedTo = (b: BreachState) => canMovePreppedSpellTo(b)

const isMustCastBreach = (b: BreachState) =>
  canCast.value && !state.game?.pendingDecision && b.prepSpells.length > 0 && getCastableSpells(state.game!, player.value.id)
    .some((spell) => spell.breachIndex === b.index && spell.mustCast)

const isCastableBreach = (b: BreachState) =>
  canCast.value && !state.game?.pendingDecision && b.prepSpells.length > 0

const isMandatoryPreppedEffect = (b: BreachState, spellIndex = 0) => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'confirm_prepped_effect'
    && decision.cardId === b.prepSpells[spellIndex]
    && decision.breachIndex === b.index
    && decision.spellIndex === spellIndex
}

const preppedSpellCastChoice = (b: BreachState, spellIndex = 0) => {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spell' || !b.prepSpells[spellIndex]) return null
  return decision.candidates.find(choice =>
    choice.playerId === player.value.id &&
    choice.breachIndex === b.index &&
    choice.spellIndex === spellIndex &&
    choice.cardId === b.prepSpells[spellIndex],
  ) ?? null
}

const isRepeatCastConfirmation = (b: BreachState, spellIndex = 0) => {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'select_prepped_spell' && decision.repeat === true
    && !!preppedSpellCastChoice(b, spellIndex)
}

const pendingPreppedSpellChoice = (b: BreachState, spellIndex = 0) => {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spells' || !b.prepSpells[spellIndex]) return null
  return decision.candidates.find(choice =>
    choice.playerId === player.value.id &&
    choice.breachIndex === b.index &&
    choice.spellIndex === spellIndex &&
    choice.cardId === b.prepSpells[spellIndex],
  ) ?? null
}

const pendingCastSpell = (b: BreachState, spellIndex = 0) => {
  const pending = state.game?.pendingEffect?.pendingSpellCast
  if (!pending || !state.game?.pendingDecision || !b.prepSpells[spellIndex]) return false
  return pending.playerId === player.value.id
    && pending.breachIndex === b.index
    && pending.spellIndex === spellIndex
    && pending.cardId === b.prepSpells[spellIndex]
}

function isAwaitingDividedDamageConfirmation(b: BreachState, spellIndex: number): boolean {
  const decision = state.game?.pendingDecision
  const pending = state.game?.pendingEffect?.pendingSpellCast
  return decision?.kind === 'allocate_divided_damage'
    && !!pending
    && pending.playerId === player.value.id
    && pending.breachIndex === b.index
    && pending.spellIndex === spellIndex
    && pending.cardId === b.prepSpells[spellIndex]
}

function dividedDamageConfirmationSpell(b: BreachState) {
  const decision = state.game?.pendingDecision
  const pending = state.game?.pendingEffect?.pendingSpellCast
  if (decision?.kind !== 'allocate_divided_damage' || !pending) return null
  if (pending.playerId !== player.value.id || pending.breachIndex !== b.index) return null
  // The engine removes a spell from its breach when casting starts. Keep its
  // art in the original breach while damage is being allocated so the player
  // can click the spell a second time to confirm the allocation.
  if (!pending.discard) return null
  return pending
}

function displayedSpellStackIndex(b: BreachState, spellIndex: number): number {
  const pending = dividedDamageConfirmationSpell(b)
  return pending && spellIndex >= pending.spellIndex ? spellIndex + 1 : spellIndex
}

function confirmDividedDamageAllocation() {
  resolveDecision({ kind: 'allocate_divided_damage', action: 'confirm' })
}

const spellDamagePreview = (b: BreachState, spellIndex = 0) => {
  if (!state.game || !b.prepSpells[spellIndex]) return null

  const pending = state.game.pendingEffect?.pendingSpellCast
  if (pendingCastSpell(b, spellIndex) && pending) {
    const casterId = state.game.pendingEffect?.effectPlayerId ?? pending.playerId
    return getSpellDamagePreviewRange(state.game, casterId, player.value.id, b.index, spellIndex)
  }

  // Ability and card effects can ask the player to choose any player's
  // prepped spell, including during Main Phase. The decision owner is the
  // caster for this preview, while the displayed player's breach is the owner
  // of the prepped spell.
  const castChoice = preppedSpellCastChoice(b, spellIndex)
  const pendingChoice = pendingPreppedSpellChoice(b, spellIndex)
  const decision = state.game.pendingDecision
  if ((castChoice && decision?.kind === 'select_prepped_spell')
    || (pendingChoice && decision?.kind === 'select_prepped_spells')) {
    const choice = castChoice ?? pendingChoice!
    const casterId = state.game.pendingEffect?.effectPlayerId
      ?? state.game.pendingEffect?.sourcePlayerId
      ?? choice.playerId
    return getSpellDamagePreviewRange(state.game, casterId, player.value.id, b.index, spellIndex)
  }

  // During casting, preview a prepped spell only while its card is hovered.
  // A pending decision belongs to another interaction and must not show a stale preview.
  if (!isCasting.value || !canCast.value || state.game.pendingDecision) return null
  return getSpellDamagePreviewRange(state.game, player.value.id, player.value.id, b.index, spellIndex)
}

const spellDamagePreviewLabel = (b: BreachState, spellIndex = 0) => {
  const preview = spellDamagePreview(b, spellIndex)
  if (!preview) return null
  return preview.min === preview.max ? `${preview.min}` : `${preview.min}/${preview.max}`
}

const typeClass = (cid: string) => {
  const type = getCard(cid).type
  if (type === 'gem' || type === 'relic' || type === 'treasure') return type
  return 'spell'
}

const handCardDisplay = computed(() => player.value.hand.map((cardId, index) => {
  const selection = boardCardChoice('hand', index, cardId)
  return {
    cardId,
    typeClass: typeClass(cardId),
    isSpell: getCard(cardId).type === 'spell',
    pending: !!selection,
    selected: !!selection && isPendingBoardCardSelected(selection),
  }
}))
const conjuredCardDisplay = computed(() => conjuredCard.value
  ? { cardId: conjuredCard.value.cardId, typeClass: typeClass(conjuredCard.value.cardId) }
  : null)
const playerCardsInPlayDisplay = computed(() => playerCardPlacementsInPlay.value.map((placement, index) => ({
  cardId: placement.cardId,
  cardIndex: placement.cardIndex,
  typeClass: typeClass(placement.cardId),
  actionAvailable: isPlayerCardInPlayAction(index, placement.cardId),
  powerTokens: player.value.playerCardPowerTokens?.[placement.cardIndex] ?? 0,
})))

const isFaceDownPreppedSpell = (b: BreachState, spellIndex: number) =>
  b.preppedSpellFaceDown?.[spellIndex] === true

const draggedPreppedSpellFaceDown = computed(() => {
  const source = draggedPreppedSpell.value
  if (!source) return false
  const breach = player.value.breaches.find(item => item.index === source.breachIndex)
  return !!breach && isFaceDownPreppedSpell(breach, source.spellIndex)
})

const draggedSpellPreviewUrl = computed(() => {
  const cardId = draggedSpellId.value
  if (!cardId) return undefined
  return draggedPreppedSpellFaceDown.value ? playerCardBackUrl() : cardImageUrl(cardId)
})

const isDraggedPreppedSpell = (b: BreachState, spellIndex: number) =>
  draggingSpell.value
    && draggedPreppedSpell.value?.breachIndex === b.index
    && draggedPreppedSpell.value?.spellIndex === spellIndex

function breachCosts(b: BreachState) {
  return getBreachActionCosts(state.game!, player.value.id, b.index) ?? { focus: 0, open: 0 }
}

function isPreppedActionCard(index: number, cardId: string): boolean {
  return preppedCardActions.value.some(action =>
    action.choices.some(choice =>
      choice.zone === 'played_this_turn' && choice.index === index && choice.cardId === cardId))
}

function isPreppedSpellAction(b: BreachState, spellIndex: number): boolean {
  return preppedCardActions.value.some(action =>
    action.kind === 'activate_effect'
      && action.breachIndex === b.index
      && action.spellIndex === spellIndex)
}

/** Identify repeatable Main Phase while-prepped effects even when their
 * activation condition is currently unavailable (for example, Wildfire Whip
 * with less than two Aether). This keeps the card visibly actionable while
 * preventing a click from falling through to normal spell casting. */
function isRepeatablePreppedSpell(b: BreachState, spellIndex: number): boolean {
  if (!isMain.value || !isCurrentSelected.value) return false
  const cardId = b.prepSpells[spellIndex]
  if (!cardId) return false
  return (getCard(cardId).effects ?? []).some(block =>
    block.trigger.kind === 'while_prepped'
      && block.trigger.phase === 'main_phase'
      && block.manualActivation === true
      && block.oncePerTurn !== true)
}

function handleEndTurn() {
  requestEndTurn()
}

function dismissEndTurnWarning(event: PointerEvent) {
  if (!state.endTurnWarningVisible) return
  const target = event.target
  if (target instanceof Element && target.closest('.end-turn-action')) return
  state.endTurnWarningVisible = false
}

function isDecisionBreachTarget(b: BreachState): boolean {
  const decision = state.game?.pendingDecision
  return (decision?.kind === 'select_breach' || decision?.kind === 'select_exhaust_breach')
    && decision.candidates.some(choice => choice.playerId === player.value.id && choice.breachIndex === b.index)
}

function effectFocusChoice(b: BreachState) {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_breach' || decision.action === 'attach' || b.opened || b.focusCount >= b.focusToOpen) return null
  return decision.candidates.find(choice =>
    choice.playerId === player.value.id && choice.breachIndex === b.index) ?? null
}

function boardCardChoice(zone: CardChoice['zone'], index: number, cardId: string) {
  return getBoardCardSelection(player.value.id, zone, index, cardId)
}

function clickPlayedCard(index: number) {
  const cardId = player.value.playedThisTurn[index]
  if (!cardId) return
  const boardChoice = boardCardChoice('played_this_turn', index, cardId)
  if (boardChoice) {
    togglePendingBoardCard(boardChoice)
    return
  }
  if (state.game?.pendingDecision) return
  if (!canActMain.value) return
  if (!isPreppedActionCard(index, cardId)) return
  activatePreppedCardAction({
    zone: 'played_this_turn', index, cardId, cardName: getCard(cardId).name,
  })
}

function clickSwapZoneCard(ownerId: string, index: number, cardId: string) {
  if (!cardId) return
  const boardChoice = getBoardCardSelection(ownerId, 'swap_zone', index, cardId)
  if (boardChoice) togglePendingBoardCard(boardChoice)
}

function isPlayerCardInPlayAction(index: number, cardId: string): boolean {
  const placement = playerCardPlacementsInPlay.value[index]
  return !!placement && placement.cardId === cardId && playerCardInPlayActions.value.some(action =>
    action.cardIndex === placement.cardIndex && action.cardId === cardId,
  )
}

function clickPlayerCardInPlay(index: number) {
  if (!state.game || state.phase !== 'main' || state.game.currentTurn === 'nemesis' || state.game.pendingDecision || state.game.pendingEffect) return
  if (playerCardsInPlay.value.length > 1) {
    const hasVisibleAction = playerCardPlacementsInPlay.value.some((placement, visibleIndex) =>
      isPlayerCardInPlayAction(visibleIndex, placement.cardId),
    )
    if (hasVisibleAction) openPlayerCardsInPlayPile()
    return
  }
  const placement = playerCardPlacementsInPlay.value[index]
  if (!placement || !isPlayerCardInPlayAction(index, placement.cardId)) return
  activatePlayerCardInPlayAction(placement.cardIndex)
}

function clickHand(i: number) {
  const cid = player.value.hand[i]
  if (!cid) return
  const boardChoice = boardCardChoice('hand', i, cid)
  if (boardChoice) {
    togglePendingBoardCard(boardChoice)
    return
  }
  if (state.game?.pendingDecision) return
  if (!canActMain.value) return
  // Spells are prepared exclusively by dragging them onto a breach.
  if (getCard(cid).type !== 'spell') playCard(i)
}

function startSpellPointerDrag(i: number, event: PointerEvent) {
  if (boardCardChoice('hand', i, player.value.hand[i] ?? '')) return
  if (state.game?.pendingDecision) return
  if (event.button !== 0 || !canActMain.value || getCard(player.value.hand[i]).type !== 'spell') return
  suppressSpellClick.value = false
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
  dragCardWidth = source?.width ?? 122
  dragCardHeight = source?.height ?? 178
  state.prepTarget = null
  draggedSpellId.value = player.value.hand[i]!
  draggedSpellIndex.value = i
  draggedPreppedSpell.value = null
  draggedConjuredCard.value = false
  dragPosition.value = { x: event.clientX, y: event.clientY }
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  window.addEventListener('pointermove', handleSpellPointerMove, { passive: false })
  window.addEventListener('pointerup', finishSpellPointerDrag, { once: true })
  window.addEventListener('pointercancel', cancelSpellPointerDrag, { once: true })
}

function developZoneActionAvailable(index: number): boolean {
  return developActions.value.some(action => action.source === 'develop_zone' && action.index === index)
}

function clickDevelopZoneCard(index: number) {
  if (!developZoneActionAvailable(index)) return
  developCard('develop_zone', index)
}

const swapZoneDisplay = computed(() => swapZoneOwners.value.map(owner => ({
  id: owner.id,
  mageName: displayMageName(owner.mageType),
  cards: (owner.swapZone ?? []).map((cardId, index) => {
    const selection = getBoardCardSelection(owner.id, 'swap_zone', index, cardId)
    return {
      key: `swap-${owner.id}-${cardId}-${index}`,
      cardId,
      index,
      typeClass: typeClass(cardId),
      pending: !!selection,
      selected: !!selection && isPendingBoardCardSelected(selection),
    }
  }),
})))
const playedZoneDisplay = computed(() => player.value.playedThisTurn.map((cardId, index) => {
  const selection = boardCardChoice('played_this_turn', index, cardId)
  return {
    key: `${cardId}${index}`,
    cardId,
    index,
    typeClass: typeClass(cardId),
    preppedAction: isPreppedActionCard(index, cardId),
    pending: !!selection,
    selected: !!selection && isPendingBoardCardSelected(selection),
  }
}))
const discardZoneDisplay = computed(() => state.discardRemaining.map((cardId, index) => ({
  key: `discard-slot-${index}`,
  cardId,
  index,
  typeClass: typeClass(cardId),
})))
const developZoneDisplay = computed(() => developZoneCards.value.map((cardId, index) => {
  const actionAvailable = developZoneActionAvailable(index)
  return {
    key: `develop-${cardId}-${index}`,
    cardId,
    index,
    typeClass: typeClass(cardId),
    actionAvailable,
    title: actionAvailable ? `Develop for ${getCard(cardId).developCost ?? 0} Aether to gain this card` : undefined,
  }
}))

function startConjuredCardDrag(event: PointerEvent) {
  if (event.button !== 0 || !conjuredCard.value) return
  suppressSpellClick.value = false
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
  dragCardWidth = source?.width ?? 122
  dragCardHeight = source?.height ?? 178
  state.prepTarget = null
  draggedSpellId.value = conjuredCard.value.cardId
  draggedSpellIndex.value = null
  draggedPreppedSpell.value = null
  draggedConjuredCard.value = true
  dragPosition.value = { x: event.clientX, y: event.clientY }
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  window.addEventListener('pointermove', handleSpellPointerMove, { passive: false })
  window.addEventListener('pointerup', finishSpellPointerDrag, { once: true })
  window.addEventListener('pointercancel', cancelSpellPointerDrag, { once: true })
}

function startPreppedSpellDrag(b: BreachState, spellIndex: number, event: PointerEvent) {
  if (event.button !== 0 || !canRepositionPrepped.value || state.game?.pendingDecision || b.present === false) return
  const cardId = b.prepSpells[spellIndex]
  if (!cardId) return
  suppressSpellClick.value = false
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
  dragCardWidth = source?.width ?? 122
  dragCardHeight = source?.height ?? 178
  state.prepTarget = null
  draggedSpellId.value = cardId
  draggedSpellIndex.value = null
  draggedPreppedSpell.value = { breachIndex: b.index, spellIndex }
  draggedConjuredCard.value = false
  dragPosition.value = { x: event.clientX, y: event.clientY }
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  window.addEventListener('pointermove', handleSpellPointerMove, { passive: false })
  window.addEventListener('pointerup', finishSpellPointerDrag, { once: true })
  window.addEventListener('pointercancel', cancelSpellPointerDrag, { once: true })
}

function handleSpellPointerMove(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  dragPosition.value = { x: event.clientX, y: event.clientY }
  const distance = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY)
  if (distance > 5) {
    if (!draggingSpell.value) {
      draggingSpell.value = true
      // A real drag is a modal pointer interaction: close any preview that
      // was already visible and prevent the click produced on release from
      // activating whichever card is underneath the pointer.
      window.dispatchEvent(new Event('card-preview-dismiss'))
      window.addEventListener('click', blockSpellDragClick, true)
    }
    suppressSpellClick.value = true
  }
  if (draggingSpell.value) event.preventDefault()
}

function blockSpellDragClick(event: MouseEvent) {
  if (!suppressSpellClick.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
  suppressSpellClick.value = false
  window.removeEventListener('click', blockSpellDragClick, true)
}

function finishSpellPointerDrag(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const wasDragging = draggingSpell.value
  const spellIndex = draggedSpellIndex.value
  const preppedSource = draggedPreppedSpell.value
  const conjuredSource = draggedConjuredCard.value
  // A spell is prepared when the dragged card overlaps a legal Breach. The
  // pointer may be just outside the Breach when the player releases, so the
  // drop target is based on rectangle intersection rather than pointer hit
  // testing. Pick the Breach with the greatest overlap if two are touched.
  const dragPreview = document.querySelector<HTMLElement>('.spell-drag-preview')
  const dragWidth = dragPreview?.offsetWidth ?? dragCardWidth
  const dragHeight = dragPreview?.offsetHeight ?? dragCardHeight
  const draggedRect = {
    left: event.clientX - dragWidth / 2,
    right: event.clientX + dragWidth / 2,
    top: event.clientY - dragHeight / 2,
    bottom: event.clientY + dragHeight / 2,
  }
  const overlapArea = (a: typeof draggedRect, b: DOMRect) => {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    return width * height
  }
  const breachCandidates = [...document.querySelectorAll<HTMLElement>('[data-breach-index]')]
    .map(element => {
      const rect = element.getBoundingClientRect()
      return {
        element,
        area: overlapArea(draggedRect, rect),
        touches: draggedRect.left <= rect.right && draggedRect.right >= rect.left
          && draggedRect.top <= rect.bottom && draggedRect.bottom >= rect.top,
      }
    })
    .filter(candidate => candidate.touches)
  const breachTarget = [...breachCandidates]
    .sort((a, b) => b.area - a.area)[0]?.element
  const targetSpell = [...document.querySelectorAll<HTMLElement>('[data-spell-index]')]
    .map(element => ({
      element,
      breach: element.closest<HTMLElement>('[data-breach-index]'),
      area: overlapArea(draggedRect, element.getBoundingClientRect()),
    }))
    .filter(candidate => candidate.breach && candidate.area > 0)
    .filter(candidate => {
      const breachIndex = Number(candidate.breach?.dataset.breachIndex)
      const breach = player.value.breaches.find(item => item.index === breachIndex)
      return !!breach && canMovePreppedTo(breach)
    })
    .sort((a, b) => b.area - a.area)[0] ?? null
  const handBreachTarget = breachCandidates
    .map(candidate => ({
      ...candidate,
      breach: player.value.breaches.find(item => item.index === Number(candidate.element.dataset.breachIndex)),
    }))
    .filter(candidate => !!candidate.breach && (conjuredSource
      ? !!conjureBreachChoice(candidate.breach)
      : canPrep(candidate.breach, draggedSpellId.value ?? '')))
    .sort((a, b) => b.area - a.area || Number(a.element.dataset.breachIndex) - Number(b.element.dataset.breachIndex))[0]?.element
  const target = preppedSource
    ? targetSpell?.breach ?? breachTarget
    : handBreachTarget
  const breachIndex = target ? Number(target.dataset.breachIndex) : NaN
  const targetSpellIndex = targetSpell ? Number(targetSpell.element.dataset.spellIndex) : undefined
  const preppedTargetBreach = preppedSource
    ? player.value.breaches.find(item => item.index === breachIndex)
    : null
  const canDropPreppedTarget = !!preppedTargetBreach
    && canMovePreppedSpellTo(preppedTargetBreach, preppedSource)
  const handRect = document.querySelector<HTMLElement>('.player-area .hand')?.getBoundingClientRect()
  const handOverlap = handRect ? overlapArea(draggedRect, handRect) : 0
  // Face-down Conjured spells may move between legal Breaches, but must remain
  // in play. This guard protects against a release over the hand creating an
  // extra card and bypassing Conjure's top-of-deck fallback.
  const sourceFaceDown = preppedSource
    ? player.value.breaches.find(item => item.index === preppedSource.breachIndex)
      ?.preppedSpellFaceDown?.[preppedSource.spellIndex] === true
    : false
  removeSpellPointerListeners()
  draggingSpell.value = false
  draggedSpellId.value = null
  draggedSpellIndex.value = null
  draggedPreppedSpell.value = null
  draggedConjuredCard.value = false
  if (wasDragging) {
    // Browsers may still dispatch click after a pointer drag. Keep the flag
    // until that synthetic click is consumed, then clear it as a fallback for
    // releases outside the card.
    suppressSpellClick.value = true
    window.setTimeout(() => {
      suppressSpellClick.value = false
      window.removeEventListener('click', blockSpellDragClick, true)
    }, 0)
  }
  if (wasDragging) {
    if (preppedSource) {
      if (handOverlap > 0) {
        if (!sourceFaceDown) {
          returnPreppedSpellToHand(preppedSource.breachIndex, preppedSource.spellIndex)
        }
      } else {
        const breach = player.value.breaches.find((item) => item.index === breachIndex)
        if (breach && breach.index !== preppedSource.breachIndex && canDropPreppedTarget) {
          movePreppedSpell(preppedSource.breachIndex, preppedSource.spellIndex, breach.index, targetSpellIndex)
        }
      }
    } else if (conjuredSource && target) {
      const breach = player.value.breaches.find(item => item.index === breachIndex)
      const choice = breach && conjureBreachChoice(breach)
      if (choice) resolveDecision({ kind: 'select_conjure_breach', choice })
    } else if (spellIndex !== null && target) {
      const breach = player.value.breaches.find((item) => item.index === breachIndex)
      if (breach) {
        // A hand spell uses the normal prep flow even if the target Breach
        // already contains a spell. Multi-spell Breaches can still stack;
        // an existing spell is never replaced by a hand drag.
        if (canPrep(breach, player.value.hand[spellIndex])) prepSpell(spellIndex, breach.index)
      }
    }
  }
}

function cancelSpellPointerDrag() {
  removeSpellPointerListeners()
  window.removeEventListener('click', blockSpellDragClick, true)
  draggingSpell.value = false
  draggedSpellId.value = null
  draggedSpellIndex.value = null
  draggedPreppedSpell.value = null
  draggedConjuredCard.value = false
  state.prepTarget = null
  suppressSpellClick.value = false
}

function removeSpellPointerListeners() {
  window.removeEventListener('pointermove', handleSpellPointerMove)
  window.removeEventListener('pointerup', finishSpellPointerDrag)
  window.removeEventListener('pointercancel', cancelSpellPointerDrag)
  dragPointerId = -1
}

onBeforeUnmount(removeSpellPointerListeners)
onMounted(() => {
  window.addEventListener('pointerdown', dismissEndTurnWarning)
})
watch(() => state.selectedPlayer, (selectedPlayer, previousSelectedPlayer) => {
  if (!previousSelectedPlayer || selectedPlayer === previousSelectedPlayer) return

  playerAreaTurnArrival.value = false
  turnMarkerArrivalPlayerId.value = null
  if (playerAreaTurnArrivalFrame !== null) cancelAnimationFrame(playerAreaTurnArrivalFrame)
  playerAreaTurnArrivalFrame = requestAnimationFrame(() => {
    playerAreaTurnArrivalFrame = null
    playerAreaTurnArrival.value = true
    if (state.game?.currentTurn === selectedPlayer) turnMarkerArrivalPlayerId.value = selectedPlayer
  })
})
watch(draggingSpell, (dragging) => {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('spell-dragging', dragging)
  }
  if (dragging && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('card-preview-dismiss'))
  }
})
watch(
  [() => state.phase, () => state.selectedPlayer, () => state.game?.currentTurn],
  () => { state.endTurnWarningVisible = false },
)
onBeforeUnmount(() => {
  clearAllHandIncreases()
  if (imageWarmupTimer) clearTimeout(imageWarmupTimer)
  if (playerAreaTurnArrivalFrame !== null) cancelAnimationFrame(playerAreaTurnArrivalFrame)
  window.removeEventListener('click', blockSpellDragClick, true)
  if (typeof document !== 'undefined') document.body.classList.remove('spell-dragging')
  window.removeEventListener('pointerdown', dismissEndTurnWarning)
})

function clickBreach(b: BreachState) {
  if (b.present === false) return
  const breachDecision = state.game?.pendingDecision
  if (breachDecision?.kind === 'select_breach') {
    const choice = breachDecision.candidates.find(candidate =>
      candidate.playerId === player.value.id && candidate.breachIndex === b.index)
    if (choice) resolveDecision({ kind: 'select_breach', choice })
    return
  }
  if (breachDecision?.kind === 'select_exhaust_breach') {
    const choice = breachDecision.candidates.find(candidate =>
      candidate.playerId === player.value.id && candidate.breachIndex === b.index)
    if (choice) resolveDecision({ kind: 'select_exhaust_breach', choice })
    return
  }
  if (isMandatoryPreppedEffect(b)) {
    return
  }
  if (state.game?.pendingDecision) return
  if (isCastableBreach(b)) { castSpell(b.index); return }
}

function clickFocusButton(b: BreachState) {
  if (b.present === false || b.opened) return
  const choice = effectFocusChoice(b)
  if (choice) {
    resolveDecision({ kind: 'select_breach', choice })
    return
  }
  if (state.game?.pendingDecision || !canActMain.value) return
  focusBreach(b.index)
}

function confirmMandatoryPreppedEffect(b: BreachState) {
  if (b.present === false) return
  if (!isMandatoryPreppedEffect(b)) return
  resolveDecision({ kind: 'confirm_prepped_effect', accepted: true })
}

function clickSpellFrame(b: BreachState, spellIndex: number) {
  if (b.present === false) return
  if (suppressSpellClick.value) {
    suppressSpellClick.value = false
    return
  }
  if (isAwaitingDividedDamageConfirmation(b, spellIndex)) {
    resolveDecision({ kind: 'allocate_divided_damage', action: 'confirm' })
    return
  }
  const pendingChoice = pendingPreppedSpellChoice(b, spellIndex)
  if (pendingChoice) {
    togglePendingPreppedSpell(pendingChoice)
    return
  }
  const castChoice = preppedSpellCastChoice(b, spellIndex)
  if (castChoice) {
    resolveDecision({ kind: 'select_prepped_spell', choice: castChoice })
    return
  }
  if (isMandatoryPreppedEffect(b, spellIndex)) {
    confirmMandatoryPreppedEffect(b)
    return
  }
  if (isRepeatablePreppedSpell(b, spellIndex) && !isPreppedSpellAction(b, spellIndex)) {
    return
  }
  if (isPreppedSpellAction(b, spellIndex)) {
    activatePreppedSpellAction(b.index, spellIndex)
    return
  }
  if (isCastableBreach(b)) castSpell(b.index, spellIndex)
}

const breachDisplayBindings = {
  canMovePreppedTo,
  canPrep,
  conjureBreachChoice,
  isCastableBreach,
  isMustCastBreach,
  isMandatoryPreppedEffect,
  preppedSpellCastChoice,
  isRepeatCastConfirmation,
  pendingPreppedSpellChoice,
  pendingCastSpell,
  isPreppedSpellAction,
  isRepeatablePreppedSpell,
  isAwaitingDividedDamageConfirmation,
  dividedDamageConfirmationSpell,
  displayedSpellStackIndex,
  isDecisionBreachTarget,
  effectFocusChoice,
  breachCosts,
  isFaceDownPreppedSpell,
  isDraggedPreppedSpell,
  isPendingPreppedSpellSelected,
  spellDamagePreviewLabel,
}

function finishPlayerTurnArrival(event: AnimationEvent) {
  if (event.animationName !== 'player-area-turn-arrival') return
  playerAreaTurnArrival.value = false
  turnMarkerArrivalPlayerId.value = null
}
</script>

<template>
  <div
    class="player-area"
    :class="{ 'turn-arrival': playerAreaTurnArrival }"
    @animationend="finishPlayerTurnArrival"
  >
    <div
      v-if="draggingSpell && draggedSpellId"
      class="spell-drag-preview"
      :style="{ left: `${dragPosition.x}px`, top: `${dragPosition.y}px` }"
    >
      <img
        v-if="draggedSpellPreviewUrl"
        :src="draggedSpellPreviewUrl"
        :alt="getCard(draggedSpellId).name"
        draggable="false"
      />
      <span v-else>{{ getCard(draggedSpellId).name }}</span>
    </div>
    <div class="char-row"></div>

    <PlayerBreachArea
      :owner-id="player.id"
      :breaches="player.breaches"
      :can-act-main="canActMain"
      :can-reposition-prepped="canRepositionPrepped"
      :has-pending-decision="!!state.game?.pendingDecision"
      :dragging-spell="draggingSpell"
      :dragged-spell-id="draggedSpellId"
      :dragged-prepped-spell="draggedPreppedSpell"
      :dragged-conjured-card="draggedConjuredCard"
      :ui="breachDisplayBindings"
      @click-breach="clickBreach"
      @click-focus="clickFocusButton"
      @open-breach="openBreach"
      @click-spell="clickSpellFrame"
      @start-spell-drag="startPreppedSpellDrag"
      @confirm-divided-damage="confirmDividedDamageAllocation"
    />
    <button
      class="trinket-deck-pile"
      type="button"
      aria-label="Open Trinket Deck"
      @click.stop="openTrinketDeckPile()"
    >
      <CardHoverPreview
        :card-id="trinketDeckTopCardKnown ? trinketDeckCards[0] : undefined"
        :image-url="trinketDeckTopCardKnown ? undefined : trinketDeckCards.length > 0 ? trinketDeckBackUrl() : undefined"
        :image-alt="trinketDeckTopCardKnown && trinketDeckCards[0]
          ? getCard(trinketDeckCards[0]).name
          : 'Trinket deck card back'"
      >
        <CardSurface
          base-class="player-pile-card"
          size="pile"
          :card-id="trinketDeckTopCardKnown ? trinketDeckCards[0] : undefined"
          :image-url="trinketDeckTopCardKnown ? undefined : trinketDeckCards.length > 0 ? trinketDeckBackUrl() : undefined"
          :image-alt="trinketDeckTopCardKnown && trinketDeckCards[0]
            ? getCard(trinketDeckCards[0]).name
            : 'Trinket deck card back'"
          class="trinket-deck-top-card"
        >
          <span v-if="trinketDeckCards.length === 0">Trinket Deck</span>
        </CardSurface>
      </CardHoverPreview>
      <PileCountBadge :count="trinketDeckCards.length" label="Trinkets" />
    </button>

    <PlayerZoneArea
      :has-swap-zone="hasSwapZone"
      :has-develop-zone="hasDevelopZone"
      :is-discard="isDiscard"
      :swap-zone-owners="swapZoneDisplay"
      :played-cards="playedZoneDisplay"
      :discard-cards="discardZoneDisplay"
      :develop-cards="developZoneDisplay"
      @click-swap-card="clickSwapZoneCard"
      @click-played-card="clickPlayedCard"
      @click-discard-card="clickDiscardCard"
      @click-develop-card="clickDevelopZoneCard"
    />
    <PlayerHandArea
      :mage-type="player.mageType"
      :mage-form-side="player.mageFormSide"
      :has-specific-deck="hasSpecificDeck"
      :specific-deck-name="specificDeckName"
      :specific-deck-cards="specificDeckCards"
      :specific-deck-top-image="specificDeckTopImage"
      :specific-deck-back-image="specificDeckBackImage"
      :specific-deck-top-is-visible="specificDeckTopIsVisible"
      :can-buy-firethorn="canBuyFirethorn"
      :player-cards-in-play="playerCardsInPlayDisplay"
      :deck-count="player.deck.length"
      :discard-count="player.discard.length"
      :discard-top-card="discardTopCard"
      :recall-available="hasRecallAction"
      :hand-cards="handCardDisplay"
      :conjured-card="conjuredCardDisplay"
      :can-act-main="canActMain"
      :dragging-spell="draggingSpell"
      :dragged-spell-index="draggedSpellIndex"
      :dragging-conjured-card="draggedConjuredCard"
      @click-specific-deck="onSpecificDeckClick"
      @open-specific-deck="openSpecificDeckPile"
      @click-player-card="clickPlayerCardInPlay"
      @click-hand-card="clickHand"
      @start-hand-spell-drag="startSpellPointerDrag"
      @start-conjured-spell-drag="startConjuredCardDrag"
      @open-deck="openPile('deck')"
      @open-discard="openPile('discard')"
    />

    <PlayerControls
      :players="controlPlayers"
      :phase-label="phaseLabel"
      :aether="aether"
      :pulse-token-count="showPulseTokens ? player.pulseTokens ?? 0 : null"
      :current-player-selected="isCurrentSelected"
      :casting-phase="isCasting"
      :main-phase="isMain"
      :can-afford-charge="canAffordCharge"
      :show-free-spell-cast="state.debugFreeSpellCastEnabled && isMain && isCurrentSelected"
      :can-free-spell-cast="hasPreppedSpell && !state.game?.pendingDecision && !state.game?.pendingEffect"
      :show-ability="isMain && canActivateAbilityInMain"
      :can-activate-ability="ready && !(abilityNeedsPreppedSpell && !hasPreppedSpell)"
      :doom-token-track="doomTokenTrack"
      :knowledge-count="knowledgeCount"
      :end-turn-warning-visible="state.endTurnWarningVisible"
      @select-player="selectPlayer"
      @gain-charge="gainCharge"
      @play-all-gems="playAllGems"
      @end-turn="handleEndTurn"
      @to-main-phase="toMainPhase"
      @debug-cast="debugCastAnyPreppedSpell"
      @activate-ability="activateAbility"
      @toggle-help="toggleHelp"
    />
  </div>
</template>
