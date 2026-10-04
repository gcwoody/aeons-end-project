import {
  checkPlayerDeath,
  createGame,
  discardNemesisPower,
  drawStrikeCard,
  getNemesisDiscardActions,
  gainLife,
  getLifeTargets,
  resolveEffects,
  resolvePendingDecision,
  returnStrikeCardToDeck,
  sufferPlayerDamage,
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

function testPowerToDiscardPreppedSpellCostsUseOnlyThePayerByDefault(): void {
  const game = mainPhaseGame()
  const payer = game.players[0]!
  const ally = game.players[1]!
  ally.breaches[0]!.prepSpells = ['vriswood_amber', 'diamond_cluster']
  game.nemesis.playArea = [{
    cardId: 'reality_rupture', cardType: 'power', placedAt: 1,
    instanceId: 'reality-rupture:1', powerTokens: 1,
  }]

  assertEqual(getNemesisDiscardActions(game, payer.id).length, 0,
    'An ally prepped spells do not satisfy Reality Rupture when the active player has none')
  assert(discardNemesisPower(game, payer.id, 'reality-rupture:1').some(message => message.includes('cannot be discarded')),
    'The player cannot start To Discard by using only ally resources')
  assertEqual(ally.breaches[0]!.prepSpells.length, 2, 'Rejected To Discard does not change the ally\'s Breach')

  payer.breaches[0]!.prepSpells = ['vriswood_amber', 'diamond_cluster']
  payer.breaches[1]!.prepSpells = ['diamond_cluster']
  const action = getNemesisDiscardActions(game, payer.id)[0]
  assert(action, 'The active player can pay with their own eligible prepped spells')
  discardNemesisPower(game, payer.id, action.instanceId)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_prepped_spells', 'Player chooses which of their eligible spells to destroy')
  assertEqual(decision.candidates.length, 3, 'Only the payer\'s three eligible spells are offered')
  assert(decision.candidates.every(choice => choice.playerId === payer.id),
    'Ally spells are omitted from the payment decision')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_prepped_spells', choices: decision.candidates.slice(0, 2),
  })
  assertEqual(payer.destroyedCards.length, 2, 'Two spells belonging to the payer are destroyed')
  assertEqual(ally.breaches[0]!.prepSpells.length, 2, 'The ally\'s prepped spells remain untouched')
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

function testExhaustionSequenceAndBreachChoice(): void {
  const game = mainPhaseGame()
  const player = game.players[0]!
  player.hp = 1
  player.charge = 3
  player.breaches[0]!.prepSpells = ['spark']
  player.breaches[0]!.preppedThisTurn = [true]

  const messages = resolveEffects(game, player.id, [{
    kind: 'deal_player_damage', amount: 2, target: 'self',
  }])
  assert(messages.some(message => message.includes('unleashes twice')), 'Lethal damage starts the ordered exhaustion sequence')
  assertEqual(game.nemesis.counters.fury, 3, 'Exhaustion performs Unleash twice')
  assertEqual(game.pendingDecision?.kind, 'select_exhaust_breach', 'Exhaustion asks which Breach to destroy')
  assertEqual(player.hp, 0, 'Exhausted player HP is clamped to zero')
  assertEqual(player.charge, 3, 'Charge remains until the Breach choice is resolved')

  const decision = game.pendingDecision!
  if (decision.kind !== 'select_exhaust_breach') throw new Error('Expected exhaustion Breach decision')
  const choice = decision.candidates[0]!
  const completed = resolvePendingDecision(game, decision.id, { kind: 'select_exhaust_breach', choice })
  assert(completed.some(message => message.includes('charge is reset to 0')), 'Exhaustion resets charge after the Breach choice')
  assertEqual(player.breaches[0]!.present, false, 'Selected Breach is removed but its slot remains')
  assertEqual(player.breaches[0]!.prepSpells.length, 0, 'Prepared spells leave a destroyed Breach')
  assertEqual(player.discard[0], 'spark', 'Prepared spells enter the discard pile')
  assertEqual(player.charge, 0, 'Exhausted player charge is reset')
  assertEqual(game.gravehold.hp, 28, 'Excess damage is doubled against Gravehold after exhaustion')
}

function testExhaustedDamageAndHealingRules(): void {
  const game = mainPhaseGame()
  const exhausted = game.players[0]!
  exhausted.exhausted = true
  exhausted.hp = 0
  const before = game.gravehold.hp
  const damageMessage = sufferPlayerDamage(game, exhausted.id, 2)
  assert(damageMessage.includes('Gravehold takes 4 damage'), 'Damage to an exhausted Mage is doubled against Gravehold')
  assertEqual(exhausted.hp, 0, 'Exhausted Mage life remains at zero')
  assertEqual(game.gravehold.hp, before - 4, 'Exhausted damage reduces Gravehold by twice the amount')
  assertEqual(getLifeTargets(game, exhausted.id, 'any_player').some(target =>
    target.kind === 'player' && target.playerId === exhausted.id), false,
  'Exhausted Mages are excluded from life targets')
  const healMessage = gainLife(game, { kind: 'player', playerId: exhausted.id }, 3)
  assert(healMessage?.includes('cannot gain life'), 'Direct healing of an exhausted Mage is rejected')
  assertEqual(exhausted.hp, 0, 'Rejected healing does not change exhausted life')

  const other = game.players[1]!
  other.hp = 5
  const messages = resolveEffects(game, exhausted.id, [{
    kind: 'deal_player_damage', amount: 1, target: 'any_player', selection: 'lowest_hp',
  }])
  assert(messages.some(message => message.includes(other.mageType)), 'Lowest-life damage chooses a non-exhausted Mage')
  assertEqual(other.hp, 4, 'Lowest-life damage skips exhausted Mages')
}

testNemesisCountersAndUnleash()
testStrikeDeckRecycleAndReturn()
testToDiscardPausesBeforePayment()
testToDiscardRejectsInsufficientPayment()
testToDiscardSupportsPreppedSpellCosts()
testPowerToDiscardPreppedSpellCostsUseOnlyThePayerByDefault()
testPlayerExcessDamage()
testExhaustionSequenceAndBreachChoice()
testExhaustedDamageAndHealingRules()
console.log('Stage 3 Nemesis effects, targets, and To Discard tests passed.')
