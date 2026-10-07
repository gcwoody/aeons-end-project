import { createGame, gainFirethornTopCard, isSpecificDeckCardRevealed, resolveEffects, resolvePendingDecision } from '../engine'
import { initializeCardInstanceZone } from '../engine/card-instances'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function firethornDeckForRandomValue(randomValue: number): string[] {
  const originalRandom = Math.random
  try {
    Math.random = () => randomValue
    return createGame('inco', 'qu').players.find(player => player.mageType === 'inco')!.specificDeck!
  } finally {
    Math.random = originalRandom
  }
}

function testFirethornDeckIsShuffledAtGameStart(): void {
  const originalOrder = firethornDeckForRandomValue(0.999999)
  const shuffledOrder = firethornDeckForRandomValue(0)
  const expectedCounts = new Map([
    ['arcing_firethorn', 2],
    ['blooming_firethorn', 2],
    ['calming_firethorn', 2],
    ['imbued_firethorn', 2],
    ['revealing_firethorn', 2],
  ])

  assertEqual(originalOrder.length, 10, 'The Firethorn deck starts with ten cards')
  assertEqual(shuffledOrder.length, 10, 'Shuffling preserves the Firethorn deck size')
  for (const [cardId, expectedCount] of expectedCounts) {
    assertEqual(originalOrder.filter(id => id === cardId).length, expectedCount, `${cardId} has two copies`)
    assertEqual(shuffledOrder.filter(id => id === cardId).length, expectedCount, `Shuffling preserves both ${cardId} copies`)
  }
  assert(shuffledOrder.some((cardId, index) => cardId !== originalOrder[index]),
    'Game setup randomizes the Firethorn order')
}

function testFirethornRevealMemoryDoesNotSpreadToMatchingCopies(): void {
  const game = createGame('inco', 'qu')
  const inco = game.players.find(player => player.mageType === 'inco')!
  inco.specificDeck = ['arcing_firethorn', 'arcing_firethorn', 'arcing_firethorn']
  inco.specificDeckInstanceIds = initializeCardInstanceZone(game, inco.specificDeck)

  assertEqual(isSpecificDeckCardRevealed(game, inco.id, 0), true,
    'The top Firethorn copy is visible by the Firethorn deck rule')
  assertEqual(isSpecificDeckCardRevealed(game, inco.id, 1), false,
    'The second matching Firethorn copy stays hidden')
  assertEqual(isSpecificDeckCardRevealed(game, inco.id, 2), false,
    'The third matching Firethorn copy stays hidden')

  game.currentTurn = inco.id
  game.currentPhase = 'main'
  inco.bonusAether = 5
  assert(gainFirethornTopCard(game, inco.id)?.includes('Gained'),
    'Inco can gain the revealed top Firethorn')
  assertEqual(inco.specificDeckInstanceIds?.length, 2,
    'Gaining a Firethorn removes its matching instance ID from the deck')
  assertEqual(isSpecificDeckCardRevealed(game, inco.id, 0), true,
    'The next physical Firethorn is visible when it becomes the top card')
  assertEqual(isSpecificDeckCardRevealed(game, inco.id, 1), false,
    'A matching copy deeper in the deck remains hidden')
}

function testAmbiguousLegacySpecificDeckMemoryDoesNotRevealEveryCopy(): void {
  const game = createGame('inco', 'qu')
  const inco = game.players.find(player => player.mageType === 'inco')!
  inco.specificDeck = ['arcing_firethorn', 'arcing_firethorn']
  inco.specificDeckInstanceIds = undefined
  inco.knownSpecificDeckCards = ['arcing_firethorn']

  assertEqual(isSpecificDeckCardRevealed(game, inco.id, 0), true,
    'The Firethorn top-revealed rule still reveals the current top card')
  assertEqual(isSpecificDeckCardRevealed(game, inco.id, 1), false,
    'An old cardId-only save does not reveal every matching physical copy')
}

function testIncoRevealsBothDecksEvenWhenNoFirethornIsAvailable(): void {
  const game = createGame('inco', 'qu')
  const [inco, ally] = game.players
  assert(inco && ally, 'The two players are present')
  inco.deck = ['crystal', 'spark']
  inco.discard = ['jade']
  ally.deck = ['spark', 'crystal']
  ally.discard = ['jade']

  resolveEffects(game, inco.id, [{ kind: 'reveal_firethorns', playerCount: 2 }], undefined, 0, inco.id)

  const firstReveal = game.pendingDecision
  assert(firstReveal?.kind === 'select_cards', 'The first player receives a reveal decision without Firethorns')
  assertEqual(firstReveal.ownerId, inco.id, 'The first reveal belongs to Inco')
  assertEqual(firstReveal.min, 0, 'The no-Firethorn reveal can be skipped')
  assertEqual(firstReveal.max, 0, 'No Firethorns are selectable')
  assert(firstReveal.candidates.some(choice => choice.zone === 'deck' && choice.cardId === 'crystal') &&
    firstReveal.candidates.some(choice => choice.zone === 'discard' && choice.cardId === 'jade'),
  'The first player sees both their Deck and Discard Pile')
  assert(firstReveal.candidates.every(choice => choice.disabled),
    'Non-Firethorn cards remain visible but cannot be selected')

  resolvePendingDecision(game, firstReveal.id, { kind: 'select_cards', choices: [] })
  const secondReveal = game.pendingDecision
  assert(secondReveal?.kind === 'select_cards', 'The second player also receives a reveal decision')
  assertEqual(secondReveal.ownerId, ally.id, 'The next reveal belongs to the other player')
  assertEqual(secondReveal.max, 0, 'The second player also has no selectable Firethorns')
  resolvePendingDecision(game, secondReveal.id, { kind: 'select_cards', choices: [] })
  assertEqual(game.pendingDecision, null, 'Skipping both empty reveals completes Inco\'s effect')
}

function testIncoFirethornChoiceShowsBothZonesAndMovesSelectedCardsToHand(): void {
  const game = createGame('inco', 'qu')
  const [inco, ally] = game.players
  assert(inco && ally, 'The two players are present')
  inco.deck = ['arcing_firethorn', 'crystal']
  inco.discard = ['jade', 'blooming_firethorn']
  ally.deck = ['spark']
  ally.discard = ['crystal']

  resolveEffects(game, inco.id, [{ kind: 'reveal_firethorns', playerCount: 2 }], undefined, 0, inco.id)

  const choice = game.pendingDecision
  assert(choice?.kind === 'select_cards', 'Inco receives a choice when Firethorns are present')
  assertEqual(choice.min, 0, 'The player may skip choosing Firethorns')
  assertEqual(choice.max, 2, 'The player may choose up to two Firethorns')
  assert(choice.candidates.some(candidate => candidate.zone === 'deck' && candidate.cardId === 'arcing_firethorn' && !candidate.disabled),
    'A Firethorn in the revealed Deck is selectable')
  assert(choice.candidates.some(candidate => candidate.zone === 'discard' && candidate.cardId === 'blooming_firethorn' && !candidate.disabled),
    'A Firethorn in the Discard Pile is selectable')
  assert(choice.candidates.some(candidate => candidate.cardId === 'crystal' && candidate.disabled),
    'Other revealed cards remain visible but disabled')
  assert(choice.candidates.some(candidate => candidate.cardId === 'jade' && candidate.disabled),
    'Non-Firethorns in the Discard Pile remain visible but disabled')

  resolvePendingDecision(game, choice.id, {
    kind: 'select_cards',
    choices: [
      choice.candidates.find(candidate => candidate.cardId === 'arcing_firethorn')!,
      choice.candidates.find(candidate => candidate.cardId === 'blooming_firethorn')!,
    ],
  })
  assert(inco.hand.includes('arcing_firethorn') && inco.hand.includes('blooming_firethorn'),
    'Selected Firethorns from both zones enter Inco\'s hand')
  assertEqual(inco.deck.join(','), 'crystal', 'The unselected Deck card keeps its order')
  assertEqual(inco.discard.join(','), 'jade', 'The unselected Discard card remains in place')

  const allyReveal = game.pendingDecision
  assert(allyReveal?.kind === 'select_cards' && allyReveal.ownerId === ally.id,
    'After Inco decides, the other player still receives a reveal decision')
  assertEqual(allyReveal.max, 0, 'The other player has no legal Firethorn choices')
  resolvePendingDecision(game, allyReveal.id, { kind: 'select_cards', choices: [] })
  assertEqual(game.pendingDecision, null, 'Skipping the second player completes the effect')
}

testFirethornDeckIsShuffledAtGameStart()
testFirethornRevealMemoryDoesNotSpreadToMatchingCopies()
testAmbiguousLegacySpecificDeckMemoryDoesNotRevealEveryCopy()
testIncoRevealsBothDecksEvenWhenNoFirethornIsAvailable()
testIncoFirethornChoiceShowsBothZonesAndMovesSelectedCardsToHand()
console.log('Wave 9 Inco tests passed')
