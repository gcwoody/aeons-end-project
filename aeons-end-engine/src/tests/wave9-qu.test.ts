import { createGame, gainCard, resolveEffects, resolvePendingDecision } from '../engine'
import type { GameState, PendingDecisionAnswer } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function freshGame(): GameState {
  const game = createGame('qu', 'jian')
  game.currentTurn = game.players[0]!.id
  game.currentPhase = 'main'
  game.market.piles = [{ cardId: 'moonstone_shard', remaining: 5 }]
  return game
}

function answerPending(game: GameState, answer: PendingDecisionAnswer): void {
  const decision = game.pendingDecision
  assert(decision, 'A pending Form decision should exist')
  resolvePendingDecision(game, decision.id, answer)
}

function testGiverFormSupplyGainAndRestore(): void {
  const game = freshGame()
  const qu = game.players[0]!
  const ally = game.players[1]!
  qu.discard = []
  ally.deck = []
  const handsBefore = JSON.stringify(game.players.map(player => player.hand))

  gainCard(game, qu.id, 'moonstone_shard', 'discard_top', 0)
  const offer = game.pendingDecision
  assert(offer?.kind === 'choose_optional', 'Giver Form asks after Qu gains a supply card')
  assertEqual(offer.cardPreview?.cardId, 'qus_form_card', 'The offer shows Qu’s Form Card')
  assertEqual(offer.cardPreview?.formSide, 'giver', 'The offer shows the Giver face')

  answerPending(game, { kind: 'choose_optional', accepted: true })
  assertEqual(game.pendingDecision, null, 'Giver Form auto-selects Qu’s only ally without a second prompt')
  assertEqual(ally.deck[0], 'moonstone_shard', 'Giver Form puts the gained card on the ally deck')
  assertEqual(JSON.stringify(game.players.map(player => player.hand)), handsBefore, 'Giver placement preserves every hand')
  assertEqual(qu.charge, 1, 'Giver Form grants Qu one charge')
  assertEqual(qu.mageFormSide, 'taker', 'Giver Form flips to Taker after placement')
}

function testTakerFormTriggersWhenAllyGains(): void {
  const game = freshGame()
  const qu = game.players[0]!
  const ally = game.players[1]!
  qu.mageFormSide = 'taker'
  qu.deck = []
  ally.discard = []
  const handsBefore = JSON.stringify(game.players.map(player => player.hand))

  gainCard(game, ally.id, 'moonstone_shard', 'discard_top', 0)
  const offer = game.pendingDecision
  assert(offer?.kind === 'choose_optional', 'Taker Form asks when an ally gains from the supply')
  assertEqual(offer.cardPreview?.formSide, 'taker', 'The offer shows the Taker face')

  answerPending(game, { kind: 'choose_optional', accepted: true })
  assertEqual(qu.deck[0], 'moonstone_shard', 'Taker Form places the gained card on Qu’s deck')
  assertEqual(JSON.stringify(game.players.map(player => player.hand)), handsBefore, 'Taker placement preserves every hand')
  assertEqual(ally.charge, 1, 'Taker Form grants the gaining ally one charge')
  assertEqual(qu.mageFormSide, 'giver', 'Taker Form flips back to Giver after placement')
}

function testEffectBasedSupplyGainTriggersGiverForm(): void {
  const game = freshGame()
  const qu = game.players[0]!
  const ally = game.players[1]!
  qu.discard = []
  ally.deck = []
  const handsBefore = JSON.stringify(game.players.map(player => player.hand))

  resolveEffects(game, qu.id, [{
    kind: 'gain_card', cardId: 'moonstone_shard', source: 'market',
  }])
  assert(game.pendingDecision?.kind === 'choose_optional', 'A card effect supply gain also triggers Giver Form')
  answerPending(game, { kind: 'choose_optional', accepted: true })
  assertEqual(game.pendingDecision, null, 'Effect-based Giver Form gain auto-selects its only ally')
  assertEqual(ally.deck[0], 'moonstone_shard', 'The effect-gained card can be placed on the ally deck')
  assertEqual(JSON.stringify(game.players.map(player => player.hand)), handsBefore, 'Effect-based Giver placement preserves every hand')
}

function testWrongFormSideDoesNotOffer(): void {
  const game = freshGame()
  const qu = game.players[0]!
  qu.mageFormSide = 'taker'

  gainCard(game, qu.id, 'moonstone_shard', 'discard_top', 0)
  assertEqual(game.pendingDecision, null, 'Taker Form does not trigger when Qu gains a card herself')
}

testGiverFormSupplyGainAndRestore()
testTakerFormTriggersWhenAllyGains()
testEffectBasedSupplyGainTriggersGiverForm()
testWrongFormSideDoesNotOffer()
console.log('Wave 9 Qu tests passed')
