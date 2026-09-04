import { reactive, computed, watch } from 'vue'
import {
  createGame, startTurn, getPlayer,
  getCastableSpells, castSpell as engineCastSpell,
  playCard as enginePlayCard, prepSpell as enginePrepSpell,
  getBuyableCards, buyCard as engineBuyCard,
  focusBreach as engineFocusBreach, openBreachDirect as engineOpenBreach,
  gainCharge as engineGainCharge, activateAbility as engineActivateAbility,
  resolveDrawPhase, drawFromDeck, getTotalAether, getAllRemainingConditional,
  canPlayerAct, toRoman,
  nemesisDrawCard, nemesisResolveAttack,
  checkGameOver, checkPlayerDeath,
} from '@engine/engine'
import { getCard } from '@engine/data'
import type { GameState, PlayerState, GemCard, RelicCard } from '@engine/types'

export type UiPhase = 'setup' | 'casting' | 'main' | 'discard_order' | 'nemesis_target' | 'gameover'

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

let logId = 0

const state = reactive({
  game: null as GameState | null,
  phase: 'setup' as UiPhase,
  log: [] as LogEntry[],
  pendingNemesis: null as DrawnCard | null,
  prepTarget: null as number | null, // hand index of the spell being prepped
  selectedPlayer: 'p1' as 'p1' | 'p2',
  discardRemaining: [] as string[], // played cards not yet clicked during discard phase
  pendingRelic: null as { drawn: string[]; discardCount: number; selected: number[] } | null,
  viewPile: null as 'deck' | 'discard' | null,
  debugOpen: false,
  hasSave: false,
  mage1: 'jian',
  mage2: 'brama',
})

const SAVE_KEY = 'aeons-end-save-v1'
state.hasSave = !!localStorage.getItem(SAVE_KEY)

const undoStack: Snapshot[] = []
const MAX_UNDO = 5

// Auto-persist the game (and UI context) to localStorage on any change.
watch(
  () => (state.game ? JSON.stringify({
    game: state.game, phase: state.phase, selectedPlayer: state.selectedPlayer,
    pendingNemesis: state.pendingNemesis, discardRemaining: state.discardRemaining,
    pendingRelic: state.pendingRelic,
  }) : ''),
  (s) => {
    if (s) { localStorage.setItem(SAVE_KEY, s); state.hasSave = true }
  },
)

function pushLog(text: string, kind: LogEntry['kind'] = 'info') {
  state.log.push({ id: ++logId, text, kind })
}

function cp(): PlayerState {
  return getPlayer(state.game!, state.game!.currentTurn)
}

/** Replicates the CLI aether display: regular vs conditional, tracked separately. */
function aetherInfo(p: PlayerState) {
  if (state.phase !== 'main') {
    return { total: 0, available: 0, regularAvail: 0, gemAether: 0, conds: {} }
  }
  const total = getTotalAether(p)
  let origCond = 0
  for (const id of p.playedThisTurn) {
    const c = getCard(id) as GemCard
    if (c.type === 'gem' && c.conditionalAether) origCond += c.conditionalAether.amount
  }
  const regularAvail = Math.max(0, (total - origCond) - p.regularAetherSpent)
  const conds: Record<string, number> = {}
  for (const [k, v] of Object.entries(getAllRemainingConditional(p))) {
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
  state.prepTarget = null
  state.discardRemaining = []
  state.pendingRelic = null
  state.viewPile = null
  pushLog('Undid last action')
}

// ===== Auto-end turn when no actions remain =====

function maybeAutoEnd() {
  if (state.phase !== 'main' || !state.game) return
  if (!playerCanAct.value) {
    pushLog('No actions available — turn ends automatically', 'info')
    doEndTurn()
  }
}

// ===== Flow =====

function beginTurn() {
  const g = state.game!
  if (g.gameOver) { state.phase = 'gameover'; return }
  const turnNum = g.turnOrderDiscard.length
  if (g.currentTurn === 'nemesis') {
    pushLog(`Turn ${turnNum} — RAGEBORNE begins`, 'warn')
    state.phase = 'nemesis_target'
    nemesisReveal()
  } else {
    const p = getPlayer(g, g.currentTurn)
    pushLog(`Turn ${turnNum} — ${g.currentTurn.toUpperCase()} (${p.mageType}) begins`, 'info')
    state.selectedPlayer = g.currentTurn as 'p1' | 'p2'
    state.phase = getCastableSpells(g, g.currentTurn).length > 0 ? 'casting' : 'main'
    if (state.phase === 'main' && !playerCanAct.value) {
      pushLog('No actions available — turn ends automatically', 'info')
      doEndTurn()
    }
  }
}

export function newGame(m1: string, m2: string) {
  const g = reactive(createGame(m1, m2)) as GameState
  state.game = g
  state.log = []
  state.pendingNemesis = null
  state.prepTarget = null
  state.selectedPlayer = 'p1'
  state.discardRemaining = []
  state.pendingRelic = null
  state.viewPile = null
  undoStack.length = 0
  pushLog(`Game started: ${m1.toUpperCase()} + ${m2.toUpperCase()} vs Rageborne`, 'ok')
  startTurn(g)
  beginTurn()
}

/** Restore a previously saved game from localStorage. */
export function resumeGame(): boolean {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return false
  try {
    const data = JSON.parse(raw)
    if (!data?.game) return false
    state.game = reactive(data.game) as GameState
    state.phase = data.phase ?? 'main'
    state.selectedPlayer = data.selectedPlayer ?? 'p1'
    state.pendingNemesis = data.pendingNemesis ?? null
    state.discardRemaining = data.discardRemaining ?? []
    state.pendingRelic = data.pendingRelic
      ? { ...data.pendingRelic, selected: data.pendingRelic.selected ?? [] }
      : null
    state.prepTarget = null
    state.log = []
    undoStack.length = 0
    pushLog('Game resumed', 'ok')
    return true
  } catch {
    return false
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY)
  state.hasSave = false
}

export function toggleDebug() {
  state.debugOpen = !state.debugOpen
}

export function selectPlayer(id: 'p1' | 'p2') {
  state.selectedPlayer = id
  state.prepTarget = null
}

export function castSpell(breachIndex: number) {
  const previous = beforeAction()
  const msg = engineCastSpell(state.game!, cp().id, breachIndex)
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
    state.phase = 'main'
    maybeAutoEnd()
  }
  finishAction(previous)
}

export function toMainPhase() {
  const must = getCastableSpells(state.game!, cp().id).filter(s => s.mustCast)
  if (must.length > 0) { pushLog('You must cast the [MUST] spell(s) first', 'warn'); return }
  state.phase = 'main'
  maybeAutoEnd()
}

export function playCard(cardIdx: number) {
  const p = cp()
  const previous = beforeAction()
  const cardId = p.hand[cardIdx]!
  const card = getCard(cardId)
  const msg = enginePlayCard(state.game!, p.id, cardId)
  if (msg) pushLog(msg)
  if (card.type === 'relic') {
    const relic = card as RelicCard
    const result = drawFromDeck(p.deck, p.discard, relic.drawCount)
    p.deck = result.newDeck
    p.discard = result.newDiscard
    if (result.drawn.length > 0) {
      p.hand.push(...result.drawn)
      state.pendingRelic = { drawn: result.drawn, discardCount: relic.discardCount, selected: [] }
      pushLog(`Relic ${relic.name}: drew ${result.drawn.length} — discard ${relic.discardCount}`, 'info')
    } else {
      pushLog(`Relic ${relic.name}: nothing to draw`, 'warn')
      maybeAutoEnd()
    }
  } else {
    maybeAutoEnd()
  }
  finishAction(previous)
}

/** Discard the chosen drawn relic cards; the rest go to the player's hand. */
export function relicDiscard(selectedIdx: number[]) {
  if (!state.pendingRelic) return
  const p = cp()
  const { drawn } = state.pendingRelic
  const drawnStart = p.hand.length - drawn.length
  for (const i of [...selectedIdx].sort((a, b) => b - a)) {
    const cardId = drawn[i]
    if (cardId === undefined) continue
    p.hand.splice(drawnStart + i, 1)
    p.discard.unshift(cardId)
  }
  state.pendingRelic = null
  maybeAutoEnd()
}

export function toggleRelicDiscard(handIndex: number) {
  if (!state.pendingRelic) return
  const p = cp()
  const drawnStart = p.hand.length - state.pendingRelic.drawn.length
  const drawnIndex = handIndex - drawnStart
  if (drawnIndex < 0 || drawnIndex >= state.pendingRelic.drawn.length) return
  const selected = state.pendingRelic.selected
  const existing = selected.indexOf(drawnIndex)
  if (existing !== -1) {
    selected.splice(existing, 1)
    return
  }
  if (selected.length >= state.pendingRelic.discardCount) return
  selected.push(drawnIndex)
  if (selected.length === state.pendingRelic.discardCount) relicDiscard([...selected])
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
    }
  }
  maybeAutoEnd()
  finishAction(previous)
}

export function prepSpell(cardIdx: number, breachIndex: number) {
  const p = cp()
  const previous = beforeAction()
  const msg = enginePrepSpell(state.game!, p.id, p.hand[cardIdx]!, breachIndex)
  if (msg) pushLog(msg, 'ok')
  state.prepTarget = null
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

export function activateAbility(target?: string) {
  const previous = beforeAction()
  const msg = engineActivateAbility(state.game!, cp().id, target)
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

export function useGame() {
  return {
    state,
    newGame, resumeGame, clearSave, toggleDebug, castSpell, toMainPhase, playCard, playAllGems, prepSpell,
    buyCard, focusBreach, openBreach, gainCharge, activateAbility,
    endTurn, nemesisChooseTarget, undo, aetherInfo, toRoman,
    selectPlayer, clickDiscardCard, relicDiscard, toggleRelicDiscard, openPile, closePile,
    castableSpells, buyables, playerCanAct,
    displayPlayer, isCurrentSelected, canActMain, canCast,
  }
}

