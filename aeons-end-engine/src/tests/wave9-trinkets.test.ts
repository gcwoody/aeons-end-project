import { ALL_MARKET_CARDS, createTwoPlayerScenario, getCard } from '../data'
import {
  buyCard, canGainCharge, createGame, gainCharge, getTrinketDeckCards, isTrinketDeckCardRevealed,
  playCard, resolveEffects, resolvePendingDecision,
} from '../engine'
import { createCardInstance, isCardInstanceRevealed, resetCardInstancesAfterShuffle } from '../engine/card-instances'
import { ensureTrinketDeckState, rememberOwnedTrinketInstance } from '../engine/zones'
import { buildTrinketDeck, TRINKET_DECK_CARD_IDS } from '../data/wave9/special-decks/trinkets'
import type { GameState } from '../types'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function setMainPhase(game: GameState, playerId: string): void {
  game.currentTurn = playerId
  game.currentPhase = 'main'
}

function testTrinketDeckCompositionAndShuffle(): void {
  const deck = buildTrinketDeck(() => 0)
  assertEqual(deck.length, 13, 'The Trinket deck has thirteen cards')
  for (const cardId of ['clouded_trinket', 'ethereal_trinket', 'glittering_trinket', 'golden_trinket', 'power_trinket']) {
    assertEqual(deck.filter(candidate => candidate === cardId).length,
      TRINKET_DECK_CARD_IDS.filter(candidate => candidate === cardId).length,
      `${getCard(cardId).name} has the configured number of copies`)
  }
  assert(deck.join(',') !== TRINKET_DECK_CARD_IDS.join(','), 'Setup shuffles the fixed composition')

  const originalRandom = Math.random
  let game: GameState
  Math.random = () => 0
  try {
    game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  } finally {
    Math.random = originalRandom
  }
  assertEqual(game.trinketDeck?.length, 13, 'Every new game initializes the shared Trinket deck')
  assert(game.trinketDeck?.join(',') !== TRINKET_DECK_CARD_IDS.join(','),
    'Game setup stores the shuffled Trinket order, not the fixed composition order')
  assertEqual(game.trinketDeckRevealed?.filter(Boolean).length, 0, 'Setup starts every physical Trinket face-down')
  assertEqual(ALL_MARKET_CARDS.clouded_trinket, undefined, 'Trinkets do not enter the Supply catalog')
  assertEqual(getCard('clouded_trinket').mechanics?.includes('trinket'), true, 'Trinket cards are registered as player cards')
}

function testRevealMemoryBelongsToEachPhysicalTrinketCopy(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  game.trinketDeck = ['ethereal_trinket', 'ethereal_trinket', 'power_trinket']
  game.trinketDeckRevealed = [true, false, false]
  const knownCopyOutsideDeck = createCardInstance(game, 'ethereal_trinket', true).instanceId

  assertEqual(isTrinketDeckCardRevealed(game, 0), true, 'The revealed physical copy stays known')
  assertEqual(isTrinketDeckCardRevealed(game, 1), false, 'A matching printed copy stays face-down')

  resolveEffects(game, player.id, [{ kind: 'gain_trinkets', amount: 1, destination: 'discard_top' }], 'test', 0, player.id)
  assertEqual(player.discard[0], 'ethereal_trinket', 'A gained Trinket goes to the top of discard by default')
  assertEqual(game.trinketDeck?.join(','), 'ethereal_trinket,power_trinket', 'Gaining removes only the top physical copy')
  assertEqual(game.trinketDeckRevealed?.join(','), 'false,false', 'The remaining copy keeps its own face-down state')
  assertEqual(isTrinketDeckCardRevealed(game, 0), false, 'Removing a known copy does not reveal a matching copy')
  resetCardInstancesAfterShuffle(game, game.trinketDeckInstanceIds ?? [])
  assertEqual(isTrinketDeckCardRevealed(game, 0), false, 'Shuffling keeps the remaining copy unknown')
  assertEqual(isCardInstanceRevealed(game, knownCopyOutsideDeck), true,
    'Shuffling one deck does not erase knowledge of a matching card outside that deck')

  player.deck = []
  game.trinketDeck = ['golden_trinket', 'power_trinket']
  game.trinketDeckRevealed = [false, false]
  resolveEffects(game, player.id, [{
    kind: 'gain_trinkets', amount: 2, destination: 'deck_top',
  }], 'test', 0, player.id)
  assertEqual(player.deck.join(','), 'power_trinket,golden_trinket', 'Deck-top gains follow repeated top placement order')
  assertEqual(game.trinketDeck?.length, 0, 'Gaining empties the shared deck when its last cards leave')
  assertEqual(game.trinketDeckRevealed?.length, 0, 'Reveal memory stays aligned with an empty deck')

  const emptyMessage = resolveEffects(game, player.id, [{ kind: 'gain_trinkets', amount: 1 }], 'test', 0, player.id)
  assert(emptyMessage.some(message => message.includes('Trinket deck is empty')), 'An empty deck is handled without blocking the effect queue')
}

function testAnyPlayerCanGainTrinketsToTheirDeck(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const [source, ally] = game.players
  game.trinketDeck = ['glittering_trinket']
  game.trinketDeckRevealed = [false]
  const messages = resolveEffects(game, source!.id, [{
    kind: 'gain_trinkets', amount: 1, target: 'any_player', destination: 'deck_top',
  }], 'nemesis_card', 0, source!.id)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'An any-player effect asks which player receives Trinkets')
  assertEqual(decision.targets.length, 2, 'Either Mage can be selected')
  assert(messages.length > 0, 'Target selection pauses a serializable effect')

  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target', target: { kind: 'player', playerId: ally!.id },
  })
  assertEqual(ally!.deck[0], 'glittering_trinket', 'The selected player receives the revealed card on deck top')
  assertEqual(source!.deck.includes('glittering_trinket'), false, 'The source does not also receive the card')
}

function testPlayedTrinketsReturnFaceUpToTheBottom(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const startingDeckLength = getTrinketDeckCards(game).length
  player.hand = ['power_trinket']

  const result = playCard(game, player.id, 'power_trinket')
  assert(result?.includes('Returned Power Trinket to the bottom'), 'Playing a Trinket reports its return')
  assertEqual(player.charge, 1, 'Power Trinket resolves its card effect before returning')
  assertEqual(player.playedThisTurn.includes('power_trinket'), false, 'A returned Trinket is removed from Played')
  assertEqual(game.trinketDeck?.length, startingDeckLength + 1, 'A played Trinket re-enters the shared deck')
  assertEqual(game.trinketDeck?.[game.trinketDeck.length - 1], 'power_trinket', 'The played Trinket goes to the bottom')
  assertEqual(game.trinketDeckRevealed?.[game.trinketDeckRevealed.length - 1], true, 'A returned Trinket remains face-up as a known copy')
  assertEqual(isTrinketDeckCardRevealed(game, game.trinketDeck!.length - 1), true,
    'The returned copy is visible in the deck viewer')
}

function testCloudedTrinketCanSkipCasting(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const breach = player.breaches.find(candidate => candidate.present !== false)!
  breach.opened = true
  breach.prepSpells.push('spark')
  breach.preppedThisTurn?.push(false)
  player.hand = ['clouded_trinket']

  playCard(game, player.id, 'clouded_trinket')
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_prepped_spells', 'Clouded Trinket offers a prepared spell')
  assertEqual(decision.min, 0, 'The optional spell selection allows skipping')
  assertEqual(decision.confirmSelection, true, 'The optional selection waits for Confirm')
  resolvePendingDecision(game, decision.id, { kind: 'select_prepped_spells', choices: [] })
  assertEqual(game.pendingDecision, null, 'Skipping completes the optional cast')
  assertEqual(player.playedThisTurn.includes('clouded_trinket'), false, 'Skipping still returns the Trinket to its deck')
  assertEqual(game.trinketDeckRevealed?.[game.trinketDeckRevealed.length - 1], true, 'Clouded Trinket returns as a known card')
}

function testGoldenTrinketAetherIsOnlySpendableToGainCards(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  player.bonusAether = 2
  assertEqual(canGainCharge(game, player.id), true, 'Two general Aether enables the Charge button')
  player.charge = player.chargeThreshold
  assertEqual(canGainCharge(game, player.id), false, 'A full charge track disables the Charge button')
  player.charge = 0
  player.bonusAether = 0
  player.conditionalAetherEarned = { gain: 3 }
  player.condAetherSpent = {}
  player.regularAetherSpent = 0

  assertEqual(canGainCharge(game, player.id), false, 'Gain-only Aether cannot enable the Charge button')
  const chargeMessage = gainCharge(game, player.id, 1)
  assert(chargeMessage?.includes('Need 2 Aether'), 'Gain-only Aether cannot pay for charge')
  const pileIndex = game.market.piles.findIndex(pile => pile.cardId === 'vriswood_amber')
  assert(pileIndex >= 0, 'The default market contains a Gem to purchase')
  const buyMessage = buyCard(game, player.id, pileIndex)
  assert(buyMessage?.includes('Bought V\'riswood Amber'), 'Gain-only Aether can buy a Supply card')
  assertEqual(player.condAetherSpent.gain, 3, 'The purchase spends its conditional Aether')
}

function testOlderSavesInitializeTrinketsWithoutLosingDeckKnowledge(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  delete game.trinketDeck
  delete game.trinketDeckRevealed
  assertEqual(getTrinketDeckCards(game).length, 13, 'An older save receives a Trinket deck on first access')
  assertEqual(getTrinketRevealCount(game), 13, 'Old-save reveal memory defaults to face-down copies')

  const saved = JSON.parse(JSON.stringify(game)) as GameState
  saved.trinketDeck = ['power_trinket', 'power_trinket']
  saved.trinketDeckRevealed = [true, false]
  assertEqual(isTrinketDeckCardRevealed(saved, 0), true, 'Known-card memory persists through JSON save/load')
  assertEqual(isTrinketDeckCardRevealed(saved, 1), false, 'A matching copy keeps its independent state after save/load')
}

function testPlayedCloudedCopyDoesNotRevealMatchingTrinketOnTop(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  game.trinketDeck = ['clouded_trinket']
  game.trinketDeckRevealed = [false]
  const topCopyInstanceId = ensureTrinketDeckState(game).instanceIds[0]!
  const playedCopyInstanceId = createCardInstance(game, 'clouded_trinket').instanceId
  rememberOwnedTrinketInstance(player, playedCopyInstanceId)
  assertEqual(player.trinketInstanceIds?.join(','), playedCopyInstanceId,
    'The played Clouded copy is tracked separately from the shared deck copies')
  player.hand = ['clouded_trinket']

  playCard(game, player.id, 'clouded_trinket')
  const optionalCast = game.pendingDecision
  if (optionalCast?.kind === 'select_prepped_spells') {
    resolvePendingDecision(game, optionalCast.id, { kind: 'select_prepped_spells', choices: [] })
  }
  const deck = ensureTrinketDeckState(game)
  assertEqual(deck.cards[0], 'clouded_trinket', 'The untouched top copy remains in the deck')
  assertEqual(deck.instanceIds[0], topCopyInstanceId, 'The untouched top copy keeps its physical identity')
  assertEqual(isTrinketDeckCardRevealed(game, 0), false,
    'Returning the played Clouded Trinket does not reveal the other Clouded copy')
  assertEqual(deck.cards[1], 'clouded_trinket', 'The played copy returns at the bottom')
  assertEqual(deck.instanceIds[1], playedCopyInstanceId, 'The played copy returns with its own identity')
  assertEqual(isTrinketDeckCardRevealed(game, 1), true, 'The returned played copy remains face-up')
}

function getTrinketRevealCount(game: GameState): number | undefined {
  return game.trinketDeckRevealed?.length
}

testTrinketDeckCompositionAndShuffle()
testRevealMemoryBelongsToEachPhysicalTrinketCopy()
testPlayedCloudedCopyDoesNotRevealMatchingTrinketOnTop()
testAnyPlayerCanGainTrinketsToTheirDeck()
testPlayedTrinketsReturnFaceUpToTheBottom()
testCloudedTrinketCanSkipCasting()
testGoldenTrinketAetherIsOnlySpendableToGainCards()
testOlderSavesInitializeTrinketsWithoutLosingDeckKnowledge()

console.log('Wave 9 Trinket tests passed')
