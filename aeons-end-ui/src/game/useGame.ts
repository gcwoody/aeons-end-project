import { reactive, computed, nextTick, toRaw, watch } from 'vue'
import {
  createGame, startTurn, getPlayer,
  resolveMageSetups as engineResolveMageSetups,
  resolvePlayerInPlayPhaseEffects as engineResolvePlayerInPlayPhaseEffects,
  getCastableSpells, getPreppedSpellChoices, castSpell as engineCastSpell,
  playCard as enginePlayCard, prepSpell as enginePrepSpell,
  getBuyableCards, buyCard as engineBuyCard,
  getDevelopZoneCards,
  developCardFromSupply as engineDevelopCardFromSupply,
  developCardFromZone as engineDevelopCardFromZone,
  buySpecificPileCard as engineBuySpecificPileCard,
  gainFirethornTopCard as engineGainFirethornTopCard,
  focusBreach as engineFocusBreach, openBreachDirect as engineOpenBreach,
  gainCharge as engineGainCharge, activateAbility as engineActivateAbility,
  resolveEffects as engineResolveEffects,
  resolveDrawPhase, getTotalAether, getAllRemainingConditional,
  getConditionalAetherByType,
  resolvePreppedEffects,
  getPreppedCardActions, activatePreppedCardAction as engineActivatePreppedCardAction,
  activatePreppedSpellAction as engineActivatePreppedSpellAction,
  getPlayerCardInPlayActions, activatePlayerCardInPlayAction as engineActivatePlayerCardInPlayAction,
  getRecallActions as engineGetRecallActions, activateRecall as engineActivateRecall,
  resolvePendingDecision as engineResolvePendingDecision,
  canPlayerAct, getMainPhaseActionHint, canActivateAbilityDuringMain, toRoman,
  advanceNemesisTurn, getNemesisDiscardActions, discardNemesisPower,
  checkGameOver,
} from '@engine/engine'
import {
  createTwoPlayerScenario, getCard, defaultMarketSetup, DEFAULT_MARKET_SLOTS,
  resolveMarketCardIds,
} from '@engine/data'
import type {
  CardChoice, CollectiveCardChoice, GameState, NemesisDifficulty, PendingDecisionAnswer,
  PendingDecision, PlayerId, PlayerState, PreppedSpellChoice, MarketSetupConfig, HealthChangeEvent,
} from '@engine/types'
import { displayMageName, formatMageNamesInText } from './display-name'
import { getNemesisPresentation } from './nemesis-presentation'
import { waitForBreachMotions } from './breach-motion'
import { cardImageUrl, playerCardBackUrl } from '../card-images'
import {
  animateCardFlight, animateCardFlightToPlayerDeck, animateCardRevealFlight, animateCardZoneMotion, captureCardFlight, captureCardZoneMotion, captureCardZoneTransfer,
  captureCardRowPositions, discardCardZoneMotion, holdCardFlightAtOrigin, resolveCardZoneMotion,
  hasActiveHandCardReflow, markHandCardDeparting, recordCardZoneMotionArrival,
  discardCardZoneMotionSource,
  cardZoneFlightDestinationMode, discardCardFlight, discardCardZoneTransfer, resolveCardZoneTransfers,
  waitForCardRowReflow, waitForHandCardReflow, waitForHandGainReflow,
} from './card-flight'
import type { CardFlightSnapshot, CardZoneMotionSnapshot, CardZoneMotionTransfer, CardZoneTransfer, CardZoneTransferSnapshot } from './card-flight'
import {
  clearGameSaves, cloneGameState, cloneUndoSnapshot, createUndoSnapshot, readGameSaves,
  summarizeGameSave, undoSnapshotsEqual, writeGameSaves,
} from './game-persistence'
import type { SaveSummary, StoredSave, UndoSnapshot, UiPhase } from './game-persistence'
export interface LogEntry { id: number; text: string; kind: 'info' | 'ok' | 'warn' }
interface BoardCardSelection {
  playerId: PlayerId
  choice: CardChoice
}
interface DamageImpact {
  id: number
  kind: HealthChangeEvent['kind']
  targetId: string
  amount: number
  left: number
  top: number
  width: number
  height: number
  stackIndex: number
}
interface DamageTargetRect {
  left: number
  top: number
  width: number
  height: number
}
let logId = 0
let damageImpactId = 0
let pendingAttachCardFlight: { ownerId: PlayerId; cardId: string; flight: CardFlightSnapshot } | null = null
let pendingNemesisDrawFlight: { cardId: string; flight: CardFlightSnapshot } | null = null
let pendingNemesisDrawRevealAnimation: Promise<void> | null = null
let pendingGainPlacementFlight: {
  decisionId: string
  cardId: string
  snapshot: CardZoneTransferSnapshot} | null = null
const cardZoneTransfersByUndo = new WeakMap<UndoSnapshot, CardZoneTransferSnapshot>()
interface HandZoneFlightSnapshot {
  playerId: PlayerId
  cardId: string
  handIndex: number
  flight: CardFlightSnapshot | null
}
interface HandZoneTransferSnapshot {
  players: Array<{ id: PlayerId; hand: string[]; deck: string[]; discard: string[] }>
  cards: HandZoneFlightSnapshot[]
}
interface HandZoneSelection {
  playerId: PlayerId
  choice: CardChoice
  selectionKey: string
  destinationPlayerId?: PlayerId
}
interface HandDiscardPresentationCard {
  cardId: string
  handIndex: number
  presentationKey: string
}
interface HandPlayPresentation {
  playerId: PlayerId
  cardId: string
  handIndex: number
  presentationKey: string
  motionKey: string
  // Zero-based occurrence among same-name copies already in Played when this
  // play started. Identifies the held copy without relying on DOM position.
  playedOccurrence: number
}
interface PlayCardZoneBaseline {
  previousHandCount: number
  previousDeckCardCount: number
  previousPlayedCount: number
  previousSwapCount: number
  previousDiscardCount: number
}
interface PendingPlayCardFlight extends PlayCardZoneBaseline {
  ownerId: PlayerId
  cardId: string
  handIndex: number
  motionKey: string
  presentationKey: string
  hiddenDestination: HTMLElement | null
  hiddenDestinationZone: string | null
  hiddenDestinationKey: string | null
  hiddenDestinationVisibility: string
}
interface PlayerZoneMotionBaseline {
  id: PlayerId
  swapZone: string[]
  discard: string[]
}
interface DiscardDisplayOverride {
  cardId: string | null
  count: number
  boardArrival?: { cardId: string; count: number }
}
interface SwapZoneDisplayHold {
  cardId: string
  index: number
  motionKey: string
  survivorKeys: string[]
  departing: boolean
}
interface SwapZoneCardKeys {
  cardIds: string[]
  motionKeys: string[]
}
interface BoardDiscardDisplayHold {
  playerId: PlayerId
  previous: DiscardDisplayOverride | undefined
  current: DiscardDisplayOverride
  previousSwap: SwapZoneDisplayHold | undefined
  currentSwap: SwapZoneDisplayHold
}
const handZoneTransfersByUndo = new WeakMap<UndoSnapshot, HandZoneTransferSnapshot>()
const pendingBoardHandFlights = new Map<string, CardFlightSnapshot | null>()
let pendingPlayCardFlight: PendingPlayCardFlight | null = null
interface MarketPileTransferSnapshot {
  pileIndex: number
  cardId: string
  remaining: number
  snapshot: CardZoneTransferSnapshot}
const marketPileTransfersByUndo = new WeakMap<UndoSnapshot, MarketPileTransferSnapshot[]>()
const cardZoneMotionsByUndo = new WeakMap<UndoSnapshot, CardZoneMotionSnapshot>()
const cardZoneMotionGatesByUndo = new WeakMap<UndoSnapshot, Map<string, Promise<void>>>()
const boardDiscardHoldsByMotion = new WeakMap<CardZoneMotionSnapshot, Map<PlayerId, BoardDiscardDisplayHold>>()
const damageImpactTimers = new Map<number, ReturnType<typeof setTimeout>>()
const DAMAGE_IMPACT_DURATION_MS = 1600
let turnTransitionSequence = 0
let activeActionCaptureDepth = 0
let activeActionCaptureCompletion: Promise<void> = Promise.resolve()
let resolveActiveActionCaptureCompletion: (() => void) | null = null
let cardZoneTransferAnimationQueue: Promise<void> = Promise.resolve()
let automaticDecisionViewRestore: { returnPlayerId: PlayerId; autoSelectedPlayerId: PlayerId } | null = null
const HAND_DISCARD_EFFECT_KINDS = new Set([
  'discard_cards', 'draw_and_discard_cards', 'discard_noncorruption_cards',
  'discard_noncorruptions_and_gain_corruptions', 'discard_cards_collectively',
  'deal_gravehold_damage_with_gem_discard', 'devouring_wave_discard_and_gain',
  'reveal_top_cards_for_discard',
])
const HAND_TO_DECK_EFFECT_KINDS = new Set([
  'place_card_on_top_of_own_deck', 'place_hand_card_on_ally_deck',
])
const state = reactive({
  game: null as GameState | null,
  phase: 'setup' as UiPhase,
  log: [] as LogEntry[],
  prepTarget: null as number | null, // hand index of the spell being prepped
  selectedPlayer: '' as PlayerId,
  discardRemaining: [] as string[], // played cards not yet clicked during discard phase
  deckDisplayOverride: null as { playerId: PlayerId; cardId: string | null; count: number } | null,
  discardTopDisplayOverride: null as { playerId: PlayerId; cardId: string | null; count: number } | null,
  discardPileDisplayOverrides: {} as Partial<Record<PlayerId, DiscardDisplayOverride>>,
  swapZoneDisplayHolds: {} as Partial<Record<PlayerId, SwapZoneDisplayHold>>,
  swapZoneCardKeys: {} as Partial<Record<PlayerId, SwapZoneCardKeys>>,
  handDiscardPresentation: null as { playerId: PlayerId; cards: HandDiscardPresentationCard[] } | null,
  handPlayPresentation: null as HandPlayPresentation | null,
  drawPhaseHandGainTotals: {} as Record<PlayerId, number>, // UI-only counts excluded from Mage draw feedback
  damageImpacts: [] as DamageImpact[], // UI-only combat feedback; never saved with the game
  cardMotionBatchActive: false,
  turnTransitionActive: false,
  autoEndWaitPending: false,
  turnTransitionId: 0,
  nemesisDrawRevealAnimating: false,
  viewPile: null as 'deck' | 'discard' | 'destroyed' | 'specific_deck' | 'trinket_deck' | 'nemesis_deck' | 'nemesis_discard' | 'nemesis_specific' | 'nemesis_specific_discard' | 'player_cards_in_play' | null,
  // Lets component-local, dismissible overlays close before a pile viewer opens.
  dismissibleOverlayVersion: 0,
  debugOpen: false,
  debugFreeSpellCastEnabled: false,
  helpOpen: false,
  hasSave: false,
  saves: [] as SaveSummary[],
  activeSaveId: null as string | null,
  deleteSaveId: null as string | null,
  deleteSaveIds: [] as string[],
  pendingPreppedSpells: [] as PreppedSpellChoice[],
  pendingBoardCards: [] as BoardCardSelection[],
  exitPrompt: false,
  endTurnWarningVisible: false,
  endTurnActionHint: null as ReturnType<typeof getMainPhaseActionHint>,
  mage1: 'jian',
  mage2: 'brama',
  nemesisType: 'rageborne',
  nemesisDifficulty: 'standard' as NemesisDifficulty,
  marketMode: 'template1' as MarketSetupConfig['mode'],
  marketSlots: resolveMarketCardIds({ mode: 'template1', slots: [] }),
})
let cardMotionBatchLocks = 0
function beginCardMotionBatch(): () => void {
  cardMotionBatchLocks++
  state.cardMotionBatchActive = true
  let released = false
  return () => {
    if (released) return
    released = true
    cardMotionBatchLocks = Math.max(0, cardMotionBatchLocks - 1)
    state.cardMotionBatchActive = cardMotionBatchLocks > 0
  }
}
let storedSaves: StoredSave[] = []
// A newly started game must not become a save record until the player chooses
// Save & Exit. Resumed games keep the existing auto-save behavior.
let autoSaveEnabled = false
const undoStack: UndoSnapshot[] = []
const MAX_UNDO = 10
function syncSaveList() {
  storedSaves.sort((a, b) => b.updatedAt - a.updatedAt)
  state.saves = storedSaves.map(summarizeGameSave)
  state.hasSave = storedSaves.length > 0
}
function preppedSpellChoiceKey(choice: PreppedSpellChoice): string {
  return `${choice.playerId}:${choice.breachIndex}:${choice.spellIndex}:${choice.cardId}`
}
function boardCardSelectionKey(selection: BoardCardSelection): string {
  const { playerId, choice } = selection
  return `${playerId}:${choice.zone}:${choice.index}:${choice.cardId}`
}
function usesBoardCardSelection(decision = state.game?.pendingDecision): boolean {
  if (decision?.kind === 'select_cards') {
    return decision.candidates.length > 0 && decision.candidates.every(choice =>
      choice.zone === 'hand' || choice.zone === 'played_this_turn' || choice.zone === 'swap_zone')
  }
  if (decision?.kind === 'select_collective_cards') {
    return decision.candidates.length > 0 && decision.candidates.every(item =>
      item.choice.zone === 'hand' || item.choice.zone === 'played_this_turn' || item.choice.zone === 'swap_zone')
  }
  return false
}
/** Whether the active card-selection decision can be made directly on the board. */
export function isBoardCardSelectionActive(): boolean {
  return usesBoardCardSelection()
}
function boardCardSelections(): BoardCardSelection[] {
  const decision = state.game?.pendingDecision
  if (!decision || !usesBoardCardSelection(decision)) return []
  if (decision.kind === 'select_collective_cards') {
    return decision.candidates.map(item => ({ playerId: item.playerId, choice: item.choice }))
  }
  if (decision.kind === 'select_cards') {
    const playerId = state.game?.pendingEffect?.effectPlayerId
      ?? state.game?.pendingEffect?.sourcePlayerId
      ?? state.game?.pendingNemesisDiscard?.playerId
    if (!playerId) return []
    return decision.candidates.map(choice => ({ playerId, choice }))
  }
  return []
}
function soleCandidateOwner(playerIds: PlayerId[]): PlayerId | null {
  const owners = [...new Set(playerIds)]
  return owners.length === 1 ? owners[0]! : null
}
/** Return the player whose board contains the only possible decision target. */
function soleDecisionDisplayPlayerId(decision: PendingDecision | null | undefined): PlayerId | null {
  if (!decision) return null
  if (decision.kind === 'choose_optional') {
    return state.game?.pendingEffect?.effectPlayerId
      ?? state.game?.pendingEffect?.sourcePlayerId
      ?? null
  }
  if (decision.kind === 'select_cards') {
    return state.game?.pendingEffect?.effectPlayerId
      ?? state.game?.pendingEffect?.sourcePlayerId
      ?? state.game?.pendingNemesisDiscard?.playerId
      ?? null
  }
  if (decision.kind === 'select_collective_cards') {
    return soleCandidateOwner(decision.candidates.map(candidate => candidate.playerId))
  }
  if (decision.kind === 'select_prepped_spell' || decision.kind === 'select_prepped_spells') {
    return soleCandidateOwner(decision.candidates.map(candidate => candidate.playerId))
  }
  if (decision.kind === 'select_breach') {
    return soleCandidateOwner(decision.candidates.map(candidate => candidate.playerId))
  }
  if (decision.kind === 'select_exhaust_breach') {
    return soleCandidateOwner(decision.candidates.map(candidate => candidate.playerId))
  }
  if (decision.kind === 'select_conjure_breach') {
    return state.game?.pendingEffect?.conjuredCard?.playerId ?? null
  }
  if ((decision.kind === 'choose_one' && state.game?.pendingEffect?.awaiting?.kind === 'reveal_top_cards') ||
    decision.kind === 'confirm_revealed_card') {
    return state.game?.pendingEffect?.revealedTopCard?.playerId ?? null
  }
  return null
}
function clearAutomaticDecisionViewRestore() {
  automaticDecisionViewRestore = null
}
function selectPlayerForDecision(id: PlayerId) {
  if (!automaticDecisionViewRestore) {
    automaticDecisionViewRestore = {
      returnPlayerId: state.selectedPlayer,
      autoSelectedPlayerId: id,
    }
  } else {
    automaticDecisionViewRestore.autoSelectedPlayerId = id
  }
  state.selectedPlayer = id
  state.prepTarget = null
}
function restoreAutomaticDecisionViewIfSettled() {
  const restore = automaticDecisionViewRestore
  if (!restore || state.game?.pendingDecision || state.game?.pendingEffect) return
  automaticDecisionViewRestore = null
  if (state.selectedPlayer !== restore.autoSelectedPlayerId) return
  if (!state.game?.players.some(player => player.id === restore.returnPlayerId)) return
  state.selectedPlayer = restore.returnPlayerId
  state.prepTarget = null
}
/** Return a board-resident hand, played, or Swap zone candidate, if selectable now. */
export function getBoardCardSelection(
  playerId: PlayerId, zone: CardChoice['zone'], index: number, cardId: string,
): BoardCardSelection | null {
  return boardCardSelections().find(selection =>
    selection.playerId === playerId &&
    selection.choice.zone === zone &&
    selection.choice.index === index &&
    selection.choice.cardId === cardId,
  ) ?? null
}
export function isPendingBoardCardSelected(selection: BoardCardSelection): boolean {
  return state.pendingBoardCards.some(item => boardCardSelectionKey(item) === boardCardSelectionKey(selection))
}
function clearPendingBoardHandFlights() {
  pendingBoardHandFlights.forEach(flight => discardCardFlight(flight))
  pendingBoardHandFlights.clear()
}
/** Select or unselect a highlighted card on the board for the active decision. */
export function togglePendingBoardCard(selection: BoardCardSelection): void {
  const decision = state.game?.pendingDecision
  if (!decision || (decision.kind !== 'select_cards' && decision.kind !== 'select_collective_cards')) return
  if (!usesBoardCardSelection(decision)) return
  const candidate = boardCardSelections().find(item => boardCardSelectionKey(item) === boardCardSelectionKey(selection))
  if (!candidate) return
  const selectionKey = boardCardSelectionKey(candidate)
  if (isPendingBoardCardSelected(candidate)) {
    discardCardFlight(pendingBoardHandFlights.get(selectionKey) ?? null)
    pendingBoardHandFlights.delete(selectionKey)
    state.pendingBoardCards = state.pendingBoardCards.filter(item =>
      boardCardSelectionKey(item) !== boardCardSelectionKey(candidate))
    return
  }
  if (state.pendingBoardCards.length >= decision.max) return
  if (candidate.choice.zone === 'hand' &&
    (HAND_DISCARD_EFFECT_KINDS.has(state.game?.pendingEffect?.awaiting?.kind ?? '') ||
      HAND_TO_DECK_EFFECT_KINDS.has(state.game?.pendingEffect?.awaiting?.kind ?? ''))) {
    const playerArea = findDataElement('data-player-area-id', candidate.playerId)
    const source = playerArea
      ? [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="hand"]')]
        .find(element => element.dataset.heldPlayCard !== 'true' &&
          element.getAttribute('data-hand-card-index') === String(candidate.choice.index) &&
          element.getAttribute('data-hand-card-id') === candidate.choice.cardId)
      : undefined
    pendingBoardHandFlights.set(selectionKey, captureCardFlight(source ?? null))
  }
  state.pendingBoardCards = [...state.pendingBoardCards, candidate]
  if (decision.max === 1) confirmPendingBoardCards()
}
/** Confirm board card selections for a multi-select decision. */
export function confirmPendingBoardCards(): void {
  const decision = state.game?.pendingDecision
  if (!decision || (decision.kind !== 'select_cards' && decision.kind !== 'select_collective_cards')) return
  if (!usesBoardCardSelection(decision)) return
  if (state.pendingBoardCards.length < decision.min || state.pendingBoardCards.length > decision.max) return
  if (decision.kind === 'select_cards') {
    resolveDecision({ kind: 'select_cards', choices: state.pendingBoardCards.map(item => item.choice) })
    return
  }
  if (decision.kind === 'select_collective_cards') {
    const choices: CollectiveCardChoice[] = state.pendingBoardCards.map(item => ({
      playerId: item.playerId,
      choice: item.choice,
    }))
    resolveDecision({ kind: 'select_collective_cards', choices })
  }
}
export function skipPendingBoardCards(): void {
  const decision = state.game?.pendingDecision
  if (!decision || (decision.kind !== 'select_cards' && decision.kind !== 'select_collective_cards')) return
  if (!usesBoardCardSelection(decision) || decision.min !== 0) return
  clearPendingBoardHandFlights()
  if (decision.kind === 'select_cards') resolveDecision({ kind: 'select_cards', choices: [] })
  if (decision.kind === 'select_collective_cards') resolveDecision({ kind: 'select_collective_cards', choices: [] })
}
export function isPendingPreppedSpellSelected(choice: PreppedSpellChoice): boolean {
  return state.pendingPreppedSpells.some(selected =>
    preppedSpellChoiceKey(selected) === preppedSpellChoiceKey(choice))
}
/** Clicking an optional single cast is its confirmation; other selections keep their footer. */
export function isImmediatePreppedSpellCast(): boolean {
  const decision = state.game?.pendingDecision
  return decision?.kind === 'select_prepped_spells'
    && decision.min === 0 && decision.max === 1
    && state.game?.pendingEffect?.awaiting?.kind === 'cast_prepped_spell'
}
export function togglePendingPreppedSpell(choice: PreppedSpellChoice): void {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spells') return
  const candidate = decision.candidates.find(item =>
    preppedSpellChoiceKey(item) === preppedSpellChoiceKey(choice))
  if (!candidate) return
  if (isPendingPreppedSpellSelected(candidate)) {
    const required = decision.requiredChoices?.some(item => preppedSpellChoiceKey(item) === preppedSpellChoiceKey(candidate))
    if (required) return
    state.pendingPreppedSpells = state.pendingPreppedSpells.filter(selected =>
      preppedSpellChoiceKey(selected) !== preppedSpellChoiceKey(candidate))
    return
  }
  if (state.pendingPreppedSpells.length >= decision.max) return
  const next = [...state.pendingPreppedSpells, candidate]
  state.pendingPreppedSpells = next
  if (decision.max === 1 && (!decision.confirmSelection || isImmediatePreppedSpellCast())) {
    resolveDecision({ kind: 'select_prepped_spells', choices: next })
  }
}
export function confirmPendingPreppedSpells(): void {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spells') return
  if (state.pendingPreppedSpells.length < decision.min || state.pendingPreppedSpells.length > decision.max) return
  if (decision.min === 0 && decision.confirmSelection && state.pendingPreppedSpells.length === 0) return
  resolveDecision({ kind: 'select_prepped_spells', choices: [...state.pendingPreppedSpells] })
}
export function skipPendingPreppedSpells(): void {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spells' || decision.min !== 0) return
  resolveDecision({ kind: 'select_prepped_spells', choices: [] })
}
function persistStoredSaves() {
  writeGameSaves(localStorage, storedSaves)
  syncSaveList()
}
function saveCurrentGame(force = false) {
  if (!state.game || (!force && !autoSaveEnabled)) return
  const now = Date.now()
  let save = storedSaves.find(candidate => candidate.id === state.activeSaveId)
  if (!save) {
    const id = `save-${now}-${storedSaves.length + 1}`
    save = {
      id,
      name: `${state.game.players.map(player => displayMageName(player.mageType)).join(' + ')} vs ${displayMageName(state.game.nemesis.type)}`,
      createdAt: now,
      updatedAt: now,
      players: [],
      nemesisType: '',
      round: 0,
      turn: 0,
      currentTurn: '',
      game: state.game,
      phase: state.phase,
      selectedPlayer: state.selectedPlayer,
      discardRemaining: [],
      undoStack: [],
    }
    storedSaves.unshift(save)
    state.activeSaveId = id
  }
  save.updatedAt = now
  save.players = state.game.players.map(player => displayMageName(player.mageType))
  save.nemesisType = displayMageName(state.game.nemesis.type)
  save.round = state.game.round
  save.turn = state.game.turnOrderDiscard.length
  save.currentTurn = state.game.currentTurn
  save.game = cloneGameState(state.game)
  save.phase = state.phase
  save.selectedPlayer = state.selectedPlayer
  save.discardRemaining = [...state.discardRemaining]
  save.undoStack = undoStack.map(cloneUndoSnapshot)
  persistStoredSaves()
}
storedSaves = readGameSaves(localStorage)
syncSaveList()
// Persist resumed games (and UI context) to localStorage on any change.
watch(
  () => (state.game ? JSON.stringify({
    game: state.game, phase: state.phase, selectedPlayer: state.selectedPlayer,
    discardRemaining: state.discardRemaining,
  }) : ''),
  (s) => {
    if (s) saveCurrentGame()
  },
)
watch(
  () => state.game?.pendingDecision?.id,
  () => {
    const decision = state.game?.pendingDecision
    state.pendingPreppedSpells = decision?.kind === 'select_prepped_spells'
      ? [...(decision.requiredChoices ?? [])]
      : []
    clearPendingBoardHandFlights()
    state.pendingBoardCards = []
    const decisionPlayerId = soleDecisionDisplayPlayerId(decision)
    if (decisionPlayerId && decisionPlayerId !== state.selectedPlayer) {
      selectPlayerForDecision(decisionPlayerId)
    }
  },
)
function pushLog(text: string, kind: LogEntry['kind'] = 'info') {
  const mageTypes = state.game?.players.map(player => player.mageType) ?? []
  state.log.push({ id: ++logId, text: formatMageNamesInText(text, mageTypes), kind })
}
function cp(): PlayerState {
  return getPlayer(state.game!, state.game!.currentTurn)
}
/** Tracks the displayed Aether breakdown: regular vs conditional. */
function aetherInfo(p: PlayerState) {
  const total = getTotalAether(p)
  const tokenTotal = p.aetherTokens ?? 0
  const remainingConditional = getAllRemainingConditional(p)
  const conditionalTypes = new Set([
    ...Object.keys(remainingConditional),
    ...Object.keys(p.condAetherSpent),
  ])
  let conditionalEarned = 0
  for (const type of conditionalTypes) {
    conditionalEarned += getConditionalAetherByType(p, type)
  }
  const regularAvail = Math.max(0, (total - tokenTotal - conditionalEarned) - p.regularAetherSpent)
  const conds: Record<string, number> = {}
  for (const [k, v] of Object.entries(remainingConditional)) {
    if (v > 0) conds[k] = v
  }
  let condAvail = 0
  for (const v of Object.values(conds)) condAvail += v
  return {
    total,
    available: regularAvail + condAvail + tokenTotal,
    aetherTokens: p.aetherTokens ?? 0,
    regularAvail,
    gemAether: conds['gem'] ?? 0,
    spellAether: conds['spell'] ?? 0,
    cardAether: conds['gain'] ?? 0,
    breachAether: conds['breach'] ?? 0,
    conds,
  }
}
// ===== Undo (Ctrl+Z, max 10 steps) =====
function snapshot(): UndoSnapshot {
  return createUndoSnapshot({
    game: state.game!,
    phase: state.phase,
    prepTarget: state.prepTarget,
    selectedPlayer: state.selectedPlayer,
    discardRemaining: state.discardRemaining,
  })
}
/** Normalize legacy Remnant Rift setup and focus progress in saves/undo snapshots. */
function normalizeRemnantRiftBreaches(game: GameState) {
  const rules = [
    {
      index: 3,
      focusToOpen: 3,
      directions: ['south', 'west', 'north'] as const,
      openDirection: 'north' as const,
    },
    {
      index: 4,
      focusToOpen: 2,
      directions: ['west', 'north'] as const,
      openDirection: 'north' as const,
    },
  ]
  for (const player of game.players) {
    if (player.mageType !== 'remnant') continue
    for (const rule of rules) {
      const breach = player.breaches.find(candidate => candidate.index === rule.index && candidate.special === 'rift')
      if (!breach || breach.present === false) continue
      const focusCount = Math.max(0, Math.floor(breach.focusCount ?? (breach.opened ? rule.focusToOpen : 0)))
      breach.focusToOpen = rule.focusToOpen
      breach.focusCount = Math.min(focusCount, rule.focusToOpen)
      breach.opened = breach.focusCount >= rule.focusToOpen
      if (breach.opened) {
        breach.focusDirection = rule.openDirection
      } else {
        breach.focusDirection = rule.directions[breach.focusCount] ?? rule.directions[0]
      }
    }
  }
}
function beforeAction(
  captureMarketTransfers = true,
  preferredHandZoneOrder: readonly HandZoneSelection[] = [],
  excludedMotionElement: HTMLElement | null = null,
  recordUndo = true,
): UndoSnapshot | null {
  if (!state.game) return null
  if (activeActionCaptureDepth === 0) {
    activeActionCaptureCompletion = new Promise(resolve => {
      resolveActiveActionCaptureCompletion = resolve
    })
  }
  const previous = snapshot()
  activeActionCaptureDepth++
  cardZoneMotionsByUndo.set(previous, typeof document === 'undefined'
    ? { rows: [], cards: [], externalArrivals: [] }
    : captureCardZoneMotion(document, excludedMotionElement))
  handZoneTransfersByUndo.set(previous, captureHandZoneTransfers(state.game, preferredHandZoneOrder))
  const cardTransfers = captureCorruptionCardTransfers(state.game)
  if (cardTransfers) cardZoneTransfersByUndo.set(previous, cardTransfers)
  if (captureMarketTransfers) {
    const marketTransfers = captureMarketPileTransfers(state.game)
    if (marketTransfers.length > 0) marketPileTransfersByUndo.set(previous, marketTransfers)
  }
  if (recordUndo) pushUndoSnapshot(previous)
  return previous
}
function pushUndoSnapshot(value: UndoSnapshot) {
  undoStack.push(value)
  if (undoStack.length > MAX_UNDO) undoStack.shift()
}
function recordUndoBoundary() {
  if (state.game) pushUndoSnapshot(snapshot())
}
function finishAction(previous: UndoSnapshot | null, preferredHandZoneOrder: readonly HandZoneSelection[] = []): Promise<void> {
  if (!previous) return Promise.resolve()
  activeActionCaptureDepth = Math.max(0, activeActionCaptureDepth - 1)
  if (!state.game) {
    const boardMotion = cardZoneMotionsByUndo.get(previous) ?? null
    discardCardZoneMotion(boardMotion)
    releaseBoardDiscardDisplayHolds(boardMotion)
    cardZoneMotionsByUndo.delete(previous)
    discardCardZoneTransfer(cardZoneTransfersByUndo.get(previous) ?? null)
    cardZoneTransfersByUndo.delete(previous)
    const handZoneCapture = handZoneTransfersByUndo.get(previous)
    handZoneCapture?.cards.forEach(card => discardCardFlight(card.flight))
    handZoneTransfersByUndo.delete(previous)
    discardMarketPileTransfers(marketPileTransfersByUndo.get(previous) ?? [])
    marketPileTransfersByUndo.delete(previous)
    completeActiveActionCaptureIfSettled()
    return Promise.resolve()
  }
  const transfers: CardZoneTransfer[] = []
  const boardMotion = cardZoneMotionsByUndo.get(previous) ?? null
  if (boardMotion) {
    holdSwapCardsMovingToDiscard(
      boardMotion,
      capturePlayerZoneMotionBaseline(previous.game.players),
      state.game.players,
    )
  }
  cardZoneMotionsByUndo.delete(previous)
  const cardTransfers = cardZoneTransfersByUndo.get(previous)
  if (cardTransfers) {
    cardZoneTransfersByUndo.delete(previous)
    transfers.push(...resolveCardZoneTransfers(
      cardTransfers,
      state.game.nemesis.corruptionDeck ?? [],
      state.game.players,
    ))
  }
  const marketTransfers = marketPileTransfersByUndo.get(previous)
  if (marketTransfers) {
    marketPileTransfersByUndo.delete(previous)
    transfers.push(...resolveMarketPileTransfers(marketTransfers, state.game))
  }
  const handZoneCapture = handZoneTransfersByUndo.get(previous)
  if (handZoneCapture) {
    handZoneTransfersByUndo.delete(previous)
    transfers.push(...resolveHandZoneTransfers(handZoneCapture, state.game.players, preferredHandZoneOrder))
  }
  const boardMotionGates = cardZoneMotionGatesByUndo.get(previous)
  cardZoneMotionGatesByUndo.delete(previous)
  const boardFlight = boardMotion
    ? queueCardZoneMotion(boardMotion, boardMotionGates).finally(() => releaseBoardDiscardDisplayHolds(boardMotion))
    : Promise.resolve()
  const cardFlight = transfers.length > 0
    ? boardFlight.then(() => queueCardZoneTransfers(transfers))
    : boardFlight
  if (state.game.gameOver) state.phase = 'gameover'
  const current = snapshot()
  if (undoSnapshotsEqual(previous, current)) {
    const undoIndex = undoStack.indexOf(previous)
    if (undoIndex >= 0) undoStack.splice(undoIndex, 1)
  }
  completeActiveActionCaptureIfSettled()
  return cardFlight
}

function queueCardZoneMotion(
  snapshot: CardZoneMotionSnapshot,
  zoneBarriers: ReadonlyMap<string, Promise<void>> = new Map(),
): Promise<void> {
  const prepareTransfer = async (transfer: CardZoneMotionTransfer): Promise<HTMLElement | null> => {
    const held = state.swapZoneDisplayHolds[transfer.ownerId]
    if (transfer.sourceZone !== 'swap' || held?.motionKey !== transfer.sourceKey || held.departing) return null
    const source = findDataElement('data-card-motion-held-key', transfer.sourceKey)
    const row = source?.closest<HTMLElement>('[data-card-motion-row]') ?? null
    const liveFlight = captureCardFlight(source)
    if (liveFlight) {
      discardCardFlight(transfer.flight)
      transfer.flight = liveFlight
    }
    if (source) source.style.visibility = 'hidden'
    state.swapZoneDisplayHolds = {
      ...state.swapZoneDisplayHolds,
      [transfer.ownerId]: { ...held, departing: true },
    }
    await nextTick()
    return row
  }
  const runMotion = async () => {
    let releaseMotion: (() => void) | null = null
    let transfers: CardZoneMotionTransfer[] = []
    if (typeof document === 'undefined') {
      discardCardZoneMotion(snapshot)
      return
    }
    try {
      await nextTick()
      transfers = resolveCardZoneMotion(snapshot, document)
      const waitingDestinations = new Map<HTMLElement, {
        visibility: string
        lastTransfer: CardZoneMotionTransfer
      }>()
      for (const transfer of transfers) {
        if (transfer.waitForZones.length === 0 || !transfer.flight || !transfer.destination) continue
        let destinationState = waitingDestinations.get(transfer.destination)
        if (!destinationState) {
          destinationState = {
            visibility: transfer.destination.style.visibility,
            lastTransfer: transfer,
          }
          waitingDestinations.set(transfer.destination, destinationState)
          transfer.destination.style.visibility = 'hidden'
        } else {
          destinationState.lastTransfer = transfer
        }
        transfer.destinationVisibilityBefore = 'hidden'
        const held = state.swapZoneDisplayHolds[transfer.ownerId]
        const heldSource = transfer.sourceZone === 'swap' && held?.motionKey === transfer.sourceKey
          ? findDataElement('data-card-motion-held-key', transfer.sourceKey)
          : null
        if (!heldSource) holdCardFlightAtOrigin(transfer.flight)
      }
      waitingDestinations.forEach(({ visibility, lastTransfer }) => {
        lastTransfer.destinationVisibilityBefore = visibility
      })
      const currentRows = new Map([...document.querySelectorAll<HTMLElement>('[data-card-motion-row]')]
        .map(row => [row.dataset.cardMotionRow ?? '', row]))
      const affectedRows = snapshot.rows.flatMap(previous => {
        const row = currentRows.get(previous.key)
        if (!row) return []
        const targets = [...row.querySelectorAll<HTMLElement>('[data-card-motion-key]')]
        const moved = targets.some(target => {
          const before = previous.positions.get(target.dataset.cardMotionKey ?? '')
          if (!before) return true
          const rect = target.getBoundingClientRect()
          return Math.abs(rect.left - before.left) >= .5 || Math.abs(rect.top - before.top) >= .5
        }) || [...previous.positions.keys()].some(key =>
          !targets.some(target => target.dataset.cardMotionKey === key))
        return moved ? [row] : []
      })
      if (transfers.length === 0 && affectedRows.length === 0) {
        await Promise.all(zoneBarriers.values())
        return
      }
      releaseMotion = beginCardMotionBatch()
      await Promise.all([
        animateCardZoneMotion(transfers, zoneBarriers, prepareTransfer),
        ...affectedRows.map(row => waitForCardRowReflow(row)),
      ])
    } catch {
      discardCardZoneMotion(snapshot)
    } finally {
      transfers.forEach(transfer => {
        if (transfer.destination && transfer.destinationVisibilityBefore !== undefined) {
          transfer.destination.style.visibility = transfer.destinationVisibilityBefore
        }
      })
      releaseMotion?.()
    }
  }
  cardZoneTransferAnimationQueue = cardZoneTransferAnimationQueue.then(runMotion, runMotion).catch(() => {
    discardCardZoneMotion(snapshot)
  })
  return cardZoneTransferAnimationQueue
}
function registerCardZoneMotionBarrier(previous: UndoSnapshot, zone: string, promise: Promise<void>) {
  const barriers = cardZoneMotionGatesByUndo.get(previous) ?? new Map<string, Promise<void>>()
  barriers.set(zone, promise)
  cardZoneMotionGatesByUndo.set(previous, barriers)
}
function refreshCardZoneMotionRow(previous: UndoSnapshot | null, row: HTMLElement | null) {
  if (!previous || !row) return
  const rowSnapshot = cardZoneMotionsByUndo.get(previous)?.rows.find(entry =>
    entry.key === row.dataset.cardMotionRow)
  if (rowSnapshot) rowSnapshot.positions = captureCardRowPositions(row)
}
function completeActiveActionCaptureIfSettled() {
  if (activeActionCaptureDepth !== 0) return
  resolveActiveActionCaptureCompletion?.()
  resolveActiveActionCaptureCompletion = null
}
export function undo() {
  const s = undoStack.pop()
  if (!s || !state.game) { pushLog('Nothing to undo', 'warn'); return }
  clearAutomaticDecisionViewRestore()
  turnTransitionSequence++
  state.turnTransitionActive = false
  state.autoEndWaitPending = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingPlayCardFlight()
  clearPendingNemesisDrawFlight()
  clearPendingGainPlacementFlight()
  state.cardMotionBatchActive = false
  state.handDiscardPresentation = null
  state.handPlayPresentation = null
  clearDamageImpacts()
  normalizeRemnantRiftBreaches(s.game)
  state.game = reactive(s.game) as GameState
  state.phase = s.phase
  state.pendingPreppedSpells = []
  clearPendingBoardHandFlights()
  state.pendingBoardCards = []
  state.prepTarget = s.prepTarget
  state.selectedPlayer = s.selectedPlayer
  state.discardRemaining = [...s.discardRemaining]
  state.deckDisplayOverride = null
  state.discardTopDisplayOverride = null
  state.discardPileDisplayOverrides = {}
  state.swapZoneDisplayHolds = {}
  state.swapZoneCardKeys = {}
  state.helpOpen = false
  state.viewPile = null
  state.endTurnWarningVisible = false
  state.endTurnActionHint = null
  pushLog('Undid last action')
}
// ===== Auto-end turn when no actions remain =====
async function waitForBreachMotionsWithShield(): Promise<boolean> {
  let ownsMotionShield = false
  let waitedForMotion = false
  try {
    let observedCardQueue: Promise<void>
    do {
      observedCardQueue = cardZoneTransferAnimationQueue
      await observedCardQueue
      waitedForMotion = await waitForBreachMotions(() => {
        if (!state.cardMotionBatchActive) {
          state.cardMotionBatchActive = true
          ownsMotionShield = true
        }
      }) || waitedForMotion
      await nextTick()
      const hand = document.querySelector<HTMLElement>('.hand')
      if (hasActiveHandCardReflow(hand)) {
        if (!state.cardMotionBatchActive) {
          state.cardMotionBatchActive = true
          ownsMotionShield = true
        }
        waitedForMotion = true
        await waitForHandCardReflow(hand)
      }
    } while (observedCardQueue !== cardZoneTransferAnimationQueue)
    return waitedForMotion
  } finally {
    if (ownsMotionShield) state.cardMotionBatchActive = false
  }}
function maybeAutoEnd() {
  if (state.phase !== 'main' || !state.game) return
  if (state.game.pendingDecision || state.game.pendingEffect) return
  if (playerCanAct.value || state.autoEndWaitPending) return
  state.autoEndWaitPending = true
  void activeActionCaptureCompletion.then(() => waitForBreachMotionsWithShield()).then(() => {
    state.autoEndWaitPending = false
    if (state.phase !== 'main' || !state.game || state.game.pendingDecision || state.game.pendingEffect) return
    if (playerCanAct.value) return
    pushLog('No actions available — turn ends automatically', 'info')
    // This automatic phase transition belongs to the action that exhausted
    // the player's options. That action already recorded its undo snapshot.
    doEndTurn(false)
  }, () => {
    state.autoEndWaitPending = false
  })
}
function resolveMainPhasePreppedEffects() {
  const g = state.game!
  const p = cp()
  for (const message of resolvePreppedEffects(g, p.id, 'main_phase')) pushLog(message, 'info')
}
function syncEnginePhaseWithUi() {
  if (!state.game || state.game.currentTurn === 'nemesis') return
  if (state.phase === 'casting' || state.phase === 'main') {
    state.game.currentPhase = state.phase
  }
}
async function enterMainPhase(playerId = cp().id) {
  await waitForBreachMotionsWithShield()
  const g = state.game
  if (!g) return
  const p = getPlayer(g, playerId)
  const messages = resolvePreppedEffects(g, p.id, 'casting_phase_end')
  for (const message of messages) pushLog(message, 'info')
  await waitForBreachMotionsWithShield()
  if (g.pendingDecision || g.pendingEffect) return
  for (const message of engineResolvePlayerInPlayPhaseEffects(g, p.id, 'casting_phase_end')) pushLog(message, 'info')
  await waitForBreachMotionsWithShield()
  if (g.pendingDecision || g.pendingEffect) return
  if (g.gameOver) { state.phase = 'gameover'; return }
  state.phase = 'main'
  // Ability activation is validated by the engine, so persist the phase
  // transition before main-phase actions become available.
  syncEnginePhaseWithUi()
  resolveMainPhasePreppedEffects()
  await waitForBreachMotionsWithShield()
  if (g.gameOver) { state.phase = 'gameover'; return }
  maybeAutoEnd()}
/** Resolve Crooked Mask Corruptions before allowing a player's Casting Phase. */async function continuePlayerTurnAfterCorruptions() {
  const g = state.game
  if (!g || g.currentTurn === 'nemesis' || g.pendingDecision || g.pendingEffect) return
  const playerId = g.currentTurn
  state.phase = 'casting'
  g.currentPhase = 'casting'
  if (g.pendingCorruptionStartPlayerId === playerId) {
    const messages = await trackAutomaticCardTransfers(() =>
      engineResolveEffects(g, playerId, [{ kind: 'resolve_corruptions', timing: 'turn_start' }], undefined, 0, playerId))
    for (const message of messages) {
      pushLog(message, 'info')
    }
    if (g.pendingDecision || g.pendingEffect) return
    g.pendingCorruptionStartPlayerId = undefined
  }
  if (g.pendingDecision || g.pendingEffect) return
  if (getCastableSpells(g, playerId).length === 0) void enterMainPhase(playerId)
}
// ===== Flow =====
function beginTurnImmediately() {
  clearAutomaticDecisionViewRestore()
  const g = state.game!
  if (g.gameOver) { state.phase = 'gameover'; return }
  const turnNum = g.turnOrderDiscard.length
  if (g.currentTurn === 'nemesis') {
    pushLog(`Turn ${turnNum} — ${g.nemesis.name.toUpperCase()} begins`, 'warn')
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
    void continueNemesisTurn()
  } else {
    const p = getPlayer(g, g.currentTurn)
    pushLog(`Turn ${turnNum} — ${displayMageName(p.mageType)} begins`, 'info')
    clearAutomaticDecisionViewRestore()
    state.selectedPlayer = g.currentTurn
    state.phase = 'casting'
    if (g.pendingDecision || g.pendingEffect) return
    void continuePlayerTurnAfterCorruptions()
  }
}
function readCssDuration(variable: string, fallbackMs: number): number {
  if (typeof document === 'undefined') return fallbackMs
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return fallbackMs
  return raw.endsWith('ms') ? value : raw.endsWith('s') ? value * 1000 : fallbackMs
}
function beginTurn(animateTransition = false) {
  if (!state.game) return
  if (!animateTransition) {
    turnTransitionSequence++
    state.turnTransitionActive = false
    beginTurnImmediately()
    return
  }
  const gameAtStart = state.game
  const sequence = ++turnTransitionSequence
  state.turnTransitionId++
  state.turnTransitionActive = true
  window.setTimeout(() => {
    if (sequence !== turnTransitionSequence || state.game !== gameAtStart) return
    state.turnTransitionActive = false
    beginTurnImmediately()
  }, readCssDuration('--turn-order-arrival-duration', 240))
}
export function newGame(
  m1: string,
  m2: string,
  nemesisType = state.nemesisType,
  nemesisDifficulty = state.nemesisDifficulty,
  marketSetup: MarketSetupConfig = { mode: state.marketMode, slots: [...state.marketSlots] },
) {
  clearAutomaticDecisionViewRestore()
  turnTransitionSequence++
  state.turnTransitionActive = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingPlayCardFlight()
  clearPendingNemesisDrawFlight()
  clearPendingGainPlacementFlight()
  state.cardMotionBatchActive = false
  clearDamageImpacts()
  state.activeSaveId = null
  autoSaveEnabled = false
  state.autoEndWaitPending = false
  state.exitPrompt = false
  state.endTurnWarningVisible = false
  state.endTurnActionHint = null
  state.nemesisType = nemesisType
  state.nemesisDifficulty = nemesisDifficulty
  const scenario = createTwoPlayerScenario([m1, m2], nemesisType, nemesisDifficulty, marketSetup)
  const g = reactive(createGame(scenario)) as GameState
  if (!g.pendingDecision && !g.pendingEffect) {
    for (const message of engineResolveMageSetups(g)) pushLog(message, 'info')
  }
  state.game = g
  state.handDiscardPresentation = null
  state.handPlayPresentation = null
  state.log = []
  state.pendingPreppedSpells = []
  clearPendingBoardHandFlights()
  state.pendingBoardCards = []
  state.prepTarget = null
  state.selectedPlayer = g.players[0]!.id
  state.discardRemaining = []
  state.deckDisplayOverride = null
  state.discardTopDisplayOverride = null
  state.discardPileDisplayOverrides = {}
  state.swapZoneDisplayHolds = {}
  state.swapZoneCardKeys = {}
  state.marketMode = scenario.marketSetup?.mode ?? defaultMarketSetup().mode
  state.marketSlots = [...(scenario.marketSetup?.slots ?? DEFAULT_MARKET_SLOTS)]
  state.helpOpen = false
  state.viewPile = null
  undoStack.length = 0
  pushLog(`Game started: ${displayMageName(m1)} + ${displayMageName(m2)} vs ${g.nemesis.name} (${nemesisDifficulty})`, 'ok')
  if (g.pendingDecision) {
    state.phase = 'casting'
    pushLog('Complete the setup choices before the first turn begins', 'info')
    return
  }
  startTurn(g)
  // When Nemesis starts the game, let the turn token arrive first so its deck
  // is mounted before we capture the draw animation's origin.
  beginTurn(g.currentTurn === 'nemesis')
}
/** Reroll the nine slots for the Setup screen's semi-random market template. */
export function rerollMarketTemplate() {
  state.marketMode = 'template1'
  state.marketSlots = resolveMarketCardIds({ mode: 'template1', slots: [] })
}
/** Restore a selected saved game from localStorage. */
export function resumeGame(saveId?: string): boolean {
  const save = storedSaves.find(candidate => candidate.id === saveId)
    ?? storedSaves[0]
  if (!save) return false
  try {
    clearAutomaticDecisionViewRestore()
    turnTransitionSequence++
    state.turnTransitionActive = false
    state.autoEndWaitPending = false
    state.nemesisDrawRevealAnimating = false
    clearPendingAttachCardFlight()
    clearPendingPlayCardFlight()
    clearPendingNemesisDrawFlight()
    clearPendingGainPlacementFlight()
    state.cardMotionBatchActive = false
    state.handDiscardPresentation = null
    state.handPlayPresentation = null
    clearDamageImpacts()
    const resumedGame = cloneGameState(save.game)
    normalizeRemnantRiftBreaches(resumedGame)
    state.game = reactive(resumedGame) as GameState
    state.activeSaveId = save.id
    autoSaveEnabled = true
    state.phase = save.phase
    syncEnginePhaseWithUi()
    state.selectedPlayer = save.selectedPlayer
    state.pendingPreppedSpells = []
    clearPendingBoardHandFlights()
    state.pendingBoardCards = []
    state.discardRemaining = [...save.discardRemaining]
    state.deckDisplayOverride = null
    state.discardTopDisplayOverride = null
    state.discardPileDisplayOverrides = {}
    state.swapZoneDisplayHolds = {}
    state.swapZoneCardKeys = {}
    state.marketMode = save.game.scenario.marketSetup?.mode ?? 'manual'
    state.marketSlots = [...(save.game.scenario.marketSetup?.slots ?? DEFAULT_MARKET_SLOTS)]
    state.prepTarget = null
    state.exitPrompt = false
    state.endTurnWarningVisible = false
    state.endTurnActionHint = null
    state.log = []
    undoStack.length = 0
    for (const savedSnapshot of save.undoStack) {
      const snapshot = cloneUndoSnapshot(savedSnapshot)
      normalizeRemnantRiftBreaches(snapshot.game)
      undoStack.push(snapshot)
    }
    if (undoStack.length > MAX_UNDO) undoStack.splice(0, undoStack.length - MAX_UNDO)
    pushLog('Game resumed', 'ok')
    if (!resumedGame.gameOver && resumedGame.currentTurn === 'nemesis' &&
      !resumedGame.pendingDecision && !resumedGame.pendingEffect) {
      // Older saves may have been written after confirming a Nemesis card but
      // before the turn state machine resumed. Continue that serialized step
      // on load so the save does not remain stuck between decisions.
      void continueNemesisTurn()
    } else if (!resumedGame.gameOver && resumedGame.currentTurn &&
      resumedGame.currentTurn !== 'nemesis' && state.phase === 'casting' &&
      !resumedGame.pendingDecision && !resumedGame.pendingEffect) {
      // Resume the Casting auto-skip check too: saves can be captured at the
      // start of a Mage turn before the no-spell transition reaches Main.
      void continuePlayerTurnAfterCorruptions()
    }
    maybeAutoEnd()
    return true
  } catch {
    return false
  }
}
export function clearSaves() {
  storedSaves = []
  clearGameSaves(localStorage)
  state.activeSaveId = null
  state.deleteSaveId = null
  state.deleteSaveIds = []
  syncSaveList()
}
/** Backward-compatible alias for the debug panel. */
export function clearSave() {
  clearSaves()
}
function createSaveId() {
  let id = ''
  do {
    id = `save-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  } while (storedSaves.some(save => save.id === id))
  return id
}
export function duplicateSave(saveId: string) {
  const source = storedSaves.find(save => save.id === saveId)
  if (!source) return
  const sourceName = summarizeGameSave(source).name
  const existingNames = new Set(storedSaves.map(save => summarizeGameSave(save).name.toLowerCase()))
  let name = `${sourceName} (Copy)`
  let copyNumber = 2
  while (existingNames.has(name.toLowerCase())) {
    name = `${sourceName} (Copy ${copyNumber})`
    copyNumber++
  }
  const now = Date.now()
  const copy: StoredSave = {
    ...source,
    id: createSaveId(),
    name,
    createdAt: now,
    updatedAt: now,
    players: [...source.players],
    game: cloneGameState(source.game),
    discardRemaining: [...source.discardRemaining],
    undoStack: (source.undoStack ?? []).map(cloneUndoSnapshot),
  }
  storedSaves.unshift(copy)
  persistStoredSaves()
}
export function renameSave(saveId: string, requestedName: string) {
  const save = storedSaves.find(candidate => candidate.id === saveId)
  const name = requestedName.trim().slice(0, 60)
  if (!save || !name) return
  save.name = name
  persistStoredSaves()
}
export function requestDeleteSave(saveId: string) {
  requestDeleteSaves([saveId])
}
export function requestDeleteSaves(saveIds: string[]) {
  const available = new Set(storedSaves.map(save => save.id))
  const pendingIds = [...new Set(saveIds)].filter(saveId => available.has(saveId))
  if (pendingIds.length === 0) return
  state.deleteSaveIds = pendingIds
  state.deleteSaveId = pendingIds.length === 1 ? pendingIds[0]! : null
}
export function cancelDeleteSave() {
  state.deleteSaveId = null
  state.deleteSaveIds = []
}
export function deleteSave(saveId: string) {
  if (state.deleteSaveIds.length !== 1 || state.deleteSaveIds[0] !== saveId) return
  deleteSaves([saveId])
}
export function deleteSaves(saveIds: string[]) {
  const approved = new Set(state.deleteSaveIds)
  const toDelete = new Set([...new Set(saveIds)].filter(saveId => approved.has(saveId)))
  if (toDelete.size === 0) return
  storedSaves = storedSaves.filter(save => !toDelete.has(save.id))
  if (storedSaves.length === 0) {
    clearGameSaves(localStorage)
  } else {
    persistStoredSaves()
  }
  syncSaveList()
  state.deleteSaveId = null
  state.deleteSaveIds = []
}
export function requestExit() {
  if (state.game) {
    state.endTurnWarningVisible = false
    state.endTurnActionHint = null
    state.exitPrompt = true
  }
}
export function cancelExit() {
  state.exitPrompt = false
}
function resetToSetup() {
  clearAutomaticDecisionViewRestore()
  turnTransitionSequence++
  state.turnTransitionActive = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingPlayCardFlight()
  clearPendingNemesisDrawFlight()
  clearPendingGainPlacementFlight()
  state.cardMotionBatchActive = false
  state.handDiscardPresentation = null
  state.handPlayPresentation = null
  clearDamageImpacts()
  state.game = null
  state.phase = 'setup'
  state.activeSaveId = null
  autoSaveEnabled = false
  state.deleteSaveId = null
  state.deleteSaveIds = []
  state.exitPrompt = false
  state.endTurnWarningVisible = false
  state.endTurnActionHint = null
  state.pendingPreppedSpells = []
  clearPendingBoardHandFlights()
  state.pendingBoardCards = []
  state.prepTarget = null
  state.discardRemaining = []
  state.deckDisplayOverride = null
  state.discardTopDisplayOverride = null
  state.discardPileDisplayOverrides = {}
  state.swapZoneDisplayHolds = {}
  state.swapZoneCardKeys = {}
  state.helpOpen = false
  state.viewPile = null
  state.debugOpen = false
  state.marketMode = 'template1'
  state.marketSlots = resolveMarketCardIds({ mode: 'template1', slots: [] })
  undoStack.length = 0
}
export function saveAndExit() {
  saveCurrentGame(true)
  resetToSetup()
}
export function exitWithoutSaving() {
  resetToSetup()
}
export function returnToMainMenu() {
  resetToSetup()
}
export function toggleDebug() {
  state.debugOpen = !state.debugOpen
}
export function setDebugFreeSpellCastEnabled(enabled: boolean) {
  state.debugFreeSpellCastEnabled = enabled
}
export function toggleHelp() {
  state.helpOpen = !state.helpOpen
}
export function closeHelp() {
  state.helpOpen = false
}
export function selectPlayer(id: PlayerId) {
  clearAutomaticDecisionViewRestore()
  state.selectedPlayer = id
  state.prepTarget = null
}
export async function castSpell(breachIndex: number, spellIndex = 0) {
  const previous = beforeAction()
  const msg = engineCastSpell(state.game!, cp().id, breachIndex, spellIndex)
  if (msg) pushLog(msg, 'ok')
  const cardFlight = finishAction(previous)
  await cardFlight
  // The nemesis may have been defeated — end the game immediately.
  if (state.game!.gameOver) {
    pushLog(checkGameOver(state.game!) ?? 'Game over', 'warn')
    state.phase = 'gameover'
    return
  }
  // Auto-advance to main phase once no more castable spells remain.
  if (getCastableSpells(state.game!, cp().id).length === 0) {
    pushLog('No more spells to cast — moving to main phase', 'info')
    await enterMainPhase(cp().id)
  }
}
export async function toMainPhase() {
  if (!state.game || state.phase !== 'casting') return
  const must = getCastableSpells(state.game!, cp().id).filter(s => s.mustCast)
  if (must.length > 0) { pushLog('You must cast the [MUST] spell(s) first', 'warn'); return }
  const previous = beforeAction()
  await enterMainPhase(cp().id)
  finishAction(previous)
}
function findDataElement(attribute: string, value: string, scope: ParentNode = document): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const escapedAttribute = attribute.startsWith('data-') ? attribute : `data-${attribute}`
  return [...scope.querySelectorAll<HTMLElement>(`[${escapedAttribute}]`)]
    .find(element => element.getAttribute(escapedAttribute) === value) ?? null
}
function findLastDataElement(attribute: string, value: string, scope: ParentNode = document): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const escapedAttribute = attribute.startsWith('data-') ? attribute : `data-${attribute}`
  const matches = [...scope.querySelectorAll<HTMLElement>(`[${escapedAttribute}]`)]
    .filter(element => element.getAttribute(escapedAttribute) === value)
  return matches[matches.length - 1] ?? null
}
function findLastMotionCard(zone: string, cardId: string, ownerId: PlayerId): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const matches = [...document.querySelectorAll<HTMLElement>(
    '[data-card-motion-zone][data-card-motion-card-id][data-card-motion-key]',
  )].filter(element => element.dataset.cardMotionZone === zone &&
    element.dataset.cardMotionCardId === cardId &&
    (zone === 'develop' || element.dataset.cardMotionOwnerId === ownerId))
  return matches[matches.length - 1] ?? null
}
function findMotionCardByOccurrence(
  zone: string,
  cardId: string,
  ownerId: PlayerId,
  occurrence: number,
): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return [...document.querySelectorAll<HTMLElement>(
    '[data-card-motion-zone][data-card-motion-card-id][data-card-motion-occurrence]',
  )].find(element => element.dataset.cardMotionZone === zone &&
    element.dataset.cardMotionCardId === cardId &&
    element.dataset.cardMotionOwnerId === ownerId &&
    Number(element.dataset.cardMotionOccurrence) === occurrence) ?? null
}
function capturePlayerZoneMotionBaseline(players: readonly PlayerState[]): PlayerZoneMotionBaseline[] {
  return players.map(player => ({
    id: player.id,
    swapZone: [...(player.swapZone ?? [])],
    discard: [...player.discard],
  }))
}
function releaseBoardDiscardDisplayHolds(snapshot: CardZoneMotionSnapshot | null) {
  if (!snapshot) return
  const holds = boardDiscardHoldsByMotion.get(snapshot)
  if (!holds) return
  boardDiscardHoldsByMotion.delete(snapshot)
  const overrides = { ...state.discardPileDisplayOverrides }
  const swapHolds = { ...state.swapZoneDisplayHolds }
  let changed = false
  let swapChanged = false
  for (const { playerId, previous, current, previousSwap, currentSwap } of holds.values()) {
    if (toRaw(overrides[playerId]) === current) {
      if (previous) overrides[playerId] = previous
      else delete overrides[playerId]
      changed = true
    }
    if (swapHolds[playerId]?.motionKey === currentSwap.motionKey) {
      if (previousSwap) swapHolds[playerId] = previousSwap
      else delete swapHolds[playerId]
      swapChanged = true
    }
  }
  if (changed) state.discardPileDisplayOverrides = overrides
  if (swapChanged) state.swapZoneDisplayHolds = swapHolds
}
function holdSwapCardsMovingToDiscard(
  snapshot: CardZoneMotionSnapshot | null,
  before: readonly PlayerZoneMotionBaseline[],
  after: readonly PlayerState[],
) {
  if (!snapshot) return
  for (const prior of before) {
    const player = after.find(candidate => candidate.id === prior.id)
    // The discard can keep its size when a swap removes the resolving card
    // from it, so detect departures per card instead of requiring growth.
    if (!player) continue
    const removed = new Map<string, number>()
    const discardedBefore = new Map<string, number>()
    for (const cardId of prior.swapZone) removed.set(cardId, (removed.get(cardId) ?? 0) + 1)
    for (const cardId of prior.discard) discardedBefore.set(cardId, (discardedBefore.get(cardId) ?? 0) + 1)
    for (const cardId of player.swapZone ?? []) {
      const count = removed.get(cardId) ?? 0
      if (count > 0) removed.set(cardId, count - 1)
    }
    for (const [cardId, count] of removed) {
      const discardAfterCount = player.discard.filter(id => id === cardId).length
      if (count <= 0 || discardAfterCount <= (discardedBefore.get(cardId) ?? 0)) continue
      const origin = snapshot.cards.find(card =>
        card.zone === 'swap' && card.ownerId === player.id && card.cardId === cardId && card.flight)
      if (!origin) continue
      if (player.discard[0] !== cardId) {
        holdCardFlightAtOrigin(origin.flight)
        continue
      }
      const holds = boardDiscardHoldsByMotion.get(snapshot) ?? new Map<PlayerId, BoardDiscardDisplayHold>()
      const existing = holds.get(player.id)
      if (existing?.current.boardArrival?.cardId === cardId &&
        existing.current.boardArrival.count === player.discard.length) continue
      const previous = existing ? existing.previous : state.discardPileDisplayOverrides[player.id]
      // The resolving card can leave the discard for the Swap zone during the
      // same action (a spell waiting in the discard). Exclude it from the
      // pre-arrival surface so its own flight out of the pile stays visible
      // and the generic motion can still detect the departure.
      const displayDiscard = [...prior.discard]
      for (const swapCardId of new Set(player.swapZone ?? [])) {
        const gainedInSwap = (player.swapZone ?? []).filter(id => id === swapCardId).length -
          prior.swapZone.filter(id => id === swapCardId).length
        const lostFromDiscard = prior.discard.filter(id => id === swapCardId).length -
          player.discard.filter(id => id === swapCardId).length
        for (let remaining = Math.min(gainedInSwap, lostFromDiscard); remaining > 0; remaining--) {
          const discardedIndex = displayDiscard.indexOf(swapCardId)
          if (discardedIndex >= 0) displayDiscard.splice(discardedIndex, 1)
        }
      }
      const current: DiscardDisplayOverride = {
        cardId: displayDiscard[0] ?? null,
        count: displayDiscard.length,
        boardArrival: { cardId, count: player.discard.length },
      }
      const previousSwap = existing ? existing.previousSwap : state.swapZoneDisplayHolds[player.id]
      const oldSwapCards = snapshot.cards.filter(card => card.zone === 'swap' && card.ownerId === player.id)
      const availableKeys = oldSwapCards.filter(card => card.key !== origin.key)
      const survivorKeys = (player.swapZone ?? []).map((remainingCardId, index) => {
        const priorIndex = availableKeys.findIndex(card => card.cardId === remainingCardId)
        if (priorIndex >= 0) return availableKeys.splice(priorIndex, 1)[0]!.key
        return `${origin.key}:arrival:${index}`
      })
      const currentSwap: SwapZoneDisplayHold = {
        cardId,
        index: oldSwapCards.findIndex(card => card.key === origin.key),
        motionKey: origin.key,
        survivorKeys,
        departing: false,
      }
      holds.set(player.id, { playerId: player.id, previous, current, previousSwap, currentSwap })
      boardDiscardHoldsByMotion.set(snapshot, holds)
      state.discardPileDisplayOverrides = { ...state.discardPileDisplayOverrides, [player.id]: current }
      state.swapZoneDisplayHolds = { ...state.swapZoneDisplayHolds, [player.id]: currentSwap }
      state.swapZoneCardKeys = {
        ...state.swapZoneCardKeys,
        [player.id]: { cardIds: [...(player.swapZone ?? [])], motionKeys: survivorKeys },
      }
    }
  }
}
function getPlayedCardDestinationZone(
  owner: PlayerState,
  cardId: string,
  baseline: PlayCardZoneBaseline,
): string | null {
  const playedCount = owner.playedThisTurn.filter(id => id === cardId).length
  const swapCount = (owner.swapZone ?? []).filter(id => id === cardId).length
  const discardCount = owner.discard.filter(id => id === cardId).length
  if (swapCount > baseline.previousSwapCount && playedCount <= baseline.previousPlayedCount) return 'swap'
  if (playedCount > baseline.previousPlayedCount) return 'played'
  if (swapCount > baseline.previousSwapCount) return 'swap'
  if (discardCount > baseline.previousDiscardCount) return 'discard'
  const handCount = owner.hand.filter(id => id === cardId).length
  if (handCount > Math.max(0, baseline.previousHandCount - 1)) return 'hand'
  if (owner.deck.filter(id => id === cardId).length > baseline.previousDeckCardCount) return 'deck'
  return null
}

function getPendingPlayCardZone(pending: PendingPlayCardFlight): string | null {
  const owner = state.game?.players.find(player => player.id === pending.ownerId)
  return owner ? getPlayedCardDestinationZone(owner, pending.cardId, pending) : null
}

function findPlayCardDestination(
  ownerId: PlayerId,
  cardId: string,
  motionKey: string,
  zone: string | null,
): HTMLElement | null {
  if (!zone || typeof document === 'undefined') return null
  if (zone === 'played' || zone === 'swap' || zone === 'discard') {
    return findLastMotionCard(zone, cardId, ownerId)
  }
  const playerArea = findDataElement('data-player-area-id', ownerId)
  if (zone === 'deck') return playerArea?.querySelector<HTMLElement>('[data-card-flight-target="deck"]') ?? null
  if (zone === 'hand' && playerArea) {
    const handCards = [...playerArea.querySelectorAll<HTMLElement>(
      '[data-card-motion-zone="hand"][data-card-motion-card-id][data-card-motion-key]',
    )]
    return handCards.find(card => card.dataset.cardMotionCardId === cardId &&
      card.dataset.cardMotionKey !== motionKey) ?? null
  }
  return null
}

function findPendingPlayCardDestination(pending: PendingPlayCardFlight, zone: string | null): HTMLElement | null {
  // Identify the held copy by its Played Zone occurrence. While it is held in
  // hand it is not rendered, so this must not fall back to an earlier identical
  // copy that has to stay visible.
  if (zone === 'played') {
    return findMotionCardByOccurrence(zone, pending.cardId, pending.ownerId, pending.previousPlayedCount)
  }
  return findPlayCardDestination(pending.ownerId, pending.cardId, pending.motionKey, zone)
}

function animatePlayCardFlight(
  flight: CardFlightSnapshot | null,
  destination: HTMLElement | null,
  zone: string,
  destinationVisibility = '',
): Promise<void> {
  const timing = zone === 'deck'
    ? 'hand-to-deck-top'
    : zone === 'discard'
      ? 'hand-to-pile'
      : zone === 'swap' ? 'hand-to-swap-zone' : 'hand-to-play-zone'
  if (zone === 'deck') {
    return animateCardFlightToPlayerDeck(flight, destination, playerCardBackUrl(), {
      destinationMode: 'overlay',
      timing,
    })
  }
  return animateCardFlight(flight, destination, {
    destinationMode: zone === 'discard' ? 'overlay' : 'replace',
    timing,
    restoreDestinationVisibility: destinationVisibility,
  })
}

function hidePendingPlayCardDestination(pending: PendingPlayCardFlight) {
  const zone = getPendingPlayCardZone(pending)
  const destination = findPendingPlayCardDestination(pending, zone)
  if (destination === pending.hiddenDestination) return
  if (pending.hiddenDestination?.style.visibility === 'hidden') {
    pending.hiddenDestination.style.visibility = pending.hiddenDestinationVisibility
  }
  pending.hiddenDestination = destination
  pending.hiddenDestinationZone = destination?.dataset.cardMotionZone ?? zone
  pending.hiddenDestinationKey = destination?.dataset.cardMotionKey ?? null
  pending.hiddenDestinationVisibility = destination?.style.visibility ?? ''
  if (destination) destination.style.visibility = 'hidden'
}

async function finishPendingPlayCardFlight(previous: UndoSnapshot | null): Promise<{ zone: string; promise: Promise<void> } | null> {
  const pending = pendingPlayCardFlight
  if (!pending) return null
  if (state.game?.pendingDecision || state.game?.pendingEffect) {
    await nextTick()
    if (pendingPlayCardFlight === pending) hidePendingPlayCardDestination(pending)
    return null
  }

  pendingPlayCardFlight = null
  const releaseMotion = beginCardMotionBatch()
  const zone = getPendingPlayCardZone(pending)
  let destinationVisibility = pending.hiddenDestinationVisibility
  let destination = pending.hiddenDestination
  try {
    await nextTick()
    destination = findPendingPlayCardDestination(pending, zone)
    if (pending.hiddenDestination && pending.hiddenDestination !== destination &&
      pending.hiddenDestination.style.visibility === 'hidden') {
      pending.hiddenDestination.style.visibility = pending.hiddenDestinationVisibility
    }
    destinationVisibility = destination === pending.hiddenDestination
      ? pending.hiddenDestinationVisibility
      : destination?.style.visibility ?? ''
    if (destination) destination.style.visibility = 'hidden'

    const playerArea = findDataElement('data-player-area-id', pending.ownerId)
    const hand = playerArea?.querySelector<HTMLElement>('.hand') ?? null
    // The held presentation card keeps its identity marker across view
    // switches, while its visual motion key changes when the hand re-mounts.
    const source = playerArea?.querySelector<HTMLElement>('.hand [data-held-play-card="true"]') ??
      [...(playerArea?.querySelectorAll<HTMLElement>('[data-card-motion-key]') ?? [])]
        .find(card => card.dataset.cardMotionKey === pending.motionKey) ?? null
    const flight = captureCardFlight(source)
    if (source) {
      markHandCardDeparting(source)
      source.style.visibility = 'hidden'
    }
    if (state.handPlayPresentation?.presentationKey === pending.presentationKey) {
      state.handPlayPresentation = null
    }
    await nextTick()
    const promise = (async () => {
      try {
        await Promise.all([
          animatePlayCardFlight(flight, destination, zone ?? 'completed', destinationVisibility),
          waitForHandCardReflow(hand),
        ])
      } finally {
        if (destination?.style.visibility === 'hidden') {
          destination.style.visibility = destinationVisibility
        }
        if (pending.hiddenDestination && pending.hiddenDestination !== destination &&
          pending.hiddenDestination.style.visibility === 'hidden') {
          pending.hiddenDestination.style.visibility = pending.hiddenDestinationVisibility
        }
        releaseMotion()
      }
    })()
    if (previous && destination) {
      const destinationZone = destination.dataset.cardMotionZone ?? zone ?? 'completed'
      registerCardZoneMotionBarrier(previous, destinationZone, promise)
    }
    return { zone: destination?.dataset.cardMotionZone ?? zone ?? 'completed', promise }
  } catch (error) {
    if (destination?.style.visibility === 'hidden') {
      destination.style.visibility = destinationVisibility
    }
    if (pending.hiddenDestination?.style.visibility === 'hidden') {
      pending.hiddenDestination.style.visibility = pending.hiddenDestinationVisibility
    }
    state.handPlayPresentation = null
    releaseMotion()
    throw error
  }
}
function captureHandZoneTransfers(
  game: GameState,
  preferredOrder: readonly HandZoneSelection[] = [],
): HandZoneTransferSnapshot {
  const cards: HandZoneFlightSnapshot[] = []
  for (const player of game.players) {
    const playerArea = findDataElement('data-player-area-id', player.id)
    const handCards = playerArea
      ? [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="hand"]')]
      : []
    for (const element of handCards) {
      if (element.dataset.heldPlayCard === 'true') continue
      const handIndex = Number(element.getAttribute('data-hand-card-index'))
      const cardId = element.getAttribute('data-hand-card-id')
      if (!Number.isInteger(handIndex) || !cardId || player.hand[handIndex] !== cardId) continue
      cards.push({ playerId: player.id, cardId, handIndex, flight: captureCardFlight(element) })
    }
  }
  for (const item of preferredOrder) {
    if (item.choice.zone !== 'hand') continue
    const boardSelectionKey = `${item.playerId}:${item.choice.zone}:${item.choice.index}:${item.choice.cardId}`
    const existing = cards.find(card =>
      card.playerId === item.playerId && card.handIndex === item.choice.index && card.cardId === item.choice.cardId)
    if (pendingBoardHandFlights.has(boardSelectionKey)) {
      const selectedFlight = pendingBoardHandFlights.get(boardSelectionKey) ?? null
      pendingBoardHandFlights.delete(boardSelectionKey)
      if (existing) {
        if (existing.flight !== selectedFlight) discardCardFlight(existing.flight)
        existing.flight = selectedFlight
      } else {
        cards.push({
          playerId: item.playerId,
          cardId: item.choice.cardId,
          handIndex: item.choice.index,
          flight: selectedFlight,
        })
      }
      continue
    }
    if (existing?.flight) continue
    const modalSource = typeof document === 'undefined' ? undefined :
      [...document.querySelectorAll<HTMLElement>('[data-card-selection-key]')]
        .find(element => element.getAttribute('data-card-selection-key') === item.selectionKey)
    const flight = captureCardFlight(modalSource ?? null)
    if (existing) existing.flight = flight
    else cards.push({
      playerId: item.playerId,
      cardId: item.choice.cardId,
      handIndex: item.choice.index,
      flight,
    })
  }
  return {
    players: game.players.map(player => ({
      id: player.id,
      hand: [...player.hand],
      deck: [...player.deck],
      discard: [...player.discard],
    })),
    cards,
  }
}
function resolveHandZoneTransfers(
  snapshot: HandZoneTransferSnapshot,
  playersAfter: readonly PlayerState[],
  preferredOrder: readonly HandZoneSelection[],
): CardZoneTransfer[] {
  const beforeById = new Map(snapshot.players.map(player => [player.id, player]))
  const availableAdds = new Map<PlayerId, Array<{ cardId: string; zoneIndex: number }>>()
  const remainingCounts = new Map<string, number>()
  const handLossCounts = new Map<string, number>()
  const countKey = (playerId: PlayerId, cardId: string) => `${playerId}:${cardId}`
  const countCard = (cards: readonly string[], cardId: string) => cards.filter(id => id === cardId).length

  for (const player of playersAfter) {
    const before = beforeById.get(player.id)
    if (!before) continue
    const oldDiscardCounts = new Map<string, number>()
    for (const cardId of before.discard) oldDiscardCounts.set(cardId, (oldDiscardCounts.get(cardId) ?? 0) + 1)
    const additions: Array<{ cardId: string; zoneIndex: number }> = []
    for (let zoneIndex = 0; zoneIndex < player.discard.length; zoneIndex++) {
      const cardId = player.discard[zoneIndex]!
      const oldCount = oldDiscardCounts.get(cardId) ?? 0
      if (oldCount > 0) oldDiscardCounts.set(cardId, oldCount - 1)
      else additions.push({ cardId, zoneIndex })
    }
    availableAdds.set(player.id, additions)

    for (const cardId of new Set(before.hand)) {
      const lost = countCard(before.hand, cardId) - countCard(player.hand, cardId)
      if (lost > 0) {
        handLossCounts.set(countKey(player.id, cardId), lost)
        remainingCounts.set(countKey(player.id, cardId), Math.min(lost, additions.filter(item => item.cardId === cardId).length))
      }
    }
  }

  const unusedFlights = [...snapshot.cards]
  const transfers: CardZoneTransfer[] = []
  const takeHandFlight = (playerId: PlayerId, cardId: string, handIndex?: number) => {
    const exactIndex = handIndex === undefined ? -1 : unusedFlights.findIndex(item =>
      item.playerId === playerId && item.handIndex === handIndex && item.cardId === cardId)
    const flightIndex = exactIndex >= 0 ? exactIndex : unusedFlights.findIndex(item =>
      item.playerId === playerId && item.cardId === cardId)
    return flightIndex >= 0 ? unusedFlights.splice(flightIndex, 1)[0] : undefined
  }
  const addTransfer = (playerId: PlayerId, cardId: string, preferredHandIndex?: number) => {
    const key = countKey(playerId, cardId)
    const remaining = remainingCounts.get(key) ?? 0
    if (remaining <= 0) return
    const additions = availableAdds.get(playerId) ?? []
    const additionIndex = additions.findIndex(item => item.cardId === cardId)
    if (additionIndex < 0) return
    const [addition] = additions.splice(additionIndex, 1)
    const source = takeHandFlight(playerId, cardId, preferredHandIndex)
    const before = beforeById.get(playerId)
    if (!before || !addition) return
    remainingCounts.set(key, remaining - 1)
    transfers.push({
      cardId,
      playerId,
      zone: 'discard',
      zoneIndex: addition.zoneIndex,
      sourceHandIndex: preferredHandIndex ?? source?.handIndex,
      flight: source?.flight ?? null,
      sourcePlayerId: playerId,
      timing: 'hand-to-pile',
      previousDeckTop: before.deck[0] ?? null,
      previousDeckCount: before.deck.length,
      previousDiscardTop: before.discard[0] ?? null,
      previousDiscardCount: before.discard.length,
    })
  }

  const deckAddCounts = new Map<string, number>()
  for (const item of preferredOrder) {
    const recipientId = item.destinationPlayerId
    if (item.choice.zone !== 'hand' || !recipientId) continue
    const sourceBefore = beforeById.get(item.playerId)
    const sourceAfter = playersAfter.find(player => player.id === item.playerId)
    const recipientBefore = beforeById.get(recipientId)
    const recipientAfter = playersAfter.find(player => player.id === recipientId)
    const sourceKey = countKey(item.playerId, item.choice.cardId)
    const destinationKey = countKey(recipientId, item.choice.cardId)
    const remainingHandLoss = handLossCounts.get(sourceKey) ?? 0
    if (!sourceBefore || !sourceAfter || !recipientBefore || !recipientAfter || remainingHandLoss <= 0) continue
    if ((deckAddCounts.get(destinationKey) ??
      countCard(recipientAfter.deck, item.choice.cardId) - countCard(recipientBefore.deck, item.choice.cardId)) <= 0) continue

    const source = takeHandFlight(item.playerId, item.choice.cardId, item.choice.index)
    handLossCounts.set(sourceKey, remainingHandLoss - 1)
    deckAddCounts.set(destinationKey,
      (deckAddCounts.get(destinationKey) ??
        countCard(recipientAfter.deck, item.choice.cardId) - countCard(recipientBefore.deck, item.choice.cardId)) - 1)
    transfers.push({
      cardId: item.choice.cardId,
      playerId: recipientId,
      zone: 'deck',
      zoneIndex: 0,
      sourcePlayerId: item.playerId,
      sourceHandIndex: item.choice.index,
      flight: source?.flight ?? null,
      timing: 'hand-to-deck-top',
      previousDeckTop: recipientBefore.deck[0] ?? null,
      previousDeckCount: recipientBefore.deck.length,
      previousDiscardTop: recipientBefore.discard[0] ?? null,
      previousDiscardCount: recipientBefore.discard.length,
    })
  }

  // For player choices, animate in the same sequence the player selected.
  for (const item of preferredOrder) {
    if (item.choice.zone === 'hand' && !item.destinationPlayerId) {
      addTransfer(item.playerId, item.choice.cardId, item.choice.index)
    }
  }
  // Forced discards have no selection sequence, so follow the newly formed pile.
  for (const [playerId, additions] of availableAdds) {
    for (const addition of [...additions]) addTransfer(playerId, addition.cardId)
  }

  unusedFlights.forEach(card => discardCardFlight(card.flight))
  return transfers
}
function captureCorruptionCardTransfers(game: GameState): CardZoneTransferSnapshot | null {
  const corruptionDeck = game.nemesis.corruptionDeck
  if (!corruptionDeck) return null
  return captureCardZoneTransfer(
    findDataElement('data-card-flight-source', 'corruption-deck'),
    corruptionDeck,
    game.players,
  )}
function captureMarketPileTransfers(game: GameState): MarketPileTransferSnapshot[] {
  return game.market.piles.flatMap((pile, pileIndex) => {
    if (pile.remaining <= 0) return []
    return [{
      pileIndex,
      cardId: pile.cardId,
      remaining: pile.remaining,
      snapshot: captureCardZoneTransfer(
        findDataElement('data-supply-pile-index', String(pileIndex)),
        Array(pile.remaining).fill(pile.cardId),
        game.players,
      ),
    }]
  })}
function discardMarketPileTransfers(captures: readonly MarketPileTransferSnapshot[]) {
  captures.forEach(capture => discardCardZoneTransfer(capture.snapshot))}
function resolveMarketPileTransfers(
  captures: readonly MarketPileTransferSnapshot[],
  game: GameState,): CardZoneTransfer[] {
  const transfers: CardZoneTransfer[] = []
  let deferredPlacement = false
  const pendingCardId = isWaitingForGainedCardPlacement(game)
    ? game.pendingEffect?.lastGainedCardId
    : undefined
  for (const capture of captures) {
    const currentPile = game.market.piles[capture.pileIndex]
    const remainingAfter = currentPile?.cardId === capture.cardId ? currentPile.remaining : 0
    if (remainingAfter >= capture.remaining) {
      discardCardZoneTransfer(capture.snapshot)
      continue
    }
    if (!deferredPlacement && pendingCardId === capture.cardId && game.pendingDecision &&
      newlyGainedPlayerId(capture.snapshot, capture.cardId, game.players)) {
      pendingGainPlacementFlight = {
        decisionId: game.pendingDecision.id,
        cardId: capture.cardId,
        snapshot: capture.snapshot,
      }
      preserveDiscardBeforePendingGainPlacement(capture.snapshot, capture.cardId, game.players)
      deferredPlacement = true
      continue
    }
    transfers.push(...resolveCardZoneTransfers(
      capture.snapshot,
      Array(remainingAfter).fill(capture.cardId),
      game.players,
    ))
  }
  return transfers}
function transferDestination(transfer: CardZoneTransfer): { element: HTMLElement; destinationMode: 'overlay' | 'replace' } | null {
  const playerArea = findDataElement('data-player-area-id', transfer.playerId)
  if (!playerArea) return null
  if (transfer.zone === 'hand') {
    const handCards = [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="hand"]')]
      .filter(element => element.dataset.heldPlayCard !== 'true')
    const handCard = handCards.find(element =>
      element.getAttribute('data-hand-card-id') === transfer.cardId &&
      element.getAttribute('data-hand-card-index') === String(transfer.zoneIndex),
    ) ?? [...handCards].reverse().find(element => element.getAttribute('data-hand-card-id') === transfer.cardId)
    return handCard ? {
      element: handCard,
      destinationMode: cardZoneFlightDestinationMode(transfer.zone, true),
    } : null
  }
  if (transfer.zone === 'deck') {
    const deck = findDataElement('data-card-flight-target', 'deck', playerArea)
    return deck ? {
      element: deck,
      destinationMode: cardZoneFlightDestinationMode(transfer.zone, false),
    } : null
  }
  const discardTop = findDataElement('data-discard-top-card', transfer.cardId, playerArea)
  if (discardTop) return {
    element: discardTop,
    destinationMode: cardZoneFlightDestinationMode(transfer.zone, true),
  }
  const discardZone = findDataElement('data-card-flight-zone', 'discard', playerArea)
  return discardZone ? {
    element: discardZone,
    destinationMode: cardZoneFlightDestinationMode(transfer.zone, false),
  } : null}
function isWaitingForGainedCardPlacement(game: GameState): boolean {
  const awaiting = game.pendingEffect?.awaiting
  return !!game.pendingDecision && awaiting?.kind === 'choose_optional' &&
    awaiting.effects.some(effect => effect.kind === 'move_gained_card')}
function newlyGainedPlayerId(
  snapshot: CardZoneTransferSnapshot,
  cardId: string,
  playersAfter: readonly PlayerState[],): PlayerId | null {
  const beforeById = new Map(snapshot.players.map(player => [player.id, player]))
  const countCard = (zones: readonly (readonly string[])[]) =>
    zones.reduce((total, cards) => total + cards.filter(id => id === cardId).length, 0)
  for (const player of playersAfter) {
    const before = beforeById.get(player.id)
    if (!before) continue
    const beforeCount = countCard([before.hand, before.deck, before.discard])
    const afterCount = countCard([player.hand, player.deck, player.discard])
    if (afterCount > beforeCount) return player.id
  }
  return null}
function preserveDiscardBeforePendingGainPlacement(
  snapshot: CardZoneTransferSnapshot,
  cardId: string,
  playersAfter: readonly PlayerState[],) {
  const playerId = newlyGainedPlayerId(snapshot, cardId, playersAfter)
  const before = snapshot.players.find(player => player.id === playerId)
  if (!playerId || !before) return
  state.discardTopDisplayOverride = {
    playerId,
    cardId: before.discard[0] ?? null,
    count: before.discard.length,
  }}
function queueCardZoneTransfers(transfers: CardZoneTransfer[]): Promise<void> {
  const animatedTransfers = transfers.filter((transfer): transfer is CardZoneTransfer & { flight: CardFlightSnapshot } => !!transfer.flight)
  if (animatedTransfers.length === 0) {
    state.handDiscardPresentation = null
    return Promise.resolve()
  }
  const discardTransfer = animatedTransfers.find(transfer => transfer.zone === 'discard')
  const deckTransfer = animatedTransfers.find(transfer => transfer.zone === 'deck')
  const priorDiscardOverride = state.discardTopDisplayOverride
  const priorDiscardOverrides = state.discardPileDisplayOverrides
  const priorDeckOverride = state.deckDisplayOverride
  const flightDiscardOverride = discardTransfer ? {
    playerId: discardTransfer.playerId,
    cardId: discardTransfer.previousDiscardTop,
    count: discardTransfer.previousDiscardCount,
  } : null
  const flightDiscardOverrides = Object.fromEntries(
    [...new Set(animatedTransfers.filter(transfer => transfer.zone === 'discard').map(transfer => transfer.playerId))]
      .flatMap(playerId => {
        const transfer = animatedTransfers.find(candidate =>
          candidate.zone === 'discard' && candidate.playerId === playerId)
        return transfer ? [[playerId, {
          cardId: transfer.previousDiscardTop,
          count: transfer.previousDiscardCount,
        }]] : []
      }),
  ) as Partial<Record<PlayerId, { cardId: string | null; count: number }>>
  const flightDeckOverride = deckTransfer ? {
    playerId: deckTransfer.playerId,
    cardId: deckTransfer.previousDeckTop,
    count: deckTransfer.previousDeckCount,
  } : null
  if (flightDiscardOverride) state.discardTopDisplayOverride = flightDiscardOverride
  if (Object.keys(flightDiscardOverrides).length > 0) {
    state.discardPileDisplayOverrides = { ...priorDiscardOverrides, ...flightDiscardOverrides }
  }
  if (flightDeckOverride) state.deckDisplayOverride = flightDeckOverride
  const releaseMotion = beginCardMotionBatch()
  cardZoneTransferAnimationQueue = cardZoneTransferAnimationQueue.then(async () => {
    try {
      await nextTick()
      for (const transfer of animatedTransfers) {
        let destination = transferDestination(transfer)
        const stagedPresentation = state.handDiscardPresentation
        const stagedOwnerId = transfer.sourcePlayerId ?? transfer.playerId
        if ((transfer.zone === 'discard' || transfer.zone === 'deck') &&
          (transfer.timing === 'hand-to-pile' || transfer.timing === 'hand-to-deck-top') &&
          transfer.sourceHandIndex !== undefined && stagedPresentation?.playerId === stagedOwnerId) {
          const playerArea = findDataElement('data-player-area-id', stagedOwnerId)
          const hand = playerArea?.querySelector<HTMLElement>('.hand') ?? null
          const sourceElement = playerArea
            ? [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="hand"]')]
              .find(element => element.dataset.heldPlayCard !== 'true' &&
                element.getAttribute('data-hand-card-index') === String(transfer.sourceHandIndex))
            : undefined
          const liveFlight = captureCardFlight(sourceElement ?? null)
          if (liveFlight) discardCardFlight(transfer.flight)
          const flight = liveFlight ?? transfer.flight
          if (sourceElement) sourceElement.style.visibility = 'hidden'
          const destinationElement = destination?.element ?? null
          const destinationMode = destination?.destinationMode ?? 'overlay'
          const flightAnimation = transfer.zone === 'deck'
            ? animateCardFlightToPlayerDeck(flight, destinationElement, playerCardBackUrl(), {
              destinationMode,
              timing: transfer.timing,
            })
            : animateCardFlight(flight, destinationElement, {
              destinationMode,
              timing: transfer.timing,
            })
          const currentPresentation = state.handDiscardPresentation
          if (currentPresentation?.playerId === stagedOwnerId) {
            currentPresentation.cards = currentPresentation.cards.filter(card =>
              card.handIndex !== transfer.sourceHandIndex)
            await nextTick()
          }
          // Start the hand's FLIP reflow as soon as the flying clone is on
          // screen. Waiting for the flight first leaves an empty slot visible
          // until the card has already reached its pile.
          await Promise.all([flightAnimation, waitForHandCardReflow(hand)])
          continue
        }
        let originalDestinationVisibility: string | undefined
        let handTarget: HTMLElement | null = null
        if (transfer.zone === 'hand' && destination) {
          // Keep the newly rendered copy hidden while the old hand shifts into
          // its final layout, then aim the flight at that exact card slot.
          originalDestinationVisibility = destination.element.style.visibility
          handTarget = destination.element
          destination.element.style.visibility = 'hidden'
          await waitForHandGainReflow(destination.element.closest<HTMLElement>('.hand'))
          destination = transferDestination(transfer) ?? {
            element: handTarget,
            destinationMode: 'replace',
          }
        }
        if (transfer.zone === 'deck') {
          const deckFlight = animateCardFlightToPlayerDeck(
            transfer.flight,
            destination?.element ?? null,
            playerCardBackUrl(),
            { destinationMode: destination?.destinationMode ?? 'overlay', timing: transfer.timing },
          )
          if ((transfer.timing === 'hand-to-pile' || transfer.timing === 'hand-to-deck-top') &&
            transfer.sourcePlayerId) {
            const sourceArea = findDataElement('data-player-area-id', transfer.sourcePlayerId)
            await Promise.all([
              deckFlight,
              waitForHandCardReflow(sourceArea?.querySelector<HTMLElement>('.hand') ?? null),
            ])
          } else {
            await deckFlight
          }
        } else {
          await animateCardFlight(transfer.flight, destination?.element ?? null, {
            destinationMode: destination?.destinationMode ?? 'overlay',
            timing: transfer.timing,
            restoreDestinationVisibility: originalDestinationVisibility,
          })
        }
      }
    } finally {
      if (flightDiscardOverride && toRaw(state.discardTopDisplayOverride) === flightDiscardOverride) {
        state.discardTopDisplayOverride = priorDiscardOverride
      }
      if (Object.keys(flightDiscardOverrides).length > 0 &&
        Object.keys(toRaw(state.discardPileDisplayOverrides)).some(playerId => playerId in flightDiscardOverrides) &&
        Object.entries(flightDiscardOverrides).every(([playerId, value]) =>
          toRaw(state.discardPileDisplayOverrides)[playerId as PlayerId] === value)) {
        state.discardPileDisplayOverrides = priorDiscardOverrides
      }
      if (flightDeckOverride && toRaw(state.deckDisplayOverride) === flightDeckOverride) {
        state.deckDisplayOverride = priorDeckOverride
      }
      state.handDiscardPresentation = null
      releaseMotion()
    }
  }).catch(() => {
    animatedTransfers.forEach(transfer => discardCardFlight(transfer.flight))
    releaseMotion()
  })
  return cardZoneTransferAnimationQueue}
/** Track automatic effects that run outside a user action's undo boundary. */async function trackAutomaticCardTransfers<T>(run: () => T): Promise<T> {
  const boardMotion = activeActionCaptureDepth === 0 && typeof document !== 'undefined'
    ? captureCardZoneMotion(document)
    : null
  const boardZoneBaseline = boardMotion && state.game
    ? capturePlayerZoneMotionBaseline(state.game.players)
    : null
  const handZoneCapture = activeActionCaptureDepth === 0 && state.game
    ? captureHandZoneTransfers(state.game)
    : null
  const capture = activeActionCaptureDepth === 0 && state.game
    ? captureCorruptionCardTransfers(state.game)
    : null
  const marketCaptures = activeActionCaptureDepth === 0 && state.game
    ? captureMarketPileTransfers(state.game)
    : []
  let result!: T
  try {
    result = run()
  } finally {
    const transfers: CardZoneTransfer[] = []
    if (handZoneCapture && state.game) {
      transfers.push(...resolveHandZoneTransfers(handZoneCapture, state.game.players, []))
    } else {
      handZoneCapture?.cards.forEach(card => discardCardFlight(card.flight))
    }
    if (capture && state.game) {
      transfers.push(...resolveCardZoneTransfers(
        capture,
        state.game.nemesis.corruptionDeck ?? [],
        state.game.players,
      ))
    } else {
      discardCardZoneTransfer(capture)
    }
    if (state.game) transfers.push(...resolveMarketPileTransfers(marketCaptures, state.game))
    else discardMarketPileTransfers(marketCaptures)
    if (boardMotion && boardZoneBaseline && state.game) {
      holdSwapCardsMovingToDiscard(boardMotion, boardZoneBaseline, state.game.players)
    }
    const boardFlight = boardMotion
      ? queueCardZoneMotion(boardMotion).finally(() => releaseBoardDiscardDisplayHolds(boardMotion))
      : Promise.resolve()
    if (transfers.length > 0) await boardFlight.then(() => queueCardZoneTransfers(transfers))
    else await boardFlight
  }
  return result
}
function clearPendingAttachCardFlight() {
  discardCardFlight(pendingAttachCardFlight?.flight ?? null)
  pendingAttachCardFlight = null}
function clearPendingPlayCardFlight() {
  const pending = pendingPlayCardFlight
  if (!pending) return
  if (pending.hiddenDestination?.style.visibility === 'hidden') {
    pending.hiddenDestination.style.visibility = pending.hiddenDestinationVisibility
  }
  if (state.handPlayPresentation?.presentationKey === pending.presentationKey) {
    state.handPlayPresentation = null
  }
  pendingPlayCardFlight = null
}
function clearPendingGainPlacementFlight() {
  if (!pendingGainPlacementFlight) return
  discardCardZoneTransfer(pendingGainPlacementFlight.snapshot)
  pendingGainPlacementFlight = null
  state.deckDisplayOverride = null
  state.discardTopDisplayOverride = null
}
function clearPendingNemesisDrawFlight() {
  discardCardFlight(pendingNemesisDrawFlight?.flight ?? null)
  pendingNemesisDrawFlight = null
}
/** Hold the deck origin through Nemesis decisions that happen before its draw. */
function capturePendingNemesisDrawFlight(game: GameState) {
  if (game.nemesisResolution?.drawnCardId) return
  const cardId = game.nemesis.deck[0]
  if (!cardId) {
    clearPendingNemesisDrawFlight()
    return
  }
  if (pendingNemesisDrawFlight?.cardId === cardId) return
  clearPendingNemesisDrawFlight()
  const flight = captureCardFlight(findDataElement('data-nemesis-deck-pile', 'true'))
  if (flight) pendingNemesisDrawFlight = { cardId, flight }
}
function startNemesisDrawRevealAnimation(decision: Extract<PendingDecision, { kind: 'confirm_nemesis_draw' }>) {
  const pendingFlight = pendingNemesisDrawFlight
  pendingNemesisDrawFlight = null
  if (!pendingFlight || pendingFlight.cardId !== decision.cardId) {
    discardCardFlight(pendingFlight?.flight ?? null)
    pendingNemesisDrawRevealAnimation = null
    return
  }
  state.cardMotionBatchActive = true
  state.nemesisDrawRevealAnimating = true
  const animation = nextTick()
    .then(() => animateCardRevealFlight(
      pendingFlight.flight,
      document.querySelector<HTMLElement>('.nemesis-reveal-card'),
      cardImageUrl(decision.cardId),
    ))
    .catch(() => undefined)
    .finally(() => {
      state.cardMotionBatchActive = false
      state.nemesisDrawRevealAnimating = false
      if (pendingNemesisDrawRevealAnimation === animation) pendingNemesisDrawRevealAnimation = null
    })
  pendingNemesisDrawRevealAnimation = animation
}
function captureDamageTargetRects(): Map<string, DamageTargetRect> {
  const targets = new Map<string, DamageTargetRect>()
  if (typeof document === 'undefined') return targets
  for (const element of document.querySelectorAll<HTMLElement>('[data-damage-target]')) {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const bounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    if (element.dataset.damageTarget) targets.set(element.dataset.damageTarget, bounds)
  }
  return targets
}
function fallbackHealthTargetRect(targetId: string): DamageTargetRect | undefined {
  if (!targetId.startsWith('minion:') || typeof document === 'undefined') return undefined
  const board = document.querySelector<HTMLElement>('.nemesis-play')
  if (!board) return undefined
  const rect = board.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : undefined
}
function queueHealthImpact(event: HealthChangeEvent, preferredRect?: DamageTargetRect) {
  const append = (rect?: DamageTargetRect) => {
    if (!rect) return
    const stackIndex = state.damageImpacts.filter(impact => impact.targetId === event.targetId).length
    const impact: DamageImpact = {
      id: ++damageImpactId,
      kind: event.kind,
      targetId: event.targetId,
      amount: event.amount,
      ...rect,
      stackIndex,
    }
    state.damageImpacts.push(impact)
    damageImpactTimers.set(impact.id, setTimeout(() => {
      state.damageImpacts = state.damageImpacts.filter(candidate => candidate.id !== impact.id)
      damageImpactTimers.delete(impact.id)
    }, DAMAGE_IMPACT_DURATION_MS))
  }
  const rect = preferredRect ?? captureDamageTargetRects().get(event.targetId) ?? fallbackHealthTargetRect(event.targetId)
  if (rect) append(rect)
  else void nextTick().then(() => append(
    captureDamageTargetRects().get(event.targetId) ?? fallbackHealthTargetRect(event.targetId),
  ))
}

watch(
  () => state.game?.healthChangeEvents?.length ?? 0,
  length => {
    const game = state.game
    if (!length || !game?.healthChangeEvents?.length) return
    const events = [...game.healthChangeEvents]
    const targetRects = captureDamageTargetRects()
    delete game.healthChangeEvents
    for (const event of events) queueHealthImpact(event, targetRects.get(event.targetId))
  },
  { flush: 'sync' },
)
function clearDamageImpacts() {
  for (const timer of damageImpactTimers.values()) clearTimeout(timer)
  damageImpactTimers.clear()
  state.damageImpacts = []
}
function getHandZoneSelectionOrder(
  game: GameState,
  effectKind: string | undefined,
  effectPlayerId: PlayerId | undefined,
  selectedActionPlayerId: PlayerId | undefined,
  placementRecipientPlayerId: PlayerId | undefined,
  answer: PendingDecisionAnswer,
): HandZoneSelection[] {
  if (!effectKind || (!HAND_DISCARD_EFFECT_KINDS.has(effectKind) && !HAND_TO_DECK_EFFECT_KINDS.has(effectKind))) return []
  const actorId = effectPlayerId ?? selectedActionPlayerId ?? game.currentTurn
  const destinationPlayerId = effectKind === 'place_card_on_top_of_own_deck'
    ? actorId
    : effectKind === 'place_hand_card_on_ally_deck'
      ? placementRecipientPlayerId
      : undefined
  if (answer.kind === 'select_cards') {
    return answer.choices
      .filter(choice => choice.zone === 'hand')
      .map(choice => ({
        playerId: actorId,
        choice,
        selectionKey: `${choice.zone}:${choice.index}:${choice.cardId}`,
        ...(destinationPlayerId ? { destinationPlayerId } : {}),
      }))
  }
  if (answer.kind === 'select_collective_cards') {
    return answer.choices
      .filter(item => item.choice.zone === 'hand')
      .map(item => ({
        playerId: item.playerId,
        choice: item.choice,
        selectionKey: `${item.playerId}:${item.choice.zone}:${item.choice.index}:${item.choice.cardId}`,
      }))
  }
  return []
}
export async function resolveDecision(answer: PendingDecisionAnswer) {
  if (!state.game?.pendingDecision) return
  const confirmingNemesisDraw = state.game.pendingDecision.kind === 'confirm_nemesis_draw'
  if (confirmingNemesisDraw && pendingNemesisDrawRevealAnimation) {
    await pendingNemesisDrawRevealAnimation
  }
  const wasCasting = state.phase === 'casting'
  const wasInitialSetup = !state.game.currentTurn
  const wasCastingPhaseEnd = state.game.pendingEffect?.preppedPhase === 'casting_phase_end'
  const wasNemesisTurnWaiting = state.game.currentTurn === 'nemesis'
  const pendingDecision = state.game.pendingDecision
  const pendingEffect = state.game.pendingEffect
  const conjuredCardToReturn = pendingDecision.kind === 'select_conjure_breach' &&
    answer.kind === 'select_conjure_breach' && !answer.choice
    ? pendingEffect?.conjuredCard
    : undefined
  const conjureReturnPlayer = conjuredCardToReturn
    ? state.game.players.find(player => player.id === conjuredCardToReturn.playerId)
    : undefined
  const conjureReturnFlight = conjuredCardToReturn && conjureReturnPlayer
    ? captureCardFlight(findDataElement('data-player-area-id', conjureReturnPlayer.id)
      ?.querySelector<HTMLElement>('.pending-conjure-card') ?? null)
    : null
  const conjureReturnDeckTop = conjureReturnPlayer?.deck[0] ?? null
  const conjureReturnDeckCount = conjureReturnPlayer?.deck.length ?? 0
  const conjureReturnDiscardTop = conjureReturnPlayer?.discard[0] ?? null
  const conjureReturnDiscardCount = conjureReturnPlayer?.discard.length ?? 0
  const preferredHandZoneOrder = pendingEffect
    ? getHandZoneSelectionOrder(
      state.game,
      pendingEffect.awaiting?.kind,
      pendingEffect.effectPlayerId,
      pendingEffect.selectedActionPlayerId,
      pendingEffect.placementRecipientPlayerId,
      answer,
    )
    : []
  const presentationPlayerId = state.selectedPlayer
  const handTransferKind = pendingEffect?.awaiting?.kind ?? ''
  const presentationPlayerBefore = (HAND_DISCARD_EFFECT_KINDS.has(handTransferKind) ||
    HAND_TO_DECK_EFFECT_KINDS.has(handTransferKind)) &&
    preferredHandZoneOrder.some(item => item.playerId === presentationPlayerId)
    ? state.game.players.find(player => player.id === presentationPlayerId)
    : undefined
  const presentationHandBefore = presentationPlayerBefore ? [...presentationPlayerBefore.hand] : []
  const presentationDiscardBefore = presentationPlayerBefore ? [...presentationPlayerBefore.discard] : []
  const presentationMovesToDiscard = HAND_DISCARD_EFFECT_KINDS.has(handTransferKind)
  const gainPlacement = pendingGainPlacementFlight?.decisionId === pendingDecision.id
    ? pendingGainPlacementFlight
    : null
  const completingAttachPlay = pendingDecision?.kind === 'select_breach' &&
    pendingDecision.action === 'attach' &&
    pendingEffect?.awaiting?.kind === 'attach_relic' &&
    pendingEffect.sourceCardInHandPendingPlay === true
  const attachFlight = completingAttachPlay && pendingAttachCardFlight?.cardId === pendingEffect?.sourceCardId
    ? pendingAttachCardFlight
    : null
  if (attachFlight) state.cardMotionBatchActive = true
  // The card click and its Breach confirmation are one action. The click has
  // already recorded the pre-play snapshot, so do not add an intermediate undo point.
  const pendingPlayFlightAtStart = pendingPlayCardFlight
  // Decisions belonging to a held hand play share the click's undo boundary.
  // The intermediate engine state already moved the card out of the hand.
  const previous = completingAttachPlay ? null : beforeAction(
    true, preferredHandZoneOrder, null, !pendingPlayFlightAtStart,
  )
  if (previous && pendingPlayFlightAtStart) {
    const motionSnapshot = cardZoneMotionsByUndo.get(previous) ?? null
    discardCardZoneMotionSource(
      motionSnapshot,
      'hand',
      pendingPlayFlightAtStart.cardId,
      pendingPlayFlightAtStart.ownerId,
      pendingPlayFlightAtStart.motionKey,
    )
    if (pendingPlayFlightAtStart.hiddenDestinationZone && pendingPlayFlightAtStart.hiddenDestinationKey) {
      discardCardZoneMotionSource(
        motionSnapshot,
        pendingPlayFlightAtStart.hiddenDestinationZone,
        pendingPlayFlightAtStart.cardId,
        pendingPlayFlightAtStart.ownerId,
        pendingPlayFlightAtStart.hiddenDestinationKey,
      )
    }
  }
  const zoneBaseline = capturePlayerZoneMotionBaseline(state.game.players)
  const messages = engineResolvePendingDecision(state.game, state.game.pendingDecision.id, answer)
  holdSwapCardsMovingToDiscard(previous ? cardZoneMotionsByUndo.get(previous) ?? null : null, zoneBaseline, state.game.players)
  if (presentationPlayerBefore) {
    // Stage hand cards selected for a discard or a deck-top transfer so they
    // stay rendered until their flights start; the flight then removes each
    // card and reflows the hand. This also keeps the hand row unchanged while
    // the board motion runs, so the flight is not delayed behind the reflow.
    const selectedCount = preferredHandZoneOrder.filter(item => item.playerId === presentationPlayerId).length
    const playerAfter = state.game.players.find(player => player.id === presentationPlayerId)
    const discardGainedSelected = !!playerAfter &&
      playerAfter.discard.length >= presentationDiscardBefore.length + selectedCount
    const handLostSelected = !!playerAfter &&
      presentationHandBefore.length - playerAfter.hand.length >= selectedCount
    if (selectedCount > 0 && (presentationMovesToDiscard ? discardGainedSelected : handLostSelected)) {
      state.handDiscardPresentation = {
        playerId: presentationPlayerId,
        cards: presentationHandBefore.map((cardId, handIndex) => ({
          cardId,
          handIndex,
          presentationKey: `${presentationPlayerId}:hand:${handIndex}`,
        })),
      }
    }
  }
  for (const message of messages) {
    const warning = message.startsWith('Invalid') || message.startsWith('Stale') || message.startsWith('Choose ') || message.startsWith('Decision ')
    pushLog(message, warning ? 'warn' : 'info')
  }
  await finishPendingPlayCardFlight(previous)
  if (previous) {
    const marketCaptures = marketPileTransfersByUndo.get(previous) ?? []
    marketPileTransfersByUndo.delete(previous)
    const marketTransfers = resolveMarketPileTransfers(marketCaptures, state.game)
    if (marketTransfers.length > 0) await queueCardZoneTransfers(marketTransfers)
  }
  if (gainPlacement && !state.game.pendingDecision && !state.game.pendingEffect) {
    pendingGainPlacementFlight = null
    const transfers = resolveCardZoneTransfers(
      gainPlacement.snapshot,
      [],
      state.game.players,
    )
    await queueCardZoneTransfers(transfers)
    // Keep the pre-gain discard surface in place until a selected card has
    // physically arrived at its destination, then reveal the updated pile.
    state.discardTopDisplayOverride = null
    await nextTick()
  }
  if (conjuredCardToReturn && conjureReturnPlayer && conjureReturnFlight) {
    const playerAfter = state.game.players.find(player => player.id === conjureReturnPlayer.id)
    if (playerAfter?.deck.length === conjureReturnDeckCount + 1 &&
      playerAfter.deck[0] === conjuredCardToReturn.cardId) {
      await queueCardZoneTransfers([{
        cardId: conjuredCardToReturn.cardId,
        playerId: conjureReturnPlayer.id,
        sourcePlayerId: conjureReturnPlayer.id,
        zone: 'deck',
        zoneIndex: 0,
        flight: conjureReturnFlight,
        timing: 'hand-to-deck-top',
        previousDeckTop: conjureReturnDeckTop,
        previousDeckCount: conjureReturnDeckCount,
        previousDiscardTop: conjureReturnDiscardTop,
        previousDiscardCount: conjureReturnDiscardCount,
      }])
    } else {
      discardCardFlight(conjureReturnFlight)
    }
  }
  await waitForBreachMotionsWithShield()
  // Finish all card-zone flights caused by this decision before continuing a
  // Nemesis/player phase. In particular, Crooked Mask Corruptions must land
  // in the Mage deck before the turn state machine advances.
  await finishAction(previous, preferredHandZoneOrder)
  if (attachFlight) {
    const attached = state.game.players.some(player =>
      player.breaches.some(breach => breach.attachedRelic?.cardId === attachFlight.cardId))
    if (attached) {
      pendingAttachCardFlight = null
      try {
        await nextTick()
        await animateCardFlight(
          attachFlight.flight,
          findLastDataElement('data-attached-relic-id', attachFlight.cardId, document),
          { destinationMode: 'replace' },
        )
      } finally {
        state.cardMotionBatchActive = false
      }
    } else {
      state.cardMotionBatchActive = false
      if (!state.game.pendingEffect?.sourceCardInHandPendingPlay) clearPendingAttachCardFlight()
    }
  }
  if (state.game.gameOver) {
    pushLog(checkGameOver(state.game) ?? 'Game over', 'warn')
    state.phase = 'gameover'
  } else if (!state.game.pendingDecision && !state.game.pendingEffect &&
    state.game.pendingCorruptionStartPlayerId === state.game.currentTurn) {
    await continuePlayerTurnAfterCorruptions()
  } else if (!state.game.pendingDecision && !state.game.pendingEffect &&
    state.game.pendingCorruptionEndTurnPlayerId === state.game.currentTurn) {
    state.game.pendingCorruptionEndTurnPlayerId = undefined
    doEndTurn(false)
  } else if (wasNemesisTurnWaiting && state.game.pendingDecision?.kind === 'confirm_nemesis_draw' &&
    state.game.pendingDecision.source !== 'specific_deck') {
    // Resolving one Nemesis decision can queue the next draw directly. That
    // transition must consume the deck-origin snapshot kept by the prior step.
    state.phase = 'nemesis_draw'
    startNemesisDrawRevealAnimation(state.game.pendingDecision)
  } else if (!state.game.pendingDecision && wasInitialSetup) {
    for (const message of engineResolveMageSetups(state.game)) pushLog(message, 'info')
    if (!state.game.pendingDecision && !state.game.pendingEffect) {
      pushLog('Setup complete — first turn begins', 'ok')
      startTurn(state.game)
      beginTurn(state.game.currentTurn === 'nemesis')
    }
  } else if (!state.game.pendingDecision && wasNemesisTurnWaiting) {
    await continueNemesisTurn()
  } else if (!state.game.pendingDecision && state.game.currentTurn !== 'nemesis' && cp().drawPhaseSetupComplete) {
    finalizeDraw()
  } else if (!state.game.pendingDecision && wasCasting) {
    const noSpellsRemain = getCastableSpells(state.game, cp().id).length === 0
    if (wasCastingPhaseEnd || noSpellsRemain) await enterMainPhase(state.game.currentTurn)
  } else if (!state.game.pendingDecision && state.phase === 'main') {
    resolveMainPhasePreppedEffects()
    maybeAutoEnd()
  }
  restoreAutomaticDecisionViewIfSettled()
}
export function playCard(cardIdx: number) {
  return playCardWithMotion(cardIdx)
}
async function playCardWithMotion(cardIdx: number) {
  if (!canActMain.value || state.cardMotionBatchActive) return
  const p = cp()
  const cardId = p.hand[cardIdx]
  if (!cardId || !state.game) return
  const cardType = getCard(cardId).type
  const playerArea = findDataElement('data-player-area-id', p.id)
  const source = findDataElement('data-hand-card-index', String(cardIdx), playerArea ?? document)
  const hand = source?.closest<HTMLElement>('.hand') ?? null
  const motionKey = source?.dataset.cardMotionKey ?? ''
  let flight = cardType === 'gem' || cardType === 'relic'
    ? captureCardFlight(source)
    : null
  const playBaseline: PlayCardZoneBaseline = {
    previousHandCount: p.hand.filter(id => id === cardId).length,
    previousDeckCardCount: p.deck.filter(id => id === cardId).length,
    previousPlayedCount: p.playedThisTurn.filter(id => id === cardId).length,
    previousSwapCount: (p.swapZone ?? []).filter(id => id === cardId).length,
    previousDiscardCount: p.discard.filter(id => id === cardId).length,
  }
  const previousPlayCount = p.cardPlayCountsThisTurn[cardId] ?? 0
  const zoneBaseline = capturePlayerZoneMotionBaseline(state.game.players)
  const previous = beforeAction(true, [], source)
  const releaseMotion = flight ? beginCardMotionBatch() : null
  let entryMotion: Promise<void> = Promise.resolve()
  try {
    const msg = enginePlayCard(state.game, p.id, cardId, cardIdx)
    if (msg) pushLog(msg)
    holdSwapCardsMovingToDiscard(previous ? cardZoneMotionsByUndo.get(previous) ?? null : null, zoneBaseline, state.game.players)
    const hasPendingEffect = !!state.game.pendingDecision || !!state.game.pendingEffect
    const cardWasPlayed = (p.cardPlayCountsThisTurn[cardId] ?? 0) > previousPlayCount
    if (source && motionKey && hasPendingEffect && cardWasPlayed) {
      const presentationKey = `${p.id}:play:${motionKey}`
      const pending: PendingPlayCardFlight = {
        ownerId: p.id,
        cardId,
        handIndex: cardIdx,
        motionKey,
        presentationKey,
        ...playBaseline,
        hiddenDestination: null,
        hiddenDestinationZone: null,
        hiddenDestinationKey: null,
        hiddenDestinationVisibility: '',
      }
      pendingPlayCardFlight = pending
      state.handPlayPresentation = {
        playerId: p.id,
        cardId,
        handIndex: cardIdx,
        presentationKey,
        motionKey,
        playedOccurrence: playBaseline.previousPlayedCount,
      }
      discardCardFlight(flight)
      flight = null
      await nextTick()
      hidePendingPlayCardDestination(pending)
      entryMotion = waitForHandCardReflow(hand)
    } else if (cardWasPlayed) {
      const destinationZone = getPlayedCardDestinationZone(p, cardId, playBaseline)
      markHandCardDeparting(source)
      await nextTick()
      const destination = findPlayCardDestination(p.id, cardId, motionKey, destinationZone)
      if (!destinationZone) {
        discardCardFlight(flight)
        flight = null
        entryMotion = waitForHandCardReflow(hand)
      } else {
        entryMotion = Promise.all([
          animatePlayCardFlight(flight, destination, destinationZone, destination?.style.visibility ?? ''),
          waitForHandCardReflow(hand),
        ]).then(() => undefined)
        if (destination && previous) {
          const motionZone = destination.dataset.cardMotionZone ?? destinationZone
          recordCardZoneMotionArrival(cardZoneMotionsByUndo.get(previous) ?? null, motionZone, cardId, p.id)
          registerCardZoneMotionBarrier(previous, motionZone, entryMotion)
        }
        flight = null
      }
    } else if (flight && cardType === 'relic' && state.game.pendingEffect?.sourceCardInHandPendingPlay) {
      discardCardFlight(pendingAttachCardFlight?.flight ?? null)
      pendingAttachCardFlight = { ownerId: p.id, cardId, flight }
      flight = null
    } else {
      discardCardFlight(flight)
      flight = null
    }
    const actionMotion = finishAction(previous)
    await Promise.all([entryMotion, actionMotion])
    maybeAutoEnd()
  } finally {
    releaseMotion?.()
  }
}
export function openPile(pile: 'deck' | 'discard') {
  const cards = pile === 'deck' ? displayPlayer.value?.deck : displayPlayer.value?.discard
  if (!cards?.length) return
  closeDismissibleOverlays()
  state.viewPile = pile
}
/** Open the displayed player's face-down Mage-specific deck for inspection. */
export function openSpecificDeckPile() {
  if (!displayPlayer.value?.specificDeck?.length) return
  closeDismissibleOverlays()
  state.viewPile = 'specific_deck'
}
/** Open the shared Trinket deck for face-down/known-card inspection. */
export function openTrinketDeckPile() {
  closeDismissibleOverlays()
  state.viewPile = 'trinket_deck'
}
/** Open the displayed player's face-up in-play cards for action selection. */
export function openPlayerCardsInPlayPile() {
  const cards = displayPlayer.value?.playerCardsInPlay ?? []
  if (!state.game || state.phase !== 'main' || state.game.currentTurn === 'nemesis'
    || state.game.pendingDecision || state.game.pendingEffect || cards.length < 2) return
  closeDismissibleOverlays()
  state.viewPile = 'player_cards_in_play'
}
export function openNemesisDeckPile() {
  if (!state.game?.nemesis.deck.length) return
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_deck'
}
export function openNemesisDiscardPile() {
  if (!state.game?.nemesis.discard.length) return
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_discard'
}
/** Open the currently configured Nemesis specific pile for inspection. */
export function openNemesisSpecificPile() {
  const nemesis = state.game?.nemesis
  if (!nemesis || !getNemesisPresentation(nemesis.type).specificDeck.enabled) return
  const cards = nemesis.type === 'crooked_mask' ? nemesis.corruptionDeck : nemesis.strikeDeck
  if (!cards?.length) return
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_specific'
}
export function openNemesisSpecificDiscardPile() {
  const nemesis = state.game?.nemesis
  if (!nemesis || !getNemesisPresentation(nemesis.type).specificDiscard.enabled || !nemesis.strikeDiscard.length) return
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_specific_discard'
}
export function closePile() {
  state.viewPile = null
}
/** Close every non-decision overlay before opening a pile viewer. */
function closeDismissibleOverlays() {
  state.helpOpen = false
  state.exitPrompt = false
  state.debugOpen = false
  state.dismissibleOverlayVersion += 1
}
export async function playAllGems() {
  if (!state.game || state.cardMotionBatchActive || state.game.pendingDecision || state.game.pendingEffect || !canActMain.value) return
  const g = state.game!
  const p = cp()
  if (!p.hand.some(id => getCard(id).type === 'gem')) return
  const previous = beforeAction()
  state.cardMotionBatchActive = true
  try {
    while (!g.pendingDecision && !g.pendingEffect) {
      const handIndex = p.hand.findIndex(id => getCard(id).type === 'gem')
      if (handIndex < 0) break
      const cardId = p.hand[handIndex]!
      const playerArea = findDataElement('data-player-area-id', p.id)
      const source = findDataElement('data-hand-card-index', String(handIndex), playerArea ?? document)
      const hand = source?.closest<HTMLElement>('.hand') ?? null
      const motionKey = source?.dataset.cardMotionKey ?? ''
      const flight = captureCardFlight(source)
      const playBaseline: PlayCardZoneBaseline = {
        previousHandCount: p.hand.filter(id => id === cardId).length,
        previousDeckCardCount: p.deck.filter(id => id === cardId).length,
        previousPlayedCount: p.playedThisTurn.filter(id => id === cardId).length,
        previousSwapCount: (p.swapZone ?? []).filter(id => id === cardId).length,
        previousDiscardCount: p.discard.filter(id => id === cardId).length,
      }
      const previousPlayCount = p.cardPlayCountsThisTurn[cardId] ?? 0
      const zoneBaseline = capturePlayerZoneMotionBaseline(g.players)
      if (motionKey && previous) {
        discardCardZoneMotionSource(
          cardZoneMotionsByUndo.get(previous) ?? null,
          'hand',
          cardId,
          p.id,
          motionKey,
        )
      }
      const msg = enginePlayCard(g, p.id, cardId, handIndex)
      if (msg) pushLog(msg)
      holdSwapCardsMovingToDiscard(previous ? cardZoneMotionsByUndo.get(previous) ?? null : null, zoneBaseline, g.players)
      const cardWasPlayed = (p.cardPlayCountsThisTurn[cardId] ?? 0) > previousPlayCount
      if ((g.pendingDecision || g.pendingEffect) && cardWasPlayed && source && motionKey) {
        const presentationKey = `${p.id}:play:${motionKey}`
        const pending: PendingPlayCardFlight = {
          ownerId: p.id,
          cardId,
          handIndex,
          motionKey,
          presentationKey,
          ...playBaseline,
          hiddenDestination: null,
          hiddenDestinationZone: null,
          hiddenDestinationKey: null,
          hiddenDestinationVisibility: '',
        }
        pendingPlayCardFlight = pending
        state.handPlayPresentation = {
          playerId: p.id,
          cardId,
          handIndex,
          presentationKey,
          motionKey,
          playedOccurrence: playBaseline.previousPlayedCount,
        }
        discardCardFlight(flight)
        await nextTick()
        hidePendingPlayCardDestination(pending)
        break
      }
      const destinationZone = cardWasPlayed ? getPlayedCardDestinationZone(p, cardId, playBaseline) : null
      if (cardWasPlayed) {
        markHandCardDeparting(source)
        await nextTick()
        const target = findPlayCardDestination(p.id, cardId, motionKey, destinationZone)
        const targetRow = target?.closest<HTMLElement>('[data-card-motion-row]') ?? null
        const motion = Promise.all([
          animatePlayCardFlight(flight, target, destinationZone ?? 'completed', target?.style.visibility ?? ''),
          waitForHandCardReflow(hand),
          waitForCardRowReflow(targetRow),
        ]).then(() => undefined)
        if (target && previous) {
          const motionZone = target.dataset.cardMotionZone ?? destinationZone ?? 'completed'
          recordCardZoneMotionArrival(cardZoneMotionsByUndo.get(previous) ?? null, motionZone, cardId, p.id)
          registerCardZoneMotionBarrier(previous, motionZone, motion)
        }
        await motion
        refreshCardZoneMotionRow(previous, targetRow)
      } else {
        discardCardFlight(flight)
      }
    }
    await finishAction(previous)
    maybeAutoEnd()
  } finally {
    state.cardMotionBatchActive = false
  }
}
export function prepSpell(cardIdx: number, breachIndex: number) {
  const p = cp()
  const previous = beforeAction()
  const msg = enginePrepSpell(state.game!, p.id, p.hand[cardIdx]!, breachIndex, cardIdx)
  if (!msg) markHandCardDeparting(findDataElement('data-hand-card-index', String(cardIdx)))
  if (msg) pushLog(msg, 'ok')
  state.prepTarget = null
  if (!msg && state.phase === 'main') resolveMainPhasePreppedEffects()
  maybeAutoEnd()
  finishAction(previous)
}
export function activatePreppedCardAction(choice: CardChoice) {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const msg = engineActivatePreppedCardAction(state.game, cp().id, choice)
  if (msg) pushLog(msg, msg.startsWith('Returned ') ? 'ok' : 'warn')
  maybeAutoEnd()
  finishAction(previous)
}
/** Activate a Main Phase while-prepped effect by clicking the spell on its Breach. */
export function activatePreppedSpellAction(breachIndex: number, spellIndex: number) {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const messages = engineActivatePreppedSpellAction(state.game, cp().id, breachIndex, spellIndex)
  for (const message of messages) pushLog(message, message.startsWith('That ') || message.startsWith('Resolve ') ? 'warn' : 'ok')
  maybeAutoEnd()
  finishAction(previous)
}
/** Activate a Main Phase action exposed by a face-up Mage-specific card in play. */
export function activatePlayerCardInPlayAction(cardIndex: number, ownerId: PlayerId = state.selectedPlayer) {
  if (!state.game || state.phase !== 'main' || state.game.currentTurn === 'nemesis' || state.game.pendingDecision || state.game.pendingEffect) return
  const previous = beforeAction()
  const messages = engineActivatePlayerCardInPlayAction(state.game, ownerId, cardIndex)
  for (const message of messages) {
    pushLog(message, message.startsWith('That ') || message.startsWith('Resolve ') ? 'warn' : 'ok')
  }
  maybeAutoEnd()
  finishAction(previous)
}
export async function buyCard(pileIdx: number) {
  if (!state.game) return
  const game = state.game
  const player = cp()
  const previous = beforeAction()
  try {
    const msg = engineBuyCard(game, player.id, pileIdx)
    if (msg) pushLog(msg, 'ok')
    const cardFlight = finishAction(previous)
    if (game.gameOver) {
      state.phase = 'gameover'
      await cardFlight
      return
    }
    await cardFlight
    maybeAutoEnd()
  } finally {
    state.cardMotionBatchActive = false
  }}
/** Open the displayed Mage's destroyed-card area. */export function openDestroyedCardsPile() {
  closeDismissibleOverlays()
  state.viewPile = 'destroyed'}
export async function focusBreach(breachIndex: number) {
  const previous = beforeAction()
  const msg = engineFocusBreach(state.game!, cp().id, breachIndex)
  if (msg) pushLog(msg, 'ok')
  await waitForBreachMotionsWithShield()
  maybeAutoEnd()
  finishAction(previous)}
export async function openBreach(breachIndex: number) {
  const previous = beforeAction()
  const msg = engineOpenBreach(state.game!, cp().id, breachIndex)
  if (msg) pushLog(msg, 'ok')
  await waitForBreachMotionsWithShield()
  maybeAutoEnd()
  finishAction(previous)
}
export function gainCharge(amount = 1) {
  const previous = beforeAction()
  const msg = engineGainCharge(state.game!, cp().id, amount)
  if (msg) pushLog(msg, 'ok')
  maybeAutoEnd()
  finishAction(previous)
}
export function activateAbility() {
  const previous = beforeAction()
  // An ability may belong to the selected mage rather than the mage whose
  // turn is currently active (for example, Xaxos during Brama's main phase).
  const msg = engineActivateAbility(state.game!, state.selectedPlayer)
  if (msg) pushLog(msg, 'ok')
  maybeAutoEnd()
  finishAction(previous)
}
// ===== End of turn + discard ordering =====
function moveToDiscard(index: number) {
  const p = cp()
  const cardId = p.playedThisTurn[index]
  if (!cardId) return
  p.playedThisTurn.splice(index, 1)
  p.discard.unshift(cardId) // each card goes to the top of the discard pile
}
function finalizeDraw() {
  const g = state.game!
  const p = cp()
  state.discardRemaining = []
  const handBeforeDraw = p.hand.length
  for (const m of resolveDrawPhase(g, p.id)) pushLog(m)
  if (g.pendingDecision || g.pendingEffect) {
    pushLog('Resolve the end-of-turn card effect before drawing', 'info')
    return
  }
  const drawn = p.hand.length - handBeforeDraw
  if (drawn > 0) {
    state.drawPhaseHandGainTotals[p.id] = (state.drawPhaseHandGainTotals[p.id] ?? 0) + drawn
  }
  const over = checkGameOver(g)
  if (over) { pushLog(over, 'warn'); state.phase = 'gameover'; return }
  startTurn(g)
  beginTurn(true)
}
/** Discard identical remaining cards one at a time so each card visibly lands. */
async function autoDiscardRemaining() {
  state.cardMotionBatchActive = true
  const fallbackFlights: Array<CardFlightSnapshot | null> = []
  try {
    await nextTick()
    for (let index = 0; index < state.discardRemaining.length; index++) {
      fallbackFlights.push(captureCardFlight(findDataElement(
        'data-discard-phase-card-index', String(index),
        document.querySelector('.played-zone-center') ?? document,
      )))
    }
    while (state.discardRemaining.length > 0) {
      const fallbackFlight = fallbackFlights.shift() ?? null
      const currentFlight = captureCardFlight(findDataElement(
        'data-discard-phase-card-index', '0',
        document.querySelector('.played-zone-center') ?? document,
      ))
      if (currentFlight) discardCardFlight(fallbackFlight)
      await moveDiscardPhaseCard(0, currentFlight ?? fallbackFlight)
    }
    pushLog('Remaining played cards are identical — discarded automatically', 'info')
    finalizeDraw()
  } finally {
    fallbackFlights.forEach(discardCardFlight)
    state.cardMotionBatchActive = false
  }}
/** Wave-specific artwork IDs for the basic Crystal and Spark represent the same cards. */function discardOrderIdentity(cardId: string): string {
  const card = getCard(cardId)
  const normalizedName = card.name.trim().toLowerCase()
  if (card.type === 'gem' && normalizedName === 'crystal') return 'shared-basic-gem:crystal'
  if (card.type === 'spell' && normalizedName === 'spark') return 'shared-basic-spell:spark'
  return `card:${cardId}`}
function areSameDiscardOrderCards(cardIds: readonly string[]): boolean {
  return new Set(cardIds.map(discardOrderIdentity)).size <= 1}
async function moveDiscardPhaseCard(index: number, capturedFlight?: CardFlightSnapshot | null) {
  const p = cp()
  const cardId = state.discardRemaining[index]
  if (!cardId) return
  const previousDiscardTop = p.discard[0] ?? null
  const previousDiscardCount = p.discard.length
  const flight = capturedFlight === undefined ? captureCardFlight(findDataElement(
    'data-discard-phase-card-index', String(index),
    document.querySelector('.played-zone-center') ?? document,
  )) : capturedFlight
  state.discardTopDisplayOverride = { playerId: p.id, cardId: previousDiscardTop, count: previousDiscardCount }
  state.discardRemaining.splice(index, 1)
  moveToDiscard(index)
  try {
    await nextTick()
    const destination = previousDiscardTop
      ? findLastDataElement('data-discard-top-card', previousDiscardTop, document)
      : document.querySelector<HTMLElement>('.player-discard-pile')
    await animateCardFlight(flight, destination, {
      destinationMode: 'overlay',
      timing: 'discard-phase',
    })
  } finally {
    state.discardTopDisplayOverride = null
    await nextTick()
  }
}
/** Core end-of-turn. Called by user action AND auto-end. */
function doEndTurn(recordDiscardUndoBoundary = true) {
  if (state.phase !== 'main' || !state.game || state.game.pendingDecision || state.game.pendingEffect) return
  const p = cp()
  if (state.game.nemesis.corruptionDeck &&
    (p.corruptionsDrawnThisTurn?.length ?? 0) > 0 &&
    state.game.pendingCorruptionEndTurnPlayerId !== p.id) {
    state.game.pendingCorruptionEndTurnPlayerId = p.id
    for (const message of engineResolveEffects(state.game, p.id,
      [{ kind: 'resolve_corruptions', timing: 'end_main' }], undefined, 0, p.id)) {
      pushLog(message, 'info')
    }
    if (state.game.pendingDecision || state.game.pendingEffect) {
      pushLog('Resolve Corruptions drawn this turn before ending the Main Phase', 'info')
      return
    }
    state.game.pendingCorruptionEndTurnPlayerId = undefined
  }
  if (p.playedThisTurn.length === 0) {
    finalizeDraw()
    return
  }
  // Keep a serializable snapshot for end-of-turn card triggers. The UI moves
  // played cards into discard before resolveDrawPhase runs, but effects such
  // as Pact Prism still need to inspect the cards played this turn.
  p.pendingEndTurnCardIds = [...p.playedThisTurn]
  if (areSameDiscardOrderCards(p.playedThisTurn)) {
    // Order is irrelevant, but each card still flies into the discard pile.
    state.discardRemaining = [...p.playedThisTurn]
    state.phase = 'discard_order'
    void autoDiscardRemaining()
    return
  }
  state.discardRemaining = [...p.playedThisTurn]
  state.phase = 'discard_order'
  // A manually started End Turn keeps a separate snapshot for Discard Order.
  // When auto-end follows another action, that action's snapshot should undo
  // both the action and this transition together.
  if (recordDiscardUndoBoundary) recordUndoBoundary()
  pushLog('Click played cards in the order they enter the discard pile', 'info')
}
export function endTurn() {
  if (!canRequestEndTurn.value) return
  const previous = beforeAction()
  doEndTurn()
  finishAction(previous)
}
/** Request the end of Main Phase, warning first when legal actions remain. */
export function requestEndTurn() {
  if (!canRequestEndTurn.value) return
  if (state.endTurnWarningVisible) {
    state.endTurnWarningVisible = false
    state.endTurnActionHint = null
    endTurn()
    return
  }
  if (playerCanAct.value) {
    state.endTurnActionHint = state.game
      ? getMainPhaseActionHint(state.game, state.game.currentTurn)
      : null
    state.endTurnWarningVisible = true
    return
  }
  state.endTurnActionHint = null
  endTurn()
}
export async function clickDiscardCard(index: number) {
  if (state.phase !== 'discard_order' || state.selectedPlayer !== state.game?.currentTurn) return
  if (index < 0 || index >= state.discardRemaining.length) return
  state.cardMotionBatchActive = true
  try {
    await moveDiscardPhaseCard(index)
    if (state.discardRemaining.length === 0) {
      finalizeDraw()
      return
    }
    // If the remaining played cards are all identical, discard them automatically.
    if (areSameDiscardOrderCards(state.discardRemaining)) {
      await autoDiscardRemaining()
    }
  } finally {
    state.cardMotionBatchActive = false
  }
}
/** Continue the serializable Nemesis state machine after a UI decision. */
async function continueNemesisTurn() {
  const g = state.game
  if (!g || g.currentTurn !== 'nemesis' || g.pendingDecision || g.pendingEffect) return
  state.nemesisDrawRevealAnimating = false
  // A completed effect frame may have already finished this Nemesis turn.
  // startTurn() owns creation of the next serializable Nemesis resolution.
  if (!g.nemesisResolution) {
    clearPendingNemesisDrawFlight()
    startTurn(g)
    beginTurn(true)
    return
  }
  capturePendingNemesisDrawFlight(g)
  const messages = await trackAutomaticCardTransfers(() => advanceNemesisTurn(g))
  const pendingDecision = (g as GameState).pendingDecision as PendingDecision | null
  for (const message of messages) pushLog(message, 'warn')
  if (pendingDecision || g.pendingEffect) {
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
    if (pendingDecision?.kind === 'confirm_nemesis_draw' &&
      pendingDecision.source !== 'specific_deck') startNemesisDrawRevealAnimation(pendingDecision)
    return
  }
  if (g.gameOver) {
    clearPendingNemesisDrawFlight()
    state.phase = 'gameover'
    return
  }
  if (!g.nemesisResolution) {
    clearPendingNemesisDrawFlight()
    startTurn(g)
    beginTurn(true)
  } else {
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
  }
}
// ===== Derived state =====
export const displayPlayer = computed(() =>
  state.game ? getPlayer(state.game, state.selectedPlayer) : null,
)
export const isCurrentSelected = computed(() => {
  if (!state.game || state.game.currentTurn === 'nemesis') return false
  return state.selectedPlayer === state.game.currentTurn
})
export const canActMain = computed(() =>
  isCurrentSelected.value && state.phase === 'main',
)
export const canActivateAbilityInMain = computed(() =>
  !!state.game && state.phase === 'main' && canActivateAbilityDuringMain(state.game, state.selectedPlayer),
)
export const canCast = computed(() =>
  isCurrentSelected.value && state.phase === 'casting',
)
export const castableSpells = computed(() =>
  state.game && state.game.currentTurn !== 'nemesis' ? getCastableSpells(state.game, state.game.currentTurn) : [],
)
export const buyables = computed(() => (state.game ? getBuyableCards(state.game) : []))
export const playerCanAct = computed(() => {
  if (!state.game || state.game.currentTurn === 'nemesis') return false
  return canPlayerAct(state.game, state.game.currentTurn)
})
export const canRequestEndTurn = computed(() => {
  const game = state.game
  return !!game
    && !game.gameOver
    && state.phase === 'main'
    && game.currentTurn !== 'nemesis'
    && state.selectedPlayer === game.currentTurn
    && !game.pendingDecision
    && !game.pendingEffect
    && !state.cardMotionBatchActive
    && !state.turnTransitionActive
    && !state.autoEndWaitPending
    && !state.viewPile
    && !state.helpOpen
    && !state.exitPrompt
    && !state.debugOpen
})
export const preppedCardActions = computed(() => {
  if (!state.game || state.phase !== 'main' || state.game.currentTurn === 'nemesis') return []
  return getPreppedCardActions(state.game, state.game.currentTurn)
})
export const playerCardInPlayActions = computed(() => {
  if (!state.game || state.phase !== 'main' || state.game.currentTurn === 'nemesis') return []
  return getPlayerCardInPlayActions(state.game, state.selectedPlayer)
})
export const nemesisDiscardActions = computed(() => {
  if (!state.game || state.phase !== 'main' || state.game.currentTurn === 'nemesis') return []
  return getNemesisDiscardActions(state.game, state.game.currentTurn)
})
export function discardNemesisCard(instanceId: string) {
  if (!state.game || state.phase !== 'main') return
  const previous = beforeAction()
  const messages = discardNemesisPower(state.game, state.game.currentTurn, instanceId)
  for (const message of messages) pushLog(message, message.startsWith('Discarded') ? 'ok' : 'warn')
  maybeAutoEnd()
  finishAction(previous)
}
/** Perform the configured action for the top card of the Nemesis-specific pile. */
export function buyNemesisSpecificTopCard() {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const msg = engineBuySpecificPileCard(state.game, cp().id)
  if (msg) pushLog(msg, 'ok')
  if (state.game.gameOver) {
    state.phase = 'gameover'
    finishAction(previous)
    return
  }
  maybeAutoEnd()
  finishAction(previous)
}
export function gainFirethornTopCard() {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const message = engineGainFirethornTopCard(state.game, cp().id)
  if (message) pushLog(message, message.startsWith('Gained') ? 'ok' : 'warn')
  maybeAutoEnd()
  finishAction(previous)
}
/** Open the standard prepped-spell choice so debugging can cast any Mage's spell. */
export function debugCastAnyPreppedSpell() {
  const g = state.game
  if (!g || !state.debugFreeSpellCastEnabled || !canActMain.value ||
    g.pendingDecision || g.pendingEffect || getPreppedSpellChoices(g).length === 0) return
  const previous = beforeAction()
  const casterPlayerId = cp().id
  const messages = engineResolveEffects(g, casterPlayerId, [{
    kind: 'cast_prepped_spell',
    source: 'any_prepped_spell',
    ownerScope: 'any_player',
  }])
  for (const message of messages) pushLog(message)
  finishAction(previous)
}
/** Develop a supply pile or gain a card from the shared Develop zone. */
export async function developCard(source: 'supply' | 'develop_zone', index: number) {
  if (!state.game) return
  const playerId = state.selectedPlayer
  const previous = beforeAction()
  const message = source === 'supply'
    ? engineDevelopCardFromSupply(state.game, playerId, index)
    : engineDevelopCardFromZone(state.game, playerId, index)
  if (message) {
    const failed = message.startsWith('Need ') || message.startsWith('Develop is only') || message.startsWith('Pile empty') || message.startsWith('Develop zone card')
    pushLog(message, failed ? 'warn' : 'ok')
  }
  if (state.game.gameOver) state.phase = 'gameover'
  const actionMotion = finishAction(previous)
  await actionMotion
  if (state.game.gameOver) return
  maybeAutoEnd()
}
/** Return Recall cards currently available to the selected Mage. */
export function getRecallActionsForPlayer(playerId: PlayerId = state.selectedPlayer) {
  return state.game ? engineGetRecallActions(state.game, playerId) : []
}
/** Activate a Recall effect from the selected Mage's Discard pile. */
export function activateRecall(discardIndex: number, playerId: PlayerId = state.selectedPlayer) {
  if (!state.game) return
  const openedDiscardPile = state.viewPile === 'discard'
  const availableRecallCount = openedDiscardPile
    ? engineGetRecallActions(state.game, playerId).length
    : 0
  const previous = beforeAction()
  const messages = engineActivateRecall(state.game, playerId, discardIndex)
  for (const message of messages) {
    pushLog(message, message.startsWith('That ') || message.startsWith('Resolve ') ? 'warn' : 'ok')
  }
  const followUpDecision = !!state.game.pendingDecision || !!state.game.pendingEffect
  const keepDiscardPileOpen = openedDiscardPile && availableRecallCount > 1 && !followUpDecision
  if (openedDiscardPile && !keepDiscardPileOpen) state.viewPile = null
  // Keep the discard-pile viewer available for consecutive Recall actions
  // only when the current Recall resolved synchronously and another Recall
  // was available before it was activated.
  if (state.viewPile !== 'discard') maybeAutoEnd()
  finishAction(previous)
}
export function useGame() {
  return {
    state,
    rerollMarketTemplate,
    newGame, resumeGame, clearSave, clearSaves,
    requestDeleteSave, requestDeleteSaves, cancelDeleteSave, deleteSave, deleteSaves,
    duplicateSave, renameSave,
    requestExit, cancelExit, saveAndExit, exitWithoutSaving,
    returnToMainMenu,
    toggleDebug, setDebugFreeSpellCastEnabled, debugCastAnyPreppedSpell,
    toggleHelp, closeHelp, castSpell, toMainPhase, resolveDecision, playCard, playAllGems, prepSpell,
    buyCard, developCard,
    buyNemesisSpecificTopCard, gainFirethornTopCard, focusBreach, openBreach, gainCharge, activateAbility, activatePreppedCardAction,
    activatePreppedSpellAction,
    activatePlayerCardInPlayAction,
    getRecallActionsForPlayer,
    activateRecall,
    endTurn, requestEndTurn, discardNemesisCard, undo, aetherInfo, toRoman,
    selectPlayer, clickDiscardCard, openPile, openDestroyedCardsPile, openSpecificDeckPile, openTrinketDeckPile, openPlayerCardsInPlayPile, openNemesisDeckPile, openNemesisDiscardPile, openNemesisSpecificPile, openNemesisSpecificDiscardPile, closePile,
    isPendingPreppedSpellSelected, isImmediatePreppedSpellCast, togglePendingPreppedSpell, confirmPendingPreppedSpells, skipPendingPreppedSpells,
    isBoardCardSelectionActive, getBoardCardSelection, isPendingBoardCardSelected,
    togglePendingBoardCard, confirmPendingBoardCards, skipPendingBoardCards,
    castableSpells, buyables, playerCanAct, canRequestEndTurn,
    displayPlayer, isCurrentSelected, canActMain, canCast, preppedCardActions, playerCardInPlayActions, nemesisDiscardActions,
    canActivateAbilityInMain,
  }
}
