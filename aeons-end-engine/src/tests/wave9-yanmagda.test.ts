import { activateAbility, createGame } from '../engine'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function testVoidTouchUsesUnboundedSupplyPrompt(): void {
  const game = createGame('yan_magda', 'jian')
  const yanMagda = game.players[0]!
  game.currentTurn = yanMagda.id
  game.currentPhase = 'main'
  yanMagda.charge = yanMagda.chargeThreshold

  activateAbility(game, yanMagda.id)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_market_pile', 'Void Touch asks the player to select a supply pile')
  assertEqual(decision.prompt, 'Choose a supply card to gain',
    'Void Touch describes its any-supply effect without exposing an artificial cost limit')
  assert(decision.candidates.length > 0, 'Any non-empty supply pile remains a valid choice')
}

testVoidTouchUsesUnboundedSupplyPrompt()
console.log('Wave 9 Yan Magda ability prompt tests passed.')
