import { getCard, MAGES } from '../data'
import {
  activateAbility, canPlayerAct, castSpell, createGame, playCard, resolvePendingDecision,
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

function testConjureRevealsWithoutEligibleBreach(): void {
  const game = freshGame()
  const indira = game.players[0]!
  indira.hand = ['fused_opal']
  indira.deck = ['spark']
  indira.discard = []
  playCard(game, indira.id, 'fused_opal')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'conjure' })

  const decision = game.pendingDecision
  assert(decision?.kind === 'select_conjure_breach', 'Conjure reveals the top card even without an eligible Breach')
  assertEqual(decision.cardId, 'spark', 'The revealed card is available to the decision UI')
  assertEqual(decision.candidates.length, 0, 'No closed, unfocused Breach is offered for prep')
  assertEqual(indira.deck.length, 0, 'The revealed card is held by the pending effect')

  const restored = JSON.parse(JSON.stringify(game)) as GameState
  resolvePendingDecision(restored, decision.id, { kind: 'select_conjure_breach', choice: null })
  assertEqual(restored.players[0]!.deck.join(','), 'spark', 'Leaving the revealed card returns it to the top after JSON restore')
  assertEqual(restored.pendingDecision, null, 'The Conjure decision finishes after leaving the card on top')
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
  const spellsCastBeforeAbility = indira.spellsCastThisTurn ?? 0
  resolvePendingDecision(game, collective.id, { kind: 'select_collective_cards', choices: [collective.candidates[0]!] })
  assertEqual(game.nemesis.hp, abilityHp - 2, 'Pyromancer Guile casts an ally spell twice')
  assertEqual(ally.hand.length, 0, 'The final cast removes the spell from the ally hand')
  assertEqual(ally.discard.join(','), 'spark', 'The final cast places the spell in its owner\'s discard pile')
  assertEqual(indira.spellsCastThisTurn, spellsCastBeforeAbility + 2, 'Both casts are attributed to Indira')
}

testSetupAndConjure()
testConjureRevealsWithoutEligibleBreach()
testTransferAndAbility()
testSpellOnlyAetherKeepsTurnOpen()
console.log('Wave 9 Indira tests passed')
