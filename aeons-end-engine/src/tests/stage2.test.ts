import {
  advanceNemesisTurn,
  createGame,
  resolvePendingDecision,
  startTurn,
} from '../engine'
import { getCard } from '../data'
import type { GameState, NemesisCardDef } from '../types'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function nemesisGame(): GameState {
  const game = createGame('jian', 'brama')
  game.currentTurn = 'nemesis'
  game.currentPhase = 'nemesis_main'
  return game
}

function confirmNemesisDraw(game: GameState): string[] {
  const decision = game.pendingDecision
  assert(decision?.kind === 'confirm_nemesis_draw', 'Nemesis draw pauses for confirmation')
  return resolvePendingDecision(game, decision.id, { kind: 'confirm_nemesis_draw', accepted: true })
}

function advanceNemesisMain(game: GameState): string[] {
  const messages: string[] = []
  for (let attempt = 0; attempt < 10; attempt++) {
    messages.push(...advanceNemesisTurn(game))
    const decision = game.pendingDecision
    if (decision?.kind !== 'confirm_nemesis_effect') break
    messages.push(...resolvePendingDecision(game, decision.id, { kind: 'confirm_nemesis_effect', accepted: true }))
  }
  return messages
}

function testNemesisMainAndDrawOrder(): void {
  const game = nemesisGame()
  const agony = getCard('agony_field') as NemesisCardDef
  const awaken = getCard('awaken') as NemesisCardDef
  const savedEffects = agony.nemesisEffects
  const savedAwakenEffects = awaken.nemesisEffects
  // This lifecycle fixture isolates token removal from the card's Stage 4 choice effects.
  agony.nemesisEffects = []
  awaken.nemesisEffects = []
  game.nemesis.nemesisTurnNumber = 0
  game.nemesis.playArea = [
    {
      cardId: 'provoker', cardType: 'minion', placedAt: 1,
      instanceId: 'provoker:1', enteredOnNemesisTurn: 0, lifeTokens: 5,
    },
    {
      cardId: 'agony_field', cardType: 'power', placedAt: 2,
      instanceId: 'agony_field:2', enteredOnNemesisTurn: 0, powerTokens: 1,
    },
  ]
  game.nemesis.deck = ['awaken']

  const messages = advanceNemesisMain(game)
  assert(messages.some(message => message.includes('Persistent for Provoker')), 'Main phase visits old Minions')
  assert(messages.some(message => message.includes('Power depleted for Agony Field')), 'Main phase resolves depleted Power')
  assert(game.pendingDecision?.kind === 'confirm_nemesis_draw', 'Draw phase pauses after revealing an Attack')
  const afterReveal = [...confirmNemesisDraw(game), ...advanceNemesisTurn(game)]
  assert(afterReveal.some(message => message.includes('Drew Attack: Awaken')), 'Draw phase draws one Attack')
  assertEqual(game.nemesis.playArea.length, 1, 'Resolved Power leaves play while Minion remains')
  assertEqual(game.nemesis.playArea[0]!.cardId, 'provoker', 'Older cards are processed before the draw')
  assert(game.nemesis.discard.includes('agony_field'), 'Resolved Power enters the Nemesis discard pile')
  assert(game.nemesis.discard.includes('awaken'), 'Resolved Attack enters the Nemesis discard pile')
  assertEqual(game.currentPhase, 'nemesis_draw', 'Nemesis turn ends in the Draw phase state')
  assertEqual(game.nemesisResolution, null, 'Completed Nemesis turns clear their continuation state')
  agony.nemesisEffects = savedEffects
  awaken.nemesisEffects = savedAwakenEffects
}

function testDrawnCardsEnterWithFreshCounters(): void {
  const minionGame = nemesisGame()
  minionGame.nemesis.deck = ['cauterizer']
  advanceNemesisTurn(minionGame)
  confirmNemesisDraw(minionGame)
  advanceNemesisTurn(minionGame)
  const minion = minionGame.nemesis.playArea[0]!
  assertEqual(minion.lifeTokens, 3, 'Drawn Minion receives its printed Life tokens')
  assertEqual(minion.enteredOnNemesisTurn, 1, 'Drawn Minion records the turn it entered play')

  const powerGame = nemesisGame()
  powerGame.nemesis.deck = ['agony_field']
  advanceNemesisTurn(powerGame)
  confirmNemesisDraw(powerGame)
  advanceNemesisTurn(powerGame)
  const power = powerGame.nemesis.playArea[0]!
  assertEqual(power.powerTokens, 2, 'Drawn Power receives its printed Power tokens')
  powerGame.currentTurn = 'nemesis'
  powerGame.currentPhase = 'nemesis_main'
  advanceNemesisMain(powerGame)
  assertEqual(powerGame.nemesis.playArea[0]!.powerTokens, 1, 'Power decreases on the next Nemesis turn')
}

function testNemesisResolutionIsSerializable(): void {
  const game = createGame('jian', 'brama')
  game.turnOrderDeck = ['nemesis']
  game.currentTurn = ''
  startTurn(game)
  assertEqual(game.currentTurn, 'nemesis', 'Turn order starts the Nemesis turn')
  assertEqual(game.currentPhase, 'nemesis_main', 'Nemesis turns start in Main Phase')
  assertEqual(game.nemesisResolution?.step, 'main', 'Nemesis Main continuation is initialized')
  assertEqual(game.nemesisResolution?.mainQueue.length, 0, 'Main queue snapshots the current play area')

  const restored = JSON.parse(JSON.stringify(game)) as GameState
  assertEqual(restored.nemesisResolution?.step, 'main', 'Nemesis continuation survives JSON round-trip')
  assertEqual(restored.nemesis.strikeDeck.length, 6, 'Strike deck survives JSON round-trip')
  assertEqual(restored.nemesis.counters.fury, 1, 'Nemesis counters survive JSON round-trip')
}

function testLethalGraveholdDamageStopsNemesisTurn(): void {
  const game = nemesisGame()
  game.gravehold.hp = 2
  game.nemesis.deck = ['cauterizer']
  game.nemesis.playArea = [{
    cardId: 'needlemaw', cardType: 'minion', placedAt: 1,
    instanceId: 'needlemaw:1', enteredOnNemesisTurn: -1, lifeTokens: 11,
  }]

  const messages = advanceNemesisMain(game)
  assert(game.gameOver, 'Lethal Gravehold damage ends the game immediately')
  assertEqual(game.winner, 'nemesis', 'Gravehold destruction awards the game to the Nemesis')
  assertEqual(game.gravehold.hp, 0, 'Lethal persistent damage clamps Gravehold HP at zero')
  assert(game.nemesis.deck.includes('cauterizer'), 'Nemesis does not draw another card after game over')
  assert(!game.nemesis.playArea.some(card => card.cardId === 'cauterizer'),
    'Nemesis does not place a later card after game over')
  assert(!messages.some(message => message.includes('Drew Minion: Cauterizer')),
    'Nemesis Main Phase does not continue into the Draw Phase after game over')
}

testNemesisMainAndDrawOrder()
testDrawnCardsEnterWithFreshCounters()
testNemesisResolutionIsSerializable()
testLethalGraveholdDamageStopsNemesisTurn()
console.log('Stage 2 Nemesis phase and lifecycle tests passed.')
