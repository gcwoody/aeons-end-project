import { createTwoPlayerScenario } from '../data'
import { clone } from '../engine/utilities'
import { createCardInstance } from '../engine/card-instances'
import {
  beginCardMoveTransaction,
  captureCardInstanceLocations,
  createCardInZone,
  getNemesisCardInstanceZone,
  getPlayerCardInstanceZone,
  getSharedDevelopCardInstanceZone,
  finishCardMoveTransaction,
  moveCardBetweenZones,
  withCardMoveTransaction,
} from '../engine/card-movement'
import { createGame, drawStrikeCard, returnStrikeCardToDeck } from '../engine'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function makeGame() {
  const scenario = createTwoPlayerScenario(['jian', 'brama'], 'rageborne', 'standard', {
    mode: 'manual',
    slots: ['clouded_sapphire', 'jade', 'searing_ruby', 'flexing_dagger', 'blasting_staff', 'phoenix_flame', 'ignite', 'dark_fire', 'chaos_arc'],
  })
  return createGame(scenario)
}

function testDuplicateCopiesKeepTheirIdentity(): void {
  const game = makeGame()
  const player = game.players[0]!
  player.hand = ['jade', 'jade']
  player.handInstanceIds = undefined
  player.handPreppedSpellInstanceIds = [null, null]
  player.discard = []
  player.discardInstanceIds = undefined

  const hand = getPlayerCardInstanceZone(game, player.id, 'hand')
  const discard = getPlayerCardInstanceZone(game, player.id, 'discard')
  const originalIds = [...hand.instanceIds]
  assert(originalIds[0] !== originalIds[1], 'Two copies with the same card ID have distinct physical IDs')

  const transaction = withCardMoveTransaction(game, 'discard', () => {
    moveCardBetweenZones(game, hand, 0, discard, 0, 'discard')
    moveCardBetweenZones(game, hand, 0, discard, discard.cards.length, 'discard')
  })

  assertEqual(transaction.events.length, 2, 'Each physical copy has one move fact')
  assert(transaction.events.every(event => event.kind === 'move'), 'Both facts describe real moves')
  assertEqual(transaction.events[0]!.instanceId, originalIds[0], 'First selected copy keeps its identity')
  assertEqual(transaction.events[1]!.instanceId, originalIds[1], 'Second selected copy keeps its identity')
  assertEqual(transaction.events[0]!.sequence, 1, 'First move has the first action sequence')
  assertEqual(transaction.events[1]!.sequence, 2, 'Second move has the next action sequence')
  assertEqual(discard.instanceIds.join(','), originalIds.join(','), 'Top and bottom insertion preserve the requested copy order')
  assertEqual(transaction.auditIssues.length, 0, 'The before/after location audit accepts both moves')
  assert(!('cardMoveEvents' in game), 'Move facts are not persisted on GameState')
}

function testCrossPlayerDeckDestinations(): void {
  const game = makeGame()
  const [owner, recipient] = game.players
  assert(owner && recipient, 'The test game has two players')
  owner.hand = ['jade', 'jade']
  owner.handInstanceIds = undefined
  owner.handPreppedSpellInstanceIds = [null, null]
  recipient.deck = ['focusing_orb']
  recipient.deckInstanceIds = undefined

  const hand = getPlayerCardInstanceZone(game, owner.id, 'hand')
  const deck = getPlayerCardInstanceZone(game, recipient.id, 'deck')
  const firstId = hand.instanceIds[0]!
  const secondId = hand.instanceIds[1]!
  const transaction = withCardMoveTransaction(game, 'effect', () => {
    moveCardBetweenZones(game, hand, 0, deck, 0, 'effect')
    moveCardBetweenZones(game, hand, 0, deck, deck.cards.length, 'effect')
  })

  assertEqual(transaction.events.length, 2, 'Both cross-player placements are recorded')
  assert(transaction.events.every(event => event.kind === 'move' && event.destination.ownerId === recipient.id), 'Facts name the receiving player')
  assertEqual(deck.instanceIds[0], firstId, 'The first card lands on top of the ally deck')
  assertEqual(deck.instanceIds[2], secondId, 'The second card lands on the bottom of the ally deck')
  assertEqual(transaction.auditIssues.length, 0, 'The audit accepts cross-player deck moves')
}

function testDevelopCreateMoveAndSnapshotRestore(): void {
  const game = makeGame()
  const player = game.players[0]!
  const before = clone(game)
  const transaction = withCardMoveTransaction(game, 'develop', () => {
    const develop = getSharedDevelopCardInstanceZone(game)
    const created = createCardInZone(game, develop, 'jade', develop.cards.length, 'develop', true)
    moveCardBetweenZones(game, develop, 0, getPlayerCardInstanceZone(game, player.id, 'discard'), 0, 'develop')
    return created.instanceId
  })

  assertEqual(transaction.events.length, 2, 'Supply entry and Develop exit have separate facts')
  assertEqual(transaction.events[0]!.kind, 'create', 'A newly gained Supply card is created as an entity')
  assertEqual(transaction.events[1]!.kind, 'move', 'The same entity then moves out of Develop')
  assertEqual(transaction.events[0]!.instanceId, transaction.events[1]!.instanceId, 'Develop keeps the created identity')
  assertEqual(transaction.auditIssues.length, 0, 'The audit accepts the Develop chain')

  Object.assign(game, before)
  const restored = captureCardInstanceLocations(game)
  assert(!restored.has(transaction.events[0]!.instanceId), 'Restoring the saved state removes the uncommitted Develop copy')
  assertEqual(game.players[0]!.discard.length, before.players[0]!.discard.length, 'Restoring the snapshot returns the discard to its prior state')
}

function testLegacyZonesGetStableIds(): void {
  const game = makeGame()
  const player = game.players[0]!
  player.handInstanceIds = undefined
  player.discardInstanceIds = undefined
  player.playedThisTurnInstanceIds = undefined
  player.swapZoneInstanceIds = undefined
  player.playerCardsInPlayInstanceIds = undefined
  player.destroyedCardInstanceIds = undefined
  game.developZoneInstanceIds = undefined

  const locations = captureCardInstanceLocations(game)
  const allIds = [...locations.keys()]
  const hand = getPlayerCardInstanceZone(game, player.id, 'hand')
  const discard = getPlayerCardInstanceZone(game, player.id, 'discard')
  const played = getPlayerCardInstanceZone(game, player.id, 'played_this_turn')
  assertEqual(new Set(allIds).size, allIds.length, 'Legacy migration gives every physical card a unique ID')
  assertEqual(hand.instanceIds.length, player.hand.length, 'Legacy hand receives a matching identity list')
  assertEqual(discard.instanceIds.length, player.discard.length, 'Legacy discard receives a matching identity list')
  assertEqual(played.instanceIds.length, player.playedThisTurn.length, 'Legacy played cards receive a matching identity list')
}

function testRepeatedZoneReadsWithTrinketsKeepIdArraysStable(): void {
  const game = makeGame()
  const player = game.players[0]!
  const trinket = createCardInstance(game, 'clouded_trinket', true)
  player.trinketInstanceIds = [trinket.instanceId]
  player.playedThisTurn = ['jade']
  player.playedThisTurnInstanceIds = undefined

  for (const zone of [
    'played_this_turn', 'deck', 'hand', 'discard', 'swap_zone',
    'specific_deck', 'player_cards_in_play', 'destroyed',
  ] as const) {
    const firstRead = getPlayerCardInstanceZone(game, player.id, zone)
    const firstIds = firstRead.instanceIds
    const secondRead = getPlayerCardInstanceZone(game, player.id, zone)
    assert(secondRead.instanceIds === firstIds,
      `Repeated ${zone} reads with an owned Trinket preserve the identity array`)
  }
}

function testStrikeKeepsItsIdentityWhileResolving(): void {
  const game = makeGame()
  game.nemesis.strikeDeck = ['convoke']
  game.nemesis.strikeDeckInstanceIds = undefined
  const draw = withCardMoveTransaction(game, 'reveal', () => drawStrikeCard(game))
  const instanceId = game.nemesis.resolvingStrikeCardInstanceId
  assertEqual(draw.value, 'convoke', 'The Strike can be drawn')
  assert(!!instanceId, 'A resolving Strike keeps its physical ID outside the deck')
  assertEqual(draw.events[0]?.kind, 'temporary', 'Drawing a Strike records its temporary reveal')
  assertEqual(draw.auditIssues.length, 0, 'The audit recognizes a Strike in its reveal step')

  const returned = withCardMoveTransaction(game, 'return', () => returnStrikeCardToDeck(game, 'convoke'))
  const deck = getNemesisCardInstanceZoneForTest(game)
  assert(deck.instanceIds.includes(instanceId!), 'The same Strike copy returns to its deck')
  assertEqual(returned.auditIssues.length, 0, 'The audit accepts Strike return and shuffle')
}

function testCallerOwnedActionBoundary(): void {
  const game = makeGame()
  const player = game.players[0]!
  player.hand = ['jade']
  player.handInstanceIds = undefined
  player.handPreppedSpellInstanceIds = [null]
  const hand = getPlayerCardInstanceZone(game, player.id, 'hand')
  const discard = getPlayerCardInstanceZone(game, player.id, 'discard')
  const transaction = beginCardMoveTransaction(game, 'discard')
  moveCardBetweenZones(game, hand, 0, discard, 0, 'discard')
  const result = finishCardMoveTransaction(transaction)

  assertEqual(result.events.length, 1, 'A caller-owned action returns its move facts')
  assertEqual(result.events[0]?.kind, 'move', 'The caller-owned transaction records a real move')
  assertEqual(result.auditIssues.length, 0, 'The caller-owned action boundary audits its final state')
}

function getNemesisCardInstanceZoneForTest(game: ReturnType<typeof makeGame>) {
  return getNemesisCardInstanceZone(game, 'strike_deck')
}

testDuplicateCopiesKeepTheirIdentity()
testCrossPlayerDeckDestinations()
testDevelopCreateMoveAndSnapshotRestore()
testLegacyZonesGetStableIds()
testRepeatedZoneReadsWithTrinketsKeepIdArraysStable()
testStrikeKeepsItsIdentityWhileResolving()
testCallerOwnedActionBoundary()
console.log('Card movement identity and fact tests passed.')
