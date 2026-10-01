<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getCastableSpells, getBreachActionCosts, getPreppedSpellChoices, getPrepSpellLimit,
  getSpellDamagePreviewRange, getSupplyMechanics, getGameZoneVisibility,
  getDevelopZoneCards, getDevelopActions, getTrinketDeckCards, isTrinketDeckCardRevealed, toRoman,
} from '@engine/engine'
import { getCard, MAGES } from '@engine/data'
import { aetherTokenImageUrl, cardImageUrl, mageTokenImageUrl, playerCardBackUrl, playerTurnOrderTokenUrl, pulseTokenImageUrl, specificDeckBackUrl, specificDeckCardImageUrl, trinketDeckBackUrl } from '../card-images'
import type { BreachState, CardChoice, PlayerState } from '@engine/types'
import { useGame } from '../game/useGame'
import CardHoverPreview from './CardHoverPreview.vue'
import BreachArtwork from './BreachArtwork.vue'
import CardSurface from './CardSurface.vue'
import { displayMageName } from '../game/display-name'
import ZoneScroller from './ZoneScroller.vue'
import PileCountBadge from './PileCountBadge.vue'
import FaceUpPileCard from './FaceUpPileCard.vue'
import TokenBadge from './TokenBadge.vue'
import MageBoard from './MageBoard.vue'
import { breachPresentation } from '../breach-images'
import { mageImageUrls } from '../mage-images'
import { preloadImages } from '../image-preloader'
import aetherIconUrl from '../../../image-database/common images/Aether.png'
import knowledgeIconUrl from '../../../image-database/common images/Knowledge.png'

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
const hasPreppedSpell = computed(() => !!state.game && getPreppedSpellChoices(state.game).length > 0)
const abilityNeedsPreppedSpell = computed(() =>
  MAGES[player.value?.mageType ?? '']?.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') ?? false,
)
const isMain = computed(() => state.phase === 'main')
const isCasting = computed(() => state.phase === 'casting')
const isDiscard = computed(() => state.phase === 'discard_order' && state.selectedPlayer === state.game?.currentTurn)
const discardTopCard = computed(() => player.value.discard[0] ?? null)
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
const playerCardPlacementsInPlay = computed(() =>
  (player.value.playerCardsInPlay ?? [])
    .map((cardId, cardIndex) => ({ cardId, cardIndex }))
    .filter(({ cardIndex }) => player.value.playerCardSupplyTargets?.[cardIndex] == null),
)
const playerCardsInPlay = computed(() => playerCardPlacementsInPlay.value.map(({ cardId }) => cardId))
const hasPlayerCardsInPlay = computed(() => playerCardsInPlay.value.length > 0)
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
const handElement = ref<HTMLElement | null>(null)
const handOffset = ref(0)
const draggedSpellId = ref<string | null>(null)
const draggedSpellIndex = ref<number | null>(null)
const draggedPreppedSpell = ref<{ breachIndex: number; spellIndex: number } | null>(null)
const draggedConjuredCard = ref(false)
const endTurnActionElement = ref<HTMLElement | null>(null)
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

const canPrep = (b: BreachState, cardId = draggedSpellId.value ?? '') =>
  b.present !== false && canActMain.value
    && b.prepSpells.length < getPrepSpellLimit(player.value, b.index)
    && (b.opened || b.focusedThisTurn || !!cardId && getCard(cardId).prepToClosedBreach)

const canMovePreppedSpellTo = (
  b: BreachState,
  source = draggedPreppedSpell.value,
) => {
  if (b.present === false || !canRepositionPrepped.value || !source) return false
  if (source.breachIndex === b.index) return false
  const sourceBreach = player.value.breaches.find(item => item.index === source?.breachIndex)
  const sourceCardId = sourceBreach?.prepSpells[source.spellIndex]
  return b.opened || b.focusedThisTurn || !!sourceCardId && getCard(sourceCardId).prepToClosedBreach
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
  const decision = state.game.pendingDecision
  if (castChoice && decision?.kind === 'select_prepped_spell') {
    const casterId = state.game.pendingEffect?.effectPlayerId
      ?? state.game.pendingEffect?.sourcePlayerId
      ?? castChoice.playerId
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
  if (target instanceof Node && endTurnActionElement.value?.contains(target)) return
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

function playerCardPowerTokens(index: number): number {
  const placement = playerCardPlacementsInPlay.value[index]
  return placement ? player.value.playerCardPowerTokens?.[placement.cardIndex] ?? 0 : 0
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

let handScrollTarget = 0
let handScrollFrame: number | null = null

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
  // Ease toward the latest wheel target so consecutive wheel events feel like
  // one continuous horizontal movement instead of a series of hard jumps.
  hand.scrollLeft += distance * 0.2
  handScrollFrame = requestAnimationFrame(animateHandScroll)
}

function handleHandWheel(event: WheelEvent) {
  const target = event.target
  const hand = target instanceof Element ? target.closest<HTMLElement>('.hand') : null
  if (!hand || hand !== handElement.value || hand.scrollWidth <= hand.clientWidth || event.deltaY === 0) return
  event.preventDefault()
  event.stopPropagation()
  // The hand intentionally maps vertical mouse-wheel movement to horizontal
  // scrolling: wheel up moves toward the left, wheel down toward the right.
  if (handScrollFrame === null) handScrollTarget = hand.scrollLeft
  const maxScroll = Math.max(0, hand.scrollWidth - hand.clientWidth)
  handScrollTarget = Math.min(Math.max(0, handScrollTarget + event.deltaY * 1.1), maxScroll)
  if (handScrollFrame === null) handScrollFrame = requestAnimationFrame(animateHandScroll)
}

let handAlignmentFrame: number | null = null
let handResizeObserver: ResizeObserver | null = null

function updateHandAlignment() {
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  handAlignmentFrame = requestAnimationFrame(() => {
    handAlignmentFrame = null
    const hand = handElement.value
    if (!hand || typeof window === 'undefined') return
    const cards = [...hand.querySelectorAll<HTMLElement>('.card')]
    const gap = Number.parseFloat(getComputedStyle(hand).gap) || 0
    const cardWidth = cards.reduce((total, card) => total + card.getBoundingClientRect().width, 0)
    const contentWidth = cardWidth + Math.max(0, cards.length - 1) * gap
    const rightPadding = Number.parseFloat(getComputedStyle(hand).paddingRight) || 0
    const handRect = hand.getBoundingClientRect()
    const desiredOffset = window.innerWidth / 2 - handRect.left - contentWidth / 2
    const maxOffset = Math.max(0, hand.clientWidth - rightPadding - contentWidth)
    handOffset.value = Math.round(Math.min(Math.max(0, desiredOffset), maxOffset))
  })
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
  const handRect = handElement.value?.getBoundingClientRect()
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
  window.addEventListener('resize', updateHandAlignment)
  if (handElement.value && typeof ResizeObserver !== 'undefined') {
    handResizeObserver = new ResizeObserver(updateHandAlignment)
    handResizeObserver.observe(handElement.value)
  }
  nextTick(updateHandAlignment)
})
watch(() => player.value?.hand.length, () => nextTick(updateHandAlignment))
watch(() => state.game?.pendingDecision?.id, () => nextTick(updateHandAlignment))
watch(() => state.selectedPlayer, (selectedPlayer, previousSelectedPlayer) => {
  nextTick(updateHandAlignment)
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
  window.removeEventListener('resize', updateHandAlignment)
  handResizeObserver?.disconnect()
  if (handAlignmentFrame !== null) cancelAnimationFrame(handAlignmentFrame)
  if (handScrollFrame !== null) cancelAnimationFrame(handScrollFrame)
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

    <div class="breaches">
      <div
        v-for="b in player.breaches" :key="b.index"
        class="breach"
        :class="{
          absent: b.present === false,
          open: b.opened,
          castable: isCastableBreach(b),
          'must-cast': isMustCastBreach(b),
          'drag-target': draggingSpell && (draggedPreppedSpell ? canMovePreppedTo(b) : draggedConjuredCard ? !!conjureBreachChoice(b) : canPrep(b)),
          'move-drag-target': draggingSpell && !!draggedPreppedSpell && canMovePreppedTo(b),
          'mandatory-prepped-effect': isMandatoryPreppedEffect(b),
        }"
        :aria-hidden="b.present === false ? 'true' : undefined"
        @click="clickBreach(b)"
        :data-breach-index="b.index"
      >
        <template v-if="b.present !== false">
        <div class="breach-token-wrap" :class="{ 'decision-breach-target': isDecisionBreachTarget(b) }">
          <BreachArtwork
            :breach="b"
            :alt="`Breach ${toRoman(b.index)} ${b.opened ? 'open' : 'closed'}`"
            :disabled="draggedSpellId !== null"
          />
          <CardHoverPreview
            v-if="b.attachedRelic"
            :card-id="b.attachedRelic.cardId"
            @click.stop
          >
            <CardSurface
              :card-id="b.attachedRelic.cardId"
              size="hand"
              class="breach-attached-relic"
              :image-alt="getCard(b.attachedRelic.cardId).name"
            />
          </CardHoverPreview>
          <div
            v-if="b.installedUpgrades?.length"
            class="breach-upgrade-strip"
            :aria-label="`Upgrades on Breach ${toRoman(b.index)}`"
          >
            <CardHoverPreview
              v-for="(upgradeId, upgradeIndex) in b.installedUpgrades"
              :key="`${upgradeId}:${upgradeIndex}`"
              :card-id="upgradeId"
            >
              <CardSurface
                :card-id="upgradeId"
                size="hand"
                class="breach-upgrade-card"
                :image-alt="getCard(upgradeId).name"
              />
            </CardHoverPreview>
          </div>
          <div
            v-for="(spellId, spellIndex) in b.prepSpells"
            :key="`${spellId}:${spellIndex}`"
            class="spell"
            :style="{ '--spell-stack-index': displayedSpellStackIndex(b, spellIndex), zIndex: displayedSpellStackIndex(b, spellIndex) + 3 }"
            :class="{
              'castable-spell': isCastableBreach(b),
              'must-cast-spell': isMustCastBreach(b),
              'mandatory-prepped-effect': isMandatoryPreppedEffect(b, spellIndex),
              'ability-prepped-spell': !!preppedSpellCastChoice(b, spellIndex),
              'repeat-cast-confirmation': isRepeatCastConfirmation(b, spellIndex),
              'pending-prepped-spell': !!pendingPreppedSpellChoice(b, spellIndex),
                  'pending-prepped-spell-selected': !!pendingPreppedSpellChoice(b, spellIndex) && isPendingPreppedSpellSelected(pendingPreppedSpellChoice(b, spellIndex)!),
                  'pending-cast-spell': pendingCastSpell(b, spellIndex),
                  'manual-prepped-action': isPreppedSpellAction(b, spellIndex),
                  'repeatable-prepped-action': isRepeatablePreppedSpell(b, spellIndex),
                }"
          >
            <CardHoverPreview :card-id="spellId" :image-url="isFaceDownPreppedSpell(b, spellIndex) ? cardImageUrl(spellId) : undefined">
              <div
                class="breach-spell-card-frame"
                @click.stop="clickSpellFrame(b, spellIndex)"
                @pointerdown="startPreppedSpellDrag(b, spellIndex, $event)"
                :data-spell-index="spellIndex"
                :class="{
                  'face-down-spell': isFaceDownPreppedSpell(b, spellIndex),
                  'dragging-prepped-spell': isDraggedPreppedSpell(b, spellIndex),
                  'castable-spell': isCastableBreach(b),
                  'must-cast-spell': isMustCastBreach(b),
                  'mandatory-prepped-effect': isMandatoryPreppedEffect(b, spellIndex),
                  'ability-prepped-spell': !!preppedSpellCastChoice(b, spellIndex),
                  'repeat-cast-confirmation': isRepeatCastConfirmation(b, spellIndex),
                  'pending-prepped-spell': !!pendingPreppedSpellChoice(b, spellIndex),
                  'pending-prepped-spell-selected': !!pendingPreppedSpellChoice(b, spellIndex) && isPendingPreppedSpellSelected(pendingPreppedSpellChoice(b, spellIndex)!),
                  'pending-cast-spell': pendingCastSpell(b, spellIndex),
                  'manual-prepped-action': isPreppedSpellAction(b, spellIndex),
                  'repeatable-prepped-action': isRepeatablePreppedSpell(b, spellIndex),
                  'repositionable-spell': canRepositionPrepped && !state.game?.pendingDecision,
                }"
              >
                <img v-if="isFaceDownPreppedSpell(b, spellIndex)" :src="playerCardBackUrl()" alt="Face-down conjured spell" />
                <img v-else-if="cardImageUrl(spellId)" :src="cardImageUrl(spellId)" :alt="getCard(spellId).name" />
                <span v-else>[{{ getCard(spellId).name }}]</span>
                <span
                  v-if="spellDamagePreviewLabel(b, spellIndex) !== null"
                  class="spell-damage-badge"
                  :class="{ 'spell-damage-badge-hover': !pendingCastSpell(b, spellIndex), 'spell-damage-badge-active': pendingCastSpell(b, spellIndex) }"
                  :aria-label="`Upcoming damage: ${spellDamagePreviewLabel(b, spellIndex)}`"
                >
                  {{ spellDamagePreviewLabel(b, spellIndex) }}
                </span>
              </div>
            </CardHoverPreview>
          </div>
          <template v-for="pendingSpell in [dividedDamageConfirmationSpell(b)]" :key="pendingSpell?.cardId">
            <div
              v-if="pendingSpell"
              class="spell"
              :style="{ '--spell-stack-index': pendingSpell.spellIndex, zIndex: pendingSpell.spellIndex + 3 }"
            >
              <button
                type="button"
                class="breach-spell-card-frame divided-damage-confirm-spell"
                :aria-label="`Confirm ${getCard(pendingSpell.cardId).name} damage allocation`"
                :title="`Click to confirm ${getCard(pendingSpell.cardId).name}`"
                @click.stop="confirmDividedDamageAllocation"
              >
                <img
                  v-if="cardImageUrl(pendingSpell.cardId)"
                  :src="cardImageUrl(pendingSpell.cardId)"
                  :alt="getCard(pendingSpell.cardId).name"
                  draggable="false"
                />
                <span v-else>{{ getCard(pendingSpell.cardId).name }}</span>
              </button>
            </div>
          </template>
        </div>
        <div
          v-if="!b.opened && (effectFocusChoice(b) || (canActMain && !state.game?.pendingDecision))"
          class="btns"
          @click.stop
        >
          <button
            class="btn small"
            :class="{ 'effect-focus-target': !!effectFocusChoice(b) }"
            :aria-label="effectFocusChoice(b)
              ? `Focus Breach ${toRoman(b.index)} with effect`
              : `Focus Breach ${toRoman(b.index)} for ${breachCosts(b).focus} Aether`"
            @click.stop="clickFocusButton(b)"
          >{{ effectFocusChoice(b) ? 'Focus' : `Focus ${breachCosts(b).focus}` }}</button>
          <button v-if="canActMain && !state.game?.pendingDecision" class="btn small" @click="openBreach(b.index)">Open {{ breachCosts(b).open }}</button>
        </div>
        </template>
      </div>
    </div>

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

    <div class="played-zones" :class="{ 'has-swap-zone': hasSwapZone, 'has-develop-zone': hasDevelopZone }">
      <section v-if="hasSwapZone" class="played-zone played-zone-swap">
        <span class="label">Swap Zone</span>
        <ZoneScroller class="zone-card-scroll">
          <div class="zone-card-track">
            <template v-for="owner in swapZoneOwners" :key="`swap-owner-${owner.id}`">
              <span class="swap-zone-owner-label">{{ displayMageName(owner.mageType) }}</span>
              <CardHoverPreview
                v-for="(cid, i) in owner.swapZone ?? []" :key="`swap-${owner.id}-${cid}-${i}`"
                :card-id="cid"
              >
                <CardSurface
                  :card-id="cid"
                  size="mini"
                  :class="[typeClass(cid), {
                    'pending-board-card': !!getBoardCardSelection(owner.id, 'swap_zone', i, cid),
                    'pending-board-card-selected': !!getBoardCardSelection(owner.id, 'swap_zone', i, cid) && isPendingBoardCardSelected(getBoardCardSelection(owner.id, 'swap_zone', i, cid)!),
                  }]"
                  :title="`${displayMageName(owner.mageType)}'s Swap Zone`"
                  @click="clickSwapZoneCard(owner.id, i, cid)"
                />
              </CardHoverPreview>
            </template>
          </div>
        </ZoneScroller>
      </section>

      <section class="played-zone played-zone-center">
        <span class="label">Played</span>
        <ZoneScroller
          class="played-card-scroll"
          :overflow-anchor="hasDevelopZone && !hasSwapZone ? 'end' : 'start'"
          :center-boundary="hasSwapZone && !hasDevelopZone ? 'start' : hasDevelopZone && !hasSwapZone ? 'end' : undefined"
        >
          <div class="zone-card-track">
            <template v-if="isDiscard">
              <CardHoverPreview
                v-for="(cid, i) in state.discardRemaining" :key="`discard-slot-${i}`"
                :card-id="cid"
              >
                <CardSurface
                  :card-id="cid"
                  size="mini"
                  class="clickable"
                  :class="typeClass(cid)"
                  @click="clickDiscardCard(i)"
                />
              </CardHoverPreview>
              <span v-if="state.discardRemaining.length === 0" class="empty">— done —</span>
            </template>
            <template v-else>
              <CardHoverPreview
                v-for="(cid, i) in player.playedThisTurn" :key="cid + i"
                :card-id="cid"
              >
                <CardSurface
                  :card-id="cid"
                  size="mini"
                  :class="[typeClass(cid), {
                    'prepped-action': isPreppedActionCard(i, cid),
                    'pending-board-card': !!boardCardChoice('played_this_turn', i, cid),
                    'pending-board-card-selected': !!boardCardChoice('played_this_turn', i, cid) && isPendingBoardCardSelected(boardCardChoice('played_this_turn', i, cid)!),
                  }]"
                  @click="clickPlayedCard(i)"
                />
              </CardHoverPreview>
            </template>
          </div>
        </ZoneScroller>
      </section>

      <section v-if="hasDevelopZone" class="played-zone played-zone-develop">
        <span class="label">Develop Zone</span>
        <ZoneScroller class="zone-card-scroll">
          <div class="zone-card-track">
            <CardHoverPreview
              v-for="(cid, i) in developZoneCards" :key="`develop-${cid}-${i}`"
              :card-id="cid"
            >
              <CardSurface
                :card-id="cid"
                size="mini"
                :title="developZoneActionAvailable(i) ? `Develop for ${getCard(cid).developCost ?? 0} Aether to gain this card` : undefined"
                :class="[typeClass(cid), { 'develop-action-available': developZoneActionAvailable(i) }]"
                @click="clickDevelopZoneCard(i)"
                @contextmenu.prevent="clickDevelopZoneCard(i)"
              />
            </CardHoverPreview>
          </div>
        </ZoneScroller>
      </section>
    </div>

    <div
      class="hand-row"
      :class="{
        'has-specific-deck': hasSpecificDeck,
        'has-player-cards-in-play': hasPlayerCardsInPlay,
      }"
    >
      <MageBoard :mage-type="player.mageType" />
      <div
        v-if="hasSpecificDeck"
        class="deck-pile clickable player-specific-deck-pile"
        :class="{ 'has-cards': specificDeckCards.length > 0 }"
        :aria-label="canBuyFirethorn ? 'Buy the top Firethorn for 5 Aether' : `Open ${specificDeckName}`"
        @click="onSpecificDeckClick"
      >
        <CardHoverPreview
          v-if="player.mageType === 'qu' && specificDeckCards.length > 0"
          class="player-specific-deck-preview"
          :card-id="specificDeckCards[0]"
          :image-url="specificDeckTopImage"
          :image-alt="`Qu's Form Card — ${player.mageFormSide === 'taker' ? 'Taker' : 'Giver'} Form`"
        >
          <CardSurface
            base-class="player-pile-card"
            size="pile"
            class="player-specific-deck-face-up"
            :image-url="specificDeckTopImage"
            :image-alt="`Qu's Form Card — ${player.mageFormSide === 'taker' ? 'Taker' : 'Giver'} Form`"
          />
        </CardHoverPreview>
        <FaceUpPileCard
          v-else-if="specificDeckTopIsVisible && specificDeckCards.length > 0"
          :card-id="specificDeckCards[0]!"
          :ariaLabel="`Open ${specificDeckName}`"
          :primaryEnabled="true"
          display-class="player-specific-deck-face-up"
          @inspect="openSpecificDeckPile"
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
      <div
        v-if="hasPlayerCardsInPlay"
        class="player-cards-in-play-pile"
        aria-label="Player cards in play"
      >
        <div class="player-card-stack">
          <CardHoverPreview
            v-for="(placement, i) in playerCardPlacementsInPlay"
            :key="`player-in-play-${placement.cardId}-${placement.cardIndex}`"
            :card-id="placement.cardId"
          >
            <CardSurface
              :card-id="placement.cardId"
              size="mini"
              class="player-in-play-card"
              :class="[typeClass(placement.cardId), {
                'in-play-action': playerCardsInPlay.length === 1 && isPlayerCardInPlayAction(i, placement.cardId),
              }]"
              :style="{ '--stack-index': i }"
              @click="clickPlayerCardInPlay(i)"
            >
              <template #overlay>
                <TokenBadge
                  v-if="playerCardPowerTokens(i) > 0"
                  label="Power"
                  :count="playerCardPowerTokens(i)"
                  tone="power"
                  placement="card"
                />
              </template>
            </CardSurface>
          </CardHoverPreview>
        </div>
      </div>
      <div
        class="deck-pile clickable player-deck-pile"
        :class="{ 'has-cards': player.deck.length > 0 }"
        @click="openPile('deck')"
      >
        <CardSurface
          v-if="player.deck.length > 0"
          base-class="player-pile-card"
          size="pile"
          :image-url="playerCardBackUrl()"
          image-alt="Player deck"
        />
        <PileCountBadge :count="player.deck.length" label="Deck" />
      </div>
      <div ref="handElement" class="hand" :style="{ '--hand-offset': `${handOffset}px` }" @wheel="handleHandWheel">
        <CardHoverPreview
          v-for="(cid, i) in player.hand" :key="cid + i"
          :card-id="cid"
        >
          <CardSurface
            :card-id="cid"
            size="hand"
            :class="[typeClass(cid), {
              dragging: draggingSpell && draggedSpellIndex === i,
              'spell-draggable': canActMain && getCard(cid).type === 'spell',
              'pending-board-card': !!boardCardChoice('hand', i, cid),
              'pending-board-card-selected': !!boardCardChoice('hand', i, cid) && isPendingBoardCardSelected(boardCardChoice('hand', i, cid)!),
            }]"
            @click="clickHand(i)"
            draggable="false"
            @pointerdown="startSpellPointerDrag(i, $event)"
          />
        </CardHoverPreview>
        <CardHoverPreview v-if="conjuredCard" :card-id="conjuredCard.cardId">
          <CardSurface
            :card-id="conjuredCard.cardId"
            size="hand"
            :class="[typeClass(conjuredCard.cardId), 'pending-board-card', 'pending-conjure-card', 'spell-draggable', {
              dragging: draggingSpell && draggedConjuredCard,
            }]"
            draggable="false"
            @pointerdown="startConjuredCardDrag"
          />
        </CardHoverPreview>
      </div>
      <div
        class="discard-pile clickable player-discard-pile"
        :class="{ 'has-cards': player.discard.length > 0, 'recall-action-available': hasRecallAction }"
        :title="hasRecallAction ? 'Recall is available from this Discard' : undefined"
        @click="openPile('discard')"
        @contextmenu.prevent="openPile('discard')"
      >
        <CardHoverPreview v-if="discardTopCard" :card-id="discardTopCard">
          <CardSurface
            base-class="player-pile-card"
            size="pile"
            class="player-discard-top-card"
            :card-id="discardTopCard"
            :image-alt="getCard(discardTopCard).name"
          />
        </CardHoverPreview>
        <PileCountBadge :count="player.discard.length" label="Discard" />
      </div>
    </div>

    <div class="controls">
      <div class="controls-left">
        <div class="char-select">
          <button
            v-for="(candidate, playerIndex) in players"
            :key="candidate.id"
            class="char-btn"
            :class="{ sel: state.selectedPlayer === candidate.id, cur: state.game!.currentTurn === candidate.id, 'turn-marker-arrival': turnMarkerArrivalPlayerId === candidate.id, 'has-hand-gain': !!handIncrease[candidate.id] }"
            @click="selectPlayer(candidate.id)"
          >
            <img class="char-turn-token" :src="playerTurnOrderTokenUrl(playerIndex + 1) ?? ''" alt="" aria-hidden="true" draggable="false" />
            <span class="cn">{{ displayMageName(candidate.mageType) }}</span>
            <span class="chp">HP <strong class="controls-number">{{ candidate.hp }}</strong></span>
            <span class="cch">Charge <strong class="controls-number">{{ candidate.charge }}</strong>/<strong class="controls-number">{{ candidate.chargeThreshold }}</strong></span>
            <span class="chand">Hand <strong class="controls-number">{{ visibleHandCount(candidate) }}</strong></span>
            <span v-if="handIncrease[candidate.id]" class="chand-gain" role="status" :aria-label="`${displayMageName(candidate.mageType)} hand gained ${handIncrease[candidate.id]} cards`">+{{ handIncrease[candidate.id] }}</span>
            <span v-if="candidate.exhausted" class="cex">EXHAUSTED</span>
          </button>
        </div>
        <div class="controls-status">
          <span class="phase">{{ phaseLabel }}</span>
        </div>
      </div>
      <div class="controls-main">
        <span class="aether">
          <img class="resource-icon" :src="aetherIconUrl" alt="Aether" />
          <span><strong class="controls-number">{{ aether.regularAvail }}</strong><template v-if="aether.gemAether > 0"> · <strong class="controls-number">{{ aether.gemAether }}</strong> gem aether</template><template v-if="aether.spellAether > 0"> · <strong class="controls-number">{{ aether.spellAether }}</strong> spell aether</template><template v-if="aether.breachAether > 0"> · <strong class="controls-number">{{ aether.breachAether }}</strong> breach aether</template></span>
        </span>
        <span
          v-if="aether.aetherTokens > 0"
          class="aether-token-status"
          :aria-label="`${aether.aetherTokens} Aether Tokens`"
          :title="`${aether.aetherTokens} Aether Tokens`"
        >
          <img :src="aetherTokenImageUrl()" alt="Aether Token" draggable="false" />
          <strong class="controls-number">{{ aether.aetherTokens }}</strong>
        </span>
        <span
          v-if="showPulseTokens"
          class="pulse-token-status"
          :aria-label="`${player.pulseTokens ?? 0} Pulse Tokens`"
          :title="`${player.pulseTokens ?? 0} Pulse Tokens`"
        >
          <img :src="pulseTokenImageUrl()" alt="Pulse Token" draggable="false" />
          <strong class="controls-number">{{ player.pulseTokens ?? 0 }}</strong>
        </span>
        <template v-if="isCurrentSelected">
          <button v-if="isCasting" class="btn" @click="toMainPhase">Start Main Phase →</button>
          <template v-if="isMain">
            <button class="btn small" :disabled="player.charge >= player.chargeThreshold" @click="gainCharge(1)">Charge</button>
            <button class="btn small" @click="playAllGems">Play All Gems</button>
            <span ref="endTurnActionElement" class="end-turn-action">
              <button class="btn primary" @click="handleEndTurn">End Turn</button>
              <span v-if="state.endTurnWarningVisible" class="end-turn-warning" role="status">
                Actions remain. End turn anyway?
              </span>
            </span>
          </template>
        </template>
        <button
          v-if="state.debugFreeSpellCastEnabled && isMain && isCurrentSelected"
          class="btn small"
          :disabled="!hasPreppedSpell || !!state.game?.pendingDecision || !!state.game?.pendingEffect"
          @click="debugCastAnyPreppedSpell()"
        >Cast Prepped Spell</button>
        <button
          v-if="isMain && canActivateAbilityInMain"
          class="btn small"
          :disabled="!ready || (abilityNeedsPreppedSpell && !hasPreppedSpell)"
          @click="activateAbility()"
        >Activate Ability</button>
        <div
          v-if="mageDefinition?.tracksDoom && doomTokenImage"
          class="doom-token-track"
          role="img"
          :aria-label="doomTokenLabel"
          :title="doomTokenLabel"
        >
          <img
            v-for="tokenIndex in 5"
            :key="tokenIndex"
            :src="doomTokenImage"
            alt=""
            :class="{ 'is-active': (player.doomTokens ?? 0) >= tokenIndex }"
          >
        </div>
        <span v-if="mageDefinition?.tracksKnowledge" class="knowledge-status">
          <img class="resource-icon" :src="knowledgeIconUrl" alt="Knowledge" />
          <strong class="controls-number">{{ player.knowledge ?? 0 }}</strong>
        </span>
      </div>
      <button class="btn help-button" aria-label="Open game help" title="Game Help" @click="toggleHelp">?</button>
    </div>
  </div>
</template>
