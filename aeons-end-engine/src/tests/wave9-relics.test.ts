import { createTwoPlayerScenario, getCard } from '../data'
import { createGame, playCard, resolveEffects, resolvePendingDecision } from '../engine'
import type { GameState } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function testThoughtTotemRefillsARevealFromTheUnshuffledDiscardPile(): void {
  const game: GameState = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  game.currentTurn = player.id
  game.currentPhase = 'main'
  player.hand = ['thought_totem']
  player.deck = ['jade', 'moonstone_shard']
  player.discard = ['crystal', 'spark']

  playCard(game, player.id, 'thought_totem')

  const decision = game.pendingDecision
  assert(decision?.kind === 'select_cards' && decision.reorderable,
    'Thought Totem opens its card selection after revealing the requested cards')
  assertEqual(decision.candidates.map(choice => choice.cardId).join(','),
    'jade,moonstone_shard,spark',
    'The reveal continues into the reversed, unshuffled discard pile after the deck cards')
  assertEqual(player.discard.length, 0,
    'The full player discard pile is recycled into the deck before the reveal decision')
  assertEqual(player.deck[3], 'crystal',
    'The unshown recycled card remains below the revealed cards')

  const selected = decision.candidates[1]!
  const reordered = [decision.candidates[2]!, decision.candidates[0]!, selected]
  resolvePendingDecision(game, decision.id, {
    kind: 'select_cards', choices: [selected], order: reordered,
  })

  assertEqual(player.deck.slice(0, 3).join(','), 'spark,jade,crystal',
    'Unselected revealed cards return to the deck top in the confirmed order')
  assertEqual(player.discard[0], 'moonstone_shard',
    'Only the selected revealed card goes to the discard pile')
  assertEqual(game.pendingDecision, null, 'The reveal and discard decision completes')
}

function testVisionaryStaffRepeatsOneSelectedRecallFromTheDiscardPile(): void {
  const crystal = getCard('crystal')
  const jade = getCard('jade')
  const originalCrystalEffects = crystal.effects
  const originalCrystalMechanics = crystal.mechanics
  const originalJadeEffects = jade.effects
  const originalJadeMechanics = jade.mechanics
  try {
    crystal.mechanics = [...(crystal.mechanics ?? []), 'recall']
    crystal.effects = [{
      trigger: { kind: 'recall' },
      effects: [
        { kind: 'gain_aether_token', amount: 1, target: 'ally' },
        { kind: 'move_source_card_to_hand' },
      ],
    }]
    jade.mechanics = [...(jade.mechanics ?? []), 'recall']
    jade.effects = [{
      trigger: { kind: 'recall' },
      effects: [{ kind: 'gain_aether_token', amount: 1 }],
    }]

    const game: GameState = createGame(createTwoPlayerScenario(['jian', 'brama']))
    const [playerA, playerB] = game.players
    assert(playerA && playerB, 'The scenario creates both players')
    game.currentTurn = playerA.id
    game.currentPhase = 'main'
    playerA.hand = ['visionary_staff']
    playerA.discard = ['jade']
    playerB.discard = ['crystal']

    playCard(game, playerA.id, 'visionary_staff')
    const modeChoice = game.pendingDecision
    assert(modeChoice?.kind === 'choose_one', 'Visionary Staff first asks which effect to use')
    resolvePendingDecision(game, modeChoice.id, { kind: 'choose_one', optionId: 'recall' })

    const recallChoice = game.pendingDecision
    assert(recallChoice?.kind === 'select_collective_cards', 'Recall selection includes cards from all players')
    assertEqual(recallChoice.candidates.map(item => item.choice.zone).join(','), 'discard,discard',
      'Both Recall options identify their actual zone as Discard')
    const selectedBRecall = recallChoice.candidates.find(item => item.playerId === playerB.id)
    assert(selectedBRecall, 'Player B has a Recall card to select')
    resolvePendingDecision(game, recallChoice.id, {
      kind: 'select_collective_cards', choices: [selectedBRecall],
    })

    assertEqual(playerB.aetherTokens, 2, 'The Recall ally is calculated from the Visionary Staff user, so Player B gains both tokens')
    assertEqual(playerA.aetherTokens, 0, 'The Visionary Staff user is not treated as their own ally')
    assert(playerB.hand.includes('crystal'), 'Source-card movement uses the selected Recall card owner, not the effect actor')
    assertEqual(playerA.pulseTokens, 0, 'The unselected Recall card is not activated')
    assert(playerA.playedThisTurn.includes('visionary_staff'), 'The outer Visionary Staff remains in the Played Zone')
    assertEqual(game.pendingDecision, null, 'Visionary Staff does not reopen Recall selection after the chosen effect')
    assertEqual(game.pendingEffect, null, 'The repeated Recall and its outer effect resolution complete')
  } finally {
    crystal.effects = originalCrystalEffects
    crystal.mechanics = originalCrystalMechanics
    jade.effects = originalJadeEffects
    jade.mechanics = originalJadeMechanics
  }
}

function testNestedCrossPlayerCastRestoresTheOuterSourceCard(): void {
  const staff = getCard('visionary_staff')
  const originalEffects = staff.effects
  try {
    staff.effects = [{
      trigger: { kind: 'on_play' },
      effects: [
        { kind: 'cast_prepped_spell', source: 'any_prepped_spell', ownerScope: 'any_player' },
        { kind: 'destroy_cards', source: 'self' },
      ],
    }]
    const game: GameState = createGame(createTwoPlayerScenario(['jian', 'brama']))
    const [playerA, playerB] = game.players
    assert(playerA && playerB, 'The scenario creates both players')
    game.currentTurn = playerA.id
    game.currentPhase = 'main'
    playerA.hand = ['visionary_staff']
    playerB.breaches[0]!.prepSpells.push('spark')

    playCard(game, playerA.id, 'visionary_staff')
    const castChoice = game.pendingDecision
    assert(castChoice?.kind === 'select_prepped_spell', 'The outer card asks the active player to select a prepped spell')
    const ownedByB = castChoice.candidates.find(choice => choice.playerId === playerB.id)
    assert(ownedByB, 'Player B has the selected prepped spell')
    resolvePendingDecision(game, castChoice.id, { kind: 'select_prepped_spell', choice: ownedByB })

    assert(playerB.discard.includes('spark'), 'The selected spell goes to its physical owner’s discard pile')
    assert(!playerA.playedThisTurn.includes('visionary_staff'), 'The later source:self effect returns to the outer card and destroys it')
    assertEqual(game.pendingDecision, null, 'The nested cast and the outer effect both finish')
    assertEqual(game.pendingEffect, null, 'No nested effect context remains pending')
  } finally {
    staff.effects = originalEffects
  }
}

function testNestedGainTriggerUsesItsOwnCardAndRestoresOuterContext(): void {
  const staff = getCard('visionary_staff')
  const crystal = getCard('crystal')
  const originalStaffEffects = staff.effects
  const originalCrystalEffects = crystal.effects
  try {
    staff.effects = [{
      trigger: { kind: 'on_play' },
      effects: [
        { kind: 'gain_card', cardId: 'crystal', source: 'market' },
        { kind: 'gain_aether', amount: 1 },
      ],
    }]
    crystal.effects = [{
      trigger: { kind: 'on_gain' },
      effects: [{ kind: 'destroy_cards', source: 'self' }],
    }]

    const game: GameState = createGame(createTwoPlayerScenario(['jian', 'brama']))
    const player = game.players[0]!
    game.currentTurn = player.id
    game.currentPhase = 'main'
    player.hand = ['visionary_staff']
    let crystalPile = game.market.piles.find(pile => pile.cardId === 'crystal')
    if (!crystalPile) {
      game.market.piles.push({ cardId: 'crystal', remaining: 2 })
      crystalPile = game.market.piles[game.market.piles.length - 1]
    }
    crystalPile!.remaining = 2

    playCard(game, player.id, 'visionary_staff')

    assert(player.destroyedCards.includes('crystal'), 'The nested On Gain effect destroys its gained source card')
    assert(player.playedThisTurn.includes('visionary_staff'),
      'The nested On Gain source:self effect does not destroy the outer source card')
    assertEqual(player.bonusAether, 1, 'The outer effect resumes after the nested On Gain trigger')
    assertEqual(game.pendingEffect, null, 'The nested On Gain frame restores and completes the outer frame')
  } finally {
    staff.effects = originalStaffEffects
    crystal.effects = originalCrystalEffects
  }
}

function testNestedPlayTriggerUsesPlayedCardAsSource(): void {
  const staff = getCard('visionary_staff')
  const crystal = getCard('crystal')
  const originalStaffEffects = staff.effects
  const originalCrystalEffects = crystal.effects
  try {
    staff.effects = [{
      trigger: { kind: 'on_play' },
      effects: [
        { kind: 'play_card_from_hand', cardType: 'gem', times: 1, destroy: false },
        { kind: 'gain_aether', amount: 1 },
      ],
    }]
    crystal.effects = [{
      trigger: { kind: 'on_play' },
      effects: [{ kind: 'destroy_cards', source: 'self' }],
    }]

    const game: GameState = createGame(createTwoPlayerScenario(['jian', 'brama']))
    const player = game.players[0]!
    game.currentTurn = player.id
    game.currentPhase = 'main'
    player.hand = ['visionary_staff', 'crystal']

    playCard(game, player.id, 'visionary_staff')
    const choice = game.pendingDecision
    assert(choice?.kind === 'select_cards', 'The outer card asks which Gem to play')
    resolvePendingDecision(game, choice.id, { kind: 'select_cards', choices: [choice.candidates[0]!] })

    assert(player.destroyedCards.includes('crystal'), 'The nested On Play effect destroys its own source card')
    assert(player.playedThisTurn.includes('visionary_staff'),
      'The nested On Play source:self effect does not destroy the outer source card')
    assertEqual(player.bonusAether, 1, 'The outer effect resumes after the nested On Play trigger')
    assertEqual(game.pendingEffect, null, 'The nested On Play frame restores and completes the outer frame')
  } finally {
    staff.effects = originalStaffEffects
    crystal.effects = originalCrystalEffects
  }
}

function testCrossPlayerSpellUsesCasterForAttachedRelicAllyScope(): void {
  const game: GameState = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const [caster, spellOwner] = game.players
  assert(caster && spellOwner, 'The scenario creates both players')
  game.currentTurn = caster.id
  game.currentPhase = 'main'
  spellOwner.breaches[0]!.attachedRelic = { cardId: 'tearstone_amulet', ownerId: spellOwner.id }
  spellOwner.breaches[0]!.prepSpells = ['spark']
  spellOwner.deck = ['crystal']

  resolveEffects(game, caster.id, [{
    kind: 'cast_prepped_spell', source: 'any_prepped_spell', ownerScope: 'any_player',
  }], 'visionary_staff')
  const selection = game.pendingDecision
  assert(selection?.kind === 'select_prepped_spell', 'The caster chooses a spell from any player')
  const selected = selection.candidates.find(choice => choice.playerId === spellOwner.id)
  assert(selected, 'The spell owner has a prepped spell to select')
  resolvePendingDecision(game, selection.id, { kind: 'select_prepped_spell', choice: selected })

  const optional = game.pendingDecision
  assert(optional?.kind === 'choose_optional', 'The attached Tearstone offers its Conjure effect')
  resolvePendingDecision(game, optional.id, { kind: 'choose_optional', accepted: true })

  assertEqual(game.pendingEffect?.conjuredCard?.playerId, spellOwner.id,
    'Any ally is relative to the caster, so the other Mage Conjures')
  assertEqual(game.pendingDecision?.kind, 'select_conjure_breach', 'The ally chooses a Breach for the Conjured card')
}

testThoughtTotemRefillsARevealFromTheUnshuffledDiscardPile()
testVisionaryStaffRepeatsOneSelectedRecallFromTheDiscardPile()
testNestedCrossPlayerCastRestoresTheOuterSourceCard()
testNestedGainTriggerUsesItsOwnCardAndRestoresOuterContext()
testNestedPlayTriggerUsesPlayedCardAsSource()
testCrossPlayerSpellUsesCasterForAttachedRelicAllyScope()

console.log('Wave 9 Relic tests passed')
