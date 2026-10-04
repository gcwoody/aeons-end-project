import type { PlayerState } from '../types'
import { ensurePlayerCollections, getPlayerTurnEffects } from './player-state'

export type SpendType = 'gem' | 'spell' | 'relic' | 'breach' | 'gain' | 'general'

export function getTotalAether(player: PlayerState): number {
  ensurePlayerCollections(player)
  const conditionalEarned = Object.values(player.conditionalAetherEarned ?? {})
    .reduce((sum, amount) => sum + amount, 0)
  return conditionalEarned + player.bonusAether + (player.aetherTokens ?? 0)
}

/** Total conditional aether of a specific type earned this turn. */
export function getConditionalAetherByType(player: PlayerState, type: string): number {
  return player.conditionalAetherEarned?.[type] ?? 0
}

/** Remaining unspent conditional aether of a given type. */
export function getRemainingConditionalAether(player: PlayerState, type: string): number {
  return Math.max(0, getConditionalAetherByType(player, type) - (player.condAetherSpent[type] ?? 0))
}

/** All remaining conditional aether, keyed by type. */
export function getAllRemainingConditional(player: PlayerState): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [type, amount] of Object.entries(player.conditionalAetherEarned ?? {})) {
    result[type] = amount
  }
  for (const [type, spent] of Object.entries(player.condAetherSpent)) {
    result[type] = Math.max(0, (result[type] ?? 0) - spent)
  }
  return result
}

function getAllConditionalAether(player: PlayerState): number {
  return Object.values(player.conditionalAetherEarned ?? {})
    .reduce((sum, amount) => sum + amount, 0)
}

export function getSpendableAether(player: PlayerState, type: SpendType): number {
  ensurePlayerCollections(player)
  const totalConditional = getAllConditionalAether(player)
  const tokens = Math.max(0, player.aetherTokens ?? 0)
  const regularTotal = getTotalAether(player) - totalConditional - tokens
  const regularAvailable = Math.max(0, regularTotal - (player.regularAetherSpent ?? 0))
  if (type === 'general') return regularAvailable + tokens
  const conditionTypes = type === 'gain'
    ? ['gem', 'spell', 'relic', 'gain']
    : type === 'breach'
      ? ['breach']
      : [type, 'gain']
  const conditionalAvailable = conditionTypes.reduce((sum, condition) =>
    sum + Math.max(0, getConditionalAetherByType(player, condition) - (player.condAetherSpent[condition] ?? 0)), 0)
  return regularAvailable + conditionalAvailable + tokens
}

export function spendAether(player: PlayerState, amount: number, type: SpendType): void {
  const tokenSpent = Math.min(Math.max(0, player.aetherTokens ?? 0), Math.max(0, amount))
  player.aetherTokens = Math.max(0, (player.aetherTokens ?? 0) - tokenSpent)
  const remaining = Math.max(0, amount - tokenSpent)
  if (type !== 'general') {
    const conditionTypes = type === 'gain'
      ? ['gem', 'spell', 'relic', 'gain']
      : type === 'breach'
        ? ['breach']
        : [type, 'gain']
    let amountToSpend = remaining
    for (const condition of conditionTypes) {
      const available = Math.max(0,
        getConditionalAetherByType(player, condition) - (player.condAetherSpent[condition] ?? 0),
      )
      const spent = Math.min(available, amountToSpend)
      player.condAetherSpent[condition] = (player.condAetherSpent[condition] ?? 0) + spent
      amountToSpend -= spent
      if (amountToSpend === 0) break
    }
    player.regularAetherSpent += amountToSpend
  } else {
    player.regularAetherSpent += remaining
  }
}

export function breachCostReduction(player: PlayerState, action: 'focus' | 'open'): number {
  return getPlayerTurnEffects(player).nextBreachCostReductions
    .filter(reduction => reduction.actions.includes(action))
    .reduce((total, reduction) => total + reduction.amount, 0)
}

export function consumeBreachCostReductions(player: PlayerState, action: 'focus' | 'open'): void {
  const effects = getPlayerTurnEffects(player)
  effects.nextBreachCostReductions = effects.nextBreachCostReductions
    .filter(reduction => !reduction.actions.includes(action))
}
