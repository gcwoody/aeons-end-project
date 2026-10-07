import {
  canPlayerAct, createGame, destroyCard, discardNemesisPower, drawCardsForPlayer, getSpellBreachTargets,
  isCorruptionDeckCardRevealed, isPlayerDeckCardRevealed, playCard, prepSpell,
  resolveCardEffects, resolveEffects, resolvePendingDecision, startTurn,
} from '../engine'
import { getCard, createTwoPlayerScenario } from '../data'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function testCollectiveCorruptionAssignment(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const [first, second] = game.players
  assert(first && second, 'Two Mages are available')

  // Burden is a collective assignment. Destroyability of the players' Breaches
  // does not change who can receive these Corruptions.
  for (const player of game.players) {
    for (const breach of player.breaches) breach.indestructible = true
  }
  const initialCorruptionCount = game.nemesis.corruptionDeck!.length
  resolveEffects(game, first.id, [
    { kind: 'gain_corruptions_collectively', amount: 2, destination: 'deck_top' },
  ], 'burden_btb', 0, first.id)

  let decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'Collective Corruption asks players to assign the first card')
  assertEqual(decision.targets.length, 2, 'Either player can receive a collective Corruption regardless of Breach state')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target', target: decision.targets.find(target => target.playerId === first.id)!,
  })
  assertEqual(getCard(first.deck[0]!).type, 'corruption', 'The selected player receives the first Corruption on top')

  decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'The second collective Corruption is assigned separately')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target', target: decision.targets.find(target => target.playerId === second.id)!,
  })
  assertEqual(getCard(second.deck[0]!).type, 'corruption', 'The second player receives the second Corruption on top')
  assertEqual(game.nemesis.corruptionDeck!.length, initialCorruptionCount - 2, 'Two cards leave the Corruption deck')
  assertEqual(game.pendingDecision, null, 'The collective assignment completes')
}

function testNemesisTurnBreachFocusDoesNotCarryIntoMagePrep(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const [first, second] = game.players
  assert(first && second, 'Two Mages are available')

  // Model Burden resolving during the Nemesis turn. Leave exactly one closed
  // Breach so its any-player focus resolves without an extra choice prompt.
  for (const player of game.players) {
    for (const breach of player.breaches) breach.opened = true
  }
  const targetBreach = second.breaches[0]!
  targetBreach.opened = false
  targetBreach.focusCount = 0
  targetBreach.focusToOpen = 2
  game.currentTurn = 'nemesis'
  game.currentPhase = 'nemesis_main'

  resolveEffects(game, first.id, [{ kind: 'focus_breach', target: 'any_player' }], 'burden_btb', 0, first.id)
  assertEqual(targetBreach.focusedThisTurn, true, 'The Nemesis focus is recorded while its effect resolves')

  // The next Mage turn must start with a fresh focus window, even though the
  // previous turn was not a Mage Draw Phase that would normally clear it.
  game.turnOrderDeck = [second.id]
  startTurn(game)
  assertEqual(game.currentTurn, second.id, 'The selected Mage begins the next turn')
  assertEqual(targetBreach.focusedThisTurn, false, 'Nemesis-turn focus is cleared at the Mage turn boundary')

  second.hand = ['spark']
  game.currentPhase = 'main'
  assert(!getSpellBreachTargets(game, second.id, 'spark').includes(targetBreach.index),
    'A Breach focused during the Nemesis turn is not offered as a prep target')
  assertEqual(prepSpell(game, second.id, 'spark', targetBreach.index), 'Cannot prep on this breach',
    'The engine rejects preparing onto the Nemesis-focused Breach')

  // Focusing during this Mage's own turn still grants the normal prep window.
  targetBreach.focusedThisTurn = false
  targetBreach.opened = false
  targetBreach.focusCount = 0
  resolveEffects(game, second.id, [{ kind: 'focus_breach', target: 'self' }], 'burden_btb', 0, second.id)
  assertEqual(targetBreach.focusedThisTurn, true, 'A focus during the active Mage turn remains valid')
  assert(prepSpell(game, second.id, 'spark', targetBreach.index)?.includes('Prepped Spark'),
    'The active Mage may prep onto a Breach focused during their own turn')
}

function testGlintingStingerDestroysSelectedBreach(): void {
  const tokenGame = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const [tokenOwner] = tokenGame.players
  assert(tokenOwner, 'A Mage is available for the Stinger token test')
  tokenGame.nemesis.playArea.push({
    cardId: 'glinting_stinger', cardType: 'minion', placedAt: 9000,
    instanceId: 'glinting_stinger:token-test', lifeTokens: 6, nemesisTokens: 0,
  })
  resolveEffects(tokenGame, tokenOwner.id, [{ kind: 'resolve_glinting_stinger' }], 'glinting_stinger', 0, tokenOwner.id)
  assertEqual(tokenGame.nemesis.playArea.find(card => card.instanceId === 'glinting_stinger:token-test')?.nemesisTokens, 1,
    'Glinting Stinger gains its first Nemesis token from zero')

  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const [first, second] = game.players
  assert(first && second, 'Two Mages are available')
  game.nemesis.playArea.push({
    cardId: 'glinting_stinger', cardType: 'minion', placedAt: 9001,
    instanceId: 'glinting_stinger:test', lifeTokens: 6, nemesisTokens: 2,
  })

  resolveEffects(game, first.id, [{ kind: 'resolve_glinting_stinger' }], 'glinting_stinger', 0, first.id)
  let decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'Glinting Stinger first asks who destroys a Breach')
  assertEqual(decision.targets.length, 2, 'Both players with destroyable Breaches are eligible')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target', target: decision.targets.find(target => target.playerId === second.id)!,
  })

  decision = game.pendingDecision
  assert(decision?.kind === 'select_breach', 'Glinting Stinger then asks for that player\'s Breach')
  assert(decision.candidates.every(candidate => candidate.playerId === second.id), 'Only the selected player\'s Breaches are offered')
  const selectedBreach = decision.candidates[0]!
  resolvePendingDecision(game, decision.id, { kind: 'select_breach', choice: selectedBreach })

  const stinger = game.nemesis.playArea.find(card => card.cardId === 'glinting_stinger')
  const destroyedBreach = second.breaches.find(breach => breach.index === selectedBreach.breachIndex)
  assertEqual(destroyedBreach?.present, false, 'The selected Breach is destroyed')
  assertEqual(stinger?.nemesisTokens, 0, 'Stinger loses its two tokens after the Breach is destroyed')
  assertEqual(game.pendingDecision, null, 'The Stinger effect completes')
}

function testCorruptionFallbackAndCostRestrictedReturn(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const [player] = game.players
  assert(player, 'A Mage is available')

  game.nemesis.corruptionDeck = []
  const graveholdBefore = game.gravehold.hp
  resolveEffects(game, player.id, [
    { kind: 'gain_corruptions', amount: 1, target: 'self', destination: 'deck_top' },
  ], 'dire_wisdom_btb', 0, player.id)
  assertEqual(game.gravehold.hp, graveholdBefore - 2, 'An empty Corruption deck makes Gravehold suffer 2 damage')

  const zeroCost = player.deck.find(cardId => getCard(cardId).cost === 0)
  const costly = game.market.piles.map(pile => pile.cardId).find(cardId => getCard(cardId).cost > 0)
  assert(zeroCost && costly, 'Test has both zero-cost and nonzero-cost cards')
  player.discard = [costly, zeroCost]
  resolveEffects(game, player.id, [{
    kind: 'return_cards_to_hand', source: 'discard', amount: 1, minAmount: 1,
    cardTypes: ['gem', 'relic', 'spell', 'treasure', 'corruption'], maxCost: 0,
  }], 'contagion_btb', 0, player.id)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_cards', 'Contagion asks to choose a zero-cost card from discard')
  assertEqual(decision.candidates.length, 1, 'Cards above the printed cost limit are excluded')
  assertEqual(decision.candidates[0]!.cardId, zeroCost, 'The zero-cost card is the only candidate')
  resolvePendingDecision(game, decision.id, { kind: 'select_cards', choices: decision.candidates })
  assert(player.hand.includes(zeroCost), 'Selected zero-cost card returns to hand')
  assert(player.discard.includes(costly), 'The nonzero-cost card stays in discard')
}

function testCorruptionCannotBePlayedOutsideItsWindow(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const player = game.players[0]!
  player.hand.push('blind_abandon_btb')
  assert(playCard(game, player.id, 'blind_abandon_btb')?.includes('cannot be played'),
    'A Corruption cannot be played as an ordinary main-phase card')
}

function testFeverOfWarCanTargetMinions(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const player = game.players[0]!
  const nemesisHpBefore = game.nemesis.hp
  game.nemesis.playArea.push({
    cardId: 'flailer', cardType: 'minion', placedAt: 9002,
    instanceId: 'flailer:fever-of-war-test', lifeTokens: 4, nemesisTokens: 0,
  })

  resolveCardEffects(game, player.id, 'fever_of_war_btb', { kind: 'on_play' })
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_damage_target', 'Fever of War asks for a damage target when a Minion is in play')
  assert(decision.targets.some(target => target.kind === 'nemesis'), 'Nemesis remains a valid target')
  const minionTarget = decision.targets.find(target => target.kind === 'minion')
  assert(minionTarget, 'The Minion is also offered as a target')

  resolvePendingDecision(game, decision.id, { kind: 'select_damage_target', target: minionTarget })
  assertEqual(game.nemesis.playArea.find(card => card.instanceId === 'flailer:fever-of-war-test')?.lifeTokens, 2,
    'Choosing the Minion deals both damage to it')
  assertEqual(game.nemesis.hp, nemesisHpBefore, 'Choosing the Minion leaves Nemesis life unchanged')
  assertEqual(game.pendingDecision, null, 'Fever of War completes after the selected target takes damage')
}

function testResolvedAndDestroyedCorruptionsReturnExactlyOnce(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const player = game.players[0]!
  const initialCount = game.nemesis.corruptionDeck!.length
  assertEqual(initialCount, 11, 'The standard Crooked Mask Corruption deck starts with eleven cards')
  const resolvedId = 'endless_hunger_btb'
  game.nemesis.corruptionDeck!.splice(game.nemesis.corruptionDeck!.indexOf(resolvedId), 1)
  player.hand = [resolvedId]

  resolveEffects(game, player.id, [{ kind: 'resolve_corruptions', timing: 'turn_start' }], undefined, 0, player.id)
  let decision = game.pendingDecision
  assert(decision?.kind === 'select_cards', 'Resolving a Corruption asks the player to select it')
  resolvePendingDecision(game, decision.id, { kind: 'select_cards', choices: [decision.candidates[0]!] })
  assertEqual(game.pendingDecision, null, 'The Corruption finishes resolving')
  assertEqual(game.nemesis.corruptionDeck!.length, initialCount, 'Resolving a Corruption returns exactly one copy')
  assertEqual(game.nemesis.corruptionDeck!.filter(cardId => cardId === resolvedId).length, 1,
    'A resolved Corruption appears exactly once in its deck')

  const destroyedId = 'blind_abandon_btb'
  game.nemesis.corruptionDeck!.splice(game.nemesis.corruptionDeck!.indexOf(destroyedId), 1)
  player.hand = [destroyedId]
  resolveEffects(game, player.id, [{ kind: 'destroy_cards', source: 'hand', minAmount: 1, maxAmount: 1 }], undefined, 0, player.id)
  decision = game.pendingDecision
  assert(decision?.kind === 'select_cards', 'Destroying a Corruption asks for a card selection')
  resolvePendingDecision(game, decision.id, { kind: 'select_cards', choices: [decision.candidates[0]!] })
  assertEqual(game.nemesis.corruptionDeck![game.nemesis.corruptionDeck!.length - 1], destroyedId,
    'A destroyed Corruption returns to the deck bottom')
  assertEqual(game.nemesis.corruptionDeckRevealed?.[game.nemesis.corruptionDeck!.length - 1], true,
    'A destroyed Corruption remains revealed when returned to the deck bottom')
  assertEqual(isCorruptionDeckCardRevealed(game, game.nemesis.corruptionDeck!.length - 1), true,
    'The Corruption deck viewer can identify the known bottom card')
  assertEqual(game.nemesis.corruptionDeckRevealed?.[0], false,
    'Unseen Corruption cards remain face-down')
  const savedGame = JSON.parse(JSON.stringify(game)) as typeof game
  assertEqual(isCorruptionDeckCardRevealed(savedGame, savedGame.nemesis.corruptionDeck!.length - 1), true,
    'The revealed Corruption state survives save serialization')
  assert(!player.destroyedCards.includes(destroyedId), 'Returned Corruptions are not left in the Mage destroyed area')
}

function testLeastExpensiveCorruptionGainMarksRequiredPiles(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const player = game.players[0]!
  resolveEffects(game, player.id, [{ kind: 'gain_least_expensive_card', cardType: 'gem', destination: 'hand' }],
    'insatiable_avarice_btb', 0, player.id)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_market_pile', 'The least-expensive Gem gain asks for a supply pile')
  assertEqual(decision.emphasis, 'required', 'The mandatory constrained target requests the required highlight')
  const costs = decision.candidates.map(candidate => getCard(candidate.cardId).cost)
  assert(costs.every(cost => cost === Math.min(...costs)), 'Every tied least-expensive pile is offered')
}

function testTemptOffersOnlyNonemptyPilesCostingFourOrLess(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const [target, other] = game.players
  assert(target && other, 'Two Mages are available')
  target.hand = ['crystal', 'crystal', 'crystal']
  other.hand = ['spark']
  game.market.piles = [
    { cardId: 'vriswood_amber', remaining: 5 },
    { cardId: 'obliterating_arc', remaining: 5 },
    { cardId: 'amethyst_shard', remaining: 0 },
  ]

  resolveEffects(game, target.id, [{ kind: 'tempt_highest_crystals' }], 'tempt_btb', 0, target.id)

  const decision = game.pendingDecision
  assert(decision?.kind === 'select_market_pile', 'Tempt opens a direct supply-pile choice after resolving its earlier effects')
  assertEqual(decision.candidates.length, 1, 'Only a non-empty pile costing four or less is eligible')
  assertEqual(decision.candidates[0]?.cardId, 'vriswood_amber', 'The eligible pile remains in the target list')
  assert(!decision.candidates.some(candidate => candidate.cardId === 'obliterating_arc'),
    'A pile above four Aether is excluded from the legal targets')
  assert(!decision.candidates.some(candidate => candidate.cardId === 'amethyst_shard'),
    'An empty pile is excluded from the legal targets')
}

function testFilteredCardChoicesRequestPersistentTargetHighlights(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const player = game.players[0]!
  player.discard = ['crystal', 'obliterating_arc']

  resolveEffects(game, player.id, [{
    kind: 'return_cards_to_hand', source: 'discard', amount: 1, minAmount: 0,
    cardTypes: ['gem', 'relic', 'spell', 'treasure', 'corruption'], maxCost: 0,
  }], 'contagion_btb', 0, player.id)

  let decision = game.pendingDecision
  assert(decision?.kind === 'select_cards', 'Contagion presents eligible discard cards for selection')
  assertEqual(decision.targetHighlight, 'choice', 'Filtered discard candidates carry the shared choice highlight')
  assertEqual(decision.candidates.length, 1, 'Only cards meeting the type and cost restrictions are offered')
  assertEqual(decision.candidates[0]?.cardId, 'crystal', 'The qualifying card remains selectable')

  const revealGame = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const revealPlayer = revealGame.players[0]!
  revealPlayer.deck = ['crystal']
  resolveEffects(revealGame, revealPlayer.id, [{ kind: 'look_at_top_card_may_destroy' }], 'grim_sight_btb', 0, revealPlayer.id)
  decision = revealGame.pendingDecision
  assert(decision?.kind === 'select_cards', 'Grim Sight presents the revealed top card as an eligible target')
  assertEqual(decision.targetHighlight, 'choice', 'The revealed deck target receives the shared choice highlight')
}

function testCrookedMaskSelectedPlayersResumeTheirEffects(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const [first, second] = game.players
  assert(first && second, 'Two Mages are available')

  resolveEffects(game, first.id, [{ kind: 'shuffle_hand_into_deck_and_draw', amount: 5 }], 'masticate', 0, first.id)
  let decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'Masticate asks which player shuffles their hand')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target', target: decision.targets.find(target => target.playerId === second.id)!,
  })
  assertEqual(second.hand.length, 5, 'Masticate resumes with the selected player and draws five cards')
  assertEqual(game.pendingDecision, null, 'Masticate does not reopen its player choice after selection')

  resolveEffects(game, first.id, [{ kind: 'place_hand_card_on_ally_deck' }], 'flailer', 0, first.id)
  decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'Flailer asks which player places a card')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target', target: decision.targets.find(target => target.playerId === first.id)!,
  })
  decision = game.pendingDecision
  assert(decision?.kind === 'select_cards', 'With one ally, Flailer proceeds directly to choosing a hand card')
  const cardChoice = decision.candidates[0]!
  resolvePendingDecision(game, decision.id, { kind: 'select_cards', choices: [cardChoice] })
  assertEqual(second.deck[0], cardChoice.cardId, 'The chosen card is placed on the sole ally\'s deck')
  assertEqual(game.pendingDecision, null, 'Flailer completes without a redundant ally prompt')
}

function testTwistingMadnessDrawAfterToDiscardKeepsMainPhaseOpen(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const player = game.players[0]!
  game.currentTurn = player.id
  game.currentPhase = 'main'
  player.hand = ['crystal', 'crystal', 'crystal', 'crystal']
  player.deck = ['jade']
  player.discard = []
  game.nemesis.playArea = [{
    cardId: 'twisting_madness_btb', cardType: 'power', placedAt: 9001,
    instanceId: 'twisting-madness:test', powerTokens: 2,
  }]

  const messages = discardNemesisPower(game, player.id, 'twisting-madness:test')
  assertEqual(game.pendingDecision, null,
    'Four matching hand cards satisfy the complete To Discard cost without another prompt')
  assertEqual(player.hand.length, 1, 'To Discard draws one card after discarding the four-card hand')
  assertEqual(player.hand[0], 'jade', 'The card drawn after To Discard enters the hand immediately')
  assertEqual(getCard(player.hand[0]!).type, 'gem', 'The drawn card is playable during Main Phase')
  assert(canPlayerAct(game, player.id),
    'A playable Gem drawn by To Discard prevents automatic Main Phase completion')
  assert(messages.some(message => message.includes('draws 1 card')),
    'The To Discard result reports its follow-up draw')
  assertEqual(game.nemesis.playArea.length, 0, 'Paying To Discard removes Twisting Madness from play')
}

function testCrookedMaskUnleashShuffleHidesDeckOrder(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama'], 'crooked_mask'))
  const player = game.players[0]!
  player.deck = ['crystal', 'spark', 'jade']
  player.discard = ['crystal', 'spark']

  resolveEffects(game, player.id, [{ kind: 'gain_corruption_and_shuffle_discard' }], 'unleash-test', 0, player.id)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_player_target', 'Crooked Mask Unleash asks who gains a Corruption')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_player_target', target: decision.targets.find(target => target.playerId === player.id)!,
  })

  assertEqual(player.discard.length, 0, 'Unleash moves the selected player discard into their deck')
  assertEqual(player.deck.length, 6, 'Unleash adds one Corruption before shuffling the deck')
  assert(player.deck.some(cardId => getCard(cardId).type === 'corruption'), 'The Corruption is included in the shuffle')
  assert(player.deck.every((_, index) => !isPlayerDeckCardRevealed(game, player.id, index)),
    'Every physical card in the shuffled deck becomes unknown')

  const handBeforeDraw = player.hand.length
  drawCardsForPlayer(game, player.id, 1)
  assertEqual(player.hand.length, handBeforeDraw + 1, 'Drawing after the shuffle moves the top card into hand')
  assert(player.deck.every((_, index) => !isPlayerDeckCardRevealed(game, player.id, index)),
    'Drawing a card does not reveal the positions of the cards still in the shuffled deck')
}

testCollectiveCorruptionAssignment()
testNemesisTurnBreachFocusDoesNotCarryIntoMagePrep()
testGlintingStingerDestroysSelectedBreach()
testCorruptionFallbackAndCostRestrictedReturn()
testCorruptionCannotBePlayedOutsideItsWindow()
testFeverOfWarCanTargetMinions()
testResolvedAndDestroyedCorruptionsReturnExactlyOnce()
testLeastExpensiveCorruptionGainMarksRequiredPiles()
testTemptOffersOnlyNonemptyPilesCostingFourOrLess()
testFilteredCardChoicesRequestPersistentTargetHighlights()
testCrookedMaskSelectedPlayersResumeTheirEffects()
testTwistingMadnessDrawAfterToDiscardKeepsMainPhaseOpen()
testCrookedMaskUnleashShuffleHidesDeckOrder()
console.log('Wave 9 Crooked Mask tests passed.')
