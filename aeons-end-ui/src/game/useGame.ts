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
  beginCardMoveTransaction, finishCardMoveTransaction,
  getPlayerCardInstanceZone, getNemesisCardInstanceZone, moveCardBetweenZones,
} from '@engine/engine'
import {
  createTwoPlayerScenario, getCard, defaultMarketSetup, DEFAULT_MARKET_SLOTS,
  resolveMarketCardIds,
} from '@engine/data'
import type {
  CardChoice, CollectiveCardChoice, GameState, NemesisDifficulty, PendingDecisionAnswer,
  PendingDecision, PlayerId, PlayerState, PreppedSpellChoice, MarketSetupConfig, HealthChangeEvent,
  CardMoveEvent, CardMoveZone,
} from '@engine/types'
import { displayMageName, formatMageNamesInText } from './display-name'
import { getNemesisPresentation } from './nemesis-presentation'
import { waitForBreachMotions } from './breach-motion'
import { cardImageUrl, playerCardBackUrl } from '../card-images'
import {
  animateCardFlight, animateCardFlightWithReveal, animateCardFlightToPlayerDeck, animateCardRevealFlight, animateCardZoneMotion, captureCardFlight, captureCardZoneMotion, captureCardMoveSourceSnapshot,
  getDecisionPresentedCardInstanceIds,
  captureCardRowPositions, discardCardZoneMotion, holdCardFlightAtOrigin,
  resolveCardFlightDestinationMode, resolveCardZoneMotionFromEvents,
  hasActiveHandCardReflow, markHandCardDeparting,
  discardCardZoneMotionSource,
  discardCardFlight, discardCardMoveSourceSnapshot,
  waitForCardRowReflow, waitForHandCardReflow, waitForHandGainReflow,
} from './card-flight'
import type { CardFlightSnapshot, CardZoneMotionSnapshot, CardZoneMotionTransfer, CardZoneTransfer, CardMoveSourceSnapshot } from './card-flight'
import { projectPileArrival, resolveHandCardZoneTransfers } from './card-motion-projection'
import { resolvePlayerCardRegionAnchor } from './card-motion-regions'
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
let pendingAttachCardFlight: { ownerId: PlayerId; cardId: string; instanceId: string; flight: CardFlightSnapshot } | null = null
let pendingNemesisDrawFlight: { cardId: string; flight: CardFlightSnapshot } | null = null
let pendingNemesisDrawRevealAnimation: Promise<void> | null = null
let pendingGainPlacementFlight: {
  decisionId: string
  cardId: string
  playerId: PlayerId
  instanceId: string
  snapshot: CardMoveSourceSnapshot
} | null = null
interface CardMoveSourceCapture {
  zone: CardMoveZone
  zoneId: string
  ownerId: string | null
  instances: Array<{ instanceId: string; cardId: string }>
  suppressedInstanceIds: Set<string>
  snapshot: CardMoveSourceSnapshot
}
const cardZoneTransfersByUndo = new WeakMap<UndoSnapshot, CardMoveSourceCapture[]>()
interface HandZoneFlightSnapshot {
  playerId: PlayerId
  cardId: string
  instanceId: string
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
  destinationPlayerId?: PlayerId
}
interface HandDiscardPresentationCard {
  cardId: string
  instanceId: string
  handIndex: number
  presentationKey: string
}
interface HandPlayPresentation {
  playerId: PlayerId
  cardId: string
  instanceId: string
  handIndex: number
  presentationKey: string
  motionKey: string
}
interface PendingPlayCardFlight {
  ownerId: PlayerId
  cardId: string
  instanceId: string
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
  swapZoneInstanceIds: string[]
  discard: string[]
  discardInstanceIds: string[]
}
interface DiscardDisplayOverride {
  cardId: string | null
  count: number
  boardArrival?: { cardId: string; count: number; instanceId: string; sourceZone: string }
}
interface SwapZoneDisplayHold {
  cardId: string
  instanceId: string
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
  currentSwap: SwapZoneDisplayHold | undefined
}
interface HandPileDisplayOverrideBaseline {
  discard: Record<PlayerId, DiscardDisplayOverride | undefined>
  deck: Record<PlayerId, { cardId: string | null; count: number } | undefined>
}
const handZoneTransfersByUndo = new WeakMap<UndoSnapshot, HandZoneTransferSnapshot>()
const cardMoveTransactionsByUndo = new WeakMap<UndoSnapshot, ReturnType<typeof beginCardMoveTransaction>>()
const cardMoveEventsByUndo = new WeakMap<UndoSnapshot, CardMoveEvent[]>()
const resolvedHandTransfersByUndo = new WeakMap<UndoSnapshot, CardZoneTransfer[]>()
const handPileDisplayOverridesByUndo = new WeakMap<UndoSnapshot, HandPileDisplayOverrideBaseline>()
const pendingBoardHandFlights = new Map<string, CardFlightSnapshot | null>()
let pendingPlayCardFlight: PendingPlayCardFlight | null = null
interface MarketPileTransferSnapshot {
  pileIndex: number
  cardId: string
  snapshot: CardMoveSourceSnapshot}
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
// Queue callbacks run asynchronously. Snapshot mutable values before enqueueing
// so later state cleanup cannot change the inputs an animation will receive.
function enqueueCardMotion(runMotion: () => Promise<void>): Promise<void> {
  const queuedMotion = cardZoneTransferAnimationQueue.then(runMotion, runMotion)
  cardZoneTransferAnimationQueue = queuedMotion.catch(() => undefined)
  return queuedMotion
}
const activeCardMoveClaims = new Set<string>()
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
  deckPileDisplayOverrides: {} as Partial<Record<PlayerId, { cardId: string | null; count: number }>>,
  discardTopDisplayOverride: null as { playerId: PlayerId; cardId: string | null; count: number } | null,
  discardPileDisplayOverrides: {} as Partial<Record<PlayerId, DiscardDisplayOverride>>,
  swapZoneDisplayHolds: {} as Partial<Record<PlayerId, SwapZoneDisplayHold>>,
  swapZoneCardKeys: {} as Partial<Record<PlayerId, SwapZoneCardKeys>>,
  handDiscardPresentation: null as { playerId: PlayerId; cards: HandDiscardPresentationCard[] } | null,
  handPlayPresentation: null as HandPlayPresentation | null,
  drawPhaseHandGainTotals: {} as Record<PlayerId, number>, // UI-only counts excluded from Mage draw feedback
  damageImpacts: [] as DamageImpact[], // UI-only combat feedback; never saved with the game
  cardMotionBatchActive: false,
  nemesisDrawRevealQueued: false,
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
  pendingConjureBreachArrival: null as { playerId: PlayerId; breachIndex: number; instanceId: string } | null,
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
const MAX_UNDO = 20
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
// ===== Undo (Ctrl+Z, max 20 steps) =====
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
  const movementTransaction = beginCardMoveTransaction(state.game, 'effect')
  const previous = snapshot()
  cardMoveTransactionsByUndo.set(previous, movementTransaction)
  activeActionCaptureDepth++
  cardZoneMotionsByUndo.set(previous, typeof document === 'undefined'
    ? { rows: [], cards: [] }
    : captureCardZoneMotion(document, excludedMotionElement))
  handZoneTransfersByUndo.set(previous, captureHandZoneTransfers(state.game, preferredHandZoneOrder))
  const externalCardTransfers = captureExternalCardMoveSources(state.game)
  if (externalCardTransfers.length > 0) cardZoneTransfersByUndo.set(previous, externalCardTransfers)
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
function finishActionMovementCapture(previous: UndoSnapshot): CardMoveEvent[] {
  const cached = cardMoveEventsByUndo.get(previous)
  if (cached) return cached
  const transaction = cardMoveTransactionsByUndo.get(previous)
  cardMoveTransactionsByUndo.delete(previous)
  if (!transaction) return []
  const result = finishCardMoveTransaction(transaction)
  result.auditIssues.forEach(issue => reportCardMotionIssue('Engine movement record is incomplete', issue))
  cardMoveEventsByUndo.set(previous, result.events)
  return result.events
}
function prepareHandDeparturePresentation(previous: UndoSnapshot) {
  const snapshot = handZoneTransfersByUndo.get(previous)
  if (!snapshot || resolvedHandTransfersByUndo.has(previous)) return
  const transfers = resolveHandCardZoneTransfers(
    snapshot,
    finishActionMovementCapture(previous),
    reportCardMotionIssue,
  )
  resolvedHandTransfersByUndo.set(previous, transfers)
  stageHandDepartures(transfers, snapshot)
  stageHandPileDisplayOverrides(previous, transfers)
}
function stageHandPileDisplayOverrides(previous: UndoSnapshot, transfers: readonly CardZoneTransfer[]) {
  const arrivals = transfers.filter(transfer =>
    !!transfer.flight && (transfer.zone === 'discard' || transfer.zone === 'deck'),
  )
  if (arrivals.length === 0) return
  const priorDiscard = { ...toRaw(state.discardPileDisplayOverrides) }
  const priorDeck = { ...toRaw(state.deckPileDisplayOverrides) }
  const nextDiscard = { ...priorDiscard }
  const nextDeck = { ...priorDeck }
  for (const transfer of arrivals) {
    if (transfer.zone === 'discard' && nextDiscard[transfer.playerId] === undefined) {
      nextDiscard[transfer.playerId] = {
        cardId: transfer.previousDiscardTop,
        count: transfer.previousDiscardCount,
      }
    }
    if (transfer.zone === 'deck' && nextDeck[transfer.playerId] === undefined) {
      nextDeck[transfer.playerId] = {
        cardId: transfer.previousDeckTop,
        count: transfer.previousDeckCount,
      }
    }
  }
  handPileDisplayOverridesByUndo.set(previous, { discard: priorDiscard, deck: priorDeck })
  state.discardPileDisplayOverrides = nextDiscard
  state.deckPileDisplayOverrides = nextDeck
}
function finishAction(previous: UndoSnapshot | null, preferredHandZoneOrder: readonly HandZoneSelection[] = []): Promise<void> {
  if (!previous) return Promise.resolve()
  activeActionCaptureDepth = Math.max(0, activeActionCaptureDepth - 1)
  const cardMoveEvents = finishActionMovementCapture(previous)
  void preferredHandZoneOrder
  if (!state.game) {
    const boardMotion = cardZoneMotionsByUndo.get(previous) ?? null
    discardCardZoneMotion(boardMotion)
    releaseBoardDiscardDisplayHolds(boardMotion)
    cardZoneMotionsByUndo.delete(previous)
    discardExternalCardMoveSources(cardZoneTransfersByUndo.get(previous) ?? [])
    cardZoneTransfersByUndo.delete(previous)
    const handZoneCapture = handZoneTransfersByUndo.get(previous)
    handZoneCapture?.cards.forEach(card => discardCardFlight(card.flight))
    handZoneTransfersByUndo.delete(previous)
    handPileDisplayOverridesByUndo.delete(previous)
    discardMarketPileTransfers(marketPileTransfersByUndo.get(previous) ?? [])
    marketPileTransfersByUndo.delete(previous)
    completeActiveActionCaptureIfSettled()
    return Promise.resolve()
  }
  const transfers: CardZoneTransfer[] = []
  const boardMotion = cardZoneMotionsByUndo.get(previous) ?? null
  if (boardMotion) {
    const boardZoneBaseline = capturePlayerZoneMotionBaseline(previous.game)
    holdSwapCardsMovingToDiscard(boardMotion, boardZoneBaseline, state.game.players, cardMoveEvents)
    holdDevelopCardsMovingToDiscard(boardMotion, boardZoneBaseline, state.game.players, cardMoveEvents)
    holdBoardCardsMovingToDiscard(boardMotion, boardZoneBaseline, state.game.players, cardMoveEvents)
  }
  cardZoneMotionsByUndo.delete(previous)
  const externalCardTransfers = cardZoneTransfersByUndo.get(previous)
  if (externalCardTransfers) {
    cardZoneTransfersByUndo.delete(previous)
    transfers.push(...resolveExternalCardMoveTransfers(externalCardTransfers, cardMoveEvents, state.game))
  }
  const marketTransfers = marketPileTransfersByUndo.get(previous)
  if (marketTransfers) {
    marketPileTransfersByUndo.delete(previous)
    transfers.push(...resolveMarketPileTransfers(marketTransfers, state.game, cardMoveEvents))
  }
  const handZoneCapture = handZoneTransfersByUndo.get(previous)
  const handPileDisplayBaseline = handPileDisplayOverridesByUndo.get(previous)
  handPileDisplayOverridesByUndo.delete(previous)
  if (handZoneCapture) {
    handZoneTransfersByUndo.delete(previous)
    const resolved = resolvedHandTransfersByUndo.get(previous)
    resolvedHandTransfersByUndo.delete(previous)
    cardMoveEventsByUndo.delete(previous)
    transfers.push(...(resolved ?? resolveHandCardZoneTransfers(handZoneCapture, cardMoveEvents, reportCardMotionIssue)))
  }
  stageHandDepartures(transfers, handZoneCapture ?? null)
  const boardMotionGates = cardZoneMotionGatesByUndo.get(previous)
  cardZoneMotionGatesByUndo.delete(previous)
  const boardFlight = boardMotion
    ? queueCardZoneMotion(boardMotion, boardMotionGates, cardMoveEvents).finally(() => releaseBoardDiscardDisplayHolds(boardMotion))
    : Promise.resolve()
  // Install pile projections synchronously, before the rule-state update can
  // paint its final deck/discard counts. The transfer queue waits for board
  // motion before starting the flights themselves.
  const cardFlight = transfers.length > 0
    ? queueCardZoneTransfers(transfers, boardFlight, handPileDisplayBaseline)
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
  cardMoveEvents: readonly CardMoveEvent[] = [],
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
    const claimedByMotion: string[] = []
    if (typeof document === 'undefined') {
      discardCardZoneMotion(snapshot)
      return
    }
    try {
      await nextTick()
      const eventResolution = resolveCardZoneMotionFromEvents(snapshot, cardMoveEvents, document, activeCardMoveClaims)
      transfers = eventResolution.transfers.filter(transfer => {
        const moveIds = transfer.moveIds?.length ? transfer.moveIds : transfer.moveId ? [transfer.moveId] : []
        if (moveIds.some(moveId => activeCardMoveClaims.has(moveId))) {
          discardCardFlight(transfer.flight)
          return false
        }
        moveIds.forEach(moveId => {
          activeCardMoveClaims.add(moveId)
          claimedByMotion.push(moveId)
        })
        return true
      })
      const pendingConjureArrival = state.pendingConjureBreachArrival
      const hasConjureArrivalMove = pendingConjureArrival && cardMoveEvents.some(event =>
        event.kind === 'move' && event.instanceId === pendingConjureArrival.instanceId &&
        event.source.zone === 'temporary' && event.destination.zone === 'breach' &&
        event.destination.ownerId === pendingConjureArrival.playerId)
      const conjureArrivalTransfer = hasConjureArrivalMove && pendingConjureArrival
        ? transfers.find(transfer => transfer.faceDownOnArrival &&
          transfer.sourceInstanceId === pendingConjureArrival.instanceId)
        : undefined
      if (hasConjureArrivalMove && pendingConjureArrival && !conjureArrivalTransfer) {
        state.pendingConjureBreachArrival = null
      } else if (hasConjureArrivalMove && pendingConjureArrival && conjureArrivalTransfer) {
        conjureArrivalTransfer.afterFlight = () => {
          if (state.pendingConjureBreachArrival?.instanceId === pendingConjureArrival.instanceId) {
            state.pendingConjureBreachArrival = null
          }
        }
      }
      for (const transfer of transfers) {
        if (transfer.destinationZone !== 'discard' ||
          !transfer.destination?.dataset.cardMotionKey?.endsWith('-arrival')) continue
        transfer.afterFlight = async () => {
          const playerId = transfer.ownerId
          const hold = boardDiscardHoldsByMotion.get(snapshot)?.get(playerId)
          const arrival = hold?.current.boardArrival
          if (!hold || !arrival || arrival.sourceZone !== transfer.sourceZone ||
            arrival.instanceId !== transfer.sourceInstanceId ||
            toRaw(state.discardPileDisplayOverrides[playerId]) !== hold.current) return

          // Show the settled top card underneath the finished flight clone
          // before that clone is removed, avoiding a one-frame flash of the
          // previous discard top.
          const settled: DiscardDisplayOverride = {
            cardId: arrival.cardId,
            count: arrival.count,
          }
          hold.current = settled
          state.discardPileDisplayOverrides = {
            ...toRaw(state.discardPileDisplayOverrides), [playerId]: settled,
          }
          await nextTick()
        }
      }
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
        animateCardZoneMotion(transfers, zoneBarriers, prepareTransfer, playerCardBackUrl()),
        ...affectedRows.map(row => waitForCardRowReflow(row)),
      ])
    } catch {
      discardCardZoneMotion(snapshot)
    } finally {
      transfers.forEach(transfer => {
        if (transfer.destination && transfer.destinationVisibilityBefore !== undefined) {
          transfer.destination.style.visibility = transfer.destinationVisibilityBefore
        }
        if (transfer.faceDownOnArrival &&
          state.pendingConjureBreachArrival?.instanceId === transfer.sourceInstanceId) {
          state.pendingConjureBreachArrival = null
        }
      })
      claimedByMotion.forEach(moveId => activeCardMoveClaims.delete(moveId))
      releaseMotion?.()
    }
  }
  return enqueueCardMotion(runMotion).catch(() => {
    discardCardZoneMotion(snapshot)
  })
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
  state.nemesisDrawRevealQueued = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingPlayCardFlight()
  clearPendingNemesisDrawFlight()
  clearPendingGainPlacementFlight()
  state.pendingConjureBreachArrival = null
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
  state.deckPileDisplayOverrides = {}
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
    void doEndTurn(false)
  }, () => {
    state.autoEndWaitPending = false
  })
}
/** Let a consumed Main Phase action disappear from the board before auto-end advances the phase. */
async function finishPreppedAction(previous: UndoSnapshot | null) {
  finishAction(previous)
  await nextTick()
  maybeAutoEnd()
}
async function resolveMainPhasePreppedEffects() {
  const g = state.game
  if (!g) return
  const p = cp()
  const resolve = () => resolvePreppedEffects(g, p.id, 'main_phase')
  const messages = activeActionCaptureDepth > 0
    ? resolve()
    : await trackAutomaticCardTransfers(resolve)
  for (const message of messages) pushLog(message, 'info')
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
  const messages = await trackAutomaticCardTransfers(() => resolvePreppedEffects(g, p.id, 'casting_phase_end'))
  for (const message of messages) pushLog(message, 'info')
  await waitForBreachMotionsWithShield()
  if (g.pendingDecision || g.pendingEffect) return
  const inPlayMessages = await trackAutomaticCardTransfers(() =>
    engineResolvePlayerInPlayPhaseEffects(g, p.id, 'casting_phase_end'))
  for (const message of inPlayMessages) pushLog(message, 'info')
  await waitForBreachMotionsWithShield()
  if (g.pendingDecision || g.pendingEffect) return
  if (g.gameOver) { state.phase = 'gameover'; return }
  state.phase = 'main'
  // Ability activation is validated by the engine, so persist the phase
  // transition before main-phase actions become available.
  syncEnginePhaseWithUi()
  await resolveMainPhasePreppedEffects()
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
  state.nemesisDrawRevealQueued = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingPlayCardFlight()
  clearPendingNemesisDrawFlight()
  clearPendingGainPlacementFlight()
  state.pendingConjureBreachArrival = null
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
  state.deckPileDisplayOverrides = {}
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
    state.nemesisDrawRevealQueued = false
    state.nemesisDrawRevealAnimating = false
    clearPendingAttachCardFlight()
    clearPendingPlayCardFlight()
    clearPendingNemesisDrawFlight()
    clearPendingGainPlacementFlight()
    state.pendingConjureBreachArrival = null
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
    state.deckPileDisplayOverrides = {}
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
  state.nemesisDrawRevealQueued = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingPlayCardFlight()
  clearPendingNemesisDrawFlight()
  clearPendingGainPlacementFlight()
  state.pendingConjureBreachArrival = null
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
  state.deckPileDisplayOverrides = {}
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
function capturePlayerZoneMotionBaseline(game: GameState): PlayerZoneMotionBaseline[] {
  return game.players.map(player => ({
    id: player.id,
    swapZone: [...(player.swapZone ?? [])],
    swapZoneInstanceIds: [...(player.swapZoneInstanceIds ?? [])],
    discard: [...player.discard],
    discardInstanceIds: [...(player.discardInstanceIds ?? [])],
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
    if (currentSwap && swapHolds[playerId]?.motionKey === currentSwap.motionKey) {
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
  events: readonly CardMoveEvent[],
) {
  if (!snapshot) return
  const departures = events.filter((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
    event.kind === 'move' && event.reason === 'swap' &&
    event.source.zone === 'swap_zone' && event.destination.zone === 'discard')
  for (const prior of before) {
    const player = after.find(candidate => candidate.id === prior.id)
    if (!player) continue
    for (const event of departures.filter(candidate => candidate.source.ownerId === player.id)) {
      const cardId = event.cardId
      const origin = snapshot.cards.find(card => card.instanceId === event.instanceId && card.flight)
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
      // and the movement coordinator can still animate the exact departure.
      const returnedFromDiscardIds = new Set(events.flatMap(candidate =>
        candidate.kind === 'move' && candidate.source.zone === 'discard' &&
          candidate.destination.zone === 'swap_zone' && candidate.source.ownerId === player.id
          ? [candidate.instanceId] : []))
      const displayIndex = prior.discardInstanceIds.findIndex(instanceId => !returnedFromDiscardIds.has(instanceId))
      const current: DiscardDisplayOverride = {
        cardId: displayIndex >= 0 ? prior.discard[displayIndex] ?? null : null,
        count: prior.discard.length - returnedFromDiscardIds.size,
        boardArrival: { cardId, count: player.discard.length, instanceId: event.instanceId, sourceZone: 'swap' },
      }
      const previousSwap = existing ? existing.previousSwap : state.swapZoneDisplayHolds[player.id]
      const oldSwapCards = snapshot.cards.filter(card => card.zone === 'swap' && card.ownerId === player.id)
      const availableKeys = oldSwapCards.filter(card => card.instanceId !== origin.instanceId)
      const survivorKeys = (player.swapZoneInstanceIds ?? []).map((instanceId, index) => {
        const priorIndex = availableKeys.findIndex(card => card.instanceId === instanceId)
        if (priorIndex >= 0) return availableKeys.splice(priorIndex, 1)[0]!.key
        return `${origin.key}:arrival:${index}`
      })
      const currentSwap: SwapZoneDisplayHold = {
        cardId,
        instanceId: event.instanceId,
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
function holdDevelopCardsMovingToDiscard(
  snapshot: CardZoneMotionSnapshot | null,
  before: readonly PlayerZoneMotionBaseline[],
  after: readonly PlayerState[],
  events: readonly CardMoveEvent[],
) {
  if (!snapshot) return
  const departures = events.filter((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
    event.kind === 'move' && event.reason === 'develop' &&
    event.source.zone === 'develop' && event.destination.zone === 'discard',
  )
  for (const prior of before) {
    const player = after.find(candidate => candidate.id === prior.id)
    if (!player) continue
    for (const event of departures.filter(candidate => candidate.destination.ownerId === player.id)) {
      const finalMove = events.filter(candidate =>
        candidate.kind === 'move' && candidate.instanceId === event.instanceId,
      ).at(-1)
      if (finalMove?.kind !== 'move' || finalMove.destination.zone !== 'discard') continue
      if (player.discardInstanceIds?.[0] !== event.instanceId) continue
      const origin = snapshot.cards.find(card => card.instanceId === event.instanceId && card.flight)
      if (!origin) continue
      const holds = boardDiscardHoldsByMotion.get(snapshot) ?? new Map<PlayerId, BoardDiscardDisplayHold>()
      const existing = holds.get(player.id)
      const previous = existing ? existing.previous : state.discardPileDisplayOverrides[player.id]
      const current: DiscardDisplayOverride = {
        cardId: prior.discard[0] ?? null,
        count: prior.discard.length,
        boardArrival: {
          cardId: event.cardId,
          count: player.discard.length,
          instanceId: event.instanceId,
          sourceZone: 'develop',
        },
      }
      holds.set(player.id, {
        playerId: player.id,
        previous,
        current,
        previousSwap: existing?.previousSwap,
        currentSwap: existing?.currentSwap,
      })
      boardDiscardHoldsByMotion.set(snapshot, holds)
      state.discardPileDisplayOverrides = { ...state.discardPileDisplayOverrides, [player.id]: current }
    }
  }
}
function holdBoardCardsMovingToDiscard(
  snapshot: CardZoneMotionSnapshot | null,
  before: readonly PlayerZoneMotionBaseline[],
  after: readonly PlayerState[],
  events: readonly CardMoveEvent[],
) {
  if (!snapshot) return
  const departures = events.filter((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
    event.kind === 'move' && event.source.zone !== 'discard' &&
    (event.source.zone === 'breach' || event.source.zone === 'played_this_turn') &&
    event.destination.zone === 'discard' && event.reason !== 'discard_phase',
  )
  for (const prior of before) {
    const player = after.find(candidate => candidate.id === prior.id)
    if (!player) continue
    for (const event of departures.filter(candidate => candidate.destination.ownerId === player.id)) {
      const finalMove = events.filter(candidate =>
        candidate.kind === 'move' && candidate.instanceId === event.instanceId,
      ).at(-1)
      if (finalMove?.kind !== 'move' || finalMove.destination.zone !== 'discard') continue
      if (player.discardInstanceIds?.[0] !== event.instanceId) continue
      const origin = snapshot.cards.find(card => card.instanceId === event.instanceId &&
        card.zone === (event.source.zone === 'played_this_turn' ? 'played' : 'breach') && card.flight)
      if (!origin) continue

      const holds = boardDiscardHoldsByMotion.get(snapshot) ?? new Map<PlayerId, BoardDiscardDisplayHold>()
      const existing = holds.get(player.id)
      const current: DiscardDisplayOverride = {
        cardId: prior.discard[0] ?? null,
        count: prior.discard.length,
        boardArrival: {
          cardId: event.cardId,
          count: player.discard.length,
          instanceId: event.instanceId,
          sourceZone: event.source.zone === 'played_this_turn' ? 'played' : 'breach',
        },
      }
      holds.set(player.id, {
        playerId: player.id,
        previous: existing ? existing.previous : state.discardPileDisplayOverrides[player.id],
        current,
        previousSwap: existing?.previousSwap,
        currentSwap: existing?.currentSwap,
      })
      boardDiscardHoldsByMotion.set(snapshot, holds)
      state.discardPileDisplayOverrides = { ...state.discardPileDisplayOverrides, [player.id]: current }
    }
  }
}
function getPlayerCardMotionZone(game: GameState | null, ownerId: PlayerId, instanceId: string): string | null {
  const owner = game?.players.find(player => player.id === ownerId)
  if (!owner || !instanceId) return null
  const zones: Array<[string, string[] | undefined]> = [
    ['hand', owner.handInstanceIds], ['deck', owner.deckInstanceIds], ['discard', owner.discardInstanceIds],
    ['played', owner.playedThisTurnInstanceIds], ['swap', owner.swapZoneInstanceIds],
  ]
  for (const [zone, instanceIds] of zones) if (instanceIds?.includes(instanceId)) return zone
  if (owner.breaches.some(breach => breach.preppedSpellInstanceIds?.includes(instanceId) ||
    breach.attachedRelic?.instanceId === instanceId)) return 'breach'
  if (game?.trinketDeckInstanceIds?.includes(instanceId)) return 'trinket_deck'
  return null
}

function hasHandPlayMove(events: readonly CardMoveEvent[], instanceId: string): boolean {
  return events.some(event => event.kind === 'move' && event.reason === 'play' &&
    event.instanceId === instanceId && event.source.zone === 'hand')
}

function getPendingPlayCardZone(pending: PendingPlayCardFlight): string | null {
  return getPlayerCardMotionZone(state.game, pending.ownerId, pending.instanceId)
}

function findPlayCardDestination(
  ownerId: PlayerId,
  cardId: string,
  instanceId: string,
  zone: string | null,
): HTMLElement | null {
  if (!zone || typeof document === 'undefined') return null
  const exactDestination = [...document.querySelectorAll<HTMLElement>('[data-card-instance-id][data-card-motion-zone]')]
    .find(card => card.dataset.cardInstanceId === instanceId && card.dataset.cardMotionZone === zone &&
      card.dataset.heldPlayCard !== 'true')
  if (exactDestination) return exactDestination
  if (zone === 'discard') return findLastMotionCard(zone, cardId, ownerId)
  const playerArea = findDataElement('data-player-area-id', ownerId)
  if (zone === 'deck') return playerArea?.querySelector<HTMLElement>('[data-card-flight-target="deck"]') ?? null
  if (zone === 'trinket_deck') return findDataElement('data-card-flight-target', 'trinket-deck')
  return null
}

function findPendingPlayCardDestination(pending: PendingPlayCardFlight, zone: string | null): HTMLElement | null {
  return findPlayCardDestination(pending.ownerId, pending.cardId, pending.instanceId, zone)
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
  if (zone === 'trinket_deck') {
    return animateCardFlight(flight, destination, {
      destinationMode: 'overlay',
      timing: 'standard',
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
  if (destination && resolveCardFlightDestinationMode(destination) !== 'overlay') {
    destination.style.visibility = 'hidden'
  }
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
    if (destination && resolveCardFlightDestinationMode(destination) !== 'overlay') {
      destination.style.visibility = 'hidden'
    }

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
    const playFlight = flight
    const playDestination = destination
    const playDestinationVisibility = destinationVisibility
    const playZone = zone ?? 'completed'
    const promise = enqueueCardMotion(async () => {
      try {
        await Promise.all([
          animatePlayCardFlight(playFlight, playDestination, playZone, playDestinationVisibility),
          waitForHandCardReflow(hand),
        ])
      } finally {
        if (playDestination?.style.visibility === 'hidden') {
          playDestination.style.visibility = playDestinationVisibility
        }
        if (pending.hiddenDestination && pending.hiddenDestination !== playDestination &&
          pending.hiddenDestination.style.visibility === 'hidden') {
          pending.hiddenDestination.style.visibility = pending.hiddenDestinationVisibility
        }
        releaseMotion()
      }
    })
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
  const decisionPresentedInstanceIds = getDecisionPresentedCardInstanceIds()
  for (const player of game.players) {
    const handInstanceIds = getPlayerCardInstanceZone(game, player.id, 'hand').instanceIds
    const playerArea = findDataElement('data-player-area-id', player.id)
    const handCards = playerArea
      ? [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="hand"]')]
      : []
    for (const element of handCards) {
      if (element.dataset.heldPlayCard === 'true') continue
      const handIndex = Number(element.getAttribute('data-hand-card-index'))
      const cardId = element.getAttribute('data-hand-card-id')
      const instanceId = Number.isInteger(handIndex) ? handInstanceIds[handIndex] : undefined
      if (!Number.isInteger(handIndex) || !cardId || !instanceId || player.hand[handIndex] !== cardId) continue
      cards.push({
        playerId: player.id,
        cardId,
        instanceId,
        handIndex,
        flight: decisionPresentedInstanceIds.has(instanceId) ? null : captureCardFlight(element),
      })
    }
  }
  for (const item of preferredOrder) {
    if (item.choice.zone !== 'hand') continue
    const boardSelectionKey = `${item.playerId}:${item.choice.zone}:${item.choice.index}:${item.choice.cardId}`
    const instanceId = getPlayerCardInstanceZone(game, item.playerId, 'hand').instanceIds[item.choice.index] ?? ''
    const wasPresentedInDecision = decisionPresentedInstanceIds.has(instanceId)
    const existing = cards.find(card =>
      card.playerId === item.playerId && card.handIndex === item.choice.index && card.cardId === item.choice.cardId)
    if (pendingBoardHandFlights.has(boardSelectionKey)) {
      const pendingFlight = pendingBoardHandFlights.get(boardSelectionKey) ?? null
      pendingBoardHandFlights.delete(boardSelectionKey)
      const selectedFlight = wasPresentedInDecision ? null : pendingFlight
      if (wasPresentedInDecision) discardCardFlight(pendingFlight)
      if (existing) {
        if (existing.flight !== selectedFlight) discardCardFlight(existing.flight)
        existing.flight = selectedFlight
      } else {
        cards.push({
          playerId: item.playerId,
          cardId: item.choice.cardId,
          instanceId,
          handIndex: item.choice.index,
          flight: selectedFlight,
        })
      }
      continue
    }
    if (existing?.flight) continue
    // A decision-window card is presentation only. Otherwise, use its actual
    // hand slot if this decision did not capture one during the first pass.
    const playerArea = findDataElement('data-player-area-id', item.playerId)
    const handSource = playerArea
      ? [...playerArea.querySelectorAll<HTMLElement>('[data-card-flight-target="hand"]')]
        .find(element => element.dataset.cardInstanceId === instanceId) ?? null
      : null
    const flight = wasPresentedInDecision ? null : captureCardFlight(handSource)
    if (existing) existing.flight = flight
    else cards.push({
      playerId: item.playerId,
      cardId: item.choice.cardId,
      instanceId,
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
function reportCardMotionIssue(message: string, details: unknown) {
  if (import.meta.env.DEV) console.error(`[card-motion] ${message}`, details)
}
function captureCardMoveSource(
  game: GameState,
  zone: { zone: CardMoveZone; zoneId: string; ownerId: string | null; cards: string[]; instanceIds: string[] },
  sourceElement: HTMLElement | null,
): CardMoveSourceCapture {
  const presentedInstanceIds = getDecisionPresentedCardInstanceIds()
  const instances = zone.cards.flatMap((cardId, index) => {
    const instanceId = zone.instanceIds[index]
    return instanceId ? [{ cardId, instanceId }] : []
  })
  return {
    zone: zone.zone,
    zoneId: zone.zoneId,
    ownerId: zone.ownerId,
    instances,
    suppressedInstanceIds: new Set(instances.flatMap(({ instanceId }) =>
      presentedInstanceIds.has(instanceId) ? [instanceId] : [])),
    snapshot: captureCardMoveSourceSnapshot(sourceElement, game.players),
  }
}
function captureExternalCardMoveSources(game: GameState): CardMoveSourceCapture[] {
  const captures: CardMoveSourceCapture[] = []
  if ((game.nemesis.corruptionDeck?.length ?? 0) > 0) {
    const corruptionDeck = getNemesisCardInstanceZone(game, 'corruption_deck')
    captures.push(captureCardMoveSource(
      game, corruptionDeck, findDataElement('data-card-flight-source', 'corruption-deck'),
    ))
  }
  if (game.nemesis.strikeDeck.length > 0) {
    const nemesisSpecificDeck = getNemesisCardInstanceZone(game, 'strike_deck')
    captures.push(captureCardMoveSource(
      game, nemesisSpecificDeck, findDataElement('data-card-flight-source', 'nemesis-specific-deck'),
    ))
  }
  for (const player of game.players) {
    if ((player.specificDeck?.length ?? 0) === 0) continue
    const specificDeck = getPlayerCardInstanceZone(game, player.id, 'specific_deck')
    const playerArea = findDataElement('data-player-area-id', player.id)
    captures.push(captureCardMoveSource(
      game,
      specificDeck,
      playerArea?.querySelector<HTMLElement>('[data-card-flight-source="mage-specific-deck"]') ?? null,
    ))
  }
  if ((game.trinketDeck?.length ?? 0) > 0) {
    const trinketDeck = getNemesisCardInstanceZone(game, 'trinket_deck')
    captures.push(captureCardMoveSource(
      game, trinketDeck, findDataElement('data-card-flight-source', 'trinket-deck'),
    ))
  }
  return captures
}
function cloneCardFlightSnapshot(flight: CardFlightSnapshot | null): CardFlightSnapshot | null {
  return flight ? {
    clone: flight.clone.cloneNode(true) as HTMLElement,
    left: flight.left,
    top: flight.top,
    width: flight.width,
    height: flight.height,
  } : null
}
function discardExternalCardMoveSources(captures: readonly CardMoveSourceCapture[]) {
  captures.forEach(capture => discardCardMoveSourceSnapshot(capture.snapshot))
}
function resolveExternalCardMoveTransfers(
  captures: readonly CardMoveSourceCapture[],
  events: readonly CardMoveEvent[],
  game: GameState,
): CardZoneTransfer[] {
  const transfers: CardZoneTransfer[] = []
  const claimedInstances = new Set<string>()
  for (const capture of captures) {
    for (const origin of capture.instances) {
      if (claimedInstances.has(origin.instanceId)) continue
      if (capture.suppressedInstanceIds.has(origin.instanceId)) {
        claimedInstances.add(origin.instanceId)
        continue
      }
      const chain = events.filter((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
        event.kind === 'move' && event.instanceId === origin.instanceId,
      ).sort((left, right) => left.sequence - right.sequence)
      const first = chain.find(event => event.source.zoneId === capture.zoneId &&
        event.source.zone === capture.zone && event.source.ownerId === capture.ownerId)
      if (!first) continue
      claimedInstances.add(origin.instanceId)
      let finalMove = first
      for (const next of chain) {
        if (next.sequence <= finalMove.sequence || next.source.zoneId !== finalMove.destination.zoneId) continue
        finalMove = next
      }
      if (!['hand', 'deck', 'discard'].includes(finalMove.destination.zone)) continue
      const current = locatePlayerCardInstance(game, origin.instanceId)
      if (!current || current.zone !== finalMove.destination.zone || current.playerId !== finalMove.destination.ownerId) {
        reportCardMotionIssue('Captured source card did not finish in its recorded player zone', {
          first, finalMove, current, instanceId: origin.instanceId,
        })
        continue
      }
      const before = capture.snapshot.players.find(player => player.id === current.playerId)
      if (!before) continue
      if (!capture.snapshot.flight) {
        reportCardMotionIssue('Visible pile movement has no captured source anchor', {
          zone: capture.zone, zoneId: capture.zoneId, cardId: origin.cardId, instanceId: origin.instanceId,
        })
      }
      const flight = cloneCardFlightSnapshot(capture.snapshot.flight)
      if (flight) flight.clone.dataset.cardFlightInstanceId = origin.instanceId
      transfers.push({
        moveId: finalMove.moveId,
        moveIds: chain.map(event => event.moveId),
        instanceId: origin.instanceId,
        cardId: finalMove.cardId,
        playerId: current.playerId,
        ...(capture.ownerId && capture.ownerId !== 'nemesis'
          ? { sourcePlayerId: capture.ownerId as PlayerId }
          : {}),
        zone: current.zone,
        zoneIndex: current.zoneIndex,
        flight,
        ...(capture.zone === 'trinket_deck' && current.zone !== 'deck' ? { revealOnArrival: true } : {}),
        ...(current.zone === 'deck' ? { timing: 'hand-to-deck-top' as const } : {}),
        previousDeckTop: before.deck[0] ?? null,
        previousDeckCount: before.deck.length,
        previousDiscardTop: before.discard[0] ?? null,
        previousDiscardCount: before.discard.length,
      })
    }
    discardCardMoveSourceSnapshot(capture.snapshot)
  }
  return transfers
}
function captureMarketPileTransfers(game: GameState): MarketPileTransferSnapshot[] {
  return game.market.piles.flatMap((pile, pileIndex) => {
    if (pile.remaining <= 0) return []
    return [{
      pileIndex,
      cardId: pile.cardId,
      snapshot: captureCardMoveSourceSnapshot(
        findDataElement('data-supply-pile-index', String(pileIndex)), game.players,
      ),
    }]
  })}
function discardMarketPileTransfers(captures: readonly MarketPileTransferSnapshot[]) {
  captures.forEach(capture => discardCardMoveSourceSnapshot(capture.snapshot))}
function locatePlayerCardInstance(
  game: GameState,
  instanceId: string,
): { playerId: PlayerId; zone: CardZoneTransfer['zone']; zoneIndex: number } | null {
  for (const player of game.players) {
    for (const zone of ['hand', 'deck', 'discard'] as const) {
      const instanceIds = getPlayerCardInstanceZone(game, player.id, zone).instanceIds
      const zoneIndex = instanceIds.indexOf(instanceId)
      if (zoneIndex >= 0) return { playerId: player.id, zone, zoneIndex }
    }
  }
  return null
}
function resolveMarketPileTransfers(
  captures: readonly MarketPileTransferSnapshot[],
  game: GameState,
  events: readonly CardMoveEvent[] = [],
): CardZoneTransfer[] {
  const transfers: CardZoneTransfer[] = []
  let deferredPlacement = false
  const pendingCardId = isWaitingForGainedCardPlacement(game)
    ? game.pendingEffect?.lastGainedCardId
    : undefined
  for (const capture of captures) {
    const creations = events.filter((event): event is Extract<CardMoveEvent, { kind: 'create' }> =>
      event.kind === 'create' && event.cardId === capture.cardId &&
      event.source?.zone === 'supply' && event.source.zoneId === `supply:${capture.pileIndex}`,
    )
    if (creations.length === 0) {
      discardCardMoveSourceSnapshot(capture.snapshot)
      continue
    }
    let retainedForPendingPlacement = false
    for (const event of creations) {
      const initialPlayerId = event.destination.ownerId as PlayerId | null
      const playerId = initialPlayerId as PlayerId | null
      const before = playerId ? capture.snapshot.players.find(player => player.id === playerId) : undefined
      if (!playerId || !before) continue
      if (!deferredPlacement && pendingCardId === capture.cardId && game.pendingDecision) {
        pendingGainPlacementFlight = {
          decisionId: game.pendingDecision.id,
          cardId: capture.cardId,
          playerId,
          instanceId: event.instanceId,
          snapshot: capture.snapshot,
        }
        preserveDiscardBeforePendingGainPlacement(capture.snapshot, playerId)
        deferredPlacement = true
        retainedForPendingPlacement = true
        continue
      }
      const currentLocation = locatePlayerCardInstance(game, event.instanceId)
      if (!currentLocation) continue
      const currentBefore = capture.snapshot.players.find(player => player.id === currentLocation.playerId)
      if (!currentBefore) continue
      const flight = capture.snapshot.flight ? {
        clone: capture.snapshot.flight.clone.cloneNode(true) as HTMLElement,
        left: capture.snapshot.flight.left,
        top: capture.snapshot.flight.top,
        width: capture.snapshot.flight.width,
        height: capture.snapshot.flight.height,
      } : null
      transfers.push({
        moveId: `create:${event.eventId}`,
        moveIds: [`create:${event.eventId}`],
        instanceId: event.instanceId,
        cardId: event.cardId,
        playerId: currentLocation.playerId,
        zone: currentLocation.zone,
        zoneIndex: currentLocation.zoneIndex,
        flight,
        previousDeckTop: currentBefore.deck[0] ?? null,
        previousDeckCount: currentBefore.deck.length,
        previousDiscardTop: currentBefore.discard[0] ?? null,
        previousDiscardCount: currentBefore.discard.length,
      })
    }
    if (!retainedForPendingPlacement) discardCardMoveSourceSnapshot(capture.snapshot)
  }
  return transfers}
function transferDestination(transfer: CardZoneTransfer): { element: HTMLElement; destinationMode: 'overlay' | 'replace' } | null {
  const playerArea = findDataElement('data-player-area-id', transfer.playerId)
  const projectedTop = state.discardPileDisplayOverrides[transfer.playerId]?.cardId ??
    (state.discardTopDisplayOverride?.playerId === transfer.playerId
      ? state.discardTopDisplayOverride.cardId : transfer.previousDiscardTop)
  return resolvePlayerCardRegionAnchor(playerArea, transfer, projectedTop)
}
function stageHandDepartures(
  transfers: readonly CardZoneTransfer[],
  snapshot: HandZoneTransferSnapshot | null,
) {
  if (!snapshot || !state.game) return
  const handTransfers = transfers.filter(transfer =>
    (transfer.zone === 'discard' || transfer.zone === 'deck') &&
    !!transfer.flight && transfer.sourcePlayerId && transfer.sourceHandInstanceId,
  )
  if (handTransfers.length === 0) return
  const preferredPlayerId = state.handDiscardPresentation?.playerId
  const playerId = preferredPlayerId && handTransfers.some(transfer => transfer.sourcePlayerId === preferredPlayerId)
    ? preferredPlayerId
    : handTransfers[0]!.sourcePlayerId!
  const movingInstances = new Set(handTransfers
    .filter(transfer => transfer.sourcePlayerId === playerId)
    .map(transfer => transfer.sourceHandInstanceId!))
  const player = state.game.players.find(candidate => candidate.id === playerId)
  if (!player) return
  const remainingInstances = new Set(getPlayerCardInstanceZone(state.game, playerId, 'hand').instanceIds)
  const cards = snapshot.cards
    .filter(card => card.playerId === playerId &&
      (remainingInstances.has(card.instanceId) || movingInstances.has(card.instanceId)))
    .sort((left, right) => left.handIndex - right.handIndex)
    .map(card => ({
      cardId: card.cardId,
      instanceId: card.instanceId,
      handIndex: card.handIndex,
      presentationKey: `${playerId}:hand:${card.instanceId}`,
    }))
  if (cards.length > 0) state.handDiscardPresentation = { playerId, cards }
}
function isWaitingForGainedCardPlacement(game: GameState): boolean {
  const awaiting = game.pendingEffect?.awaiting
  return !!game.pendingDecision && awaiting?.kind === 'choose_optional' &&
    awaiting.effects.some(effect => effect.kind === 'move_gained_card')}
function preserveDiscardBeforePendingGainPlacement(
  snapshot: CardMoveSourceSnapshot,
  playerId: PlayerId,) {
  const before = snapshot.players.find(player => player.id === playerId)
  if (!playerId || !before) return
  state.discardTopDisplayOverride = {
    playerId,
    cardId: before.discard[0] ?? null,
    count: before.discard.length,
  }}
function queueCardZoneTransfers(
  transfers: CardZoneTransfer[],
  waitForBoardMotion: Promise<void> = Promise.resolve(),
  displayBaseline?: HandPileDisplayOverrideBaseline,
): Promise<void> {
  const candidates = transfers.filter((transfer): transfer is CardZoneTransfer & { flight: CardFlightSnapshot } => !!transfer.flight)
  const claimedMoveIds = new Set<string>()
  const animatedTransfers = candidates.filter(transfer => {
    const moveIds = transfer.moveIds?.length ? transfer.moveIds : transfer.moveId ? [transfer.moveId] : []
    const alreadyClaimed = moveIds.find(moveId => activeCardMoveClaims.has(moveId))
    if (alreadyClaimed) {
      reportCardMotionIssue('Movement was claimed more than once', { moveId: alreadyClaimed, transfer })
      discardCardFlight(transfer.flight)
      return false
    }
    moveIds.forEach(moveId => {
      activeCardMoveClaims.add(moveId)
      claimedMoveIds.add(moveId)
    })
    return true
  })
  if (animatedTransfers.length === 0) {
    if (displayBaseline) {
      state.discardPileDisplayOverrides = { ...displayBaseline.discard }
      state.deckPileDisplayOverrides = { ...displayBaseline.deck }
    }
    state.handDiscardPresentation = null
    return Promise.resolve()
  }
  const priorDiscardOverrides = displayBaseline?.discard ?? { ...toRaw(state.discardPileDisplayOverrides) }
  const priorDeckOverrides = displayBaseline?.deck ?? { ...toRaw(state.deckPileDisplayOverrides) }
  const discardProjection = new Map<PlayerId, { cardId: string | null; count: number }>()
  const deckProjection = new Map<PlayerId, { cardId: string | null; count: number }>()
  const projectedDiscardOverrides = { ...priorDiscardOverrides }
  const projectedDeckOverrides = { ...priorDeckOverrides }
  for (const transfer of animatedTransfers) {
    if (transfer.zone === 'discard' && !discardProjection.has(transfer.playerId)) {
      const initial = {
        cardId: transfer.previousDiscardTop,
        count: transfer.previousDiscardCount,
      }
      discardProjection.set(transfer.playerId, initial)
      projectedDiscardOverrides[transfer.playerId] = initial
    }
    if (transfer.zone === 'deck' && !deckProjection.has(transfer.playerId)) {
      const initial = {
        cardId: transfer.previousDeckTop,
        count: transfer.previousDeckCount,
      }
      deckProjection.set(transfer.playerId, initial)
      projectedDeckOverrides[transfer.playerId] = initial
    }
  }
  if (discardProjection.size > 0) state.discardPileDisplayOverrides = projectedDiscardOverrides
  if (deckProjection.size > 0) state.deckPileDisplayOverrides = projectedDeckOverrides
  const latestDiscardOverrides = new Map(discardProjection)
  const latestDeckOverrides = new Map(deckProjection)
  const releaseMotion = beginCardMotionBatch()
  const restoreAndRelease = (() => {
    let released = false
    return () => {
      if (released) return
      released = true
      for (const [playerId, projection] of discardProjection) {
        const player = state.game?.players.find(candidate => candidate.id === playerId)
        if (player && (projection.count !== player.discard.length || projection.cardId !== (player.discard[0] ?? null))) {
          reportCardMotionIssue('Discard projection did not settle to the engine state', {
            playerId, projection, engineTop: player.discard[0] ?? null, engineCount: player.discard.length,
          })
        }
      }
      for (const [playerId, projection] of deckProjection) {
        const player = state.game?.players.find(candidate => candidate.id === playerId)
        if (player && (projection.count !== player.deck.length || projection.cardId !== (player.deck[0] ?? null))) {
          reportCardMotionIssue('Deck projection did not settle to the engine state', {
            playerId, projection, engineTop: player.deck[0] ?? null, engineCount: player.deck.length,
          })
        }
      }
      const currentDiscardOverrides = { ...toRaw(state.discardPileDisplayOverrides) }
      for (const [playerId, latest] of latestDiscardOverrides) {
        if (currentDiscardOverrides[playerId] !== latest) continue
        const previous = priorDiscardOverrides[playerId]
        if (previous) currentDiscardOverrides[playerId] = previous
        else delete currentDiscardOverrides[playerId]
      }
      state.discardPileDisplayOverrides = currentDiscardOverrides
      const currentDeckOverrides = { ...toRaw(state.deckPileDisplayOverrides) }
      for (const [playerId, latest] of latestDeckOverrides) {
        if (currentDeckOverrides[playerId] !== latest) continue
        const previous = priorDeckOverrides[playerId]
        if (previous) currentDeckOverrides[playerId] = previous
        else delete currentDeckOverrides[playerId]
      }
      state.deckPileDisplayOverrides = currentDeckOverrides
      state.handDiscardPresentation = null
      claimedMoveIds.forEach(moveId => activeCardMoveClaims.delete(moveId))
      releaseMotion()
    }
  })()

  const showArrival = (transfer: CardZoneTransfer) => {
    if (transfer.zone === 'discard') {
      const current = discardProjection.get(transfer.playerId) ?? {
        cardId: transfer.previousDiscardTop,
        count: transfer.previousDiscardCount,
      }
      const next = projectPileArrival(current, transfer)
      discardProjection.set(transfer.playerId, next)
      latestDiscardOverrides.set(transfer.playerId, next)
      state.discardPileDisplayOverrides = {
        ...toRaw(state.discardPileDisplayOverrides), [transfer.playerId]: next,
      }
    } else if (transfer.zone === 'deck') {
      const current = deckProjection.get(transfer.playerId) ?? {
        cardId: transfer.previousDeckTop,
        count: transfer.previousDeckCount,
      }
      const next = projectPileArrival(current, transfer)
      deckProjection.set(transfer.playerId, next)
      latestDeckOverrides.set(transfer.playerId, next)
      state.deckPileDisplayOverrides = {
        ...toRaw(state.deckPileDisplayOverrides), [transfer.playerId]: next,
      }
    }
  }
  return enqueueCardMotion(async () => {
    try {
      await waitForBoardMotion
      await nextTick()
      for (const transfer of animatedTransfers) {
        let arrivalShown = false
        const showArrivalUnderFlight = async () => {
          if (arrivalShown) return
          arrivalShown = true
          if (transfer.zone !== 'discard' && transfer.zone !== 'deck') return
          showArrival(transfer)
          await nextTick()
        }
        let destination = transferDestination(transfer)
        if (!destination && (transfer.zone === 'discard' || transfer.zone === 'deck')) {
          reportCardMotionIssue('Destination pile has no visible anchor; settling to rule state', transfer)
        }
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
                (transfer.sourceHandInstanceId
                  ? element.getAttribute('data-card-instance-id') === transfer.sourceHandInstanceId
                  : element.getAttribute('data-hand-card-index') === String(transfer.sourceHandIndex)))
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
              afterFlight: showArrivalUnderFlight,
            })
            : animateCardFlight(flight, destinationElement, {
              destinationMode,
              timing: transfer.timing,
              afterFlight: showArrivalUnderFlight,
            })
          const currentPresentation = state.handDiscardPresentation
          if (currentPresentation?.playerId === stagedOwnerId) {
            currentPresentation.cards = currentPresentation.cards.filter(card =>
              transfer.sourceHandInstanceId
                ? card.instanceId !== transfer.sourceHandInstanceId
                : card.handIndex !== transfer.sourceHandIndex)
            await nextTick()
          }
          // Start the hand's FLIP reflow as soon as the flying clone is on
          // screen. Waiting for the flight first leaves an empty slot visible
          // until the card has already reached its pile.
          await Promise.all([flightAnimation, waitForHandCardReflow(hand)])
          await showArrivalUnderFlight()
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
            {
              destinationMode: destination?.destinationMode ?? 'overlay',
              timing: transfer.timing,
              afterFlight: showArrivalUnderFlight,
            },
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
          const flightOptions = {
            destinationMode: destination?.destinationMode ?? 'overlay',
            timing: transfer.timing,
            restoreDestinationVisibility: originalDestinationVisibility,
            afterFlight: showArrivalUnderFlight,
          }
          const revealImage = transfer.revealOnArrival ? cardImageUrl(transfer.cardId) : undefined
          if (revealImage) {
            await animateCardFlightWithReveal(
              transfer.flight, destination?.element ?? null, revealImage, flightOptions,
            )
          } else {
            await animateCardFlight(transfer.flight, destination?.element ?? null, flightOptions)
          }
        }
        await showArrivalUnderFlight()
      }
    } finally {
      restoreAndRelease()
    }
  }).catch(() => {
    animatedTransfers.forEach(transfer => discardCardFlight(transfer.flight))
    restoreAndRelease()
  })
}
/** Track automatic effects that run outside a user action's undo boundary. */async function trackAutomaticCardTransfers<T>(run: () => T): Promise<T> {
  const movementTransaction = activeActionCaptureDepth === 0 && state.game
    ? beginCardMoveTransaction(state.game, 'effect')
    : null
  const boardMotion = activeActionCaptureDepth === 0 && typeof document !== 'undefined'
    ? captureCardZoneMotion(document)
    : null
  const boardZoneBaseline = boardMotion && state.game
    ? capturePlayerZoneMotionBaseline(state.game)
    : null
  const handZoneCapture = activeActionCaptureDepth === 0 && state.game
    ? captureHandZoneTransfers(state.game)
    : null
  const externalCaptures = activeActionCaptureDepth === 0 && state.game
    ? captureExternalCardMoveSources(state.game)
    : null
  const marketCaptures = activeActionCaptureDepth === 0 && state.game
    ? captureMarketPileTransfers(state.game)
    : []
  let result!: T
  try {
    result = run()
  } finally {
    const movementResult = movementTransaction ? finishCardMoveTransaction(movementTransaction) : null
    movementResult?.auditIssues.forEach(issue => reportCardMotionIssue('Engine movement record is incomplete', issue))
    const cardMoveEvents = movementResult?.events ?? []
    const transfers: CardZoneTransfer[] = []
    if (handZoneCapture && state.game) {
      transfers.push(...resolveHandCardZoneTransfers(handZoneCapture, cardMoveEvents, reportCardMotionIssue))
    } else {
      handZoneCapture?.cards.forEach(card => discardCardFlight(card.flight))
    }
    stageHandDepartures(transfers, handZoneCapture)
    if (externalCaptures && state.game) {
      transfers.push(...resolveExternalCardMoveTransfers(externalCaptures, cardMoveEvents, state.game))
    } else {
      discardExternalCardMoveSources(externalCaptures ?? [])
    }
    if (state.game) transfers.push(...resolveMarketPileTransfers(marketCaptures, state.game, cardMoveEvents))
    else discardMarketPileTransfers(marketCaptures)
    if (boardMotion && boardZoneBaseline && state.game) {
      holdSwapCardsMovingToDiscard(boardMotion, boardZoneBaseline, state.game.players, cardMoveEvents)
      holdDevelopCardsMovingToDiscard(boardMotion, boardZoneBaseline, state.game.players, cardMoveEvents)
      holdBoardCardsMovingToDiscard(boardMotion, boardZoneBaseline, state.game.players, cardMoveEvents)
    }
    const boardFlight = boardMotion
      ? queueCardZoneMotion(boardMotion, new Map(), cardMoveEvents).finally(() => releaseBoardDiscardDisplayHolds(boardMotion))
      : Promise.resolve()
    if (transfers.length > 0) await queueCardZoneTransfers(transfers, boardFlight)
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
  discardCardMoveSourceSnapshot(pendingGainPlacementFlight.snapshot)
  pendingGainPlacementFlight = null
  state.deckDisplayOverride = null
  state.deckPileDisplayOverrides = {}
  state.discardTopDisplayOverride = null
}
function resolvePendingGainPlacementTransfers(
  pending: NonNullable<typeof pendingGainPlacementFlight>,
  game: GameState,
): CardZoneTransfer[] {
  const before = pending.snapshot.players.find(player => player.id === pending.playerId)
  if (!before) {
    discardCardMoveSourceSnapshot(pending.snapshot)
    return []
  }
  for (const zone of ['hand', 'deck', 'discard'] as const) {
    const destination = getPlayerCardInstanceZone(game, pending.playerId, zone)
    const zoneIndex = destination.instanceIds.indexOf(pending.instanceId)
    if (zoneIndex < 0) continue
    return [{
      instanceId: pending.instanceId,
      cardId: pending.cardId,
      playerId: pending.playerId,
      zone,
      zoneIndex,
      flight: pending.snapshot.flight,
      previousDeckTop: before.deck[0] ?? null,
      previousDeckCount: before.deck.length,
      previousDiscardTop: before.discard[0] ?? null,
      previousDiscardCount: before.discard.length,
    }]
  }
  discardCardMoveSourceSnapshot(pending.snapshot)
  return []
}
function clearPendingNemesisDrawFlight() {
  discardCardFlight(pendingNemesisDrawFlight?.flight ?? null)
  pendingNemesisDrawFlight = null
}
/** Capture the current deck top before a Nemesis continuation can remove it. */
function captureNemesisDeckTopFlight(game: GameState) {
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
/** Hold the deck origin through Nemesis decisions that happen before its draw. */
function capturePendingNemesisDrawFlight(game: GameState) {
  if (game.nemesisResolution?.drawnCardId) return
  captureNemesisDeckTopFlight(game)
}
function startNemesisDrawRevealAnimation(decision: Extract<PendingDecision, { kind: 'confirm_nemesis_draw' }>): Promise<void> {
  const pendingFlight = pendingNemesisDrawFlight
  pendingNemesisDrawFlight = null
  const matchingFlight = pendingFlight?.cardId === decision.cardId ? pendingFlight.flight : null
  if (pendingFlight && !matchingFlight) discardCardFlight(pendingFlight.flight)
  // A nested Nemesis continuation can reveal a card without passing through
  // continueNemesisTurn. If that path lacked a pre-draw snapshot, use the
  // visible deck anchor when it is still available.
  const flight = matchingFlight ?? captureCardFlight(findDataElement('data-nemesis-deck-pile', 'true'))
  const releaseMotion = beginCardMotionBatch()
  state.nemesisDrawRevealQueued = true
  state.nemesisDrawRevealAnimating = true
  const animation = enqueueCardMotion(async () => {
    const currentDecision = state.game?.pendingDecision
    if (currentDecision?.kind !== 'confirm_nemesis_draw' || currentDecision.id !== decision.id) {
      discardCardFlight(flight)
      return
    }
    await nextTick()
    const destination = document.querySelector<HTMLElement>('.nemesis-reveal-card')
    if (!destination) {
      discardCardFlight(flight)
      return
    }
    const destinationVisibility = destination.style.visibility
    destination.style.visibility = 'hidden'
    state.nemesisDrawRevealQueued = false
    await nextTick()
    destination.style.visibility = destinationVisibility
    if (flight) await animateCardRevealFlight(flight, destination, cardImageUrl(decision.cardId))
  })
    .catch(() => undefined)
    .finally(() => {
      releaseMotion()
      state.nemesisDrawRevealQueued = false
      state.nemesisDrawRevealAnimating = false
      if (pendingNemesisDrawRevealAnimation === animation) pendingNemesisDrawRevealAnimation = null
    })
  pendingNemesisDrawRevealAnimation = animation
  return animation
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
        ...(destinationPlayerId ? { destinationPlayerId } : {}),
      }))
  }
  if (answer.kind === 'select_collective_cards') {
    return answer.choices
      .filter(item => item.choice.zone === 'hand')
      .map(item => ({
        playerId: item.playerId,
        choice: item.choice,
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
  if (wasNemesisTurnWaiting) {
    captureNemesisDeckTopFlight(state.game)
    state.nemesisDrawRevealQueued = true
  }
  const conjuredCardToReturn = pendingDecision.kind === 'select_conjure_breach' &&
    answer.kind === 'select_conjure_breach' && !answer.choice
    ? pendingEffect?.conjuredCard
    : undefined
  const conjurePrepTarget = pendingDecision.kind === 'select_conjure_breach' &&
    answer.kind === 'select_conjure_breach' && answer.choice && pendingEffect?.conjuredCard?.instanceId &&
    answer.choice.playerId === pendingEffect.conjuredCard.playerId
    ? {
      playerId: pendingEffect.conjuredCard.playerId,
      breachIndex: answer.choice.breachIndex,
      instanceId: pendingEffect.conjuredCard.instanceId,
    }
    : null
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
  let pendingPlayFlightCompletion: Promise<{ zone: string; promise: Promise<void> } | null> | null = null
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
  const conjureMotionSnapshot = previous ? cardZoneMotionsByUndo.get(previous) : null
  const conjureOrigin = conjurePrepTarget
    ? conjureMotionSnapshot?.cards.find(card =>
      card.zone === 'conjure' && card.instanceId === conjurePrepTarget.instanceId)
    : undefined
  if (conjurePrepTarget && conjureOrigin?.flight) {
    state.pendingConjureBreachArrival = conjurePrepTarget
  }
  if (previous && pendingPlayFlightAtStart) {
    const motionSnapshot = cardZoneMotionsByUndo.get(previous) ?? null
    discardCardZoneMotionSource(
      motionSnapshot,
      'hand',
      pendingPlayFlightAtStart.cardId,
      pendingPlayFlightAtStart.ownerId,
      pendingPlayFlightAtStart.motionKey,
      pendingPlayFlightAtStart.instanceId,
    )
    if (pendingPlayFlightAtStart.hiddenDestinationZone && pendingPlayFlightAtStart.hiddenDestinationKey) {
      discardCardZoneMotionSource(
        motionSnapshot,
        pendingPlayFlightAtStart.hiddenDestinationZone,
        pendingPlayFlightAtStart.cardId,
        pendingPlayFlightAtStart.ownerId,
        pendingPlayFlightAtStart.hiddenDestinationKey,
        pendingPlayFlightAtStart.instanceId,
      )
    }
  }
  const zoneBaseline = capturePlayerZoneMotionBaseline(state.game)
  const messages = engineResolvePendingDecision(state.game, state.game.pendingDecision.id, answer)
  const nextNemesisDrawPending = wasNemesisTurnWaiting &&
    state.game.pendingDecision?.kind === 'confirm_nemesis_draw' &&
    state.game.pendingDecision.source !== 'specific_deck'
  if (!nextNemesisDrawPending) state.nemesisDrawRevealQueued = false
  const decisionMoveEvents = previous ? finishActionMovementCapture(previous) : []
  if (previous) prepareHandDeparturePresentation(previous)
  if (conjurePrepTarget && state.pendingConjureBreachArrival?.instanceId === conjurePrepTarget.instanceId) {
    const movedToChosenBreach = decisionMoveEvents.some(event =>
      event.kind === 'move' && event.instanceId === conjurePrepTarget.instanceId &&
      event.source.zone === 'temporary' && event.source.zoneId === `temporary:conjure:${conjurePrepTarget.playerId}` &&
      event.destination.zone === 'breach' && event.destination.zoneId ===
        `player:${conjurePrepTarget.playerId}:breach:${conjurePrepTarget.breachIndex}`)
    if (movedToChosenBreach && conjureOrigin?.flight) {
      holdCardFlightAtOrigin(conjureOrigin.flight)
      const playerArea = findDataElement('data-player-area-id', conjurePrepTarget.playerId)
      const source = playerArea
        ? findDataElement('data-card-instance-id', conjurePrepTarget.instanceId, playerArea)
        : null
      if (source?.dataset.cardMotionZone === 'conjure') source.style.visibility = 'hidden'
    } else {
      state.pendingConjureBreachArrival = null
    }
  }
  if (conjuredCardToReturn && conjureReturnPlayer) {
    const playerAfter = state.game.players.find(player => player.id === conjureReturnPlayer.id)
    const returnEvent = decisionMoveEvents.find((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
      event.kind === 'move' && event.cardId === conjuredCardToReturn.cardId &&
      (!conjuredCardToReturn.instanceId || event.instanceId === conjuredCardToReturn.instanceId) &&
      event.source.zone === 'temporary' &&
      event.source.zoneId === `temporary:conjure:${conjureReturnPlayer.id}` &&
      event.destination.zone === 'deck' && event.destination.ownerId === conjureReturnPlayer.id,
    )
    const returnedDeck = getPlayerCardInstanceZone(state.game, conjureReturnPlayer.id, 'deck')
    const returnedInstanceId = returnEvent?.instanceId
    if (returnEvent && playerAfter?.deck.length === conjureReturnDeckCount + 1 &&
      returnedDeck.cards[returnEvent.destination.index] === conjuredCardToReturn.cardId &&
      returnedDeck.instanceIds[returnEvent.destination.index] === returnedInstanceId) {
      if (!conjureReturnFlight) {
        reportCardMotionIssue('Conjured card return has no visible source anchor', {
          cardId: conjuredCardToReturn.cardId, instanceId: returnedInstanceId,
        })
      } else {
        // Install the old deck count before yielding. The held played card's
        // own flight remains the prerequisite for this return flight.
        pendingPlayFlightCompletion = finishPendingPlayCardFlight(previous)
        const waitForPendingPlay = pendingPlayFlightCompletion.then(motion => motion?.promise ?? Promise.resolve())
        void queueCardZoneTransfers([{
          moveId: returnEvent.moveId,
          instanceId: returnEvent.instanceId,
          cardId: conjuredCardToReturn.cardId,
          playerId: conjureReturnPlayer.id,
          sourcePlayerId: conjureReturnPlayer.id,
          zone: 'deck',
          zoneIndex: returnEvent.destination.index,
          flight: conjureReturnFlight,
          timing: 'hand-to-deck-top',
          previousDeckTop: conjureReturnDeckTop,
          previousDeckCount: conjureReturnDeckCount,
          previousDiscardTop: conjureReturnDiscardTop,
          previousDiscardCount: conjureReturnDiscardCount,
        }], waitForPendingPlay)
      }
    } else {
      reportCardMotionIssue('Conjured card return has no matching temporary-to-deck movement event', {
        cardId: conjuredCardToReturn.cardId,
        instanceId: conjuredCardToReturn.instanceId,
        returnEvent,
      })
      discardCardFlight(conjureReturnFlight)
    }
  }
  const decisionBoardMotion = previous ? cardZoneMotionsByUndo.get(previous) ?? null : null
  holdSwapCardsMovingToDiscard(decisionBoardMotion, zoneBaseline, state.game.players, decisionMoveEvents)
  holdDevelopCardsMovingToDiscard(decisionBoardMotion, zoneBaseline, state.game.players, decisionMoveEvents)
  holdBoardCardsMovingToDiscard(decisionBoardMotion, zoneBaseline, state.game.players, decisionMoveEvents)
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
      const capturedHandCards = previous
        ? handZoneTransfersByUndo.get(previous)?.cards.filter(card => card.playerId === presentationPlayerId) ?? []
        : []
      state.handDiscardPresentation = {
        playerId: presentationPlayerId,
        cards: presentationHandBefore.map((cardId, handIndex) => ({
          cardId,
          instanceId: capturedHandCards.find(card => card.handIndex === handIndex)?.instanceId ?? '',
          handIndex,
          presentationKey: `${presentationPlayerId}:hand:${handIndex}`,
        })),
      }
      if (previous) stageHandDepartures(
        resolvedHandTransfersByUndo.get(previous) ?? [],
        handZoneTransfersByUndo.get(previous) ?? null,
      )
    }
  }
  for (const message of messages) {
    const warning = message.startsWith('Invalid') || message.startsWith('Stale') || message.startsWith('Choose ') || message.startsWith('Decision ')
    pushLog(message, warning ? 'warn' : 'info')
  }
  if (pendingPlayFlightCompletion) await pendingPlayFlightCompletion
  else await finishPendingPlayCardFlight(previous)
  if (previous) {
    const marketCaptures = marketPileTransfersByUndo.get(previous) ?? []
    marketPileTransfersByUndo.delete(previous)
    const marketTransfers = resolveMarketPileTransfers(marketCaptures, state.game, decisionMoveEvents)
    if (marketTransfers.length > 0) await queueCardZoneTransfers(marketTransfers)
  }
  if (gainPlacement && !state.game.pendingDecision && !state.game.pendingEffect) {
    pendingGainPlacementFlight = null
    const transfers = resolvePendingGainPlacementTransfers(gainPlacement, state.game)
    await queueCardZoneTransfers(transfers)
    // Keep the pre-gain discard surface in place until a selected card has
    // physically arrived at its destination, then reveal the updated pile.
    state.discardTopDisplayOverride = null
    await nextTick()
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
        await enqueueCardMotion(() => animateCardFlight(
          attachFlight.flight,
          findDataElement('data-card-instance-id', attachFlight.instanceId, document),
          { destinationMode: 'replace' },
        ))
      } finally {
        state.cardMotionBatchActive = false
      }
    } else {
      state.cardMotionBatchActive = false
      if (!state.game.pendingEffect?.sourceCardInHandPendingPlay) clearPendingAttachCardFlight()
    }
  }
  if (state.game.gameOver) {
    clearPendingNemesisDrawFlight()
    pushLog(checkGameOver(state.game) ?? 'Game over', 'warn')
    state.phase = 'gameover'
  } else if (!state.game.pendingDecision && !state.game.pendingEffect &&
    state.game.pendingCorruptionStartPlayerId === state.game.currentTurn) {
    await continuePlayerTurnAfterCorruptions()
  } else if (!state.game.pendingDecision && !state.game.pendingEffect &&
    state.game.pendingCorruptionEndTurnPlayerId === state.game.currentTurn) {
    state.game.pendingCorruptionEndTurnPlayerId = undefined
    await doEndTurn(false)
  } else if (wasNemesisTurnWaiting && state.game.pendingDecision?.kind === 'confirm_nemesis_draw' &&
    state.game.pendingDecision.source !== 'specific_deck') {
    // Resolving one Nemesis decision can queue the next draw directly. That
    // transition must consume the deck-origin snapshot kept by the prior step.
    state.phase = 'nemesis_draw'
    await startNemesisDrawRevealAnimation(state.game.pendingDecision)
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
    await finalizeDraw()
  } else if (!state.game.pendingDecision && wasCasting) {
    const noSpellsRemain = getCastableSpells(state.game, cp().id).length === 0
    if (wasCastingPhaseEnd || noSpellsRemain) await enterMainPhase(state.game.currentTurn)
  } else if (!state.game.pendingDecision && state.phase === 'main') {
    await resolveMainPhasePreppedEffects()
    maybeAutoEnd()
  }
  restoreAutomaticDecisionViewIfSettled()
}
export function playCard(cardIdx: number) {
  return playCardWithMotion(cardIdx)
}
async function playCardWithMotion(
  cardIdx: number,
  options: { allowCardMotionBatch?: boolean; recordUndo?: boolean } = {},
) {
  if (!canActMain.value || (state.cardMotionBatchActive && !options.allowCardMotionBatch)) return
  const p = cp()
  const cardId = p.hand[cardIdx]
  if (!cardId || !state.game) return
  const cardType = getCard(cardId).type
  const playerArea = findDataElement('data-player-area-id', p.id)
  const source = findDataElement('data-hand-card-index', String(cardIdx), playerArea ?? document)
  const hand = source?.closest<HTMLElement>('.hand') ?? null
  const motionKey = source?.dataset.cardMotionKey ?? ''
  const instanceId = source?.dataset.cardInstanceId ??
    getPlayerCardInstanceZone(state.game, p.id, 'hand').instanceIds[cardIdx] ?? ''
  let flight = cardType === 'gem' || cardType === 'relic'
    ? captureCardFlight(source)
    : null
  const zoneBaseline = capturePlayerZoneMotionBaseline(state.game)
  const previous = beforeAction(true, [], source, options.recordUndo ?? true)
  const releaseMotion = flight ? beginCardMotionBatch() : null
  let entryMotion: Promise<void> = Promise.resolve()
  try {
    const playMovementCapture = beginCardMoveTransaction(state.game, 'play')
    const msg = enginePlayCard(state.game, p.id, cardId, cardIdx)
    const playEvents = finishCardMoveTransaction(playMovementCapture).events
    if (msg) pushLog(msg)
    holdSwapCardsMovingToDiscard(previous ? cardZoneMotionsByUndo.get(previous) ?? null : null,
      zoneBaseline, state.game.players, playEvents)
    holdDevelopCardsMovingToDiscard(previous ? cardZoneMotionsByUndo.get(previous) ?? null : null,
      zoneBaseline, state.game.players, playEvents)
    holdBoardCardsMovingToDiscard(previous ? cardZoneMotionsByUndo.get(previous) ?? null : null,
      zoneBaseline, state.game.players, playEvents)
    const hasPendingEffect = !!state.game.pendingDecision || !!state.game.pendingEffect
    const cardWasPlayed = hasHandPlayMove(playEvents, instanceId)
    if (source && motionKey && instanceId && hasPendingEffect && cardWasPlayed) {
      const presentationKey = `${p.id}:play:${motionKey}`
      const pending: PendingPlayCardFlight = {
        ownerId: p.id,
        cardId,
        instanceId,
        handIndex: cardIdx,
        motionKey,
        presentationKey,
        hiddenDestination: null,
        hiddenDestinationZone: null,
        hiddenDestinationKey: null,
        hiddenDestinationVisibility: '',
      }
      pendingPlayCardFlight = pending
      state.handPlayPresentation = {
        playerId: p.id,
        cardId,
        instanceId,
        handIndex: cardIdx,
        presentationKey,
        motionKey,
      }
      discardCardFlight(flight)
      flight = null
      await nextTick()
      hidePendingPlayCardDestination(pending)
      entryMotion = enqueueCardMotion(() => waitForHandCardReflow(hand))
    } else if (cardWasPlayed) {
      const destinationZone = getPlayerCardMotionZone(state.game, p.id, instanceId)
      markHandCardDeparting(source)
      await nextTick()
      const destination = findPlayCardDestination(p.id, cardId, instanceId, destinationZone)
      if (!destinationZone) {
        discardCardFlight(flight)
        flight = null
        entryMotion = enqueueCardMotion(() => waitForHandCardReflow(hand))
      } else {
        const playFlight = flight
        const destinationVisibility = destination?.style.visibility ?? ''
        entryMotion = enqueueCardMotion(async () => {
          await Promise.all([
            animatePlayCardFlight(playFlight, destination, destinationZone, destinationVisibility),
            waitForHandCardReflow(hand),
          ])
        })
        if (destination && previous) registerCardZoneMotionBarrier(previous, destinationZone ?? 'played', entryMotion)
        flight = null
      }
    } else if (flight && cardType === 'relic' && state.game.pendingEffect?.sourceCardInHandPendingPlay) {
      discardCardFlight(pendingAttachCardFlight?.flight ?? null)
      pendingAttachCardFlight = { ownerId: p.id, cardId, instanceId, flight }
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
  // Keep the batch to one undo step, but give every card its own movement
  // boundary so on-play effects can finish their flights before the next gem.
  pushUndoSnapshot(snapshot())
  const releaseBatchMotion = beginCardMotionBatch()
  try {
    while (canActMain.value && !g.pendingDecision && !g.pendingEffect) {
      const handIndex = p.hand.findIndex(id => getCard(id).type === 'gem')
      if (handIndex < 0) break
      await playCardWithMotion(handIndex, { allowCardMotionBatch: true, recordUndo: false })
    }
    maybeAutoEnd()
  } finally {
    releaseBatchMotion()
  }
}
export function prepSpell(cardIdx: number, breachIndex: number, options: { animate?: boolean } = {}) {
  const p = cp()
  const cardId = p.hand[cardIdx]!
  const playerArea = findDataElement('data-player-area-id', p.id)
  const source = findDataElement('data-hand-card-index', String(cardIdx), playerArea ?? document)
  // The drag preview already follows the pointer. Exclude this card from the
  // motion snapshot so release places it without starting a second flight.
  const previous = beforeAction(true, [], options.animate === false ? source : null)
  const instanceId = state.game
    ? getPlayerCardInstanceZone(state.game, p.id, 'hand').instanceIds[cardIdx]
    : undefined
  const msg = enginePrepSpell(state.game!, p.id, cardId, breachIndex, cardIdx)
  if (!msg) {
    markHandCardDeparting(source)
    if (options.animate === false && instanceId) {
      discardCardZoneMotionSource(
        previous ? cardZoneMotionsByUndo.get(previous) ?? null : null,
        'hand', cardId, p.id, source?.dataset.cardMotionKey ?? '', instanceId,
      )
    }
  }
  if (msg) pushLog(msg, 'ok')
  state.prepTarget = null
  if (!msg && state.phase === 'main') void resolveMainPhasePreppedEffects()
  maybeAutoEnd()
  finishAction(previous)
}
export async function activatePreppedCardAction(choice: CardChoice) {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const msg = engineActivatePreppedCardAction(state.game, cp().id, choice)
  if (msg) pushLog(msg, msg.startsWith('Returned ') ? 'ok' : 'warn')
  await finishPreppedAction(previous)
}
/** Activate a Main Phase while-prepped effect by clicking the spell on its Breach. */
export async function activatePreppedSpellAction(breachIndex: number, spellIndex: number) {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const messages = engineActivatePreppedSpellAction(state.game, cp().id, breachIndex, spellIndex)
  for (const message of messages) pushLog(message, message.startsWith('That ') || message.startsWith('Resolve ') ? 'warn' : 'ok')
  await finishPreppedAction(previous)
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
async function finalizeDraw() {
  const g = state.game!
  const p = cp()
  state.discardRemaining = []
  const handBeforeDraw = p.hand.length
  const messages = await trackAutomaticCardTransfers(() => resolveDrawPhase(g, p.id))
  for (const message of messages) pushLog(message)
  if (g.pendingDecision || g.pendingEffect) {
    pushLog('Resolve the end-of-turn card effect before drawing', 'info')
    return
  }
  const drawn = p.hand.length - handBeforeDraw
  if (drawn > 0) {
    state.drawPhaseHandGainTotals[p.id] = (state.drawPhaseHandGainTotals[p.id] ?? 0) + drawn
    await nextTick()
    const hand = typeof document === 'undefined'
      ? null
      : findDataElement('data-player-area-id', p.id)?.querySelector<HTMLElement>('.hand') ?? null
    await waitForHandCardReflow(hand)
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
    await finalizeDraw()
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
  const game = state.game
  if (!game) return
  const p = cp()
  const cardId = state.discardRemaining[index]
  if (!cardId) return
  const previousDiscardTop = p.discard[0] ?? null
  const previousDiscardCount = p.discard.length
  const playedZone = getPlayerCardInstanceZone(game, p.id, 'played_this_turn')
  const discardZone = getPlayerCardInstanceZone(game, p.id, 'discard')
  const instanceId = playedZone.instanceIds[index]
  if (!instanceId || playedZone.cards[index] !== cardId) return
  const flight = capturedFlight === undefined ? captureCardFlight(findDataElement(
    'data-discard-phase-card-index', String(index),
    document.querySelector('.played-zone-center') ?? document,
  )) : capturedFlight
  const movementTransaction = beginCardMoveTransaction(game, 'discard_phase')
  moveCardBetweenZones(game, playedZone, index, discardZone, 0, 'discard_phase')
  const movement = finishCardMoveTransaction(movementTransaction)
  const moved = movement.events.find((event): event is Extract<CardMoveEvent, { kind: 'move' }> =>
    event.kind === 'move' && event.instanceId === instanceId &&
    event.source.zone === 'played_this_turn' && event.destination.zone === 'discard')
  state.discardRemaining.splice(index, 1)
  if (!moved) {
    discardCardFlight(flight)
    return
  }
  try {
    await queueCardZoneTransfers([{
      moveId: moved.moveId,
      instanceId: moved.instanceId,
      cardId: moved.cardId,
      playerId: p.id,
      zone: 'discard',
      zoneIndex: moved.destination.index,
      flight,
      timing: 'discard-phase',
      previousDeckTop: p.deck[0] ?? null,
      previousDeckCount: p.deck.length,
      previousDiscardTop,
      previousDiscardCount,
    }])
  } finally {
    discardCardFlight(flight)
  }
}
/** Core end-of-turn. Called by user action AND auto-end. */
async function doEndTurn(recordDiscardUndoBoundary = true) {
  if (state.phase !== 'main' || !state.game || state.game.pendingDecision || state.game.pendingEffect) return
  const p = cp()
  if (state.game.nemesis.corruptionDeck &&
    (p.corruptionsDrawnThisTurn?.length ?? 0) > 0 &&
    state.game.pendingCorruptionEndTurnPlayerId !== p.id) {
    state.game.pendingCorruptionEndTurnPlayerId = p.id
    const resolveCorruptions = () => engineResolveEffects(state.game!, p.id,
      [{ kind: 'resolve_corruptions', timing: 'end_main' }], undefined, 0, p.id)
    const messages = activeActionCaptureDepth > 0
      ? resolveCorruptions()
      : await trackAutomaticCardTransfers(resolveCorruptions)
    for (const message of messages) {
      pushLog(message, 'info')
    }
    if (state.game.pendingDecision || state.game.pendingEffect) {
      pushLog('Resolve Corruptions drawn this turn before ending the Main Phase', 'info')
      return
    }
    state.game.pendingCorruptionEndTurnPlayerId = undefined
  }
  if (p.playedThisTurn.length === 0) {
    state.game.currentPhase = 'draw'
    await finalizeDraw()
    return
  }
  // Keep a serializable snapshot for end-of-turn card triggers. The UI moves
  // played cards into discard before resolveDrawPhase runs, but effects such
  // as Pact Prism still need to inspect the cards played this turn.
  p.pendingEndTurnCardIds = [...p.playedThisTurn]
  // The UI's Discard Order phase is part of the engine's Draw phase. Keep the
  // serializable phase in sync so Main Phase-only actions (such as Recall) are
  // unavailable as soon as the first played card enters the Discard.
  state.game.currentPhase = 'draw'
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
export async function endTurn() {
  if (!canRequestEndTurn.value) return
  const previous = beforeAction()
  await doEndTurn()
  await finishAction(previous)
}
/** Request the end of Main Phase, warning first when legal actions remain. */
export function requestEndTurn() {
  if (!canRequestEndTurn.value) return
  if (state.endTurnWarningVisible) {
    state.endTurnWarningVisible = false
    state.endTurnActionHint = null
    void endTurn()
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
  void endTurn()
}
export async function clickDiscardCard(index: number) {
  if (state.phase !== 'discard_order' || state.selectedPlayer !== state.game?.currentTurn) return
  if (index < 0 || index >= state.discardRemaining.length) return
  state.cardMotionBatchActive = true
  try {
    await moveDiscardPhaseCard(index)
    if (state.discardRemaining.length === 0) {
      await finalizeDraw()
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
  state.nemesisDrawRevealQueued = false
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
  state.nemesisDrawRevealQueued = true
  const messages = await trackAutomaticCardTransfers(() => advanceNemesisTurn(g))
  const pendingDecision = (g as GameState).pendingDecision as PendingDecision | null
  const hasQueuedDeckReveal = pendingDecision?.kind === 'confirm_nemesis_draw' &&
    pendingDecision.source !== 'specific_deck'
  if (!hasQueuedDeckReveal) state.nemesisDrawRevealQueued = false
  for (const message of messages) pushLog(message, 'warn')
  if (pendingDecision || g.pendingEffect) {
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
    if (pendingDecision?.kind === 'confirm_nemesis_draw' &&
      pendingDecision.source !== 'specific_deck') await startNemesisDrawRevealAnimation(pendingDecision)
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
  return state.game && state.phase === 'main'
    ? engineGetRecallActions(state.game, playerId)
    : []
}
/** Activate a Recall effect from the selected Mage's Discard pile. */
export function activateRecall(discardIndex: number, playerId: PlayerId = state.selectedPlayer) {
  if (!state.game) return
  if (state.phase !== 'main') {
    pushLog('Recall can only be activated during the Main Phase', 'warn')
    return
  }
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
