import { ALL_NEMESIS_CARDS, createTwoPlayerScenario } from '../data'
import type { NemesisCardDef } from '../types'
import { clone } from '../engine/utilities'
import { createCardInstance, isCardInstanceRevealed } from '../engine/card-instances'
import { shufflePlayerDiscardIntoDeck } from '../engine/zones'
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
import { createGame, drawStrikeCard, resolveEffects, resolvePendingDecision, returnStrikeCardToDeck } from '../engine'

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

function testShuffledDiscardMovesKeepOriginalSourcesAndFinalDestinations(): void {
  const game = makeGame()
  const player = game.players[0]!
  player.deck = ['spark', 'crystal']
  player.deckInstanceIds = undefined
  player.discard = ['jade', 'jade', 'crystal']
  player.discardInstanceIds = undefined
  const discardedIds = [...getPlayerCardInstanceZone(game, player.id, 'discard').instanceIds]
  const existingDeckIds = [...getPlayerCardInstanceZone(game, player.id, 'deck').instanceIds]

  const result = withCardMoveTransaction(game, 'effect', () => shufflePlayerDiscardIntoDeck(game, player))
  const moves = result.events.filter(event => event.kind === 'move')
  assertEqual(moves.length, discardedIds.length, 'Each discarded copy has a discard-to-deck move fact')
  for (const [index, move] of moves.entries()) {
    assertEqual(move.instanceId, discardedIds[index], 'Discard transfer order keeps each physical copy')
    assertEqual(move.source.zone, 'discard', 'The original pile is recorded as the movement source')
    assertEqual(move.source.index, index, 'The source index comes from the original discard order')
    assertEqual(move.destination.zone, 'deck', 'The shuffled deck is the movement destination')
    assertEqual(move.destination.index, player.deckInstanceIds!.indexOf(move.instanceId),
      'The destination index matches the final shuffled deck position')
    assertEqual(move.reason, 'shuffle', 'The movement explains why the discard enters the deck')
  }
  assertEqual(result.events.filter(event => event.kind === 'shuffle').length, 5,
    'The original shuffle facts still describe every shuffled card')
  assert([...existingDeckIds, ...discardedIds].every(instanceId => !isCardInstanceRevealed(game, instanceId)),
    'Shuffle forgets the positions of both existing deck cards and discarded cards')
  assertEqual(result.auditIssues.length, 0, 'Discard-to-deck transfers pass the location audit')
}

function startGatherDarkness(game: ReturnType<typeof makeGame>, playerId: string): void {
  const card = ALL_NEMESIS_CARDS.gather_darkness! as NemesisCardDef
  const effects = card.nemesisEffects!.find(block => block.trigger === 'immediately')!.effects
  resolveEffects(game, undefined, effects, card.id)
  const choice = game.pendingDecision
  if (choice?.kind !== 'select_player_target') throw new Error('Gather Darkness must request a player')
  const target = choice.targets.find(candidate => candidate.playerId === playerId)
  if (!target) throw new Error('The requested player must remain a valid Gather Darkness target')
  resolvePendingDecision(game, choice.id, { kind: 'select_player_target', target })
}

function acceptCardMotionBarrier(game: ReturnType<typeof makeGame>): void {
  const decision = game.pendingDecision
  if (decision?.kind !== 'await_card_motions') throw new Error('Card movements must finish before continuing')
  resolvePendingDecision(game, decision.id, { kind: 'await_card_motions', accepted: true })
}

function testGatherDarknessWaitsForDiscardAndDestructionSeparately(): void {
  const game = makeGame()
  const player = game.players[0]!
  player.deck = ['spark', 'crystal', 'jade']
  player.deckInstanceIds = undefined
  player.discard = ['crystal', 'crystal', 'spark', 'jade']
  player.discardInstanceIds = undefined
  game.nemesis.counters.fury = 0
  const discardedIds = [...getPlayerCardInstanceZone(game, player.id, 'discard').instanceIds]

  const transfer = withCardMoveTransaction(game, 'effect', () => startGatherDarkness(game, player.id))
  assertEqual(game.pendingDecision?.kind, 'await_card_motions', 'Discard transfer pauses before destroying cards')
  assertEqual(player.deck.length, 7, 'All discarded cards reach the shuffled deck before destruction')
  assertEqual(player.discard.length, 0, 'The discard pile is emptied by the shuffle')
  assertEqual(player.destroyedCards.length, 0, 'No top card is destroyed before the transfer barrier')
  assertEqual(game.nemesis.counters.fury, 0, 'Unleash has not resolved during the transfer')
  assertEqual(transfer.events.filter(event => event.kind === 'move').map(event => event.instanceId).join(','),
    discardedIds.join(','), 'The transfer captures every original discarded copy in order')
  assertEqual(transfer.auditIssues.length, 0, 'The transfer phase passes the movement audit')
  const expectedDestroyedIds = player.deckInstanceIds!.slice(0, 4)

  const destruction = withCardMoveTransaction(game, 'effect', () => acceptCardMotionBarrier(game))
  assertEqual(game.pendingDecision?.kind, 'await_card_motions', 'Top-card destruction has a second barrier')
  assertEqual(player.destroyedCards.length, 4, 'Exactly four top cards are removed after the transfer finishes')
  assertEqual(destruction.events.filter(event => event.kind === 'destroy').map(event => event.instanceId).join(','),
    expectedDestroyedIds.join(','), 'Destruction facts follow the actual shuffled top-card order')
  assertEqual(game.nemesis.counters.fury, 0, 'Unleash waits until all four destroy movements finish')
  assertEqual(destruction.auditIssues.length, 0, 'The destruction phase passes the movement audit')

  acceptCardMotionBarrier(game)
  assertEqual(game.nemesis.counters.fury, 2, 'Unleash twice resolves only after both movement phases')
  assertEqual(game.pendingDecision, null, 'The completed attack leaves no movement decision behind')
}

function testGatherDarknessAllowsEmptyDiscardAndDoesNotWaitForMissingMoves(): void {
  const game = makeGame()
  const player = game.players[0]!
  player.deck = ['crystal', 'spark']
  player.deckInstanceIds = undefined
  player.discard = []
  player.discardInstanceIds = undefined
  game.nemesis.counters.fury = 0

  startGatherDarkness(game, player.id)
  assertEqual(player.destroyedCards.length, 2, 'An empty discard remains valid and the available deck cards are destroyed')
  assertEqual(game.pendingDecision?.kind, 'await_card_motions', 'Actual top-card destruction still waits for movement')
  acceptCardMotionBarrier(game)
  assertEqual(game.nemesis.counters.fury, 2, 'No extra transfer barrier is needed for an empty discard')

  const emptyGame = makeGame()
  const emptyPlayer = emptyGame.players[0]!
  emptyPlayer.deck = []
  emptyPlayer.deckInstanceIds = undefined
  emptyPlayer.discard = []
  emptyPlayer.discardInstanceIds = undefined
  emptyGame.nemesis.counters.fury = 0
  startGatherDarkness(emptyGame, emptyPlayer.id)
  assertEqual(emptyGame.pendingDecision, null, 'An empty deck and discard do not create a movement stall')
  assertEqual(emptyGame.nemesis.counters.fury, 2, 'With no moved cards, Unleash resolves immediately')
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
testShuffledDiscardMovesKeepOriginalSourcesAndFinalDestinations()
testGatherDarknessWaitsForDiscardAndDestructionSeparately()
testGatherDarknessAllowsEmptyDiscardAndDoesNotWaitForMissingMoves()
console.log('Card movement identity and fact tests passed.')
