import { reactive, computed, watch } from 'vue'
import {
  createGame, startTurn, getPlayer,
  getCastableSpells, castSpell as engineCastSpell,
  playCard as enginePlayCard, prepSpell as enginePrepSpell,
  movePreppedSpell as engineMovePreppedSpell,
  returnPreppedSpellToHand as engineReturnPreppedSpellToHand,
  getBuyableCards, buyCard as engineBuyCard, buySpecificPileCard as engineBuySpecificPileCard,
  focusBreach as engineFocusBreach, openBreachDirect as engineOpenBreach,
  gainCharge as engineGainCharge, activateAbility as engineActivateAbility,
  resolveDrawPhase, getTotalAether, getAllRemainingConditional,
  getConditionalAetherByType,
  resolvePreppedEffects,
  getPreppedCardActions, activatePreppedCardAction as engineActivatePreppedCardAction,
  activatePreppedSpellAction as engineActivatePreppedSpellAction,
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

export type UiPhase = 'setup' | 'casting' | 'main' | 'discard_order' | 'nemesis_main' | 'nemesis_draw' | 'gameover'

export interface LogEntry { id: number; text: string; kind: 'info' | 'ok' | 'warn' }

interface Snapshot {
  game: GameState
  phase: UiPhase
  prepTarget: number | null
  selectedPlayer: PlayerId
  discardRemaining: string[]
}

export interface SaveSummary {
  id: string
  players: string[]
  nemesisType: string
  round: number
  turn: number
  currentTurn: string
  updatedAt: number
}

interface StoredSave extends SaveSummary {
  createdAt: number
  game: GameState
  phase: UiPhase
  selectedPlayer: PlayerId
  discardRemaining: string[]
  /** The most recent undo snapshots, persisted so resume keeps Ctrl+Z history. */
  undoStack: Snapshot[]
}

interface BoardCardSelection {
  playerId: PlayerId
  choice: CardChoice
}

let logId = 0

const state = reactive({
  game: null as GameState | null,
  phase: 'setup' as UiPhase,
  log: [] as LogEntry[],
  prepTarget: null as number | null, // hand index of the spell being prepped
  selectedPlayer: '' as PlayerId,
  discardRemaining: [] as string[], // played cards not yet clicked during discard phase
  viewPile: null as 'deck' | 'discard' | 'nemesis_specific' | null,
  // Lets component-local, dismissible overlays close before a pile viewer opens.
  dismissibleOverlayVersion: 0,
  debugOpen: false,
  helpOpen: false,
  hasSave: false,
  saves: [] as SaveSummary[],
  activeSaveId: null as string | null,
  deleteSaveId: null as string | null,
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

const SAVE_KEY = 'aeons-end-saves-v3'
let storedSaves: StoredSave[] = []
// A newly started game must not become a save record until the player chooses
// Save & Exit. Resumed games keep the existing auto-save behavior.
let autoSaveEnabled = false

function displayName(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id
}

const undoStack: Snapshot[] = []
const MAX_UNDO = 10

function saveSummary(save: StoredSave): SaveSummary {
  const currentPlayer = save.game.players.find(player => player.id === save.currentTurn)
  return {
    id: save.id,
    players: save.players.map(displayName),
    nemesisType: displayName(save.nemesisType),
    round: save.round,
    turn: save.turn,
    currentTurn: currentPlayer ? displayName(currentPlayer.mageType) : 'Nemesis',
    updatedAt: save.updatedAt,
  }
}

function syncSaveList() {
  storedSaves.sort((a, b) => b.updatedAt - a.updatedAt)
  state.saves = storedSaves.map(saveSummary)
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
      choice.zone === 'hand' || choice.zone === 'played_this_turn')
  }
  if (decision?.kind === 'select_collective_cards') {
    return decision.candidates.length > 0 && decision.candidates.every(item =>
      item.choice.zone === 'hand' || item.choice.zone === 'played_this_turn')
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

  if (decision.kind === 'choose_one' && state.game?.pendingEffect?.awaiting?.kind === 'review_top_cards') {
    return state.game.pendingEffect.reviewingTopCard?.playerId ?? null
  }

  return null
}

/** Return a board-resident hand or played-card candidate, if this card is selectable now. */
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
  if (decision.max === 1) resolveDecision({ kind: 'select_prepped_spells', choices: next })
}

export function confirmPendingPreppedSpells(): void {
  const decision = state.game?.pendingDecision
  if (decision?.kind !== 'select_prepped_spells') return
  if (state.pendingPreppedSpells.length < decision.min || state.pendingPreppedSpells.length > decision.max) return
  resolveDecision({ kind: 'select_prepped_spells', choices: [...state.pendingPreppedSpells] })
}

function readStoredSaves(): StoredSave[] {
  try {
    const current = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    if (!Array.isArray(current)) return []
    return current.filter(save => {
      const game = save?.game
      return save?.id
        && game?.scenario?.id === 'two_player'
        && game.players?.every((player: PlayerState) => /^wave\d+_[A-Z0-9_-]+$/.test(player.id))
    })
  } catch {
    return []
  }
}

function persistStoredSaves() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(storedSaves))
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
  save.players = state.game.players.map(player => displayName(player.mageType))
  save.nemesisType = displayName(state.game.nemesis.type)
  save.round = state.game.round
  save.turn = state.game.turnOrderDiscard.length
  save.currentTurn = state.game.currentTurn
  save.game = JSON.parse(JSON.stringify(state.game)) as GameState
  save.phase = state.phase
  save.selectedPlayer = state.selectedPlayer
  save.discardRemaining = [...state.discardRemaining]
  save.undoStack = undoStack.map(cloneSnapshot)
  persistStoredSaves()
}

storedSaves = readStoredSaves()
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
  state.log.push({ id: ++logId, text, kind })
}

function cp(): PlayerState {
  return getPlayer(state.game!, state.game!.currentTurn)
}

/** Tracks the displayed Aether breakdown: regular vs conditional. */
function aetherInfo(p: PlayerState) {
  const total = getTotalAether(p)
  const remainingConditional = getAllRemainingConditional(p)
  const conditionalTypes = new Set([
    ...Object.keys(remainingConditional),
    ...Object.keys(p.condAetherSpent),
  ])
  let conditionalEarned = 0
  for (const type of conditionalTypes) {
    conditionalEarned += getConditionalAetherByType(p, type)
  }
  const regularAvail = Math.max(0, (total - conditionalEarned) - p.regularAetherSpent)
  const conds: Record<string, number> = {}
  for (const [k, v] of Object.entries(remainingConditional)) {
    if (v > 0) conds[k] = v
  }
  let condAvail = 0
  for (const v of Object.values(conds)) condAvail += v
  return {
    total,
    available: regularAvail + condAvail,
    regularAvail,
    gemAether: conds['gem'] ?? 0,
    spellAether: conds['spell'] ?? 0,
    conds,
  }
}

// ===== Undo (Ctrl+Z, max 10 steps) =====

function snapshot(): Snapshot {
  return {
    game: JSON.parse(JSON.stringify(state.game)) as GameState,
    phase: state.phase,
    prepTarget: state.prepTarget,
    selectedPlayer: state.selectedPlayer,
    discardRemaining: [...state.discardRemaining],
  }
}

function cloneSnapshot(source: Snapshot): Snapshot {
  return {
    game: JSON.parse(JSON.stringify(source.game)) as GameState,
    phase: source.phase,
    prepTarget: source.prepTarget,
    selectedPlayer: source.selectedPlayer,
    discardRemaining: Array.isArray(source.discardRemaining) ? [...source.discardRemaining] : [],
  }
}

function beforeAction(): Snapshot | null {
  if (!state.game) return null
  const previous = snapshot()
  undoStack.push(previous)
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  return previous
}

function finishAction(previous: Snapshot | null) {
  if (!previous || !state.game) return
  if (state.game.gameOver) state.phase = 'gameover'
  const current = snapshot()
  const unchanged = JSON.stringify(previous.game) === JSON.stringify(current.game)
    && previous.phase === current.phase
    && previous.prepTarget === current.prepTarget
    && previous.selectedPlayer === current.selectedPlayer
    && JSON.stringify(previous.discardRemaining) === JSON.stringify(current.discardRemaining)
  if (unchanged) undoStack.pop()
}

export function undo() {
  const s = undoStack.pop()
  if (!s || !state.game) { pushLog('Nothing to undo', 'warn'); return }
  state.game = reactive(s.game) as GameState
  state.phase = s.phase
  state.pendingPreppedSpells = []
  state.pendingBoardCards = []
  state.prepTarget = s.prepTarget
  state.selectedPlayer = s.selectedPlayer
  state.discardRemaining = [...s.discardRemaining]
  state.helpOpen = false
  state.viewPile = null
  state.endTurnWarningVisible = false
  pushLog('Undid last action')
}

// ===== Auto-end turn when no actions remain =====

function maybeAutoEnd() {
  if (state.phase !== 'main' || !state.game) return
  if (state.game.pendingDecision) return
  if (!playerCanAct.value) {
    pushLog('No actions available — turn ends automatically', 'info')
    doEndTurn()
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

function beginTurn() {
  const g = state.game!
  if (g.gameOver) { state.phase = 'gameover'; return }
  const turnNum = g.turnOrderDiscard.length
  if (g.currentTurn === 'nemesis') {
    pushLog(`Turn ${turnNum} — ${g.nemesis.name.toUpperCase()} begins`, 'warn')
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
    continueNemesisTurn()
  } else {
    const p = getPlayer(g, g.currentTurn)
    pushLog(`Turn ${turnNum} — ${displayName(p.mageType)} begins`, 'info')
    state.selectedPlayer = g.currentTurn
    if (g.pendingDecision || getCastableSpells(g, g.currentTurn).length > 0) state.phase = 'casting'
    else enterMainPhase()
  }
}

export function newGame(
  m1: string,
  m2: string,
  nemesisType = state.nemesisType,
  nemesisDifficulty = state.nemesisDifficulty,
  marketSetup: MarketSetupConfig = { mode: state.marketMode, slots: [...state.marketSlots] },
) {
  state.activeSaveId = null
  autoSaveEnabled = false
  state.exitPrompt = false
  state.endTurnWarningVisible = false
  state.nemesisType = nemesisType
  state.nemesisDifficulty = nemesisDifficulty
  const scenario = createTwoPlayerScenario([m1, m2], nemesisType, nemesisDifficulty, marketSetup)
  const g = reactive(createGame(scenario)) as GameState
  state.game = g
  state.log = []
  state.pendingPreppedSpells = []
  state.pendingBoardCards = []
  state.prepTarget = null
  state.selectedPlayer = g.players[0]!.id
  state.discardRemaining = []
  state.marketMode = scenario.marketSetup?.mode ?? defaultMarketSetup().mode
  state.marketSlots = [...(scenario.marketSetup?.slots ?? DEFAULT_MARKET_SLOTS)]
  state.helpOpen = false
  state.viewPile = null
  undoStack.length = 0
  pushLog(`Game started: ${m1.toUpperCase()} + ${m2.toUpperCase()} vs ${g.nemesis.name} (${nemesisDifficulty})`, 'ok')
  if (g.pendingDecision) {
    state.phase = 'casting'
    pushLog('Complete the Nemesis setup before the first turn begins', 'info')
    return
  }
  startTurn(g)
  beginTurn()
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
    state.game = reactive(JSON.parse(JSON.stringify(save.game)) as GameState) as GameState
    state.activeSaveId = save.id
    autoSaveEnabled = true
    state.phase = save.phase
    syncEnginePhaseWithUi()
    state.selectedPlayer = save.selectedPlayer
    state.pendingPreppedSpells = []
    state.pendingBoardCards = []
    state.discardRemaining = [...save.discardRemaining]
    state.marketMode = save.game.scenario.marketSetup?.mode ?? 'manual'
    state.marketSlots = [...(save.game.scenario.marketSetup?.slots ?? DEFAULT_MARKET_SLOTS)]
    state.prepTarget = null
    state.exitPrompt = false
    state.endTurnWarningVisible = false
    state.log = []
    undoStack.length = 0
    for (const savedSnapshot of save.undoStack) undoStack.push(cloneSnapshot(savedSnapshot))
    if (undoStack.length > MAX_UNDO) undoStack.splice(0, undoStack.length - MAX_UNDO)
    pushLog('Game resumed', 'ok')
    return true
  } catch {
    return false
  }
}

export function clearSaves() {
  storedSaves = []
  localStorage.removeItem(SAVE_KEY)
  state.activeSaveId = null
  state.deleteSaveId = null
  syncSaveList()
}

/** Backward-compatible alias for the debug panel. */
export function clearSave() {
  clearSaves()
}

export function requestDeleteSave(saveId: string) {
  if (storedSaves.some(save => save.id === saveId)) state.deleteSaveId = saveId
}

export function cancelDeleteSave() {
  state.deleteSaveId = null
}

export function deleteSave(saveId: string) {
  if (state.deleteSaveId !== saveId) return
  storedSaves = storedSaves.filter(save => save.id !== saveId)
  if (storedSaves.length === 0) {
    localStorage.removeItem(SAVE_KEY)
  } else {
    persistStoredSaves()
  }
  syncSaveList()
  state.deleteSaveId = null
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
  state.game = null
  state.phase = 'setup'
  state.activeSaveId = null
  autoSaveEnabled = false
  state.deleteSaveId = null
  state.exitPrompt = false
  state.endTurnWarningVisible = false
  state.pendingPreppedSpells = []
  state.pendingBoardCards = []
  state.prepTarget = null
  state.discardRemaining = []
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
  const must = getCastableSpells(state.game!, cp().id).filter(s => s.mustCast)
  if (must.length > 0) { pushLog('You must cast the [MUST] spell(s) first', 'warn'); return }
  enterMainPhase()
}

export function resolveDecision(answer: PendingDecisionAnswer) {
  if (!state.game?.pendingDecision) return
  const wasCasting = state.phase === 'casting'
  const wasInitialSetup = !state.game.currentTurn
  const wasCastingPhaseEnd = state.game.pendingEffect?.preppedPhase === 'casting_phase_end'
  const wasNemesisTurnWaiting = state.game.currentTurn === 'nemesis'
  const previous = beforeAction()
  const messages = engineResolvePendingDecision(state.game, state.game.pendingDecision.id, answer)
  for (const message of messages) {
    const warning = message.startsWith('Invalid') || message.startsWith('Stale') || message.startsWith('Choose ') || message.startsWith('Decision ')
    pushLog(message, warning ? 'warn' : 'info')
  }
  if (state.game.gameOver) {
    pushLog(checkGameOver(state.game) ?? 'Game over', 'warn')
    state.phase = 'gameover'
  } else if (!state.game.pendingDecision && wasInitialSetup) {
    pushLog('Nemesis setup complete — first turn begins', 'ok')
    startTurn(state.game)
    beginTurn()
  } else if (!state.game.pendingDecision && wasCasting) {
    const noSpellsRemain = getCastableSpells(state.game, cp().id).length === 0
    if (wasCastingPhaseEnd || noSpellsRemain) enterMainPhase()
  } else if (!state.game.pendingDecision && state.phase === 'main') {
    resolveMainPhasePreppedEffects()
    maybeAutoEnd()
  } else if (!state.game.pendingDecision && wasNemesisTurnWaiting) {
    continueNemesisTurn()
  }
  finishAction(previous)
}

export function playCard(cardIdx: number) {
  const p = cp()
  const previous = beforeAction()
  const cardId = p.hand[cardIdx]!
  const msg = enginePlayCard(state.game!, p.id, cardId)
  if (msg) pushLog(msg)
  maybeAutoEnd()
  finishAction(previous)
}

export function openPile(pile: 'deck' | 'discard') {
  closeDismissibleOverlays()
  state.viewPile = pile
}

/** Open the currently configured face-up Nemesis specific pile for inspection. */
export function openNemesisSpecificPile() {
  closeDismissibleOverlays()
  state.viewPile = 'nemesis_specific'
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

export function playAllGems() {
  const g = state.game!
  const p = cp()
  const previous = beforeAction()
  for (const id of [...p.hand]) {
    if (getCard(id).type === 'gem') {
      const msg = enginePlayCard(g, p.id, id)
      if (msg) pushLog(msg)
      if (g.pendingDecision) break
    }
  }
  maybeAutoEnd()
  finishAction(previous)
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

export function buyCard(pileIdx: number) {
  const previous = beforeAction()
  const msg = engineBuyCard(state.game!, cp().id, pileIdx)
  if (msg) pushLog(msg, 'ok')
  if (state.game!.gameOver) {
    state.phase = 'gameover'
    finishAction(previous)
    return
  }
  maybeAutoEnd()
  finishAction(previous)
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
  for (const m of resolveDrawPhase(g, p.id)) pushLog(m)
  const over = checkGameOver(g)
  if (over) { pushLog(over, 'warn'); state.phase = 'gameover'; return }
  startTurn(g)
  beginTurn()
}

/** Discard every remaining played card (they are all identical). */
function autoDiscardRemaining() {
  const p = cp()
  const cards = [...state.discardRemaining]
  state.discardRemaining = []
  for (const cardId of cards) {
    const i = p.playedThisTurn.indexOf(cardId)
    if (i !== -1) p.playedThisTurn.splice(i, 1)
    p.discard.unshift(cardId)
  }
  pushLog('Remaining played cards are identical — discarded automatically', 'info')
  finalizeDraw()
}

/** Core end-of-turn. Called by user action AND auto-end. */
function doEndTurn() {
  if (state.phase !== 'main' || !state.game) return
  const p = cp()
  if (p.playedThisTurn.length === 0) {
    finalizeDraw()
    return
  }
  if (new Set(p.playedThisTurn).size === 1) {
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

export function clickDiscardCard(index: number) {
  if (state.phase !== 'discard_order') return
  if (index < 0 || index >= state.discardRemaining.length) return
  state.discardRemaining.splice(index, 1)
  moveToDiscard(index)
  if (state.discardRemaining.length === 0) {
    finalizeDraw()
    return
  }
  // If the remaining played cards are all identical, discard them automatically.
  if (new Set(state.discardRemaining).size === 1) {
    autoDiscardRemaining()
  }
}

/** Continue the serializable Nemesis state machine after a UI decision. */
function continueNemesisTurn() {
  const g = state.game
  if (!g || g.currentTurn !== 'nemesis' || g.pendingDecision || g.pendingEffect) return
  // A completed effect frame may have already finished this Nemesis turn.
  // startTurn() owns creation of the next serializable Nemesis resolution.
  if (!g.nemesisResolution) {
    startTurn(g)
    beginTurn()
    return
  }
  const messages = advanceNemesisTurn(g)
  for (const message of messages) pushLog(message, 'warn')
  if (g.pendingDecision || g.pendingEffect) {
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
    return
  }
  if (g.gameOver) {
    state.phase = 'gameover'
    return
  }
  if (!g.nemesisResolution) {
    startTurn(g)
    beginTurn()
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

export function useGame() {
  return {
    state,
    rerollMarketTemplate,
    newGame, resumeGame, clearSave, clearSaves,
    requestDeleteSave, cancelDeleteSave, deleteSave,
    requestExit, cancelExit, saveAndExit, exitWithoutSaving,
    returnToMainMenu,
    toggleDebug, toggleHelp, closeHelp, castSpell, toMainPhase, resolveDecision, playCard, playAllGems, prepSpell,
    buyCard, buyNemesisSpecificTopCard, focusBreach, openBreach, gainCharge, activateAbility, activatePreppedCardAction,
    activatePreppedSpellAction,
    movePreppedSpell, returnPreppedSpellToHand,
    endTurn, requestEndTurn, discardNemesisCard, undo, aetherInfo, toRoman,
    selectPlayer, clickDiscardCard, openPile, openNemesisSpecificPile, closePile,
    isPendingPreppedSpellSelected, togglePendingPreppedSpell, confirmPendingPreppedSpells,
    isBoardCardSelectionActive, getBoardCardSelection, isPendingBoardCardSelected,
    togglePendingBoardCard, confirmPendingBoardCards, skipPendingBoardCards,
    castableSpells, buyables, playerCanAct,
    displayPlayer, isCurrentSelected, canActMain, canRepositionPrepped, canCast, preppedCardActions, nemesisDiscardActions,
    canActivateAbilityInMain,
  }
}

