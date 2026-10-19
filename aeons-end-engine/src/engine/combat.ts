import type { DamageTargetRef, GameState, NemesisCardDef } from '../types'
import { getCard, getNemesisDefinition } from '../data'
import { isPresentBreach } from './breaches'
import { getPlayer } from './zones'
import { insertCardInstanceAt } from './card-instances'
import { recordHealthChange } from './health-feedback'
import { getNemesisRules } from '../nemesis/registry'
import {
  destroyCardFromZone, getBreachAttachedRelicZone, getBreachCardInstanceZone,
  getNemesisCardInstanceZone, getPlayerCardInstanceZone, moveCardBetweenZones, recordCardMove,
} from './card-movement'

export function damageNemesis(game: GameState, amount: number, sourceCardId?: string): void {
  const definition = getNemesisDefinition(game.nemesis.definitionId)
  const allowedSources = definition?.damageOnlyFromCardIds
  const allowedValue = allowedSources && !allowedSources.includes(sourceCardId ?? '')
    ? 0
    : Math.max(0, amount)
  const value = getNemesisRules(definition?.rulesModuleId ?? game.nemesis.definitionId)
    ?.modifyDamageTaken?.(game, allowedValue, sourceCardId) ?? allowedValue
  if (value > 0) recordHealthChange(game, { kind: 'damage', targetId: 'nemesis', amount: value })
  game.nemesis.hp -= value
  if (game.nemesis.hp <= 0) {
    game.nemesis.hp = 0
    finishGame(game, 'players')
  }
}

/** Deal damage to a resolved target reference. */
export function dealDamage(game: GameState, target: DamageTargetRef, amount: number, sourceCardId?: string): string {
  const value = Math.max(0, amount)
  if (target.kind === 'nemesis') {
    const before = game.nemesis.hp
    damageNemesis(game, value, sourceCardId)
    return `Nemesis takes ${before - game.nemesis.hp} damage (${game.nemesis.hp}/${game.nemesis.maxHp})`
  }

  if (target.kind === 'gravehold') {
    if (game.damagePrevention) return 'Gravehold suffers no damage this turn'
    const before = game.gravehold.hp
    game.gravehold.hp = Math.max(0, before - value)
    recordHealthChange(game, { kind: 'damage', targetId: 'gravehold', amount: value })
    if (game.gravehold.hp <= 0) checkGameOver(game)
    return `Gravehold takes ${before - game.gravehold.hp} damage (${game.gravehold.hp}/${game.gravehold.maxHp})`
  }

  const minion = game.nemesis.playArea.find(card =>
    card.cardType === 'minion' && card.placedAt === target.placedAt,
  )
  if (!minion) return `Target ${target.label} is no longer in play`
  const definition = getCard(minion.cardId) as NemesisCardDef
  // Damage reduction cannot turn a positive hit into less than 1 damage, but
  // it must not create damage when the original damage instance is zero.
  const reducedValue = value > 0
    ? Math.max(1, value - Math.max(0, definition.damageReductionPerInstance ?? 0))
    : 0
  const resolvedValue = definition.damagePerInstance === undefined
    ? reducedValue
    : Math.min(reducedValue, Math.max(0, definition.damagePerInstance))
  const before = Math.max(0, minion.lifeTokens ?? 0)
  recordHealthChange(game, { kind: 'damage', targetId: `minion:${minion.placedAt}`, amount: resolvedValue })
  minion.lifeTokens = Math.max(Math.max(0, definition.minimumLife ?? 0), before - resolvedValue)
  if (minion.lifeTokens === 0) {
    const playIndex = game.nemesis.playArea.indexOf(minion)
    const instanceId = minion.instanceId ?? `${minion.cardId}:${minion.placedAt}`
    game.nemesis.playArea = game.nemesis.playArea.filter(card => card !== minion)
    const discard = getNemesisCardInstanceZone(game,
      definition.returnToSpecificDiscardOnDefeat ? 'strike_discard' : 'nemesis_discard')
    insertCardInstanceAt(game, discard.cards, discard.instanceIds, {
      cardId: minion.cardId, instanceId, revealed: true,
    }, 0, true)
    minion.instanceId = instanceId
    recordCardMove(game, instanceId, minion.cardId,
      { zoneId: 'nemesis:play_area', zone: 'nemesis_play_area', ownerId: 'nemesis', index: playIndex },
      { zoneId: discard.zoneId, zone: discard.zone, ownerId: discard.ownerId, index: 0 }, 'effect')
    return `${target.label} takes ${before} damage and is defeated`
  }
  return `${target.label} takes ${before - minion.lifeTokens} damage (${minion.lifeTokens} life remaining)`
}

export function sufferPlayerDamage(game: GameState, playerId: string, damage: number): string {
  const player = getPlayer(game, playerId)
  const value = Math.max(0, damage)
  if (game.damagePrevention) return `${player.mageType} suffers no damage this turn`
  if (player.exhausted) {
    const graveholdDamage = value * 2
    game.gravehold.hp = Math.max(0, game.gravehold.hp - graveholdDamage)
    recordHealthChange(game, { kind: 'damage', targetId: 'gravehold', amount: graveholdDamage })
    if (game.gravehold.hp <= 0) checkGameOver(game)
    return `${player.mageType} is exhausted; Gravehold takes ${graveholdDamage} damage (${game.gravehold.hp}/${game.gravehold.maxHp})`
  }
  player.hp -= value
  recordHealthChange(game, { kind: 'damage', targetId: `player:${player.id}`, amount: value })
  return `${player.mageType} takes ${value} damage (${player.hp}/${player.maxHp})`
}

export function checkGameOver(game: GameState): string | null {
  if (game.nemesis.hp <= 0) { finishGame(game, 'players'); return 'VICTORY! Nemesis defeated!' }
  const nemesisDefinition = getNemesisDefinition(game.nemesis.definitionId)
  if (nemesisDefinition?.lifeLossThreshold != null && game.nemesis.hp >= nemesisDefinition.lifeLossThreshold) {
    finishGame(game, 'nemesis')
    return 'DEFEAT! The Nemesis has reached its life threshold!'
  }
  if (nemesisDefinition?.deckEmptyLoses && game.nemesis.deck.length === 0) {
    finishGame(game, 'nemesis')
    return 'DEFEAT! The Nemesis deck is empty!'
  }
  if (game.gravehold.hp <= 0) { finishGame(game, 'nemesis'); return 'DEFEAT! Gravehold destroyed!' }
  if (game.players.every(player => player.exhausted)) { finishGame(game, 'nemesis'); return 'DEFEAT! All mages exhausted!' }
  const usesDevouredPile = nemesisDefinition?.specificPileKind === 'devoured'
  if (usesDevouredPile && game.market.piles.every(pile => pile.remaining <= 0)) {
    finishGame(game, 'nemesis')
    return 'DEFEAT! All supply piles have been Devoured!'
  }
  return null
}

export function finishGame(game: GameState, winner: string): void {
  game.gameOver = true
  game.winner = winner
  for (const player of game.players) player.pulseTokens = 0
}

export function checkPlayerDeath(game: GameState, playerId: string, deferConsequences = false): string | null {
  const player = getPlayer(game, playerId)
  if (player.hp <= 0 && !player.exhausted) {
    const excess = Math.max(0, -player.hp)
    player.hp = 0
    player.exhausted = true
    // Preserve the direct helper behavior. Effect resolution passes true and
    // queues the ordered consequences so they can pause and resume safely.
    if (!deferConsequences) {
      game.gravehold.hp = Math.max(0, game.gravehold.hp - excess * 2)
      recordHealthChange(game, { kind: 'damage', targetId: 'gravehold', amount: excess * 2 })
      const openBreach = player.breaches.find(breach =>
        isPresentBreach(breach) && breach.opened && !breach.indestructible,
      )
      if (openBreach) {
        openBreach.opened = false
        const spells = getBreachCardInstanceZone(game, player.id, openBreach.index)
        for (let index = spells.cards.length - 1; index >= 0; index -= 1) {
          destroyCardFromZone(game, spells, index, 'destroy', false)
        }
        openBreach.prepSpells = []
        openBreach.preppedThisTurn = []
        openBreach.preppedSpellFaceDown = []
        if (openBreach.attachedRelic) {
          const attachment = getBreachAttachedRelicZone(game, player.id, openBreach.index)
          const discard = getPlayerCardInstanceZone(game, openBreach.attachedRelic.ownerId, 'discard')
          if (attachment) moveCardBetweenZones(game, attachment, 0, discard, 0, 'destroy')
        }
        openBreach.present = false
      }
      player.charge = 0
      const gameOver = checkGameOver(game)
      const breachOutcome = openBreach ? 'Breach lost' : 'no Breach destroyed'
      return gameOver
        ? `${player.mageType} EXHAUSTED! ${breachOutcome}, Gravehold -${excess * 2}; ${gameOver}`
        : `${player.mageType} EXHAUSTED! ${breachOutcome}, Gravehold -${excess * 2}`
    }
    return `${player.mageType} EXHAUSTED! Nemesis unleashes twice; choose a Breach to destroy`
  }
  return null
}
