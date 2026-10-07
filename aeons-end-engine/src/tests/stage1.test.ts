import { createGame } from '../engine'
import {
  BASIC_NEMESIS_CARDS,
  BASIC_NEMESIS_CARDS_BY_TIER,
  WAVE9_BASIC_NEMESIS_CARDS,
  CROOKED_MASK_CORRUPTION_CARDS,
  crookedMask,
  NEMESIS_CARDS,
  RAGEBORNE_STRIKE_CARDS,
  RAGEBORNE_UNIQUE_CARDS,
  RAGEBORNE_UNIQUE_CARDS_BY_TIER,
  buildRageborneDeck,
  buildRageborneStrikeDeck,
  getCard,
  rageborne,
  createTwoPlayerScenario,
} from '../data'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function fixedRandom(): () => number {
  return () => 0.37
}

function testNemesisCatalog(): void {
  assertEqual(Object.keys(BASIC_NEMESIS_CARDS).length, 43, 'Basic Nemesis catalog includes all supported waves')
  assertEqual(Object.keys(WAVE9_BASIC_NEMESIS_CARDS).length, 22, 'Wave 9 contributes 22 Basic Nemesis cards')
  assertEqual(Object.keys(RAGEBORNE_UNIQUE_CARDS).length, 9, 'Rageborne catalog contains 9 unique cards')
  assertEqual(Object.keys(RAGEBORNE_STRIKE_CARDS).length, 6, 'Rageborne catalog contains 6 Strike cards')

  for (const [tier, ids] of Object.entries(BASIC_NEMESIS_CARDS_BY_TIER)) {
    for (const id of ids) {
      const card = BASIC_NEMESIS_CARDS[id]!
      assertEqual(card.tier, Number(tier), `${id} is registered in the correct Basic tier`)
      assert(['attack', 'minion', 'power'].includes(card.type), `${id} uses a Nemesis card type`)
      if (card.type === 'minion') assert(typeof card.life === 'number', `${id} has Minion life`) 
      if (card.type === 'power') assert(typeof card.power === 'number', `${id} has Power tokens`)
      assertEqual(getCard(id).id, id, `${id} is available through the unified card lookup`)
    }
  }

  for (const [tier, ids] of Object.entries(RAGEBORNE_UNIQUE_CARDS_BY_TIER)) {
    assertEqual(ids.length, 3, `Rageborne has three unique cards in Tier ${tier}`)
    for (const id of ids) assertEqual(RAGEBORNE_UNIQUE_CARDS[id]!.tier, Number(tier), `${id} tier`)
  }
  for (const id of Object.keys(RAGEBORNE_STRIKE_CARDS)) assertEqual(getCard(id).type, 'strike', `${id} is a Strike card`)
}

function testCrookedMaskSetup(): void {
  assertEqual(Object.keys(CROOKED_MASK_CORRUPTION_CARDS).length, 11, 'Crooked Mask has eleven Corruption cards')
  const standard = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  assertEqual(standard.nemesis.name, 'Crooked Mask', 'Crooked Mask is selectable in Setup')
  assertEqual(standard.nemesis.hp, 70, 'Crooked Mask starts with 70 life')
  assertEqual(standard.nemesis.deck.length, 24, 'Crooked Mask deck contains 9 unique and 15 Basic cards')
  assertEqual(standard.nemesis.corruptionDeck?.length, 11, 'Crooked Mask initializes a shuffled Corruption deck')
  assertEqual(standard.nemesis.strikeDeck.length, 0, 'Crooked Mask does not receive a Strike deck')

  const increased = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask', 'increased'))
  for (const player of increased.players) {
    assertEqual(getCard(player.deck[player.deck.length - 1]!).type, 'corruption', 'Increased difficulty Corruption remains face down in the starting deck')
  }
  assertEqual(increased.nemesis.corruptionDeck?.length, 9, 'Increased difficulty takes one Corruption for each Mage')
  assert(Object.values(BASIC_NEMESIS_CARDS_BY_TIER).flat().includes('dark_conclusion'), 'Wave 9 Basic cards enter the shared Nemesis pool')
  assert(crookedMask.basicCardsPerTier[3] === 7, 'Crooked Mask uses seven Tier 3 Basic cards')
}

function testRageborneDeckBuilder(): void {
  const deck = buildRageborneDeck(fixedRandom())
  assertEqual(deck.length, 24, 'Two-player Rageborne deck contains 24 cards')
  const expectedTierSizes = [6, 8, 10]
  let offset = 0
  for (const [index, size] of expectedTierSizes.entries()) {
    const tier = (index + 1) as 1 | 2 | 3
    const tierCards = deck.slice(offset, offset + size)
    const uniqueCount = tierCards.filter(id => RAGEBORNE_UNIQUE_CARDS_BY_TIER[tier].includes(id)).length
    const basicCount = tierCards.filter(id => BASIC_NEMESIS_CARDS_BY_TIER[tier].includes(id)).length
    assertEqual(uniqueCount, 3, `Tier ${tier} contains three Rageborne unique cards`)
    assertEqual(basicCount, rageborne.basicCardsPerTier[tier], `Tier ${tier} contains the configured Basic cards`)
    offset += size
  }
  assertEqual(new Set(deck).size, deck.length, 'Nemesis deck contains no duplicate card definitions')
  assert(deck.every(id => !Object.prototype.hasOwnProperty.call(RAGEBORNE_STRIKE_CARDS, id)), 'Strike cards stay in the separate Strike deck')

  const lowRandomDeck = buildRageborneDeck(() => 0)
  const highRandomDeck = buildRageborneDeck(() => 0.999999)
  assert(JSON.stringify(lowRandomDeck) !== JSON.stringify(highRandomDeck), 'Nemesis tier shuffles respond to different random sources')

  const strikeDeck = buildRageborneStrikeDeck(fixedRandom())
  assertEqual(strikeDeck.length, 6, 'Rageborne Strike deck contains six cards')
  assertEqual(new Set(strikeDeck).size, strikeDeck.length, 'Strike deck contains no duplicate cards')
}

function testNemesisGameInitialization(): void {
  const scenario = createTwoPlayerScenario(['jian', 'brama'])
  const standard = createGame(scenario)
  assertEqual(standard.scenario.id, 'two_player', 'Game stores the selected scenario')
  assertEqual(standard.scenario.turnOrderDeckSize, 6, 'Two-player scenario always uses six turn-order cards')
  assertEqual(standard.turnOrderDeck.length, 6, 'Initial turn-order deck contains six cards')
  assertEqual(standard.players[0]!.id, 'wave1_JIAN', 'Player ID includes the Wave and Mage name')
  assertEqual(standard.players[1]!.id, 'wave1_BRAMA', 'Each player receives a stable Mage-based ID')
  assertEqual(standard.nemesis.definitionId, 'rageborne', 'Game uses the Rageborne definition')
  assertEqual(standard.nemesis.name, 'Rageborne', 'Game stores the Nemesis name')
  assertEqual(standard.nemesis.difficultyLevel, 2, 'Game stores the printed difficulty level')
  assertEqual(standard.nemesis.difficulty, 'standard', 'Standard difficulty is the default')
  assertEqual(standard.nemesis.deck.length, 24, 'Game initializes the configured Nemesis deck')
  assertEqual(standard.nemesis.strikeDeck.length, 6, 'Game initializes the Strike deck separately')
  assertEqual(standard.nemesis.counters.fury, 1, 'Rageborne starts with one Fury counter')

  const increased = createGame(createTwoPlayerScenario(['jian', 'brama'], 'rageborne', 'increased'))
  assertEqual(increased.nemesis.difficulty, 'increased', 'Increased difficulty is serializable at initialization')
  assertEqual(increased.nemesis.counters.fury, 1, 'Difficulty selection does not change initial Fury')

  let duplicateRejected = false
  try {
    createTwoPlayerScenario(['jian', 'jian'])
  } catch {
    duplicateRejected = true
  }
  assert(duplicateRejected, 'Scenario rejects selecting the same Mage twice')

  duplicateRejected = false
  try {
    createGame({ ...scenario, mageTypes: ['jian', 'jian'] })
  } catch {
    duplicateRejected = true
  }
  assert(duplicateRejected, 'Game creation rejects duplicate Mage IDs in a direct scenario')
}

testNemesisCatalog()
testCrookedMaskSetup()
testRageborneDeckBuilder()
testNemesisGameInitialization()
console.log('Stage 1 Nemesis data and deck tests passed.')
