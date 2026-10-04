import type { GameState, PlayerId } from '@engine/types'
import { displayMageName } from './display-name'

export type UiPhase = 'setup' | 'casting' | 'main' | 'discard_order' | 'nemesis_main' | 'nemesis_draw' | 'gameover'

export interface UndoSnapshot {
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

export interface StoredSave extends SaveSummary {
  createdAt: number
  game: GameState
  phase: UiPhase
  selectedPlayer: PlayerId
  discardRemaining: string[]
  /** The most recent undo snapshots, persisted so resume keeps Ctrl+Z history. */
  undoStack: UndoSnapshot[]
}

export const SAVE_KEY = 'aeons-end-saves-v3'

interface SnapshotParts {
  game: GameState
  phase: UiPhase
  prepTarget: number | null
  selectedPlayer: PlayerId
  discardRemaining: string[]
}

/** Create an isolated undo snapshot so later game mutations cannot alter history. */
export function createUndoSnapshot(parts: SnapshotParts): UndoSnapshot {
  return {
    game: cloneGameState(parts.game),
    phase: parts.phase,
    prepTarget: parts.prepTarget,
    selectedPlayer: parts.selectedPlayer,
    discardRemaining: [...parts.discardRemaining],
  }
}

/** Clone snapshots when moving them between live history and stored saves. */
export function cloneUndoSnapshot(source: UndoSnapshot): UndoSnapshot {
  return {
    game: cloneGameState(source.game),
    phase: source.phase,
    prepTarget: source.prepTarget,
    selectedPlayer: source.selectedPlayer,
    discardRemaining: Array.isArray(source.discardRemaining) ? [...source.discardRemaining] : [],
  }
}

export function undoSnapshotsEqual(left: UndoSnapshot, right: UndoSnapshot): boolean {
  return JSON.stringify(left.game) === JSON.stringify(right.game)
    && left.phase === right.phase
    && left.prepTarget === right.prepTarget
    && left.selectedPlayer === right.selectedPlayer
    && JSON.stringify(left.discardRemaining) === JSON.stringify(right.discardRemaining)
}

/** Read valid saves while ignoring malformed or unsupported localStorage data. */
export function readGameSaves(storage: Pick<Storage, 'getItem'>): StoredSave[] {
  try {
    const current = JSON.parse(storage.getItem(SAVE_KEY) ?? 'null')
    if (!Array.isArray(current)) return []
    return current.filter(save => {
      const game = save?.game
      return save?.id
        && game?.scenario?.id === 'two_player'
        && game.players?.every((player: GameState['players'][number]) => /^wave\d+_[A-Z0-9_-]+$/.test(player.id))
    })
  } catch {
    return []
  }
}

export function writeGameSaves(storage: Pick<Storage, 'setItem'>, saves: StoredSave[]): void {
  storage.setItem(SAVE_KEY, JSON.stringify(saves))
}

export function clearGameSaves(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(SAVE_KEY)
}

export function cloneGameState(game: GameState): GameState {
  return JSON.parse(JSON.stringify(game)) as GameState
}

export function summarizeGameSave(save: StoredSave): SaveSummary {
  const currentPlayer = save.game.players.find(player => player.id === save.currentTurn)
  return {
    id: save.id,
    players: save.players.map(displayMageName),
    nemesisType: displayMageName(save.nemesisType),
    round: save.round,
    turn: save.turn,
    currentTurn: currentPlayer ? displayMageName(currentPlayer.mageType) : 'Nemesis',
    updatedAt: save.updatedAt,
  }
}
