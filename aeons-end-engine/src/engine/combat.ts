import type { DamageTargetRef, GameState, NemesisCardDef } from '../types'
import { getCard, getNemesisDefinition } from '../data'
import { isPresentBreach } from './breaches'
import { getPlayer } from './zones'
import { insertCardInstanceAt } from './card-instances'
import { recordHealthChange } from './health-feedback'

export function damageNemesis(game: GameState, amount: number): void {
  const value = Math.max(0, amount)
  if (value > 0) recordHealthChange(game, { kind: 'damage', targetId: 'nemesis', amount: value })
  game.nemesis.hp -= value
  if (game.nemesis.hp <= 0) {
    game.nemesis.hp = 0
    finishGame(game, 'players')
  }
}

/** Deal damage to a resolved target reference. */
export function dealDamage(game: GameState, target: DamageTargetRef, amount: number): string {
  const value = Math.max(0, amount)
  if (target.kind === 'nemesis') {
    const before = game.nemesis.hp
    damageNemesis(game, value)
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
  const reducedValue = Math.max(1, value - Math.max(0, definition.damageReductionPerInstance ?? 0))
  const resolvedValue = definition.damagePerInstance === undefined
    ? reducedValue
    : Math.min(reducedValue, Math.max(0, definition.damagePerInstance))
  const before = Math.max(0, minion.lifeTokens ?? 0)
  recordHealthChange(game, { kind: 'damage', targetId: `minion:${minion.placedAt}`, amount: resolvedValue })
  minion.lifeTokens = Math.max(0, before - resolvedValue)
  if (minion.lifeTokens === 0) {
    game.nemesis.playArea = game.nemesis.playArea.filter(card => card !== minion)
    insertCardInstanceAt(game, game.nemesis.discard, game.nemesis.discardInstanceIds ??= [], {
      cardId: minion.cardId,
      instanceId: minion.instanceId ?? `${minion.cardId}:${minion.placedAt}`,
      revealed: true,
    }, 0, true)
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
  if (game.gravehold.hp <= 0) { finishGame(game, 'nemesis'); return 'DEFEAT! Gravehold destroyed!' }
  if (game.players.every(player => player.exhausted)) { finishGame(game, 'nemesis'); return 'DEFEAT! All mages exhausted!' }
  const usesDevouredPile = getNemesisDefinition(game.nemesis.definitionId)?.specificPileKind === 'devoured'
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
        openBreach.prepSpells = []
        openBreach.preppedThisTurn = []
        openBreach.preppedSpellFaceDown = []
        openBreach.preppedSpellInstanceIds = []
        if (openBreach.attachedRelic) {
          getPlayer(game, openBreach.attachedRelic.ownerId).discard.unshift(openBreach.attachedRelic.cardId)
          openBreach.attachedRelic = undefined
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
