import type {
  BreachChoice, CardEffectBlock, CardEffectCondition, CardEffectTrigger,
  CardZone, GameState, PendingEffectResolution, PlayerState, PreppedSpellChoice,
} from '../types'
import { getCard, MAGES } from '../data'
import { isPresentBreach } from './breaches'
import { MAX_PULSE_TOKENS, ensurePlayerCollections } from './player-state'
import { getZoneCards } from './player-state'
import { getSpendableAether } from './aether'
import { getDevelopZoneCards, getPlayer } from './zones'
import { getDoomOwner, getSelectedPlayerTargets } from './targets'

export interface EffectConditionServices {
  hasRecallChoices(game: GameState, sourcePlayerId?: string): boolean
  getPreppedSpellChoices(game: GameState): PreppedSpellChoice[]
  getBreachChoices(
    game: GameState,
    target: 'self' | 'ally' | 'any_player',
    playerId: string,
  ): BreachChoice[]
  findPlayerCardInPlayIndex(player: PlayerState, cardId: string, preferredIndex?: number): number
  playerCardSupplyTarget(player: PlayerState, cardIndex: number): number | null
}

export function conditionMatches(
  game: GameState,
  playerId: string | undefined,
  condition: CardEffectCondition | undefined,
  resolution: PendingEffectResolution | undefined,
  sourceCardId: string | undefined,
  sourceCardIndex: number | undefined,
  sourcePlayerId: string | undefined,
  pendingPlayCardId: string | undefined,
  services: EffectConditionServices,
): boolean {
  if (!condition) return true
  if (condition.kind === 'all_of') {
    return condition.conditions.every(item => conditionMatches(
      game, playerId, item, resolution, sourceCardId, sourceCardIndex, sourcePlayerId, pendingPlayCardId, services,
    ))
  }
  if (condition.kind === 'develop_zone_card_count') {
    const cardId = condition.cardId === 'source'
      ? sourceCardId ?? resolution?.sourceCardId
      : condition.cardId
    if (!cardId) return false
    const count = getDevelopZoneCards(game).filter(candidate => candidate === cardId).length
    return condition.comparison === 'equals' ? count === condition.count : count >= condition.count
  }
  if (condition.kind === 'last_selection_nonempty') return (resolution?.lastSelectedCardCount ?? 0) > 0
  if (condition.kind === 'last_optional_accepted') return resolution?.lastOptionalAccepted === true
  if (condition.kind === 'has_recall_in_any_discard') {
    return services.hasRecallChoices(game, resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId)
  }
  if (condition.kind === 'has_last_selected_card_cost') {
    const value = resolution?.lastSelectedCardCost ?? 0
    if (condition.comparison === 'equals') return value === condition.amount
    if (condition.comparison === 'at_most') return value <= condition.amount
    if (condition.comparison === 'greater_than') return value > condition.amount
    return value >= condition.amount
  }
  if (condition.kind === 'nemesis_discard_minion_count') {
    const value = game.nemesis.discard.filter(cardId => getCard(cardId).type === 'minion').length
    if (condition.comparison === 'equals') return value === condition.amount
    if (condition.comparison === 'at_most') return value <= condition.amount
    if (condition.comparison === 'greater_than') return value > condition.amount
    return value >= condition.amount
  }
  if (condition.kind === 'nemesis_turn_order_discard_count') {
    const value = game.turnOrderDiscard.filter(cardId => cardId === 'nemesis').length
    return condition.comparison === 'equals' ? value === condition.count : value >= condition.count
  }
  if (condition.kind === 'has_player_turn_order_card') {
    return Boolean(playerId && game.turnOrderDiscard.some(cardId => cardId === playerId))
  }
  if (condition.kind === 'has_doom') {
    return (getDoomOwner(game)?.doomTokens ?? 0) >= Math.max(0, condition.amount)
  }
  if (condition.kind === 'player_relation_to_source') {
    if (!playerId || !sourcePlayerId) return false
    return condition.relation === 'same'
      ? playerId === sourcePlayerId
      : playerId !== sourcePlayerId && game.players.some(player => player.id === sourcePlayerId)
  }
  if (!playerId) return false
  const player = getPlayer(game, playerId)
  if (condition.kind === 'mage_form_is') {
    const targetId = condition.player === 'source'
      ? resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
      : playerId
    return getPlayer(game, targetId).mageFormSide === condition.form
  }
  if (condition.kind === 'has_ally_prepped_spell') {
    return services.getPreppedSpellChoices(game).some(choice => choice.playerId !== (resolution?.sourcePlayerId ?? playerId))
  }
  if (condition.kind === 'has_prepped_spell') {
    const sourceId = resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
    return services.getPreppedSpellChoices(game).some(choice =>
      condition.ownerScope !== 'ally' || choice.playerId !== sourceId,
    )
  }
  if (condition.kind === 'spells_cast_this_turn') {
    const value = player.spellsCastThisTurn ?? 0
    return condition.comparison === 'equals' ? value === condition.count : value >= condition.count
  }
  if (condition.kind === 'has_opened_breach') {
    const targetContext = condition.target === 'ally'
      ? resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
      : playerId
    return getSelectedPlayerTargets(game, targetContext, condition.target).some(target =>
      getPlayer(game, target.playerId).breaches.some(breach =>
        isPresentBreach(breach) && breach.opened &&
        (!condition.breachIndices || condition.breachIndices.includes(breach.index)),
      ),
    )
  }
  if (condition.kind === 'has_eligible_card_in_zone') {
    const sourceId = resolution?.sourcePlayerId ?? sourcePlayerId
    const targets = condition.target === 'source'
      ? sourceId ? [{ kind: 'player' as const, playerId: sourceId }] : []
      : getSelectedPlayerTargets(game,
        condition.target === 'ally' ? sourceId ?? playerId : playerId,
        condition.target ?? 'self')
    return targets.some(target => {
      const owner = getPlayer(game, target.playerId)
      const zones: CardZone[] = condition.zone === 'hand_or_discard'
        ? ['hand', 'discard']
        : [condition.zone]
      return zones.some(zone => getZoneCards(owner, zone).some(cardId => {
        const card = getCard(cardId)
        return condition.cardTypes.includes(card.type) &&
          card.cost >= (condition.minimumCost ?? 0) &&
          (condition.treasureLevel === undefined || card.treasureLevel === condition.treasureLevel)
      }))
    })
  }
  if (condition.kind === 'has_unopened_breach') {
    return player.breaches.some(breach => isPresentBreach(breach) && !breach.opened)
  }
  if (condition.kind === 'all_breaches_opened') {
    const present = player.breaches.filter(isPresentBreach)
    return present.length > 0 && present.every(breach => breach.opened)
  }
  if (condition.kind === 'has_charge') return player.charge >= Math.max(0, condition.amount)
  if (condition.kind === 'has_pulse_token_capacity') return (player.pulseTokens ?? 0) < MAX_PULSE_TOKENS
  if (condition.kind === 'has_focusable_breach') {
    return services.getBreachChoices(game, condition.target, playerId).length > 0
  }
  if (condition.kind === 'has_knowledge') {
    const targetId = condition.player === 'source'
      ? resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
      : playerId
    return (getPlayer(game, targetId).knowledge ?? 0) >= Math.max(0, condition.amount)
  }
  if (condition.kind === 'has_pulse_tokens') {
    const targetId = condition.player === 'source'
      ? resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
      : playerId
    return (getPlayer(game, targetId).pulseTokens ?? 0) >= Math.max(0, condition.amount)
  }
  if (condition.kind === 'has_aether') return getSpendableAether(player, 'general') >= Math.max(0, condition.amount)
  if (condition.kind === 'has_card_in_zone') {
    return getZoneCards(player, condition.zone).some(cardId =>
      (!condition.cardType || getCard(cardId).type === condition.cardType) &&
      (!condition.cardId || cardId === condition.cardId),
    )
  }
  if (condition.kind === 'zone_card_count') {
    const count = getZoneCards(player, condition.zone).filter(cardId =>
      (!condition.cardId || cardId === condition.cardId) &&
      (!condition.cardType || getCard(cardId).type === condition.cardType),
    ).length
    if (condition.comparison === 'equals') return count === condition.count
    if (condition.comparison === 'at_most') return count <= condition.count
    if (condition.comparison === 'greater_than') return count > condition.count
    return count >= condition.count
  }
  if (condition.kind === 'has_affordable_card_in_specific_deck') {
    const targetId = condition.player === 'source'
      ? resolution?.sourcePlayerId ?? sourcePlayerId ?? playerId
      : playerId
    const target = getPlayer(game, targetId)
    const resource = condition.payment === 'knowledge' ? target.knowledge ?? 0 : 0
    return (target.specificDeck ?? []).some(cardId => {
      const card = getCard(cardId)
      return card.type === condition.cardType && card.cost <= resource
    })
  }
  if (condition.kind === 'has_installed_breach_upgrade') {
    const owner = resolution?.pendingSpellCast
      ? getPlayer(game, resolution.pendingSpellCast.playerId)
      : player
    const breach = owner.breaches.find(item => item.index === condition.breachIndex)
    return (breach?.installedUpgrades?.length ?? 0) > 0
  }
  if (condition.kind === 'has_card_in_hand') {
    return player.hand.some(cardId => getCard(cardId).type === condition.cardType)
  }
  if (condition.kind === 'hand_card_count') {
    const count = player.hand.filter(cardId => {
      const card = getCard(cardId)
      return condition.cardTypes.includes(card.type as 'gem' | 'relic' | 'spell') && card.cost >= condition.minCost
    }).length
    return condition.comparison === 'equals' ? count === condition.count : count >= condition.count
  }
  if (condition.kind === 'set_supply_pile_empty') {
    if (!sourceCardId || sourceCardIndex === undefined) return false
    const sourceOwner = getPlayer(game, sourcePlayerId ?? playerId)
    const index = services.findPlayerCardInPlayIndex(sourceOwner, sourceCardId, sourceCardIndex)
    const pileIndex = index < 0 ? null : services.playerCardSupplyTarget(sourceOwner, index)
    return pileIndex !== null && (game.market.piles[pileIndex]?.remaining ?? 0) <= 0
  }
  if (condition.kind === 'supply_pile_empty') {
    const pile = game.market.piles.find(candidate => candidate.cardId === condition.cardId)
    return !pile || pile.remaining <= 0
  }
  let value = 0
  let expected = 0
  if (condition.kind === 'card_play_count_this_turn') {
    ensurePlayerCollections(player)
    value = player.cardPlayCountsThisTurn[condition.cardId] ?? 0
    if (condition.cardId === pendingPlayCardId) value++
    expected = condition.count
  } else if (condition.kind === 'open_breach_count') {
    value = player.breaches.filter(breach => isPresentBreach(breach) && breach.opened).length
    expected = condition.count
  } else if (condition.kind === 'prepped_spell_count') {
    value = player.breaches
      .filter(isPresentBreach)
      .reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    expected = condition.count
  }
  if (condition.comparison === 'equals') return value === expected
  if (condition.comparison === 'at_most') return value <= expected
  if (condition.comparison === 'greater_than') return value > expected
  return value >= expected
}

export function matchingBlocks(
  cardId: string,
  playerId: string,
  game: GameState,
  trigger: CardEffectTrigger,
  sourceCardIndex: number | undefined,
  conditionPlayerId: string,
  pendingPlayCardId: string | undefined,
  effectSourcePlayerId: string,
  services: EffectConditionServices,
): CardEffectBlock[] {
  return (getCard(cardId).effects ?? []).filter(block => {
    if (block.trigger.kind !== trigger.kind) return false
    if (block.trigger.kind === 'while_prepped' && trigger.kind === 'while_prepped') {
      if (block.trigger.phase !== trigger.phase) return false
    }
    if (block.trigger.kind === 'while_in_play' && trigger.kind === 'while_in_play') {
      if (block.trigger.phase !== trigger.phase) return false
    }
    const blockEffectPlayerId = block.effectPlayerScope === 'owner' ? playerId : conditionPlayerId
    return conditionMatches(
      game, blockEffectPlayerId, block.condition, undefined, cardId, sourceCardIndex,
      effectSourcePlayerId, pendingPlayCardId, services,
    )
  })
}
