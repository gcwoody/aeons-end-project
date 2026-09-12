import { reactive, computed, watch } from 'vue'
import {
  createGame, startTurn, getPlayer,
  getCastableSpells, castSpell as engineCastSpell,
  playCard as enginePlayCard, prepSpell as enginePrepSpell,
  getBuyableCards, buyCard as engineBuyCard,
  focusBreach as engineFocusBreach, openBreachDirect as engineOpenBreach,
  gainCharge as engineGainCharge, activateAbility as engineActivateAbility,
  resolveDrawPhase, getTotalAether, getAllRemainingConditional,
  getConditionalAetherByType,
  resolvePreppedEffects,
  getPreppedCardActions, activatePreppedCardAction as engineActivatePreppedCardAction,
  resolvePendingDecision as engineResolvePendingDecision,
  canPlayerAct, canActivateAbilityDuringMain, toRoman,
  advanceNemesisTurn, getNemesisDiscardActions, discardNemesisPower,
  nemesisDrawCard, nemesisResolveAttack,
  checkGameOver, checkPlayerDeath,
} from '@engine/engine'
import { getCard } from '@engine/data'
import type { CardChoice, GameState, PendingDecisionAnswer, PlayerState, PreppedSpellChoice } from '@engine/types'

export type UiPhase = 'setup' | 'casting' | 'main' | 'discard_order' | 'nemesis_main' | 'nemesis_draw' | 'nemesis_target' | 'gameover'

export interface LogEntry { id: number; text: string; kind: 'info' | 'ok' | 'warn' }

export interface DrawnCard {
  cardId: string
  cardName: string
  tier: number
  damage: number
}

interface Snapshot {
  game: GameState
  phase: UiPhase
  pendingNemesis: DrawnCard | null
  prepTarget: number | null
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
  selectedPlayer: 'p1' | 'p2'
  pendingNemesis: DrawnCard | null
  discardRemaining: string[]
}

let logId = 0

const state = reactive({
  game: null as GameState | null,
  phase: 'setup' as UiPhase,
  log: [] as LogEntry[],
  pendingNemesis: null as DrawnCard | null,
  prepTarget: null as number | null, // hand index of the spell being prepped
  selectedPlayer: 'p1' as 'p1' | 'p2',
  discardRemaining: [] as string[], // played cards not yet clicked during discard phase
  viewPile: null as 'deck' | 'discard' | null,
  debugOpen: false,
  helpOpen: false,
  hasSave: false,
  saves: [] as SaveSummary[],
  activeSaveId: null as string | null,
  deleteSaveId: null as string | null,
  pendingPreppedSpells: [] as PreppedSpellChoice[],
  exitPrompt: false,
  mage1: 'jian',
  mage2: 'brama',
})

const SAVE_KEY = 'aeons-end-saves-v2'
const LEGACY_SAVE_KEY = 'aeons-end-save-v1'
let storedSaves: StoredSave[] = []
// A newly started game must not become a save record until the player chooses
// Save & Exit. Resumed games keep the existing auto-save behavior.
let autoSaveEnabled = false

function displayName(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id
}

const undoStack: Snapshot[] = []
const MAX_UNDO = 5

/** Fill fields introduced by newer engine versions when loading an older save. */
function normalizeSavedGame(game: GameState): GameState {
  game.pendingDecision ??= null
  game.pendingEffect ??= null
  game.decisionCounter ??= 0
  game.damagePrevention ??= false
  for (const player of game.players) {
    player.destroyedCards ??= []
    player.conditionalAetherEarned ??= {}
    if (!player.cardPlayCountsThisTurn) {
      player.cardPlayCountsThisTurn = {}
      for (const cardId of player.playedThisTurn) {
        player.cardPlayCountsThisTurn[cardId] = (player.cardPlayCountsThisTurn[cardId] ?? 0) + 1
      }
    }
    player.turnEffects ??= { nextBreachCostReductions: [], usedPreppedEffects: [], prepSpellLimit: 1 }
    player.turnEffects.nextBreachCostReductions ??= []
    player.turnEffects.usedPreppedEffects ??= []
    player.turnEffects.prepSpellLimit ??= 1
    for (const breach of player.breaches) {
      const legacy = breach as typeof breach & { prepSpell?: string | null }
      breach.prepSpells ??= legacy.prepSpell ? [legacy.prepSpell] : []
      delete legacy.prepSpell
    }
  }
  return game
}

function saveSummary(save: StoredSave): SaveSummary {
  return {
    id: save.id,
    players: save.players.map(displayName),
    nemesisType: displayName(save.nemesisType),
    round: save.round,
    turn: save.turn,
    currentTurn: save.currentTurn,
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
    state.pendingPreppedSpells = state.pendingPreppedSpells.filter(selected =>
      preppedSpellChoiceKey(selected) !== preppedSpellChoiceKey(candidate))
    return
  }
  if (state.pendingPreppedSpells.length >= decision.max) return
  state.pendingPreppedSpells.push(candidate)
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
    if (Array.isArray(current)) return current.filter(save => save?.game && save?.id)
  } catch {
    // Fall back to the legacy single-save format.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY) ?? 'null')
    if (!legacy?.game) return []
    const game = normalizeSavedGame(legacy.game as GameState)
    const now = Date.now()
    return [{
      id: `legacy-${game.timestamp || now}`,
      createdAt: now,
      updatedAt: now,
      players: game.players.map(player => player.mageType),
      nemesisType: game.nemesis.type,
      round: game.round,
      turn: game.turnOrderDiscard.length,
      currentTurn: game.currentTurn,
      game,
      phase: legacy.phase ?? 'main',
      selectedPlayer: legacy.selectedPlayer ?? 'p1',
      pendingNemesis: legacy.pendingNemesis ?? null,
      discardRemaining: legacy.discardRemaining ?? [],
    }]
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
      pendingNemesis: null,
      discardRemaining: [],
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
  save.pendingNemesis = state.pendingNemesis ? { ...state.pendingNemesis } : null
  save.discardRemaining = [...state.discardRemaining]
  persistStoredSaves()
}

storedSaves = readStoredSaves()
syncSaveList()

// Persist resumed games (and UI context) to localStorage on any change.
watch(
  () => (state.game ? JSON.stringify({
    game: state.game, phase: state.phase, selectedPlayer: state.selectedPlayer,
    pendingNemesis: state.pendingNemesis, discardRemaining: state.discardRemaining,
  }) : ''),
  (s) => {
    if (s) saveCurrentGame()
  },
)

watch(
  () => state.game?.pendingDecision?.id,
  () => { state.pendingPreppedSpells = [] },
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
  return { total, available: regularAvail + condAvail, regularAvail, gemAether: conds['gem'] ?? 0, conds }
}

// ===== Undo (Ctrl+Z, max 5 steps) =====

function snapshot(): Snapshot {
  return {
    game: JSON.parse(JSON.stringify(state.game)) as GameState,
    phase: state.phase,
    pendingNemesis: state.pendingNemesis ? { ...state.pendingNemesis } : null,
    prepTarget: state.prepTarget,
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
  const current = snapshot()
  const unchanged = JSON.stringify(previous.game) === JSON.stringify(current.game)
    && previous.phase === current.phase
    && JSON.stringify(previous.pendingNemesis) === JSON.stringify(current.pendingNemesis)
  if (unchanged) undoStack.pop()
}

export function undo() {
  const s = undoStack.pop()
  if (!s || !state.game) { pushLog('Nothing to undo', 'warn'); return }
  state.game = reactive(s.game) as GameState
  state.phase = s.phase
  state.pendingNemesis = s.pendingNemesis
  state.pendingPreppedSpells = []
  state.prepTarget = null
  state.discardRemaining = []
  state.helpOpen = false
  state.viewPile = null
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
  state.phase = 'main'
  // Ability activation is validated by the engine, so persist the phase
  // transition before main-phase actions become available.
  syncEnginePhaseWithUi()
  resolveMainPhasePreppedEffects()
  maybeAutoEnd()
}

// ===== Flow =====

function beginTurn() {
  const g = state.game!
  if (g.gameOver) { state.phase = 'gameover'; return }
  const turnNum = g.turnOrderDiscard.length
  if (g.currentTurn === 'nemesis') {
    pushLog(`Turn ${turnNum} — RAGEBORNE begins`, 'warn')
    state.phase = g.currentPhase === 'nemesis_draw' ? 'nemesis_draw' : 'nemesis_main'
    continueNemesisTurn()
  } else {
    const p = getPlayer(g, g.currentTurn)
    pushLog(`Turn ${turnNum} — ${g.currentTurn.toUpperCase()} (${p.mageType}) begins`, 'info')
    state.selectedPlayer = g.currentTurn as 'p1' | 'p2'
    if (g.pendingDecision || getCastableSpells(g, g.currentTurn).length > 0) state.phase = 'casting'
    else enterMainPhase()
  }
}

export function newGame(m1: string, m2: string) {
  state.activeSaveId = null
  autoSaveEnabled = false
  state.exitPrompt = false
  const g = reactive(createGame(m1, m2)) as GameState
  state.game = g
  state.log = []
  state.pendingNemesis = null
  state.pendingPreppedSpells = []
  state.prepTarget = null
  state.selectedPlayer = 'p1'
  state.discardRemaining = []
  state.helpOpen = false
  state.viewPile = null
  undoStack.length = 0
  pushLog(`Game started: ${m1.toUpperCase()} + ${m2.toUpperCase()} vs Rageborne`, 'ok')
  startTurn(g)
  beginTurn()
}

/** Restore a selected saved game from localStorage. */
export function resumeGame(saveId?: string): boolean {
  const save = storedSaves.find(candidate => candidate.id === saveId)
    ?? storedSaves[0]
  if (!save) return false
  try {
    state.game = reactive(normalizeSavedGame(JSON.parse(JSON.stringify(save.game)) as GameState)) as GameState
    state.activeSaveId = save.id
    autoSaveEnabled = true
    state.phase = save.phase ?? 'main'
    syncEnginePhaseWithUi()
    state.selectedPlayer = save.selectedPlayer ?? 'p1'
    state.pendingNemesis = save.pendingNemesis ?? null
    state.pendingPreppedSpells = []
    state.discardRemaining = save.discardRemaining ?? []
    state.prepTarget = null
    state.exitPrompt = false
    state.log = []
    undoStack.length = 0
    pushLog('Game resumed', 'ok')
    return true
  } catch {
    return false
  }
}

export function clearSaves() {
  storedSaves = []
  localStorage.removeItem(SAVE_KEY)
  localStorage.removeItem(LEGACY_SAVE_KEY)
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
    localStorage.removeItem(LEGACY_SAVE_KEY)
  } else {
    persistStoredSaves()
  }
  syncSaveList()
  state.deleteSaveId = null
}

export function requestExit() {
  if (state.game) state.exitPrompt = true
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
  state.pendingNemesis = null
  state.pendingPreppedSpells = []
  state.prepTarget = null
  state.discardRemaining = []
  state.helpOpen = false
  state.viewPile = null
  state.debugOpen = false
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

export function selectPlayer(id: 'p1' | 'p2') {
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
  state.viewPile = pile
}

export function closePile() {
  state.viewPile = null
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

export function activatePreppedCardAction(choice: CardChoice) {
  if (!state.game || !canActMain.value) return
  const previous = beforeAction()
  const msg = engineActivatePreppedCardAction(state.game, cp().id, choice)
  if (msg) pushLog(msg, msg.startsWith('Returned ') ? 'ok' : 'warn')
  maybeAutoEnd()
  finishAction(previous)
}

export function buyCard(pileIdx: number) {
  const previous = beforeAction()
  const msg = engineBuyCard(state.game!, cp().id, pileIdx)
  if (msg) pushLog(msg, 'ok')
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

function moveToDiscard(cardId: string) {
  const p = cp()
  const i = p.playedThisTurn.indexOf(cardId)
  if (i !== -1) p.playedThisTurn.splice(i, 1)
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

export function clickDiscardCard(cardId: string) {
  if (state.phase !== 'discard_order') return
  const idx = state.discardRemaining.indexOf(cardId)
  if (idx === -1) return
  state.discardRemaining.splice(idx, 1)
  moveToDiscard(cardId)
  if (state.discardRemaining.length === 0) {
    finalizeDraw()
    return
  }
  // If the remaining played cards are all identical, discard them automatically.
  if (new Set(state.discardRemaining).size === 1) {
    autoDiscardRemaining()
  }
}

function nemesisReveal() {
  const g = state.game!
  const card = nemesisDrawCard(g)
  if (!card) {
    pushLog('Nemesis deck is empty — no card drawn this turn', 'warn')
    startTurn(g)
    beginTurn()
    return
  }
  state.pendingNemesis = card
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

export function nemesisChooseTarget(target: 'p1' | 'p2' | 'gravehold') {
  const g = state.game!
  const card = state.pendingNemesis
  if (!card) return
  const previous = beforeAction()
  const msg = nemesisResolveAttack(g, target, card.damage)
  pushLog(`Nemesis attacks ${target}: ${msg}`, 'warn')
  if (target !== 'gravehold') {
    const d = checkPlayerDeath(g, target)
    if (d) pushLog(d, 'warn')
  }
  state.pendingNemesis = null
  const over = checkGameOver(g)
  if (over) {
    pushLog(over, 'warn')
    state.phase = 'gameover'
    finishAction(previous)
    return
  }
  startTurn(g)
  beginTurn()
  finishAction(previous)
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

export function useGame() {
  return {
    state,
    newGame, resumeGame, clearSave, clearSaves,
    requestDeleteSave, cancelDeleteSave, deleteSave,
    requestExit, cancelExit, saveAndExit, exitWithoutSaving,
    returnToMainMenu,
    toggleDebug, toggleHelp, closeHelp, castSpell, toMainPhase, resolveDecision, playCard, playAllGems, prepSpell,
    buyCard, focusBreach, openBreach, gainCharge, activateAbility, activatePreppedCardAction,
    endTurn, nemesisChooseTarget, discardNemesisCard, undo, aetherInfo, toRoman,
    selectPlayer, clickDiscardCard, openPile, closePile,
    isPendingPreppedSpellSelected, togglePendingPreppedSpell, confirmPendingPreppedSpells,
    castableSpells, buyables, playerCanAct,
    displayPlayer, isCurrentSelected, canActMain, canCast, preppedCardActions, nemesisDiscardActions,
    canActivateAbilityInMain,
  }
}

