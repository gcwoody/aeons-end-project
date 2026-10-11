import {
  activateRecall, canPlayerAct, checkGameOver, createGame, getRecallActions, getSupplyMechanics,
  resolveDrawPhase, resolveEffects, resolvePendingDecision,
} from '../engine'
import { getCard } from '../data'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function testPulseTokensAreCappedPersistentAndSpentExactly(): void {
  const game = createGame('jian', 'brama')
  const player = game.players[0]!
  resolveEffects(game, player.id, [
    { kind: 'gain_pulse_token', amount: 8 },
  ], undefined, 0, player.id)
  assertEqual(player.pulseTokens, 5, 'Pulse token gains stop at five')

  resolveEffects(game, player.id, [
    { kind: 'lose_pulse_token', amount: 2 },
    { kind: 'gain_pulse_token', amount: 1 },
  ], undefined, 0, player.id)
  assertEqual(player.pulseTokens, 4, 'Pulse tokens can be lost and regained')

  resolveDrawPhase(game, player.id)
  assertEqual(player.pulseTokens, 4, 'Pulse tokens carry over through the Draw Phase')

  resolveEffects(game, player.id, [
    { kind: 'lose_pulse_token', amount: 5 },
  ], undefined, 0, player.id)
  assertEqual(player.pulseTokens, 4, 'An unaffordable Pulse token loss does not partially spend')
}

function testPulseTokenEffectsCanSelectAnyPlayer(): void {
  const game = createGame('jian', 'brama')
  const source = game.players[0]!
  const target = game.players[1]!
  resolveEffects(game, source.id, [
    { kind: 'gain_pulse_token', amount: 2, target: 'any_player' },
  ], undefined, 0, source.id)

  const decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'A multi-player Pulse target opens a player choice')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target',
    target: { kind: 'player', playerId: target.id },
  })
  assertEqual(target.pulseTokens, 2, 'The selected player receives Pulse tokens')
  assertEqual(source.pulseTokens, 0, 'The unselected player receives no Pulse tokens')
}

function testPulseTokenSupplyVisibilityUsesSetupMechanics(): void {
  const pulseCard = getCard('jade')
  const originalMechanics = pulseCard.mechanics
  try {
    pulseCard.mechanics = ['pulse_token']
    const baseline = createGame('jian', 'brama')
    const slots = baseline.market.piles.map(pile => pile.cardId).filter(cardId => cardId !== 'jade')
    if (slots.length < 9) slots.push('jade')
    else slots[0] = 'jade'
    const scenario = {
      ...baseline.scenario,
      marketSetup: { mode: 'manual' as const, slots },
    }
    const game = createGame(scenario)
    assert(getSupplyMechanics(game).includes('pulse_token'), 'The setup market enables Pulse token UI')

    game.market.piles.find(pile => pile.cardId === 'jade')!.remaining = 0
    assert(getSupplyMechanics(game).includes('pulse_token'), 'An emptied starting pile still keeps the token visible')

    const restoredGame = JSON.parse(JSON.stringify(game)) as typeof game
    delete restoredGame.supplyMechanics
    assert(getSupplyMechanics(restoredGame).includes('pulse_token'), 'Older saves derive mechanics from their market')
  } finally {
    pulseCard.mechanics = originalMechanics
  }
}

function testRecallIsMainPhaseOnlyAndEachDuplicateCanBeUsedOnce(): void {
  const crystal = getCard('crystal')
  const originalEffects = crystal.effects
  const originalMechanics = crystal.mechanics
  try {
    crystal.mechanics = [...(crystal.mechanics ?? []), 'recall']
    crystal.effects = [{
      trigger: { kind: 'recall' },
      oncePerTurn: true,
      condition: { kind: 'has_pulse_tokens', amount: 1 },
      effects: [{ kind: 'lose_pulse_token', amount: 1 }],
    }]

    const game = createGame('jian', 'brama')
    const player = game.players[0]!
    game.currentTurn = player.id
    game.currentPhase = 'main'
    player.discard = ['crystal', 'crystal']
    player.pulseTokens = 0
    assertEqual(getRecallActions(game, player.id).length, 0, 'Recall conditions are checked before highlighting')

    player.pulseTokens = 2
    assertEqual(getRecallActions(game, player.id).length, 2, 'Both matching card copies are initially available')
    const firstMessages = activateRecall(game, player.id, 0)
    assert(firstMessages.some(message => message.includes('loses 1 Pulse token')), 'Clicking a Recall card resolves its effect')
    assertEqual(player.discard.length, 2, 'Activating Recall leaves the card in the Discard')
    assertEqual(player.pulseTokens, 1, 'The selected Recall effect changes Pulse tokens')
    assertEqual(getRecallActions(game, player.id).length, 1, 'The unused duplicate stays available')

    activateRecall(game, player.id, 1)
    assertEqual(player.pulseTokens, 0, 'The second physical copy can use Recall independently')
    assertEqual(getRecallActions(game, player.id).length, 0, 'Both used copies stop highlighting')

    resolveDrawPhase(game, player.id)
    assertEqual(game.currentPhase, 'draw', 'Resolving the Draw Phase updates the engine phase')
    game.currentPhase = 'main'
    assertEqual(getRecallActions(game, player.id).length, 0, 'Recall remains unavailable if its condition is no longer met')
    player.pulseTokens = 2
    assertEqual(getRecallActions(game, player.id).length, 2, 'Recall usage resets for the next turn')

    game.currentPhase = 'draw'
    assertEqual(getRecallActions(game, player.id).length, 0, 'Recall is unavailable during Draw/Discard Order')
    const drawPhaseMessages = activateRecall(game, player.id, 0)
    assert(drawPhaseMessages.some(message => message.includes('Main Phase')),
      'The engine rejects direct Recall activation during Draw/Discard Order')
    assertEqual(player.pulseTokens, 2, 'Rejected Draw Phase Recall does not spend its payment')

    game.currentPhase = 'casting'
    assertEqual(getRecallActions(game, player.id).length, 0, 'Recall is unavailable outside the Main Phase')
    game.currentPhase = 'main'
    game.currentTurn = game.players[1]!.id
    assertEqual(getRecallActions(game, player.id).length, 0, 'Recall is unavailable during another player\'s turn')
  } finally {
    crystal.effects = originalEffects
    crystal.mechanics = originalMechanics
  }
}

function testAvailableRecallKeepsTheMainPhaseOpenAfterSpendingAether(): void {
  const game = createGame('nook', 'brama')
  const player = game.players[0]!
  game.currentTurn = player.id
  game.currentPhase = 'main'
  player.hand = []
  player.bonusAether = 0
  player.aetherTokens = 0
  player.discard = ['visionary_staff']

  assertEqual(getRecallActions(game, player.id).length, 1,
    'The purchased Recall relic is available from the active player\'s Discard')
  assert(canPlayerAct(game, player.id),
    'An available Recall action prevents the Main Phase from auto-ending after Aether is spent')
}

function testPulseTokensAreDiscardedWhenTheGameEnds(): void {
  const game = createGame('jian', 'brama')
  game.players[0]!.pulseTokens = 4
  game.players[1]!.pulseTokens = 2
  game.nemesis.hp = 0
  checkGameOver(game)
  assertEqual(game.players[0]!.pulseTokens, 0, 'Game end clears the first player\'s Pulse tokens')
  assertEqual(game.players[1]!.pulseTokens, 0, 'Game end clears the ally\'s Pulse tokens')
}

function testPactPrismEndTurnTriggerSurvivesUiDiscardOrdering(): void {
  const game = createGame('jian', 'brama')
  const player = game.players[0]!
  // The UI's discard-order step moves played cards before it calls the engine
  // draw-phase resolver. The snapshot is the bridge that preserves this card's
  // end-of-turn trigger across that ordering.
  player.playedThisTurn = []
  player.pendingEndTurnCardIds = ['pact_prism']
  resolveDrawPhase(game, player.id)
  assertEqual(player.aetherTokens, 2, 'Pact Prism grants two Aether tokens at end of turn')
}

testPulseTokensAreCappedPersistentAndSpentExactly()
testPulseTokenEffectsCanSelectAnyPlayer()
testPulseTokenSupplyVisibilityUsesSetupMechanics()
testRecallIsMainPhaseOnlyAndEachDuplicateCanBeUsedOnce()
testAvailableRecallKeepsTheMainPhaseOpenAfterSpendingAether()
testPulseTokensAreDiscardedWhenTheGameEnds()
testPactPrismEndTurnTriggerSurvivesUiDiscardOrdering()

console.log('Wave 9 Pulse token and Recall tests passed')
