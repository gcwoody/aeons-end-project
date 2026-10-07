import { getCard, MAGES } from '../data'
import {
  activateAbility, activatePlayerCardInPlayAction, createGame, getMainPhaseActionHint, getPlayerCardInPlayActions,
  buyCard, openBreachDirect, playCard, resolveDrawPhase, resolvePendingDecision,
} from '../engine'
import type { GameState } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function freshGame(): GameState {
  const game = createGame('dezmodia', 'jian')
  game.currentTurn = game.players[0]!.id
  game.currentPhase = 'main'
  return game
}

function testTreasureCatalog(): void {
  const treasureIds = [
    'calcified_electinium', 'corrupted_coil', 'fungal_network', 'ice_heart_shard',
    'polished_dyaminium', 'runic_flute', 'time_cortex',
  ]
  for (const id of treasureIds) {
    const card = getCard(id)
    assertEqual(card.type, 'treasure', `${id} uses the Treasure card type`)
    assertEqual(card.treasureLevel, 2, `${id} is a level 2 Treasure`)
    assertEqual(card.cost, 0, `${id} has no Supply-card purchase cost`)
  }
}

function testSetupAndSpecificDeckAbility(): void {
  const game = freshGame()
  const dezmodia = game.players[0]!
  // Keep the shuffled setup deterministic for the action assertion below.
  dezmodia.specificDeck = ['corrupted_coil', 'calcified_electinium', 'fungal_network', 'ice_heart_shard', 'polished_dyaminium', 'runic_flute', 'time_cortex']
  assertEqual(MAGES.dezmodia?.abilityName, 'Pilfer the Past', 'Dezmodia is registered')
  assertEqual(dezmodia.hand.join(','), 'vision_shard,wave9_crystal,wave9_crystal,wave9_spark,wave9_spark', 'Dezmodia starts with the documented hand')
  assertEqual(dezmodia.deck[0], 'energized_stone', 'Dezmodia starts with Energized Stone on top of the deck')
  assertEqual(dezmodia.specificDeck?.length, 7, 'Dezmodia starts with seven Stash cards')
  assertEqual(dezmodia.playerCardsInPlay?.length, 0, 'Dezmodia starts with an empty Player cards in play area')

  dezmodia.charge = dezmodia.chargeThreshold
  activateAbility(game, dezmodia.id)
  assertEqual(game.pendingDecision?.kind, 'choose_one', 'Pilfer the Past offers an OR choice')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'stash' })
  const reveal = game.pendingDecision
  assert(reveal?.kind === 'select_cards', 'Pilfer the Past reveals Stash cards for selection')
  assertEqual(reveal.source, 'specific_deck', 'Pilfer the Past uses the generic specific-deck source')
  const chosen = reveal.candidates.find(candidate => candidate.cardId === 'corrupted_coil')!
  const returned = reveal.candidates.find(candidate => candidate.cardId !== chosen.cardId)!
  resolvePendingDecision(game, reveal.id, { kind: 'select_cards', choices: [chosen] })
  assert(dezmodia.knownSpecificDeckCards?.includes(chosen.cardId),
    'Cards revealed by Pilfer the Past remain known when the Stash is inspected later')
  assertEqual(dezmodia.playerCardsInPlay?.[0], chosen.cardId, 'The selected Treasure enters Player cards in play')
  assertEqual(dezmodia.specificDeck?.length, 6, 'The Stash loses the selected and returned cards')
  assertEqual(dezmodia.specificDeck?.[dezmodia.specificDeck.length - 1], returned.cardId, 'The unselected revealed card goes to the Stash bottom')

  // Corrupted Coil demonstrates the reusable Main Phase action surface for an
  // in-play Mage-specific card. Its action destroys the Treasure after damage.
  assertEqual(getPlayerCardInPlayActions(game, dezmodia.id).length, 1, 'Corrupted Coil exposes an in-play action')
  activatePlayerCardInPlayAction(game, dezmodia.id, 0)
  assertEqual(dezmodia.playerCardsInPlay?.length, 0, 'Destroying an in-play Treasure removes it from the play area')
  assert(dezmodia.destroyedCards.includes('corrupted_coil'), 'Destroying an in-play Treasure records it as destroyed')
}

function testVisionShardReturnsRevealedCards(): void {
  const game = freshGame()
  const dezmodia = game.players[0]!
  dezmodia.hand = ['vision_shard']
  const original = [...(dezmodia.specificDeck ?? [])]
  playCard(game, dezmodia.id, 'vision_shard')
  assertEqual(game.pendingDecision?.kind, 'choose_one', 'Vision Shard offers an OR choice')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'stash' })
  const first = game.pendingDecision
  assert(first?.kind === 'place_specific_deck_card', 'Vision Shard reveals both cards for independent placement')
  if (first?.kind !== 'place_specific_deck_card') return
  const firstCard = first.cards[0]!
  const secondCard = first.cards[1]!
  resolvePendingDecision(game, first.id, { kind: 'place_specific_deck_card', cardId: firstCard.cardId, placement: 'bottom' })
  const second = game.pendingDecision
  assert(second?.kind === 'place_specific_deck_card' && second.cards.length === 1,
    'The placed card leaves the reveal while the other remains visible')
  if (second?.kind !== 'place_specific_deck_card') return
  resolvePendingDecision(game, second.id, { kind: 'place_specific_deck_card', cardId: secondCard.cardId, placement: 'top' })
  assertEqual(dezmodia.specificDeck?.length, original.length, 'Vision Shard keeps the Stash size unchanged')
  assertEqual(dezmodia.specificDeck?.[0], original[1], 'A revealed card returned to the top becomes the new top')
  assertEqual(dezmodia.specificDeck?.[dezmodia.specificDeck.length - 1], original[0], 'A revealed card returned to the bottom reaches the bottom')
}

function testVisionShardBottomOrderFollowsSelectionOrder(): void {
  const game = freshGame()
  const dezmodia = game.players[0]!
  dezmodia.hand = ['vision_shard']
  const original = [...(dezmodia.specificDeck ?? [])]
  playCard(game, dezmodia.id, 'vision_shard')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'stash' })
  const first = game.pendingDecision!
  assert(first.kind === 'place_specific_deck_card', 'Vision Shard exposes both cards for ordered placement')
  const firstCard = first.cards[0]!
  const secondCard = first.cards[1]!
  assert(dezmodia.knownSpecificDeckCards?.includes(firstCard.cardId)
    && dezmodia.knownSpecificDeckCards.includes(secondCard.cardId),
  'Vision Shard records both revealed Stash cards as known information')
  // Choose the second revealed card first; both cards then go to the bottom.
  resolvePendingDecision(game, first.id, { kind: 'place_specific_deck_card', cardId: secondCard.cardId, placement: 'bottom' })
  const second = game.pendingDecision!
  assert(second.kind === 'place_specific_deck_card', 'The remaining revealed card stays selectable')
  resolvePendingDecision(game, second.id, { kind: 'place_specific_deck_card', cardId: firstCard.cardId, placement: 'bottom' })
  assertEqual(dezmodia.specificDeck?.[dezmodia.specificDeck.length - 2], secondCard.cardId,
    'The first card selected for the bottom is placed before the next bottom card')
  assertEqual(dezmodia.specificDeck?.[dezmodia.specificDeck.length - 1], firstCard.cardId,
    'The second card selected for the bottom is placed last')
  assertEqual(dezmodia.specificDeck?.length, original.length, 'Ordered placement preserves Stash size')
}

function testStashTreasureMechanics(): void {
  const game = freshGame()
  const dezmodia = game.players[0]!
  dezmodia.specificDeck = ['calcified_electinium', 'fungal_network']
  dezmodia.charge = dezmodia.chargeThreshold
  activateAbility(game, dezmodia.id)
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'stash' })
  const reveal = game.pendingDecision!
  assert(reveal.kind === 'select_cards', 'Calcified Electinium is revealed from the Stash')
  const calcified = reveal.candidates.find(candidate => candidate.cardId === 'calcified_electinium')!
  resolvePendingDecision(game, reveal.id, { kind: 'select_cards', choices: [calcified] })
  assertEqual(game.pendingDecision?.kind, 'select_market_pile', 'Calcified Electinium asks for an eligible supply pile')
  const pileDecision = game.pendingDecision!
  assert(pileDecision.kind === 'select_market_pile', 'Calcified Electinium has a supply-pile decision')
  const target = pileDecision.candidates[0]!
  resolvePendingDecision(game, pileDecision.id, { kind: 'select_market_pile', choice: target })
  assertEqual(dezmodia.playerCardSupplyTargets?.[0], target.pileIndex, 'Calcified Electinium stores its supply target')

  // A gain from the attached pile goes directly to hand.
  dezmodia.bonusAether = 10
  const beforeHand = dezmodia.hand.length
  buyCard(game, dezmodia.id, target.pileIndex)
  if (game.pendingDecision?.kind === 'choose_optional') {
    const decision = game.pendingDecision
    resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: false })
  }
  assertEqual(dezmodia.hand.length, beforeHand + 1, 'Calcified Electinium moves the gained card to hand')

  // An attached Treasure remains in its supply-pile slot after the pile is
  // exhausted, and its empty-pile action becomes available to destroy it for
  // four Charge.
  game.market.piles[target.pileIndex]!.remaining = 0
  const emptyPileAction = getPlayerCardInPlayActions(game, dezmodia.id)
    .find(action => action.cardId === 'calcified_electinium')
  assert(emptyPileAction, 'Calcified Electinium remains actionable when its target pile is empty')
  activatePlayerCardInPlayAction(game, dezmodia.id, emptyPileAction.cardIndex)
  assert(!dezmodia.playerCardsInPlay?.includes('calcified_electinium'),
    'Calcified Electinium can be destroyed after its target pile empties')

  // Corrupted Coil supplies a token when a Breach opens, and unused tokens
  // are removed at the end of the turn.
  dezmodia.playerCardsInPlay = ['corrupted_coil']
  dezmodia.playerCardSupplyTargets = [null]
  dezmodia.playerCardPowerTokens = [0]
  dezmodia.bonusAether = 10
  const breach = dezmodia.breaches.find(item => !item.opened && item.present !== false)!
  openBreachDirect(game, dezmodia.id, breach.index)
  if (game.pendingDecision?.kind === 'select_player_target') {
    const decision = game.pendingDecision
    resolvePendingDecision(game, decision.id, { kind: 'select_player_target', target: decision.targets[0]! })
  }
  assert((dezmodia.aetherTokens ?? 0) > 0, 'Opening a Breach grants an Aether token')
  resolveDrawPhase(game, dezmodia.id)
  assertEqual(dezmodia.aetherTokens, 0, 'Unused Aether tokens expire during draw')

  const fungalGame = freshGame()
  const fungalPlayer = fungalGame.players[0]!
  fungalPlayer.playerCardsInPlay = ['fungal_network']
  fungalPlayer.playerCardSupplyTargets = [null]
  fungalPlayer.playerCardPowerTokens = [0]
  fungalPlayer.charge = fungalPlayer.chargeThreshold
  activateAbility(fungalGame, fungalPlayer.id)
  resolvePendingDecision(fungalGame, fungalGame.pendingDecision!.id, { kind: 'choose_one', optionId: 'life' })
  if (fungalGame.pendingDecision?.kind === 'select_life_target') {
    const lifeDecision = fungalGame.pendingDecision
    resolvePendingDecision(fungalGame, lifeDecision.id, { kind: 'select_life_target', target: lifeDecision.targets[0]! })
  }
  assertEqual(fungalGame.pendingDecision?.kind, 'choose_optional', 'Fungal Network offers its post-ability gain')
  const fungalChoice = fungalGame.pendingDecision!
  resolvePendingDecision(fungalGame, fungalChoice.id, { kind: 'choose_optional', accepted: false })
  assertEqual(fungalPlayer.playerCardPowerTokens?.[0], 1, 'Fungal Network gains a Power token after an ability resolves')
}

function testSetTreasureCannotChooseEmptySupplyPile(): void {
  const game = freshGame()
  const dezmodia = game.players[0]!
  dezmodia.specificDeck = ['polished_dyaminium', 'fungal_network']
  dezmodia.charge = dezmodia.chargeThreshold
  activateAbility(game, dezmodia.id)
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'stash' })
  const reveal = game.pendingDecision!
  assert(reveal.kind === 'select_cards', 'Polished Dyaminium is revealed from the Stash')

  // Exhaust a supply pile before the Treasure chooses its target. Empty piles
  // must not appear as valid set-next-to targets.
  const emptyPileIndex = 0
  game.market.piles[emptyPileIndex]!.remaining = 0
  const polished = reveal.candidates.find(candidate => candidate.cardId === 'polished_dyaminium')!
  resolvePendingDecision(game, reveal.id, { kind: 'select_cards', choices: [polished] })
  const pileDecision = game.pendingDecision
  assert(pileDecision?.kind === 'select_market_pile',
    'Polished Dyaminium asks for a supply-pile target')
  assert(!pileDecision.candidates.some(candidate => candidate.pileIndex === emptyPileIndex),
    'Empty supply piles are excluded from Treasure placement choices')
  assert(pileDecision.candidates.every(candidate => candidate.remaining > 0),
    'Every Treasure placement choice has cards remaining')
}

/** Treasure actions use the active player's state while remaining owned by Dezmodia. */
function testTreasureActionsUseActivePlayerContext(): void {
  const coilGame = createGame('dezmodia', 'brama')
  const dezmodia = coilGame.players[0]!
  const brama = coilGame.players[1]!
  coilGame.currentTurn = brama.id
  coilGame.currentPhase = 'main'
  dezmodia.playerCardsInPlay = ['corrupted_coil']
  dezmodia.playerCardSupplyTargets = [null]
  dezmodia.playerCardPowerTokens = [0]
  brama.breaches.forEach(breach => {
    if (breach.present !== false) breach.opened = true
  })
  brama.hand = []
  brama.playedThisTurn = []
  brama.bonusAether = 0
  brama.aetherTokens = 0
  brama.charge = 0
  const remainingAction = getMainPhaseActionHint(coilGame, brama.id)
  assertEqual(remainingAction?.targetId, `player-card-in-play:${dezmodia.id}:0`,
    'End Turn guidance locates Corrupted Coil in the other Mage area')
  assertEqual(remainingAction?.viewPlayerId, dezmodia.id,
    'End Turn guidance directs the player to the Treasure owner area')
  assert(remainingAction?.label.includes('Corrupted Coil'),
    'End Turn guidance names the action card')
  const hpBefore = coilGame.nemesis.hp
  assertEqual(getPlayerCardInPlayActions(coilGame, dezmodia.id).length, 1,
    'A Treasure action remains available when another player is taking the turn')
  activatePlayerCardInPlayAction(coilGame, dezmodia.id, 0)
  assertEqual(coilGame.nemesis.hp, hpBefore - 8,
    'Corrupted Coil counts the active player\'s four opened Breaches')
  assert(dezmodia.destroyedCards.includes('corrupted_coil'),
    'Corrupted Coil is destroyed from its owner\'s Player cards in play area')

  const fungalGame = createGame('dezmodia', 'brama')
  const fungalOwner = fungalGame.players[0]!
  const fungalActor = fungalGame.players[1]!
  fungalGame.currentTurn = fungalActor.id
  fungalGame.currentPhase = 'main'
  fungalOwner.playerCardsInPlay = ['fungal_network']
  fungalOwner.playerCardSupplyTargets = [null]
  fungalOwner.playerCardPowerTokens = [2]
  fungalActor.hand = ['jade', 'blasting_staff']
  activatePlayerCardInPlayAction(fungalGame, fungalOwner.id, 0)
  const destroyDecision = fungalGame.pendingDecision
  assert(destroyDecision?.kind === 'select_cards',
    'Fungal Network asks the active player to choose cards from their hand or discard')
  assert(destroyDecision.candidates.every(choice =>
    choice.cardId === 'jade' || choice.cardId === 'blasting_staff'),
  'Fungal Network uses the active player\'s cards as the destruction payment')
  resolvePendingDecision(fungalGame, destroyDecision.id, {
    kind: 'select_cards', choices: destroyDecision.candidates,
  })
  assert(fungalActor.destroyedCards.includes('jade') && fungalActor.destroyedCards.includes('blasting_staff'),
    'Fungal Network destroys the active player\'s selected cards')
  assert(fungalOwner.destroyedCards.includes('fungal_network'),
    'Fungal Network is destroyed from its owner\'s play area')

  const conditionGame = createGame('dezmodia', 'brama')
  const conditionOwner = conditionGame.players[0]!
  const conditionActor = conditionGame.players[1]!
  conditionGame.currentTurn = conditionActor.id
  conditionGame.currentPhase = 'main'
  conditionOwner.playerCardsInPlay = ['ice_heart_shard']
  conditionOwner.playerCardSupplyTargets = [null]
  conditionOwner.playerCardPowerTokens = [0]
  // The owner has the required cards, but the active player does not.
  conditionOwner.hand = ['jade', 'blasting_staff']
  conditionActor.hand = ['crystal']
  assertEqual(getPlayerCardInPlayActions(conditionGame, conditionOwner.id).length, 0,
    'Ice-Heart Shard checks the active player\'s hand, not Dezmodia\'s hand')
  conditionActor.hand = ['jade', 'blasting_staff']
  assertEqual(getPlayerCardInPlayActions(conditionGame, conditionOwner.id).length, 1,
    'Ice-Heart Shard becomes available when the active player meets its condition')

  const cortexGame = createGame('dezmodia', 'brama')
  const cortexOwner = cortexGame.players[0]!
  const cortexActor = cortexGame.players[1]!
  cortexGame.currentTurn = cortexActor.id
  cortexGame.currentPhase = 'main'
  cortexOwner.playerCardsInPlay = ['time_cortex']
  cortexOwner.playerCardSupplyTargets = [null]
  cortexOwner.playerCardPowerTokens = [0]
  cortexActor.breaches[0]!.prepSpells = ['spark', 'spark', 'spark', 'spark']
  cortexGame.turnOrderDiscard = [cortexActor.id]
  activatePlayerCardInPlayAction(cortexGame, cortexOwner.id, 0)
  const turnOrderDecision = cortexGame.pendingDecision
  assert(turnOrderDecision?.kind === 'select_turn_order_card',
    'Time Cortex asks for the active player\'s turn order card')
  assertEqual(turnOrderDecision.cards.length, 1, 'Time Cortex only offers the active player\'s card')
  assertEqual(turnOrderDecision.cards[0]!.cardId, cortexActor.id,
    'Time Cortex does not use Dezmodia\'s turn order card context')

  const emptyFluteGame = createGame('dezmodia', 'brama')
  const emptyFluteOwner = emptyFluteGame.players[0]!
  emptyFluteGame.currentTurn = emptyFluteGame.players[1]!.id
  emptyFluteGame.currentPhase = 'main'
  emptyFluteOwner.playerCardsInPlay = ['runic_flute']
  emptyFluteOwner.playerCardSupplyTargets = [null]
  emptyFluteOwner.playerCardPowerTokens = [0]
  assertEqual(getPlayerCardInPlayActions(emptyFluteGame, emptyFluteOwner.id).length, 0,
    'Runic Flute is not actionable when the active player has no prepped spells')
  activatePlayerCardInPlayAction(emptyFluteGame, emptyFluteOwner.id, 0)
  assertEqual(emptyFluteOwner.playerCardsInPlay?.[0], 'runic_flute',
    'Runic Flute is not destroyed by an invalid empty-spell activation')

  const fluteGame = createGame('dezmodia', 'brama')
  const fluteOwner = fluteGame.players[0]!
  const fluteActor = fluteGame.players[1]!
  fluteGame.currentTurn = fluteActor.id
  fluteGame.currentPhase = 'main'
  fluteOwner.playerCardsInPlay = ['runic_flute']
  fluteOwner.playerCardSupplyTargets = [null]
  fluteOwner.playerCardPowerTokens = [0]
  fluteActor.breaches[0]!.prepSpells = ['spark', 'spark']
  activatePlayerCardInPlayAction(fluteGame, fluteOwner.id, 0)
  const castDecision = fluteGame.pendingDecision
  assert(castDecision?.kind === 'select_prepped_spell' && castDecision.allowSkip === true,
    'Runic Flute opens an iterative prepped-spell choice that can be skipped')
  assert(castDecision.candidates.every(choice => choice.playerId === fluteActor.id),
    'Runic Flute offers the active player\'s prepped spells')
  const firstCast = castDecision.candidates[0]!
  resolvePendingDecision(fluteGame, castDecision.id, { kind: 'select_prepped_spell', choice: firstCast })
  const nextCastDecision = fluteGame.pendingDecision
  assert(nextCastDecision?.kind === 'select_prepped_spell' && nextCastDecision.allowSkip === true,
    `Runic Flute asks again after each individual spell cast (got ${nextCastDecision?.kind ?? 'none'})`)
  resolvePendingDecision(fluteGame, nextCastDecision.id, { kind: 'select_prepped_spell', choice: null })
  assertEqual(fluteGame.pendingDecision, null, 'Skipping ends the free-casting sequence')
  assert(fluteOwner.destroyedCards.includes('runic_flute'), 'Runic Flute is destroyed after the sequence ends')
}

testTreasureCatalog()
testSetupAndSpecificDeckAbility()
testVisionShardReturnsRevealedCards()
testVisionShardBottomOrderFollowsSelectionOrder()
testStashTreasureMechanics()
testSetTreasureCannotChooseEmptySupplyPile()
testTreasureActionsUseActivePlayerContext()
console.log('Wave 9 Dezmodia tests passed')
