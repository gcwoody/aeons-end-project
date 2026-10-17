import { createTwoPlayerScenario } from '../data'
import {
  castSpell, createGame, getBreachCardInstanceZone, getNemesisCardInstanceZone,
  getPlayerCardInstanceZone, prepSpell, resolvePendingDecision,
} from '../engine'
import type { GameState } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function setMainPhase(game: GameState, playerId: string): void {
  game.currentTurn = playerId
  game.currentPhase = 'main'
  // Oracle of Filth asks which Supply piles to replace during setup. This test
  // isolates the later ordinary casting path from that unrelated choice.
  game.pendingDecision = null
  game.pendingEffect = null
}

function testOrdinarySpellCastMovesTheCorrectPhysicalCopyIntoTheVortex(): void {
  const game = createGame(createTwoPlayerScenario(['stake', 'wolf'], 'oracle_of_filth'))
  const player = game.players.find(candidate => candidate.mageType === 'stake')!
  setMainPhase(game, player.id)

  const breach = player.breaches.find(candidate => candidate.index === 4)!
  breach.opened = true
  player.turnEffects.prepSpellLimit = 2
  player.hand = ['piercing_light', 'piercing_light']
  player.handInstanceIds = undefined
  const hand = getPlayerCardInstanceZone(game, player.id, 'hand')
  const [firstCopyId, secondCopyId] = [...hand.instanceIds]
  assert(firstCopyId && secondCopyId && firstCopyId !== secondCopyId,
    'Duplicate Piercing Lights have separate physical identities')

  assert(prepSpell(game, player.id, 'piercing_light', breach.index, 0)?.includes('Prepped'),
    'The first Piercing Light can be prepped')
  assert(prepSpell(game, player.id, 'piercing_light', breach.index, 0)?.includes('Prepped'),
    'The second Piercing Light can be prepped')
  const breachZone = getBreachCardInstanceZone(game, player.id, breach.index)
  assertEqual(breachZone.instanceIds[0], firstCopyId, 'The first prepared copy keeps its identity')
  assertEqual(breachZone.instanceIds[1], secondCopyId, 'The second prepared copy keeps its identity')

  const pupil = {
    cardId: 'pupil_of_oblivion', cardType: 'minion' as const, placedAt: 9001,
    instanceId: 'pupil_of_oblivion:ordinary-cast-test', lifeTokens: 2,
  }
  game.nemesis.playArea = [pupil]
  assertEqual(game.nemesis.playArea.length, 1, 'Ocularum is absent so Vortex placement is permitted')

  castSpell(game, player.id, breach.index, 1)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_damage_target', 'Ordinary casting asks which enemy to damage')
  const pupilTarget = decision.targets.find(target => target.kind === 'minion' && target.placedAt === pupil.placedAt)
  assert(pupilTarget, 'Pupil of Oblivion is a valid target')
  resolvePendingDecision(game, decision.id, { kind: 'select_damage_target', target: pupilTarget })

  const vortex = getNemesisCardInstanceZone(game, 'strike_deck')
  assertEqual(vortex.instanceIds[0], secondCopyId,
    'The exact spell copy cast through the normal player path moves into the Vortex')
  assertEqual(vortex.cards[0], 'piercing_light', 'The Vortex receives the cast spell')
  const remainingBreach = getBreachCardInstanceZone(game, player.id, breach.index)
  assertEqual(remainingBreach.instanceIds.length, 1, 'The other duplicate remains prepared')
  assertEqual(remainingBreach.instanceIds[0], firstCopyId, 'The uncast duplicate remains the same physical card')
  assertEqual(pupil.lifeTokens, 1, 'Pupil takes the spell damage before its effect moves that spell')
}

testOrdinarySpellCastMovesTheCorrectPhysicalCopyIntoTheVortex()

console.log('Wave 9 Oracle of Filth tests passed')
