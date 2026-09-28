import { getCard, MAGES } from '../data'
import {
  activateAbility,
  castSpell,
  createGame,
  destroyCard,
  playCard,
  prepSpell,
  resolvePendingDecision,
} from '../engine'
import type { CardChoice, GameState } from '../types'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function assertCards(actual: string[], expected: string[], message: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), message)
}

function freshNookGame(): GameState {
  const game = createGame('nook', 'jian')
  game.currentTurn = game.players[0]!.id
  game.currentPhase = 'main'
  return game
}

function resolveChoice(game: GameState, optionId: string): void {
  const decision = game.pendingDecision
  assert(decision?.kind === 'choose_one', 'Expected a choose-one decision')
  resolvePendingDecision(game, decision.id, { kind: 'choose_one', optionId })
}

function choiceIn(decision: Extract<NonNullable<GameState['pendingDecision']>, { kind: 'select_cards' }>, cardId: string): CardChoice {
  const choice = decision.candidates.find(candidate => candidate.cardId === cardId)
  assert(choice, `Expected ${cardId} to be selectable`)
  return choice
}

function testNookSetup(): void {
  const game = freshNookGame()
  const nook = game.players[0]!
  assertEqual(nook.mageType, 'nook', 'Nook is available in a scenario')
  assertEqual(MAGES.nook?.abilityName, 'Rupture Time', 'Nook ability is registered')
  assertCards(nook.hand, ['superior_crystal', 'wave9_crystal', 'wave9_crystal', 'superior_spark', 'wave9_spark'],
    'Nook starts with the documented hand')
  assertCards(nook.deck, ['wave9_crystal', 'wave9_crystal', 'wave9_crystal', 'wave9_spark', 'wave9_spark'],
    'Nook starts with the documented deck')
  assertCards(nook.swapZone ?? [], [
    'infused_crystal', 'dim_crystal', 'empty_crystal',
    'infused_spark', 'empty_spark', 'dim_spark',
  ], 'Nook Swap zone starts in its documented left-to-right order')
  assertCards(game.developZone ?? [], [], 'The shared Develop zone starts empty')
}

function testCrystalSwapSequence(): void {
  const game = freshNookGame()
  const nook = game.players[0]!
  nook.hand = ['superior_crystal']
  playCard(game, nook.id, 'superior_crystal')
  resolveChoice(game, 'swap')

  assertEqual(nook.bonusAether, 3, 'Superior Crystal swap option grants three Aether')
  assertEqual(nook.discard[0], 'infused_crystal', 'Swap card enters the top of the discard pile')
  assertCards(nook.swapZone ?? [], [
    'dim_crystal', 'empty_crystal', 'infused_spark', 'empty_spark', 'dim_spark', 'superior_crystal',
  ], 'The source card is appended at the right edge of the Swap zone')

  const dimGame = freshNookGame()
  const dimNook = dimGame.players[0]!
  dimNook.hand = ['dim_crystal']
  dimNook.swapZone = ['empty_crystal']
  playCard(dimGame, dimNook.id, 'dim_crystal')
  assertEqual(dimNook.bonusAether, 1, 'Dim Crystal grants its mandatory one Aether')
  assertEqual(dimNook.discard[0], 'empty_crystal', 'Dim Crystal automatically gains Empty Crystal')
  assertCards(dimNook.swapZone ?? [], ['dim_crystal'], 'Mandatory swaps append the source card on the right')

  const unavailableGame = freshNookGame()
  const unavailableNook = unavailableGame.players[0]!
  unavailableNook.hand = ['superior_crystal']
  unavailableNook.swapZone = []
  playCard(unavailableGame, unavailableNook.id, 'superior_crystal')
  resolveChoice(unavailableGame, 'swap')
  assertEqual(unavailableNook.bonusAether, 3, 'A swap option still grants its listed Aether when the target is unavailable')
  assertCards(unavailableNook.swapZone ?? [], ['superior_crystal'],
    'A source card enters the Swap zone when its requested target is unavailable')
  assertCards(unavailableNook.discard, [], 'No replacement card is gained when the requested target is unavailable')
}

function testSpellSwapSequence(): void {
  const game = freshNookGame()
  const nook = game.players[0]!
  nook.hand = ['superior_spark']
  const nemesisHp = game.nemesis.hp
  assert(prepSpell(game, nook.id, 'superior_spark', 1)?.includes('Prepped'), 'Superior Spark can be prepped')
  castSpell(game, nook.id, 1)
  resolveChoice(game, 'swap')

  assertEqual(game.nemesis.hp, nemesisHp - 3, 'Superior Spark swap option deals three damage')
  assertEqual(nook.discard[0], 'infused_spark', 'Infused Spark enters the top of the discard pile')
  assertEqual(nook.swapZone?.[nook.swapZone.length - 1], 'superior_spark', 'Cast spells enter the Swap zone after swapping')
}

function testRuptureTimeAndEmptyCardDestruction(): void {
  const game = freshNookGame()
  const nook = game.players[0]!
  nook.charge = nook.chargeThreshold
  nook.hand = ['crystal', 'superior_spark', 'jade']
  nook.discard = ['spark']

  activateAbility(game, nook.id)
  const moveDecision = game.pendingDecision
  assert(moveDecision?.kind === 'select_cards', 'Rupture Time asks which cards enter the Swap zone')
  if (!moveDecision || moveDecision.kind !== 'select_cards') return
  resolvePendingDecision(game, moveDecision.id, {
    kind: 'select_cards',
    choices: ['crystal', 'superior_spark', 'spark'].map(cardId => choiceIn(moveDecision, cardId)),
  })

  const gainDecision = game.pendingDecision
  assert(gainDecision?.kind === 'select_cards', 'Rupture Time then asks which Swap zone card to gain')
  if (!gainDecision || gainDecision.kind !== 'select_cards') return
  const target = choiceIn(gainDecision, 'dim_spark')
  assertEqual(target.zone, 'swap_zone', 'Rupture Time exposes Swap zone choices directly')
  resolvePendingDecision(game, gainDecision.id, { kind: 'select_cards', choices: [target] })

  assertEqual(nook.charge, 0, 'Rupture Time spends all charge')
  assertEqual(nook.discard[0], 'dim_spark', 'Rupture Time gains the chosen Swap zone card to discard top')
  assertCards([...(nook.swapZone?.slice(-3) ?? [])].sort(), ['crystal', 'spark', 'superior_spark'],
    'Cards moved by Rupture Time occupy the right edge of the Swap zone')

  nook.hand = ['empty_crystal']
  const result = destroyCard(game, nook.id, {
    zone: 'hand', index: 0, cardId: 'empty_crystal', cardName: getCard('empty_crystal').name,
  })
  assert(result?.includes('returns to the Swap zone'), 'Empty Crystal uses its replacement destination when destroyed')
  assertEqual(nook.swapZone?.[nook.swapZone.length - 1], 'empty_crystal', 'Destroyed Empty Crystal is appended to the Swap zone')
  assert(!nook.destroyedCards.includes('empty_crystal'), 'Empty Crystal is not placed in the destroyed-card area')
}

testNookSetup()
testCrystalSwapSequence()
testSpellSwapSequence()
testRuptureTimeAndEmptyCardDestruction()

console.log('Wave 9 Nook tests passed')
