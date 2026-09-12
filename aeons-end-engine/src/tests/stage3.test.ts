import {
  checkPlayerDeath,
  createGame,
  discardNemesisPower,
  drawStrikeCard,
  getNemesisDiscardActions,
  resolveEffects,
  resolvePendingDecision,
  returnStrikeCardToDeck,
} from '../engine'
import type { GameState } from '../types'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function mainPhaseGame(): GameState {
  const game = createGame('jian', 'brama')
  game.currentTurn = game.players[0]!.id
  game.currentPhase = 'main'
  return game
}

function testNemesisCountersAndUnleash(): void {
  const game = mainPhaseGame()
  assertEqual(game.nemesis.counters.fury, 1, 'Rageborne starts with one Fury')
  const messages = resolveEffects(game, game.players[0]!.id, [{ kind: 'unleash' }])
  assert(messages.some(message => message.includes('fury')), 'Unleash resolves the Nemesis configuration')
  assertEqual(game.nemesis.counters.fury, 2, 'Unleash gains the configured Fury amount')

  resolveEffects(game, game.players[0]!.id, [{ kind: 'lose_nemesis_counter', counter: 'fury', amount: 10 }])
  assertEqual(game.nemesis.counters.fury, 0, 'Nemesis counters cannot become negative')
}

function testStrikeDeckRecycleAndReturn(): void {
  const game = mainPhaseGame()
  game.nemesis.strikeDeck = []
  game.nemesis.strikeDiscard = ['convoke']
  const drawn = drawStrikeCard(game)
  assertEqual(drawn, 'convoke', 'Strike discard recycles when the Strike deck is empty')
  assertEqual(game.nemesis.strikeDiscard.length, 0, 'Recycled Strike discard is cleared')
  returnStrikeCardToDeck(game, drawn!)
  assertEqual(game.nemesis.strikeDeck.length, 1, 'Resolved Strike returns to the auxiliary deck')
  assertEqual(drawStrikeCard(game), 'convoke', 'Returned Strike can be drawn again')
}

function testToDiscardPausesBeforePayment(): void {
  const game = mainPhaseGame()
  const player = game.players[0]!
  player.hand = ['crystal', 'vriswood_amber', 'diamond_cluster']
  game.nemesis.playArea = [{
    cardId: 'agony_field', cardType: 'power', placedAt: 1,
    instanceId: 'agony-field:1', powerTokens: 2,
  }]

  const actions = getNemesisDiscardActions(game, player.id)
  assertEqual(actions.length, 1, 'A payable Power exposes a To Discard action')
  const messages = discardNemesisPower(game, player.id, actions[0]!.instanceId)
  assert(messages.some(message => message.includes('Decision required')), 'Destroy costs pause for a card choice')
  assert(game.pendingDecision?.kind === 'select_cards', 'To Discard exposes a reusable card selection decision')
  assertEqual(player.hand.length, 3, 'No card is removed before the choice is submitted')
  assertEqual(player.destroyedCards.length, 0, 'No payment is made before the choice is submitted')

  const decision = game.pendingDecision!
  if (decision.kind !== 'select_cards') throw new Error('Expected card selection decision')
  const expensive = decision.candidates.find(choice => choice.cardId === 'vriswood_amber')!
  const completed = resolvePendingDecision(game, decision.id, { kind: 'select_cards', choices: [expensive] })
  assert(completed.some(message => message.includes('Discarded Power')), 'To Discard completes after the required payment')
  assertEqual(game.nemesis.playArea.length, 0, 'Power is removed from play')
  assertEqual(game.nemesis.discard[0], 'agony_field', 'Power enters the Nemesis discard pile')
  assertEqual(player.destroyedCards[0], 'vriswood_amber', 'The selected card is permanently destroyed')
  assertEqual(player.hand[0], 'crystal', 'An ineligible low-cost card remains in hand')
  assertEqual(player.hand.length, 2, 'Only the selected card is removed from hand')
}

function testToDiscardRejectsInsufficientPayment(): void {
  const game = mainPhaseGame()
  const player = game.players[0]!
  player.bonusAether = 5
  game.nemesis.playArea = [{
    cardId: 'eye_of_nothing', cardType: 'power', placedAt: 1,
    instanceId: 'eye-of-nothing:1', powerTokens: 2,
  }]
  assertEqual(getNemesisDiscardActions(game, player.id).length, 0, 'Insufficient Aether makes To Discard unavailable')
  assert(discardNemesisPower(game, player.id, 'eye-of-nothing:1').some(message => message.includes('cannot be discarded')), 'Insufficient payment is rejected without mutation')
  assertEqual(player.bonusAether, 5, 'Rejected To Discard does not spend Aether')
  assertEqual(game.nemesis.playArea.length, 1, 'Rejected To Discard leaves the Power in play')
}

function testToDiscardSupportsPreppedSpellCosts(): void {
  const game = mainPhaseGame()
  const player = game.players[0]!
  player.breaches[0]!.prepSpells = ['vriswood_amber']
  player.breaches[1]!.prepSpells = ['diamond_cluster']
  game.nemesis.playArea = [{
    cardId: 'reality_rupture', cardType: 'power', placedAt: 1,
    instanceId: 'reality-rupture:1', powerTokens: 1,
  }]
  const action = getNemesisDiscardActions(game, player.id)[0]
  assert(action, 'A Power with a prepped-spell payment is exposed when enough spells exist')
  const messages = discardNemesisPower(game, player.id, action.instanceId)
  assert(messages.some(message => message.includes('Discarded Power')), 'Prepped-spell To Discard payment completes')
  assertEqual(player.breaches[0]!.prepSpells.length, 0, 'First eligible prepped spell is destroyed')
  assertEqual(player.breaches[1]!.prepSpells.length, 0, 'Second eligible prepped spell is destroyed')
  assertEqual(player.destroyedCards.length, 2, 'Prepped spells are permanently destroyed')
}

function testPlayerExcessDamage(): void {
  const game = mainPhaseGame()
  const player = game.players[0]!
  player.hp = -3
  const message = checkPlayerDeath(game, player.id)
  assert(message?.includes('Gravehold -6'), 'Excess damage is calculated before clamping player HP')
  assertEqual(player.hp, 0, 'Exhausted player HP is clamped to zero')
  assertEqual(game.gravehold.hp, 24, 'Excess damage reduces Gravehold by twice the excess')
}

testNemesisCountersAndUnleash()
testStrikeDeckRecycleAndReturn()
testToDiscardPausesBeforePayment()
testToDiscardRejectsInsufficientPayment()
testToDiscardSupportsPreppedSpellCosts()
testPlayerExcessDamage()
console.log('Stage 3 Nemesis effects, targets, and To Discard tests passed.')
