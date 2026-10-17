import type {
  DamageTargetRef, DamageTargetScope, GameState, LifeTargetRef, LifeTargetScope,
  PendingEffectResolution, PlayerSelectionRule, PlayerState, PlayerTargetRef, PlayerTargetScope,
} from '../types'
import { getCard, getNemesisDefinition, MAGES } from '../data'
import { isPresentBreach } from './breaches'
import { getPlayer } from './zones'
import { recordHealthChange } from './health-feedback'
import { finishGame } from './combat'

export function getLifeTargets(
  game: GameState, sourcePlayerId: string, scope: LifeTargetScope,
): LifeTargetRef[] {
  if (scope === 'nemesis') return [{ kind: 'nemesis' }]
  if (scope === 'gravehold') return [{ kind: 'gravehold' }]
  if (scope === 'self') {
    const player = getPlayer(game, sourcePlayerId)
    return player.exhausted ? [] : [{ kind: 'player', playerId: sourcePlayerId }]
  }
  if (scope === 'ally') {
    return game.players
      .filter(player => player.id !== sourcePlayerId && !player.exhausted)
      .map(player => ({ kind: 'player', playerId: player.id }))
  }
  return game.players
    .filter(player => !player.exhausted)
    .map(player => ({ kind: 'player', playerId: player.id }))
}

/** Resolve a source Minion to the active physical card copy when available. */
export function getSourceMinion(game: GameState, sourceCardId?: string) {
  const resolution = game.nemesisResolution
  const cardId = sourceCardId ?? resolution?.activeCardId
  if (!cardId) return undefined

  const activeInstanceId = resolution?.activeCardId === cardId
    ? resolution.activeCardInstanceId
    : undefined
  if (activeInstanceId) {
    return game.nemesis.playArea.find(card =>
      card.cardType === 'minion' && card.cardId === cardId &&
      (card.instanceId ?? `${card.cardId}:${card.placedAt}`) === activeInstanceId,
    )
  }
  const matches = game.nemesis.playArea.filter(card => card.cardType === 'minion' && card.cardId === cardId)
  return matches.length === 1 ? matches[0] : undefined
}

export function getPlayerTargets(
  game: GameState, sourcePlayerId: string, scope: PlayerTargetScope,
): PlayerTargetRef[] {
  if (scope === 'self') return [{ kind: 'player', playerId: sourcePlayerId }]
  if (scope === 'ally') {
    return game.players
      .filter(player => player.id !== sourcePlayerId)
      .map(player => ({ kind: 'player', playerId: player.id }))
  }
  return game.players.map(player => ({ kind: 'player', playerId: player.id }))
}

/** Keep fully resolvable targets when any exist; otherwise keep the targets with the greatest available amount. */
export function retainFullyResolvableOrMaximumTargets<T extends PlayerTargetRef>(
  targets: T[],
  requiredAmount: number,
  availableAmount: (target: T) => number,
): T[] {
  if (targets.length === 0) return []
  const required = Math.max(0, requiredAmount)
  const amounts = targets.map(target => Math.max(0, availableAmount(target)))
  const full = targets.filter((_, index) => amounts[index]! >= required)
  if (full.length > 0) return full
  const maximum = Math.max(...amounts)
  return targets.filter((_, index) => amounts[index] === maximum)
}

export function getSelectedPlayerTargets(
  game: GameState,
  sourcePlayerId: string,
  scope: PlayerTargetScope,
  selection?: PlayerSelectionRule,
): PlayerTargetRef[] {
  let targets = getPlayerTargets(game, sourcePlayerId, scope)
  if (!selection || targets.length === 0) return targets
  // Effects that choose the player with the lowest life never target an
  // exhausted Mage; explicit damage targets may still affect one.
  if (selection === 'lowest_hp') targets = targets.filter(target => !getPlayer(game, target.playerId).exhausted)
  if (targets.length === 0) return []
  const values = targets.map(target => {
    const player = getPlayer(game, target.playerId)
    if (selection === 'most_prepped_spells') {
      return player.breaches.reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    }
    if (selection === 'lowest_hp') return -player.hp
    if (selection === 'highest_hp') return player.hp
    if (selection === 'most_charges') return player.charge
    if (selection === 'fewest_cards_in_deck') return -player.deck.length
    if (selection === 'most_crystals') return player.hand.filter(cardId => {
      const card = getCard(cardId)
      return card.type === 'gem' && card.name.trim().toLowerCase() === 'crystal'
    }).length
    return player.breaches.filter(breach => isPresentBreach(breach) && breach.opened).length
  })
  const best = Math.max(...values)
  return targets.filter((_, index) => values[index] === best)
}

/** Resolve ally relative to the effect initiator, independently of card owner and target. */
export function effectTargetPlayerId(
  resolution: PendingEffectResolution,
  currentPlayerId: string,
  scope: PlayerTargetScope,
  relativeToSource = false,
): string {
  return relativeToSource || scope === 'ally'
    ? resolution.sourcePlayerId ?? currentPlayerId
    : currentPlayerId
}

export function getEffectPlayerTargets(
  game: GameState,
  resolution: PendingEffectResolution,
  currentPlayerId: string,
  scope: PlayerTargetScope,
  selection?: PlayerSelectionRule,
  relativeToSource = false,
): PlayerTargetRef[] {
  return getSelectedPlayerTargets(
    game,
    effectTargetPlayerId(resolution, currentPlayerId, scope, relativeToSource),
    scope,
    selection,
  )
}

export function getDoomOwner(game: GameState): PlayerState | undefined {
  return game.players.find(player => MAGES[player.mageType]?.tracksDoom)
}

export function getSelectedDamagePlayerTargets(
  game: GameState,
  sourcePlayerId: string,
  scope: PlayerTargetScope | 'doom_owner',
  selection?: PlayerSelectionRule,
): PlayerTargetRef[] {
  if (scope === 'doom_owner') {
    const player = getDoomOwner(game)
    return player ? [{ kind: 'player', playerId: player.id }] : []
  }
  return getSelectedPlayerTargets(game, sourcePlayerId, scope, selection)
}

export function gainLife(game: GameState, target: LifeTargetRef, amount: number): string | null {
  const value = Math.max(0, amount)
  if (target.kind === 'player') {
    const player = getPlayer(game, target.playerId)
    if (!player) return 'Invalid life target'
    if (player.exhausted) return `${player.mageType} cannot gain life while exhausted`
    const before = player.hp
    player.hp = Math.min(player.maxHp, before + value)
    const gained = player.hp - before
    recordHealthChange(game, { kind: 'healing', targetId: `player:${player.id}`, amount: gained })
    return `${player.mageType} gains ${gained} life (${player.hp}/${player.maxHp})`
  }

  if (target.kind === 'nemesis') {
    const before = game.nemesis.hp
    const hasNoMaximum = getNemesisDefinition(game.nemesis.definitionId)?.noLifeMaximum === true
    game.nemesis.hp = hasNoMaximum ? before + value : Math.min(game.nemesis.maxHp, before + value)
    const gained = game.nemesis.hp - before
    recordHealthChange(game, { kind: 'healing', targetId: 'nemesis', amount: gained })
    const lossThreshold = getNemesisDefinition(game.nemesis.definitionId)?.lifeLossThreshold
    if (lossThreshold != null && game.nemesis.hp >= lossThreshold) finishGame(game, 'nemesis')
    return `Nemesis gains ${gained} life (${game.nemesis.hp}/${game.nemesis.maxHp})`
  }

  const before = game.gravehold.hp
  game.gravehold.hp = Math.min(game.gravehold.maxHp, before + value)
  const gained = game.gravehold.hp - before
  recordHealthChange(game, { kind: 'healing', targetId: 'gravehold', amount: gained })
  return `Gravehold gains ${gained} life (${game.gravehold.hp}/${game.gravehold.maxHp})`
}

export function getDamageTargets(game: GameState, scope: DamageTargetScope, sourceCardId?: string): DamageTargetRef[] {
  const targets: DamageTargetRef[] = []
  if (scope === 'nemesis' || scope === 'nemesis_or_minion') {
    targets.push({ kind: 'nemesis', id: 'nemesis', label: 'Nemesis' })
  }
  if (scope === 'minion' || scope === 'nemesis_or_minion' || scope === 'source_minion') {
    const sourceMinion = scope === 'source_minion' ? getSourceMinion(game, sourceCardId) : undefined
    const minions = scope === 'source_minion'
      ? sourceMinion ? [sourceMinion] : []
      : game.nemesis.playArea
    for (const minion of minions) {
      if (minion.cardType !== 'minion') continue
      targets.push({
        kind: 'minion',
        id: `minion:${minion.placedAt}`,
        placedAt: minion.placedAt,
        cardId: minion.cardId,
        label: getCard(minion.cardId).name,
      })
    }
  }
  if (scope === 'gravehold') {
    targets.push({ kind: 'gravehold', id: 'gravehold', label: 'Gravehold' })
  }
  return targets
}

function damageTargetCurrentHealth(game: GameState, target: DamageTargetRef): number {
  if (target.kind === 'nemesis') return Math.max(0, game.nemesis.hp)
  if (target.kind === 'gravehold') return Math.max(0, game.gravehold.hp)
  const minion = game.nemesis.playArea.find(card =>
    card.cardType === 'minion' && card.placedAt === target.placedAt,
  )
  return Math.max(0, minion?.lifeTokens ?? 0)
}

export function automaticallyAllocateDamage(
  game: GameState, targets: DamageTargetRef[], amount: number,
): Record<string, number> {
  const ordered = targets
    .map((target, index) => ({ target, index, health: damageTargetCurrentHealth(game, target) }))
    .sort((left, right) => left.health - right.health || left.index - right.index)
  const allocations: Record<string, number> = {}
  let remaining = Math.max(0, Math.floor(amount))

  for (const { target, health } of ordered) {
    if (remaining <= 0) break
    const assigned = Math.min(remaining, health)
    if (assigned > 0) allocations[target.id] = assigned
    remaining -= assigned
  }

  // Keep excess damage assigned after all targets' current life is covered.
  if (remaining > 0) {
    const overflowTarget = targets.find(target => target.kind === 'nemesis') ?? ordered[ordered.length - 1]?.target
    if (overflowTarget) allocations[overflowTarget.id] = (allocations[overflowTarget.id] ?? 0) + remaining
  }
  return allocations
}
