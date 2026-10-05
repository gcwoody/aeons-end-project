import { reactive, computed, nextTick, watch } from 'vue'
import {
  createGame, startTurn, getPlayer,
  resolveMageSetups as engineResolveMageSetups,
  resolvePlayerInPlayPhaseEffects as engineResolvePlayerInPlayPhaseEffects,
  getCastableSpells, getPreppedSpellChoices, castSpell as engineCastSpell,
  playCard as enginePlayCard, prepSpell as enginePrepSpell,
  movePreppedSpell as engineMovePreppedSpell,
  returnPreppedSpellToHand as engineReturnPreppedSpellToHand,
  getBuyableCards, buyCard as engineBuyCard,
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
  canPlayerAct, canActivateAbilityDuringMain, toRoman,
  advanceNemesisTurn, getNemesisDiscardActions, discardNemesisPower,
  checkGameOver,
} from '@engine/engine'
import {
  createTwoPlayerScenario, getCard, defaultMarketSetup, DEFAULT_MARKET_SLOTS,
  resolveMarketCardIds,
} from '@engine/data'
import type {
  CardChoice, CollectiveCardChoice, GameState, NemesisDifficulty, PendingDecisionAnswer,
  PendingDecision, PlayerId, PlayerState, PreppedSpellChoice, MarketSetupConfig,
} from '@engine/types'
import { displayMageName, formatMageNamesInText } from './display-name'
import { cardImageUrl } from '../card-images'
import { animateCardFlight, animateCardRevealFlight, captureCardFlight, discardCardFlight } from './card-flight'
import type { CardFlightSnapshot } from './card-flight'
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
const damageTargetRects = new WeakMap<UndoSnapshot, Map<string, DamageTargetRect>>()
const damageImpactTimers = new Map<number, ReturnType<typeof setTimeout>>()
const DAMAGE_IMPACT_DURATION_MS = 1600
let turnTransitionSequence = 0

const state = reactive({
  game: null as GameState | null,
  phase: 'setup' as UiPhase,
  log: [] as LogEntry[],
  prepTarget: null as number | null, // hand index of the spell being prepped
  selectedPlayer: '' as PlayerId,
  discardRemaining: [] as string[], // played cards not yet clicked during discard phase
  discardTopDisplayOverride: null as { playerId: PlayerId; cardId: string | null } | null,
  drawPhaseHandGainTotals: {} as Record<PlayerId, number>, // UI-only counts excluded from Mage draw feedback
  damageImpacts: [] as DamageImpact[], // UI-only combat feedback; never saved with the game
  cardMotionBatchActive: false,
  turnTransitionActive: false,
  turnTransitionId: 0,
  nemesisDrawRevealAnimating: false,
  viewPile: null as 'deck' | 'discard' | 'specific_deck' | 'trinket_deck' | 'nemesis_deck' | 'nemesis_discard' | 'nemesis_specific' | 'nemesis_specific_discard' | 'player_cards_in_play' | null,
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
  mage1: 'jian',
  mage2: 'brama',
  nemesisType: 'rageborne',
  nemesisDifficulty: 'standard' as NemesisDifficulty,
  marketMode: 'template1' as MarketSetupConfig['mode'],
  marketSlots: resolveMarketCardIds({ mode: 'template1', slots: [] }),
})

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

/** Select or unselect a highlighted card on the board for the active decision. */
export function togglePendingBoardCard(selection: BoardCardSelection): void {
  const decision = state.game?.pendingDecision
  if (!decision || (decision.kind !== 'select_cards' && decision.kind !== 'select_collective_cards')) return
  if (!usesBoardCardSelection(decision)) return
  const candidate = boardCardSelections().find(item => boardCardSelectionKey(item) === boardCardSelectionKey(selection))
  if (!candidate) return

  if (isPendingBoardCardSelected(candidate)) {
    state.pendingBoardCards = state.pendingBoardCards.filter(item =>
      boardCardSelectionKey(item) !== boardCardSelectionKey(candidate))
    return
  }
  if (state.pendingBoardCards.length >= decision.max) return

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
  if (decision.kind === 'select_cards') resolveDecision({ kind: 'select_cards', choices: [] })
  if (decision.kind === 'select_collective_cards') resolveDecision({ kind: 'select_collective_cards', choices: [] })
}

export function isPendingPreppedSpellSelected(choice: PreppedSpellChoice): boolean {
  return state.pendingPreppedSpells.some(selected =>
    preppedSpellChoiceKey(selected) === preppedSpellChoiceKey(choice))
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
  if (decision.max === 1 && !decision.confirmSelection) {
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
    state.pendingBoardCards = []

    const decisionPlayerId = soleDecisionDisplayPlayerId(decision)
    if (decisionPlayerId && decisionPlayerId !== state.selectedPlayer) {
      selectPlayer(decisionPlayerId)
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

function beforeAction(): UndoSnapshot | null {
  if (!state.game) return null
  const previous = snapshot()
  damageTargetRects.set(previous, captureDamageTargetRects())
  pushUndoSnapshot(previous)
  return previous
}

function pushUndoSnapshot(value: UndoSnapshot) {
  undoStack.push(value)
  if (undoStack.length > MAX_UNDO) undoStack.shift()
}

function recordUndoBoundary() {
  if (state.game) pushUndoSnapshot(snapshot())
}

function finishAction(previous: UndoSnapshot | null) {
  if (!previous || !state.game) return
  queueDamageImpacts(previous)
  if (state.game.gameOver) state.phase = 'gameover'
  const current = snapshot()
  if (undoSnapshotsEqual(previous, current)) undoStack.pop()
}

export function undo() {
  const s = undoStack.pop()
  if (!s || !state.game) { pushLog('Nothing to undo', 'warn'); return }
  turnTransitionSequence++
  state.turnTransitionActive = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingNemesisDrawFlight()
  state.cardMotionBatchActive = false
  clearDamageImpacts()
  normalizeRemnantRiftBreaches(s.game)
  state.game = reactive(s.game) as GameState
  state.phase = s.phase
  state.pendingPreppedSpells = []
  state.pendingBoardCards = []
  state.prepTarget = s.prepTarget
  state.selectedPlayer = s.selectedPlayer
  state.discardRemaining = [...s.discardRemaining]
  state.discardTopDisplayOverride = null
  state.helpOpen = false
  state.viewPile = null
  state.endTurnWarningVisible = false
  pushLog('Undid last action')
}

// ===== Auto-end turn when no actions remain =====

function maybeAutoEnd() {
  if (state.phase !== 'main' || !state.game) return
  if (state.game.pendingDecision || state.game.pendingEffect) return
  if (!playerCanAct.value) {
    pushLog('No actions available — turn ends automatically', 'info')
    // This automatic phase transition belongs to the action that exhausted
    // the player's options. That action already recorded its undo snapshot.
    doEndTurn(false)
  }
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

function enterMainPhase() {
  const g = state.game!
  const p = cp()
  const messages = resolvePreppedEffects(g, p.id, 'casting_phase_end')
  for (const message of messages) pushLog(message, 'info')
  if (g.pendingDecision || g.pendingEffect) return
  for (const message of engineResolvePlayerInPlayPhaseEffects(g, p.id, 'casting_phase_end')) pushLog(message, 'info')
  if (g.pendingDecision || g.pendingEffect) return
  if (g.gameOver) { state.phase = 'gameover'; return }
  state.phase = 'main'
  // Ability activation is validated by the engine, so persist the phase
  // transition before main-phase actions become available.
  syncEnginePhaseWithUi()
  resolveMainPhasePreppedEffects()
  if (g.gameOver) { state.phase = 'gameover'; return }
  maybeAutoEnd()
}

// ===== Flow =====

function beginTurnImmediately() {
  const g = state.game!
  if (g.gameOver) { state.phase = 'gameover'; return }
  const turnNum = g.turnOrderDiscard.length
  if (g.currentTurn === 'nemesis') {
    pushLog(`Turn ${turnNum} — ${g.nemesis.name.toUpperCase()} begins`, 'warn')
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
    continueNemesisTurn()
  } else {
    const p = getPlayer(g, g.currentTurn)
    pushLog(`Turn ${turnNum} — ${displayMageName(p.mageType)} begins`, 'info')
    state.selectedPlayer = g.currentTurn
    if (g.pendingDecision || getCastableSpells(g, g.currentTurn).length > 0) state.phase = 'casting'
    else enterMainPhase()
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
  turnTransitionSequence++
  state.turnTransitionActive = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingNemesisDrawFlight()
  state.cardMotionBatchActive = false
  clearDamageImpacts()
  state.activeSaveId = null
  autoSaveEnabled = false
  state.exitPrompt = false
  state.endTurnWarningVisible = false
  state.nemesisType = nemesisType
  state.nemesisDifficulty = nemesisDifficulty
  const scenario = createTwoPlayerScenario([m1, m2], nemesisType, nemesisDifficulty, marketSetup)
  const g = reactive(createGame(scenario)) as GameState
  if (!g.pendingDecision && !g.pendingEffect) {
    for (const message of engineResolveMageSetups(g)) pushLog(message, 'info')
  }
  state.game = g
  state.log = []
  state.pendingPreppedSpells = []
  state.pendingBoardCards = []
  state.prepTarget = null
  state.selectedPlayer = g.players[0]!.id
  state.discardRemaining = []
  state.discardTopDisplayOverride = null
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
    turnTransitionSequence++
    state.turnTransitionActive = false
    state.nemesisDrawRevealAnimating = false
    clearPendingAttachCardFlight()
    clearPendingNemesisDrawFlight()
    state.cardMotionBatchActive = false
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
    state.pendingBoardCards = []
    state.discardRemaining = [...save.discardRemaining]
    state.discardTopDisplayOverride = null
    state.marketMode = save.game.scenario.marketSetup?.mode ?? 'manual'
    state.marketSlots = [...(save.game.scenario.marketSetup?.slots ?? DEFAULT_MARKET_SLOTS)]
    state.prepTarget = null
    state.exitPrompt = false
    state.endTurnWarningVisible = false
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
      continueNemesisTurn()
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
    state.exitPrompt = true
  }
}

export function cancelExit() {
  state.exitPrompt = false
}

function resetToSetup() {
  turnTransitionSequence++
  state.turnTransitionActive = false
  state.nemesisDrawRevealAnimating = false
  clearPendingAttachCardFlight()
  clearPendingNemesisDrawFlight()
  state.cardMotionBatchActive = false
  clearDamageImpacts()
  state.game = null
  state.phase = 'setup'
  state.activeSaveId = null
  autoSaveEnabled = false
  state.deleteSaveId = null
  state.deleteSaveIds = []
  state.exitPrompt = false
  state.endTurnWarningVisible = false
  state.pendingPreppedSpells = []
  state.pendingBoardCards = []
  state.prepTarget = null
  state.discardRemaining = []
  state.discardTopDisplayOverride = null
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
  state.selectedPlayer = id
  state.prepTarget = null
}

export function castSpell(breachIndex: number, spellIndex = 0) {
  const previous = beforeAction()
  const msg = engineCastSpell(state.game!, cp().id, breachIndex, spellIndex)
  if (msg) pushLog(msg, 'ok')
  // The nemesis may have been defeated — end the game immediately.
  if (state.game!.gameOver) {
    pushLog(checkGameOver(state.game!) ?? 'Game over', 'warn')
    state.phase = 'gameover'
    finishAction(previous)
    return
  }
  // Auto-advance to main phase once no more castable spells remain.
  if (getCastableSpells(state.game!, cp().id).length === 0) {
    pushLog('No more spells to cast — moving to main phase', 'info')
    enterMainPhase()
  }
  finishAction(previous)
}

export function toMainPhase() {
  if (!state.game || state.phase !== 'casting') return
  const must = getCastableSpells(state.game!, cp().id).filter(s => s.mustCast)
  if (must.length > 0) { pushLog('You must cast the [MUST] spell(s) first', 'warn'); return }
  const previous = beforeAction()
  enterMainPhase()
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

function clearPendingAttachCardFlight() {
  discardCardFlight(pendingAttachCardFlight?.flight ?? null)
  pendingAttachCardFlight = null
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
    return
  }

  state.cardMotionBatchActive = true
  state.nemesisDrawRevealAnimating = true
  void nextTick()
    .then(() => animateCardRevealFlight(
      pendingFlight.flight,
      document.querySelector<HTMLElement>('.nemesis-reveal-card'),
      cardImageUrl(decision.cardId),
    ))
    .finally(() => {
      state.cardMotionBatchActive = false
      state.nemesisDrawRevealAnimating = false
    })
}

function captureDamageTargetRects(): Map<string, DamageTargetRect> {
  const targets = new Map<string, DamageTargetRect>()
  if (typeof document === 'undefined') return targets
  for (const element of document.querySelectorAll<HTMLElement>('[data-damage-target]')) {
    const targetId = element.dataset.damageTarget
    if (!targetId) continue
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    targets.set(targetId, { left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  }
  return targets
}

function queueDamageImpacts(previous: UndoSnapshot) {
  const before = previous.game
  const after = state.game!
  const rects = damageTargetRects.get(previous) ?? new Map<string, DamageTargetRect>()

  const addImpact = (targetId: string, amount: number) => {
    if (amount <= 0) return
    const rect = rects.get(targetId)
    if (!rect) return
    const stackIndex = state.damageImpacts.filter(impact => impact.targetId === targetId).length
    const impact: DamageImpact = { id: ++damageImpactId, targetId, amount, ...rect, stackIndex }
    state.damageImpacts.push(impact)
    damageImpactTimers.set(impact.id, setTimeout(() => {
      state.damageImpacts = state.damageImpacts.filter(candidate => candidate.id !== impact.id)
      damageImpactTimers.delete(impact.id)
    }, DAMAGE_IMPACT_DURATION_MS))
  }

  const playersAfter = new Map(after.players.map(player => [player.id, player]))
  for (const playerBefore of before.players) {
    const playerAfter = playersAfter.get(playerBefore.id)
    if (playerAfter) addImpact(`player:${playerBefore.id}`, playerBefore.hp - playerAfter.hp)
  }
  addImpact('nemesis', before.nemesis.hp - after.nemesis.hp)
  addImpact('gravehold', before.gravehold.hp - after.gravehold.hp)

  const minionsAfter = new Map(after.nemesis.playArea
    .filter(card => card.cardType === 'minion')
    .map(card => [card.placedAt, card]))
  for (const minionBefore of before.nemesis.playArea.filter(card => card.cardType === 'minion')) {
    const minionAfter = minionsAfter.get(minionBefore.placedAt)
    const lifeBefore = Math.max(0, minionBefore.lifeTokens ?? 0)
    const lifeAfter = Math.max(0, minionAfter?.lifeTokens ?? 0)
    addImpact(`minion:${minionBefore.placedAt}`, lifeBefore - lifeAfter)
  }
}

function clearDamageImpacts() {
  for (const timer of damageImpactTimers.values()) clearTimeout(timer)
  damageImpactTimers.clear()
  state.damageImpacts = []
}

export function resolveDecision(answer: PendingDecisionAnswer) {
  if (!state.game?.pendingDecision) return
  if (state.game.pendingDecision.kind === 'confirm_nemesis_draw') state.nemesisDrawRevealAnimating = false
  const wasCasting = state.phase === 'casting'
  const wasInitialSetup = !state.game.currentTurn
  const wasCastingPhaseEnd = state.game.pendingEffect?.preppedPhase === 'casting_phase_end'
  const wasNemesisTurnWaiting = state.game.currentTurn === 'nemesis'
  const pendingDecision = state.game.pendingDecision
  const pendingEffect = state.game.pendingEffect
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
  const previous = completingAttachPlay ? null : beforeAction()
  const messages = engineResolvePendingDecision(state.game, state.game.pendingDecision.id, answer)
  for (const message of messages) {
    const warning = message.startsWith('Invalid') || message.startsWith('Stale') || message.startsWith('Choose ') || message.startsWith('Decision ')
    pushLog(message, warning ? 'warn' : 'info')
  }
  if (state.game.gameOver) {
    pushLog(checkGameOver(state.game) ?? 'Game over', 'warn')
    state.phase = 'gameover'
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
    continueNemesisTurn()
  } else if (!state.game.pendingDecision && state.game.currentTurn !== 'nemesis' && cp().drawPhaseSetupComplete) {
    finalizeDraw()
  } else if (!state.game.pendingDecision && wasCasting) {
    const noSpellsRemain = getCastableSpells(state.game, cp().id).length === 0
    if (wasCastingPhaseEnd || noSpellsRemain) enterMainPhase()
  } else if (!state.game.pendingDecision && state.phase === 'main') {
    resolveMainPhasePreppedEffects()
    maybeAutoEnd()
  }
  if (attachFlight) {
    const attached = state.game.players.some(player =>
      player.breaches.some(breach => breach.attachedRelic?.cardId === attachFlight.cardId))
    if (attached) {
      pendingAttachCardFlight = null
      void nextTick()
        .then(() => animateCardFlight(
          attachFlight.flight,
          findLastDataElement('data-attached-relic-id', attachFlight.cardId, document),
        ))
        .finally(() => { state.cardMotionBatchActive = false })
    } else {
      state.cardMotionBatchActive = false
      if (!state.game.pendingEffect?.sourceCardInHandPendingPlay) clearPendingAttachCardFlight()
    }
  }
  finishAction(previous)
}

export function playCard(cardIdx: number) {
  return playCardWithMotion(cardIdx)
}

async function playCardWithMotion(cardIdx: number) {
  const p = cp()
  const cardId = p.hand[cardIdx]
  if (!cardId || !state.game) return

  const cardType = getCard(cardId).type
  const flight = cardType === 'gem' || cardType === 'relic'
    ? captureCardFlight(findDataElement('data-hand-card-index', String(cardIdx)))
    : null
  const previous = beforeAction()
  const playedCount = p.playedThisTurn.length
  if (flight) state.cardMotionBatchActive = true

  try {
    const msg = enginePlayCard(state.game, p.id, cardId)
    if (msg) pushLog(msg)

    if (p.playedThisTurn.length > playedCount && flight) {
      await nextTick()
      await animateCardFlight(flight, findLastDataElement('data-played-card-id', cardId, document.querySelector('.played-zone-center') ?? document))
    } else if (flight && cardType === 'relic' && state.game.pendingEffect?.sourceCardInHandPendingPlay) {
      discardCardFlight(pendingAttachCardFlight?.flight ?? null)
      pendingAttachCardFlight = { ownerId: p.id, cardId, flight }
    } else {
      discardCardFlight(flight)
    }

    maybeAutoEnd()
    finishAction(previous)
  } finally {
    state.cardMotionBatchActive = false
  }
}

export function openPile(pile: 'deck' | 'discard') {
  closeDismissibleOverlays()
  state.viewPile = pile
}

/** Open the displayed player's face-down Mage-specific deck for inspection. */
export function openSpecificDeckPile() {
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
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_deck'
}

export function openNemesisDiscardPile() {
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_discard'
}

/** Open the currently configured Nemesis specific pile for inspection. */
export function openNemesisSpecificPile() {
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_specific'
}

export function openNemesisSpecificDiscardPile() {
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
  if (!state.game || state.game.pendingDecision || state.game.pendingEffect || !canActMain.value) return
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
      const flight = captureCardFlight(findDataElement('data-hand-card-index', String(handIndex)))
      const playedCount = p.playedThisTurn.length
      const msg = enginePlayCard(g, p.id, cardId)
      if (msg) pushLog(msg)

      if (p.playedThisTurn.length > playedCount && flight) {
        await nextTick()
        const target = findLastDataElement('data-played-card-id', cardId, document.querySelector('.played-zone-center') ?? document)
        await animateCardFlight(flight, target)
      } else {
        discardCardFlight(flight)
      }

      // An engine decision pauses the play-all action. Show it only after the
      // card that caused it has finished moving; remaining Gems stay in hand.
      if (g.pendingDecision || g.pendingEffect) break
    }
    maybeAutoEnd()
    finishAction(previous)
  } finally {
    state.cardMotionBatchActive = false
  }
}

export function prepSpell(cardIdx: number, breachIndex: number) {
  const p = cp()
  const previous = beforeAction()
  const msg = enginePrepSpell(state.game!, p.id, p.hand[cardIdx]!, breachIndex, cardIdx)
  if (msg) pushLog(msg, 'ok')
  state.prepTarget = null
  if (!msg && state.phase === 'main') resolveMainPhasePreppedEffects()
  maybeAutoEnd()
  finishAction(previous)
}

export function movePreppedSpell(
  sourceBreachIndex: number, sourceSpellIndex: number, targetBreachIndex: number, targetSpellIndex?: number,
) {
  if (!state.game || !canRepositionPrepped.value) return
  const previous = beforeAction()
  const msg = engineMovePreppedSpell(
    state.game, cp().id, sourceBreachIndex, sourceSpellIndex, targetBreachIndex, targetSpellIndex,
  )
  if (msg) pushLog(msg, msg.startsWith('Moved ') || msg.startsWith('Swapped ') ? 'ok' : 'warn')
  finishAction(previous)
}

export function returnPreppedSpellToHand(breachIndex: number, spellIndex: number) {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const msg = engineReturnPreppedSpellToHand(state.game, cp().id, breachIndex, spellIndex)
  if (msg) pushLog(msg, msg.startsWith('Returned ') ? 'ok' : 'warn')
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
  const cardId = game.market.piles[pileIdx]?.cardId
  const flight = cardId
    ? captureCardFlight(findDataElement('data-supply-card-id', cardId))
    : null
  const previous = beforeAction()
  const discardCount = player.discard.length
  if (flight) state.cardMotionBatchActive = true

  try {
    const msg = engineBuyCard(game, player.id, pileIdx)
    if (msg) pushLog(msg, 'ok')
    const gained = !!cardId && player.discard.length > discardCount && player.discard[0] === cardId
    if (gained && flight) {
      await nextTick()
      await animateCardFlight(flight, findLastDataElement('data-discard-top-card', cardId, document))
    } else {
      discardCardFlight(flight)
    }

    if (game.gameOver) {
      state.phase = 'gameover'
      finishAction(previous)
      return
    }
    maybeAutoEnd()
    finishAction(previous)
  } finally {
    state.cardMotionBatchActive = false
  }
}

export function focusBreach(breachIndex: number) {
  const previous = beforeAction()
  const msg = engineFocusBreach(state.game!, cp().id, breachIndex)
  if (msg) pushLog(msg, 'ok')
  maybeAutoEnd()
  finishAction(previous)
}

export function openBreach(breachIndex: number) {
  const previous = beforeAction()
  const msg = engineOpenBreach(state.game!, cp().id, breachIndex)
  if (msg) pushLog(msg, 'ok')
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
  while (state.discardRemaining.length > 0) {
    await moveDiscardPhaseCard(0)
  }
  pushLog('Remaining played cards are identical — discarded automatically', 'info')
  finalizeDraw()
}

/** Wave-specific artwork IDs for the basic Crystal and Spark represent the same cards. */
function discardOrderIdentity(cardId: string): string {
  const card = getCard(cardId)
  const normalizedName = card.name.trim().toLowerCase()
  if (card.type === 'gem' && normalizedName === 'crystal') return 'shared-basic-gem:crystal'
  if (card.type === 'spell' && normalizedName === 'spark') return 'shared-basic-spell:spark'
  return `card:${cardId}`
}

function areSameDiscardOrderCards(cardIds: readonly string[]): boolean {
  return new Set(cardIds.map(discardOrderIdentity)).size <= 1
}

async function moveDiscardPhaseCard(index: number) {
  const p = cp()
  const cardId = state.discardRemaining[index]
  if (!cardId) return
  const previousDiscardTop = p.discard[0] ?? null
  const flight = captureCardFlight(findDataElement(
    'data-discard-phase-card-index', String(index),
    document.querySelector('.played-zone-center') ?? document,
  ))
  state.discardTopDisplayOverride = { playerId: p.id, cardId: previousDiscardTop }
  state.discardRemaining.splice(index, 1)
  moveToDiscard(index)
  try {
    await nextTick()
    const destination = previousDiscardTop
      ? findLastDataElement('data-discard-top-card', previousDiscardTop, document)
      : document.querySelector<HTMLElement>('.player-discard-pile')
    await animateCardFlight(flight, destination, { hideDestination: false })
  } finally {
    state.discardTopDisplayOverride = null
    await nextTick()
  }
}

/** Core end-of-turn. Called by user action AND auto-end. */
function doEndTurn(recordDiscardUndoBoundary = true) {
  if (state.phase !== 'main' || !state.game) return
  const p = cp()
  if (p.playedThisTurn.length === 0) {
    finalizeDraw()
    return
  }
  // Keep a serializable snapshot for end-of-turn card triggers. The UI moves
  // played cards into discard before resolveDrawPhase runs, but effects such
  // as Pact Prism still need to inspect the cards played this turn.
  p.pendingEndTurnCardIds = [...p.playedThisTurn]
  if (areSameDiscardOrderCards(p.playedThisTurn)) {
    // All played cards are identical — order is irrelevant, skip the click step.
    const cards = [...p.playedThisTurn]
    p.playedThisTurn = []
    for (const cardId of cards) p.discard.unshift(cardId)
    pushLog('All played cards are identical — discarded automatically', 'info')
    finalizeDraw()
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
  if (state.phase !== 'main') return
  const previous = beforeAction()
  doEndTurn()
  finishAction(previous)
}

/** Request the end of Main Phase, warning first when legal actions remain. */
export function requestEndTurn() {
  if (state.phase !== 'main') return
  if (state.endTurnWarningVisible) {
    state.endTurnWarningVisible = false
    endTurn()
    return
  }
  if (playerCanAct.value) {
    state.endTurnWarningVisible = true
    return
  }
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
function continueNemesisTurn() {
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
  const messages = advanceNemesisTurn(g)
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

export const canRepositionPrepped = computed(() =>
  !!state.game
    && state.game.currentTurn !== 'nemesis'
    && isCurrentSelected.value
    && (state.phase === 'main' || state.phase === 'discard_order')
    && !state.game.pendingDecision
    && !state.game.pendingEffect,
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
export function developCard(source: 'supply' | 'develop_zone', index: number) {
  if (!state.game) return
  const previous = beforeAction()
  const playerId = state.selectedPlayer
  const message = source === 'supply'
    ? engineDevelopCardFromSupply(state.game, playerId, index)
    : engineDevelopCardFromZone(state.game, playerId, index)
  if (message) {
    const failed = message.startsWith('Need ') || message.startsWith('Develop is only') || message.startsWith('Pile empty') || message.startsWith('Develop zone card')
    pushLog(message, failed ? 'warn' : 'ok')
  }
  if (state.game.gameOver) {
    state.phase = 'gameover'
    finishAction(previous)
    return
  }
  maybeAutoEnd()
  finishAction(previous)
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
    movePreppedSpell, returnPreppedSpellToHand,
    endTurn, requestEndTurn, discardNemesisCard, undo, aetherInfo, toRoman,
    selectPlayer, clickDiscardCard, openPile, openSpecificDeckPile, openTrinketDeckPile, openPlayerCardsInPlayPile, openNemesisDeckPile, openNemesisDiscardPile, openNemesisSpecificPile, openNemesisSpecificDiscardPile, closePile,
    isPendingPreppedSpellSelected, togglePendingPreppedSpell, confirmPendingPreppedSpells, skipPendingPreppedSpells,
    isBoardCardSelectionActive, getBoardCardSelection, isPendingBoardCardSelected,
    togglePendingBoardCard, confirmPendingBoardCards, skipPendingBoardCards,
    castableSpells, buyables, playerCanAct,
    displayPlayer, isCurrentSelected, canActMain, canRepositionPrepped, canCast, preppedCardActions, playerCardInPlayActions, nemesisDiscardActions,
    canActivateAbilityInMain,
  }
}

