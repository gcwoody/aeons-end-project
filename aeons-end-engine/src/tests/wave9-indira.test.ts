import { getCard, MAGES } from '../data'
import {
  activateAbility, canPlayerAct, castSpell, createGame, playCard, resolvePendingDecision,
  movePreppedSpell, returnPreppedSpellToHand,
} from '../engine'
import type { GameState } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function freshGame(): GameState {
  const game = createGame('indira', 'jian')
  game.currentTurn = game.players[0]!.id
  game.currentPhase = 'main'
  return game
}

function testSetupAndConjure(): void {
  const game = freshGame()
  const indira = game.players[0]!
  assertEqual(MAGES.indira?.abilityName, "Pyromancer's Guile", 'Indira is registered')
  assertEqual(indira.hand.join(','), 'wave9_crystal,wave9_crystal,wave9_crystal,wave9_crystal,wave9_spark', 'Indira starts with the documented hand')
  assertEqual(indira.deck.join(','), 'wave9_crystal,wave9_crystal,wave9_crystal,wave9_crystal,fused_opal', 'Indira starts with the documented deck')
  assertEqual(indira.breaches[2]!.special, 'transfer', 'Indira uses a Transfer Breach')
  assertEqual(indira.breaches[0]!.present, false, 'Indira has no Breach I')
  assertEqual(indira.breaches[3]!.present, false, 'Indira has no Breach IV')
  indira.hand = ['fused_opal']
  indira.deck = []
  indira.discard = ['spark']
  indira.breaches[1]!.opened = true
  playCard(game, indira.id, 'fused_opal')
  assertEqual(game.pendingDecision?.kind, 'choose_one', 'Fused Opal offers an OR choice')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'conjure' })
  assertEqual(game.pendingDecision?.kind, 'select_conjure_breach', 'Conjure asks for an eligible Breach')
  const conjure = game.pendingDecision!
  assert(conjure.kind === 'select_conjure_breach', 'Conjure decision has Breach candidates')
  resolvePendingDecision(game, conjure.id, { kind: 'select_conjure_breach', choice: conjure.candidates[0]! })
  const prepared = indira.breaches[conjure.candidates[0]!.breachIndex - 1]!
  assertEqual(prepared.preppedSpellFaceDown?.[0], true, 'Conjure stores the face-down flag')
  assertEqual(prepared.prepSpells[0], 'spark', 'Conjure recycles an empty deck from discard')
  assertEqual(
    returnPreppedSpellToHand(game, indira.id, prepared.index, 0),
    'Face-down Conjured spells cannot be returned to hand',
    'Face-down Conjured spells cannot be returned to hand',
  )
  const hp = game.nemesis.hp
  castSpell(game, indira.id, prepared.index)
  assertEqual(game.nemesis.hp, hp - 2, 'A face-down Conjured card deals exactly two damage')
  assertEqual(getCard('spark').cost, 0, 'The physical card keeps its printed cost')
}

function testSpellOnlyAetherKeepsTurnOpen(): void {
  const game = freshGame()
  const indira = game.players[0]!
  indira.hand = []
  indira.conditionalAetherEarned = { spell: 5 }
  indira.regularAetherSpent = 0
  game.market.piles = [{ cardId: 'lava_tendril', remaining: 1 }]
  assert(canPlayerAct(game, indira.id), 'Spell-only Aether keeps the Main Phase open for a Spell purchase')
}

function testFaceDownConjureMovement(): void {
  const game = freshGame()
  const indira = game.players[0]!
  const source = indira.breaches[1]!
  const target = indira.breaches[2]!
  source.opened = true
  target.opened = true
  source.prepSpells = ['spark']
  source.preppedThisTurn = [false]
  source.preppedSpellFaceDown = [true]

  assertEqual(
    movePreppedSpell(game, indira.id, source.index, 0, target.index),
    'Moved Spark to Breach III',
    'A face-down Conjured spell can move to another legal Breach',
  )
  assertEqual(target.preppedSpellFaceDown?.[0], true, 'Face-down status survives Breach movement')
  assertEqual(
    returnPreppedSpellToHand(game, indira.id, target.index, 0),
    'Face-down Conjured spells cannot be returned to hand',
    'A moved face-down Conjured spell still cannot return to hand',
  )
}

function testTransferAndAbility(): void {
  const game = freshGame()
  const indira = game.players[0]!
  const ally = game.players[1]!
  const transfer = indira.breaches[2]!
  transfer.opened = true
  transfer.prepSpells = ['spark']
  transfer.preppedThisTurn = [false]
  transfer.preppedSpellFaceDown = [false]
  ally.hand = []
  const hp = game.nemesis.hp
  castSpell(game, indira.id, transfer.index)
  assertEqual(game.nemesis.hp, hp - 2, 'Transfer Breach adds one damage to a Spark')
  assertEqual(ally.hand[0], 'spark', 'Transfer Breach returns the spell to an ally hand')
  indira.charge = indira.chargeThreshold
  ally.hand = ['spark']
  const abilityHp = game.nemesis.hp
  activateAbility(game, indira.id)
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_optional', accepted: true })
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'cast_twice' })
  const collective = game.pendingDecision!
  assert(collective.kind === 'select_collective_cards', 'Ability selects an ally spell')
  resolvePendingDecision(game, collective.id, { kind: 'select_collective_cards', choices: [collective.candidates[0]!] })
  assertEqual(game.nemesis.hp, abilityHp - 2, 'Pyromancer Guile casts an ally spell twice')
  assertEqual(ally.hand[0], 'spark', 'Pyromancer Guile does not discard the ally spell')
}

testSetupAndConjure()
testTransferAndAbility()
testSpellOnlyAetherKeepsTurnOpen()
testFaceDownConjureMovement()
console.log('Wave 9 Indira tests passed')
