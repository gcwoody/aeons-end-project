import {
  activateAbility, activatePlayerCardInPlayAction, castSpell, createGame,
  getMarketCardCost, getPlayerCardInPlayActions, playCard, resolvePendingDecision,
  resolveEffects, resolvePlayerInPlayPhaseEffects,
} from '../engine'
import type { GameState } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function clearSetupDecision(game: GameState): void {
  game.pendingDecision = null
  game.pendingEffect = null
}

function freshGame(cardId: string): GameState {
  const game = createGame('tressa', 'brama')
  const tressa = game.players[0]!
  const activeAlly = game.players[1]!
  // Tressa's setup reveal is unrelated to these effect-context fixtures.
  game.pendingDecision = null
  game.pendingEffect = null
  game.currentTurn = activeAlly.id
  game.currentPhase = 'main'
  tressa.playerCardsInPlay = [cardId]
  tressa.playerCardSupplyTargets = [null]
  tressa.playerCardPowerTokens = [0]
  return game
}

function testArtifactStanceUsesTressaAsYou(): void {
  const game = freshGame('artifact_stance')
  const tressa = game.players[0]!
  const activeAlly = game.players[1]!
  game.currentTurn = tressa.id
  tressa.hand = ['jade']
  activeAlly.hand = ['crystal']
  game.market.piles = [
    { cardId: 'blasting_staff', remaining: 5 },
    { cardId: 'burning_opal', remaining: 5 },
  ]

  const action = getPlayerCardInPlayActions(game, tressa.id)[0]
  assert(action, 'Artifact Stance can be activated during the active ally Mage\'s turn')
  activatePlayerCardInPlayAction(game, tressa.id, action.cardIndex)

  const option = game.pendingDecision
  assert(option?.kind === 'choose_one', 'Artifact Stance asks which card type to destroy')
  const gemOption = option.options.find(candidate => candidate.id === 'gem')
  assert(gemOption && !gemOption.disabled, 'The Gem option checks Tressa\'s hand, not the active ally\'s hand')
  resolvePendingDecision(game, option.id, { kind: 'choose_one', optionId: 'gem' })

  const destroy = game.pendingDecision
  assert(destroy?.kind === 'select_cards', 'Artifact Stance asks Tressa to choose a Gem')
  assert(destroy.candidates.some(candidate => candidate.cardId === 'jade'),
    'Tressa\'s eligible Gem is available for destruction')
  assert(!destroy.candidates.some(candidate => candidate.cardId === 'crystal'),
    'The active ally\'s hand is not used for Artifact Stance')
  resolvePendingDecision(game, destroy.id, {
    kind: 'select_cards', choices: [destroy.candidates.find(candidate => candidate.cardId === 'jade')!],
  })

  const gain = game.pendingDecision
  assert(gain?.kind === 'select_market_pile', 'Artifact Stance offers a supply card after the destruction')
  assert(gain.candidates.some(candidate => candidate.cardId === 'blasting_staff'),
    'Artifact Stance offers a cost-4 card after destroying Tressa\'s cost-2 Jade')
  assert(!gain.candidates.some(candidate => candidate.cardId === 'burning_opal'),
    'Artifact Stance excludes cards above the destroyed Gem cost plus 2')
  resolvePendingDecision(game, gain.id, {
    kind: 'select_market_pile', choice: gain.candidates.find(candidate => candidate.cardId === 'blasting_staff')!,
  })
  assert(tressa.discard.includes('blasting_staff'), 'The gained card belongs to Tressa')
  assert(!activeAlly.discard.includes('blasting_staff'), 'The gained card is not assigned to the active ally')
}

function testArtifactStanceIsNotActionableWithoutAnEligibleHandCard(): void {
  const game = freshGame('artifact_stance')
  const tressa = game.players[0]!
  game.currentTurn = tressa.id
  tressa.hand = ['crystal']

  assert(!getPlayerCardInPlayActions(game, tressa.id).some(action => action.cardId === 'artifact_stance'),
    'Artifact Stance is not highlighted when Tressa has no Gem or Relic costing at least 2')
  const result = activatePlayerCardInPlayAction(game, tressa.id, 0)
  assert(result.some(message => message.includes('no available Main Phase action')),
    'Artifact Stance cannot be activated without an eligible card')
  assertEqual(game.pendingDecision, null, 'Artifact Stance opens no choice when all options are unavailable')
}

function testBreachStanceUsesTressaAsYou(): void {
  const game = freshGame('breach_stance')
  const tressa = game.players[0]!
  const activeAlly = game.players[1]!
  game.currentTurn = tressa.id
  tressa.hand = ['crystal']
  activeAlly.hand = ['jade']
  for (const breach of tressa.breaches) {
    if (breach.present === false) continue
    breach.opened = false
    breach.focusCount = 0
    breach.focusToOpen = 3
    breach.focusCost = breach.index === 3 || breach.index === 4 ? 4 : 5
  }

  const action = getPlayerCardInPlayActions(game, tressa.id)[0]
  assert(action, 'Breach Stance is available during Tressa\'s Main Phase')
  activatePlayerCardInPlayAction(game, tressa.id, action.cardIndex)
  const optional = game.pendingDecision
  assert(optional?.kind === 'choose_optional', 'Breach Stance offers its discard-and-focus effect')
  resolvePendingDecision(game, optional.id, { kind: 'choose_optional', accepted: true })

  const discard = game.pendingDecision
  assert(discard?.kind === 'select_cards', 'Breach Stance asks for a card from Tressa\'s hand')
  assert(discard.candidates.some(candidate => candidate.cardId === 'crystal'),
    'Tressa\'s hand is used for the discard')
  assert(!discard.candidates.some(candidate => candidate.cardId === 'jade'),
    'The active ally\'s hand is not used for the discard')
  resolvePendingDecision(game, discard.id, {
    kind: 'select_cards', choices: [discard.candidates.find(candidate => candidate.cardId === 'crystal')!],
  })

  const breachChoice = game.pendingDecision
  assert(breachChoice?.kind === 'select_breach', 'Breach Stance offers Tressa\'s closed Breaches')
  assert(breachChoice.candidates.length > 0 &&
    breachChoice.candidates.every(candidate => candidate.playerId === tressa.id),
  'The focus target is one of Tressa\'s Breaches')
  assertEqual(breachChoice.candidates.length, 2,
    'Breach Stance offers all Breaches tied for the lowest focus cost')
  assert(breachChoice.candidates.every(candidate => candidate.focusCost === 4),
    'Breach Stance excludes Tressa\'s more expensive closed Breach')
  resolvePendingDecision(game, breachChoice.id, {
    kind: 'select_breach', choice: breachChoice.candidates[0]!,
  })
  assertEqual(tressa.breaches.find(breach => breach.index === 3)?.focusCount, 1,
    'Confirming Breach Stance focuses the selected Tressa Breach')
  assertEqual(activeAlly.breaches.find(breach => breach.index === 3)?.focusCount, 0,
    'Breach Stance does not change an ally Breach')
}

function testBreachStanceCannotBeActivatedDuringAnAllysMainPhase(): void {
  const game = freshGame('breach_stance')
  const tressa = game.players[0]!
  const ally = game.players[1]!
  tressa.hand = ['crystal']
  game.currentTurn = ally.id

  assert(!getPlayerCardInPlayActions(game, tressa.id).some(action => action.cardId === 'breach_stance'),
    'Breach Stance is not highlighted during the ally\'s Main Phase')
  const result = activatePlayerCardInPlayAction(game, tressa.id, 0)
  assert(result.some(message => message.includes('no available Main Phase action')),
    'Breach Stance cannot be activated during the ally\'s Main Phase')
  assertEqual(game.pendingDecision, null, 'Breach Stance creates no decision during the ally\'s turn')
}

function testBreachStanceIsUnavailableWithoutDiscardAndFocusTargets(): void {
  const game = freshGame('breach_stance')
  const tressa = game.players[0]!
  game.currentTurn = tressa.id

  tressa.hand = []
  assert(!getPlayerCardInPlayActions(game, tressa.id).some(action => action.cardId === 'breach_stance'),
    'Breach Stance is not highlighted when Tressa has no card to discard')
  const noCardResult = activatePlayerCardInPlayAction(game, tressa.id, 0)
  assert(noCardResult.some(message => message.includes('no available Main Phase action')),
    'Breach Stance cannot be clicked when Tressa has no card to discard')
  assertEqual(game.pendingDecision, null, 'Breach Stance opens no prompt without a discardable card')

  tressa.hand = ['crystal']
  for (const breach of tressa.breaches) {
    if (breach.present === false) continue
    breach.opened = true
  }
  assert(!getPlayerCardInPlayActions(game, tressa.id).some(action => action.cardId === 'breach_stance'),
    'Breach Stance is not highlighted when Tressa has no closed Breach to focus')
  const noBreachResult = activatePlayerCardInPlayAction(game, tressa.id, 0)
  assert(noBreachResult.some(message => message.includes('no available Main Phase action')),
    'Breach Stance cannot be clicked when Tressa has no closed Breach to focus')
  assertEqual(game.pendingDecision, null, 'Breach Stance opens no prompt without a legal focus target')

  const closedBreach = tressa.breaches.find(breach => breach.present !== false)
  assert(closedBreach, 'Tressa has a present Breach for the eligible-state check')
  closedBreach.opened = false
  assert(getPlayerCardInPlayActions(game, tressa.id).some(action => action.cardId === 'breach_stance'),
    'Breach Stance becomes actionable when both a discard and a closed Breach are available')
}

function testReconnectTissueChecksTressasTreasureAfterAllyChoice(): void {
  const game = createGame('tressa', 'brama')
  const tressa = game.players[0]!
  const ally = game.players[1]!
  clearSetupDecision(game)
  game.currentTurn = tressa.id
  game.currentPhase = 'main'
  tressa.charge = tressa.chargeThreshold
  tressa.playerCardsInPlay = ['alchemic_stance', 'creator_stance']
  tressa.playerCardSupplyTargets = [null, null]
  tressa.playerCardPowerTokens = [0, 0]
  tressa.specificDeck = ['overload_stance']
  tressa.knownSpecificDeckCards = []
  ally.hand = ['crystal']
  ally.discard = ['jade']
  ally.charge = 0
  ally.playerCardsInPlay = ['breach_stance']
  ally.playerCardSupplyTargets = [null]
  ally.playerCardPowerTokens = [0]

  activateAbility(game, tressa.id)
  assertEqual(ally.charge, 2, 'Reconnect Tissue grants two charges to Tressa\'s ally')
  assertEqual(tressa.charge, 0, 'Tressa spends her charge threshold to activate Reconnect Tissue')

  const allyCard = game.pendingDecision
  assert(allyCard?.kind === 'select_cards',
    'Reconnect Tissue directly opens the selected ally\'s optional card-selection prompt')
  assertEqual(allyCard.prompt, 'Destroy a card from your hand or discard pile?',
    'The destruction prompt addresses the selected ally in their own perspective')
  assertEqual(allyCard.min, 0, 'The selected ally may skip destroying a card')
  assertEqual(allyCard.max, 1, 'The selected ally may destroy at most one card')
  assertEqual(game.pendingEffect?.effectPlayerId, ally.id,
    'Reconnect Tissue switches the decision context to the selected ally')
  assert(allyCard.candidates.some(candidate => candidate.zone === 'hand' && candidate.cardId === 'crystal'),
    'The selected ally can choose a card from hand')
  assert(allyCard.candidates.some(candidate => candidate.zone === 'discard' && candidate.cardId === 'jade'),
    'The selected ally can choose a card from discard')
  resolvePendingDecision(game, allyCard.id, {
    kind: 'select_cards', choices: [allyCard.candidates.find(candidate => candidate.zone === 'discard')!],
  })
  assert(ally.destroyedCards.includes('jade'),
    'Reconnect Tissue destroys the selected card from the ally\'s discard pile')
  assertEqual(game.pendingEffect?.effectPlayerId, tressa.id,
    'After the ally decides, Reconnect Tissue resumes from Tressa\'s perspective')

  const treasureOffer = game.pendingDecision
  assert(treasureOffer?.kind === 'choose_optional',
    'Reconnect Tissue then offers to exchange the Treasure in Tressa\'s play area')
  assertEqual(treasureOffer.accept.disabled, false,
    'The Yes option checks Tressa\'s level-3 Treasure, not the ally\'s Player cards in play')
  resolvePendingDecision(game, treasureOffer.id, { kind: 'choose_optional', accepted: true })

  const treasureChoice = game.pendingDecision
  assert(treasureChoice?.kind === 'select_cards',
    'Reconnect Tissue asks Tressa which level-3 Treasure to exchange when she has more than one')
  assertEqual(treasureChoice.candidates.length, 2,
    'Reconnect Tissue offers only Tressa\'s level-3 Treasures')
  assert(treasureChoice.candidates.every(candidate => candidate.cardId !== 'breach_stance'),
    'Reconnect Tissue does not offer the ally\'s Treasure for exchange')
  resolvePendingDecision(game, treasureChoice.id, {
    kind: 'select_cards', choices: [treasureChoice.candidates.find(candidate => candidate.cardId === 'alchemic_stance')!],
  })

  assertEqual(tressa.playerCardsInPlay?.join(','), 'creator_stance,overload_stance',
    'Accepting the offer exchanges the selected Treasure for the next Vault card in Tressa\'s play area')
  assertEqual(tressa.specificDeck?.[0], 'alchemic_stance',
    'The exchanged Treasure is put on the bottom of Tressa\'s Vault')
  assert(tressa.knownSpecificDeckCards?.includes('overload_stance') &&
    tressa.knownSpecificDeckCards.includes('alchemic_stance'),
  'Treasures revealed from the Vault stay known when exchanged into and out of play')
  assertEqual(ally.playerCardsInPlay?.[0], 'breach_stance',
    'Reconnect Tissue leaves the ally\'s level-3 Treasure untouched')
}

function testReconnectTissueCanSkipAllyDestruction(): void {
  const game = createGame('tressa', 'brama')
  const tressa = game.players[0]!
  const ally = game.players[1]!
  clearSetupDecision(game)
  game.currentTurn = tressa.id
  game.currentPhase = 'main'
  tressa.charge = tressa.chargeThreshold
  tressa.playerCardsInPlay = ['alchemic_stance']
  tressa.playerCardSupplyTargets = [null]
  tressa.playerCardPowerTokens = [0]
  tressa.specificDeck = ['overload_stance']
  ally.hand = ['crystal']

  activateAbility(game, tressa.id)
  const selection = game.pendingDecision
  assert(selection?.kind === 'select_cards', 'Reconnect Tissue opens the ally card choice without a Yes/No dialog')
  assertEqual(selection.min, 0, 'The ally selection allows an empty choice to skip')
  resolvePendingDecision(game, selection.id, { kind: 'select_cards', choices: [] })
  assertEqual(ally.destroyedCards.includes('crystal'), false,
    'Skipping Reconnect Tissue leaves the ally\'s card untouched')
  assertEqual(game.pendingDecision?.kind, 'choose_optional',
    'After skipping, Tressa still receives her separate Vault exchange decision')
  assertEqual(game.pendingEffect?.effectPlayerId, tressa.id,
    'The follow-up Vault decision returns to Tressa\'s perspective')
}

function testOverloadStanceCountsOnlySpellsThatWereCast(): void {
  for (const castCount of [1, 2, 3]) {
    const game = createGame('tressa', 'brama')
    const tressa = game.players[0]!
    clearSetupDecision(game)
    game.currentTurn = tressa.id
    game.currentPhase = 'main'
    game.nemesis.hp = 40
    tressa.playerCardsInPlay = ['overload_stance']
    tressa.playerCardSupplyTargets = [null]
    tressa.playerCardPowerTokens = [0]
    tressa.spellsCastThisTurn = 0

    tressa.hand = ['crystal']
    playCard(game, tressa.id, 'crystal')
    assertEqual(tressa.spellsCastThisTurn, 0,
      'Playing a Gem does not count as casting a spell for Overload Stance')

    for (let index = 0; index < castCount; index++) {
      const breach = tressa.breaches[index + 1]!
      breach.opened = true
      breach.damageBonus = 0
      breach.prepSpells = ['crystal']
      breach.preppedThisTurn = [false]
      breach.preppedSpellFaceDown = [false]
      assertEqual(castSpell(game, tressa.id, breach.index), 'Only a Spell can be cast',
        'A non-Spell in a malformed prep slot is rejected')
      assertEqual(tressa.spellsCastThisTurn, index,
        'An invalid cast attempt does not increment the spell counter')
      breach.prepSpells = ['spark']
      assert(castSpell(game, tressa.id, breach.index)?.includes('Cast Spark'),
        `Tressa can cast Spark ${index + 1}`)
      assertEqual(tressa.spellsCastThisTurn, index + 1,
        'A successfully cast Spell increments the casting counter once')
    }
    assertEqual(game.nemesis.hp, 40 - castCount,
      'Spark damage is resolved during casting before Overload Stance triggers')

    const overloadDamage = castCount >= 3 ? 4 : 1
    const expectedHp = 40 - castCount - overloadDamage
    resolvePlayerInPlayPhaseEffects(game, tressa.id, 'casting_phase_end')
    assertEqual(game.nemesis.hp, expectedHp,
      `Overload Stance deals its ${castCount}-spell threshold damage after Spark damage`)

    resolvePlayerInPlayPhaseEffects(game, tressa.id, 'casting_phase_end')
    assertEqual(game.nemesis.hp, expectedHp,
      'Overload Stance resolves at most once during the turn')
  }
}

function testTressaSetupPutsOneOfTwoRevealedTreasuresIntoPlay(): void {
  const game = createGame('tressa', 'brama')
  const tressa = game.players[0]!
  const startingVault = [...tressa.specificDeck!]
  const reveal = game.pendingDecision
  assert(reveal?.kind === 'select_cards', 'Tressa setup asks which of the top two Vault cards to put in play')
  assertEqual(reveal.layout, 'instant-card-choice', 'Tressa setup resolves a Treasure choice on one click')
  assertEqual(reveal.candidates.length, 2, 'Tressa setup reveals exactly two Vault cards')
  assert(reveal.candidates.every(candidate => startingVault.slice(0, 2).includes(candidate.cardId)),
    'Only the two current top cards of Tressa\'s Vault are offered')
  resolvePendingDecision(game, reveal.id, {
    kind: 'select_cards', choices: [reveal.candidates[0]!],
  })
  const chosen = reveal.candidates[0]!.cardId
  const returned = reveal.candidates[1]!.cardId
  assertEqual(tressa.playerCardsInPlay?.[0], chosen,
    'The selected Treasure enters Tressa\'s Player cards in play')
  assertEqual(tressa.specificDeck?.length, 4, 'The Vault retains four cards after setup')
  assertEqual(tressa.specificDeck?.[tressa.specificDeck.length - 1], returned,
    'The unselected revealed Treasure goes to the bottom of Tressa\'s Vault')
  assert(tressa.knownSpecificDeckCards?.includes(returned) &&
    tressa.knownSpecificDeckCards.includes(tressa.specificDeck![0]!),
  'The unselected Treasure and newly revealed Vault top remain known')
}

function testTransmateriumChargesTressaOnly(): void {
  const game = freshGame('creator_stance')
  const tressa = game.players[0]!
  const ally = game.players[1]!
  tressa.playerCardsInPlay = []
  tressa.hand = ['transmaterium']
  tressa.charge = 0
  ally.charge = 0
  playCard(game, tressa.id, 'transmaterium')
  assertEqual(tressa.charge, 1, 'Transmaterium gives its player one charge')
  assertEqual(ally.charge, 0, 'Transmaterium does not give charge to Tressa\'s ally')
}

function testTranslocateDealsDamageAndOptionallyCyclesTressasVault(): void {
  const game = createGame('tressa', 'brama')
  const tressa = game.players[0]!
  clearSetupDecision(game)
  game.currentTurn = tressa.id
  game.nemesis.hp = 40
  tressa.specificDeck = ['artifact_stance', 'breach_stance', 'creator_stance']
  const breach = tressa.breaches.find(item => item.index === 2)!
  breach.opened = true
  breach.damageBonus = 0
  breach.prepSpells = ['translocate']
  breach.preppedThisTurn = [false]
  breach.preppedSpellFaceDown = [false]

  castSpell(game, tressa.id, breach.index)
  assertEqual(game.nemesis.hp, 39, 'Translocate deals one damage when Tressa casts it')
  const prompt = game.pendingDecision
  assert(prompt?.kind === 'choose_optional', 'Translocate lets Tressa choose whether to cycle the Vault')
  resolvePendingDecision(game, prompt.id, { kind: 'choose_optional', accepted: true })
  assertEqual(tressa.specificDeck?.join(','), 'breach_stance,creator_stance,artifact_stance',
    'Accepting Translocate moves Tressa\'s Vault top card to its bottom')
  assert(tressa.knownSpecificDeckCards?.includes('artifact_stance') &&
    tressa.knownSpecificDeckCards.includes('breach_stance'),
  'Translocate remembers both the card it moved and the newly exposed Vault top')

  const skipGame = createGame('tressa', 'brama')
  const skipTressa = skipGame.players[0]!
  clearSetupDecision(skipGame)
  skipTressa.specificDeck = ['artifact_stance', 'breach_stance']
  const skipBreach = skipTressa.breaches.find(item => item.index === 2)!
  skipBreach.opened = true
  skipBreach.prepSpells = ['translocate']
  skipBreach.preppedThisTurn = [false]
  skipBreach.preppedSpellFaceDown = [false]
  castSpell(skipGame, skipTressa.id, skipBreach.index)
  const skipPrompt = skipGame.pendingDecision
  assert(skipPrompt?.kind === 'choose_optional', 'Translocate also offers its optional Vault effect when skipped')
  resolvePendingDecision(skipGame, skipPrompt.id, { kind: 'choose_optional', accepted: false })
  assertEqual(skipTressa.specificDeck?.join(','), 'artifact_stance,breach_stance',
    'Skipping Translocate leaves Tressa\'s Vault unchanged')
}

function testAlchemicStanceReturnsOnlyTressasDiscardedRelicOrSpell(): void {
  const game = freshGame('alchemic_stance')
  const tressa = game.players[0]!
  const ally = game.players[1]!
  game.currentTurn = ally.id
  tressa.discard = ['crystal', 'spark', 'flexing_dagger']
  ally.discard = ['essence_theft']

  resolvePlayerInPlayPhaseEffects(game, tressa.id, 'end_turn_before_draw')
  const prompt = game.pendingDecision
  assert(prompt?.kind === 'choose_optional', 'Alchemic Stance prompts Tressa before her draw')
  resolvePendingDecision(game, prompt.id, { kind: 'choose_optional', accepted: true })
  const selection = game.pendingDecision
  assert(selection?.kind === 'select_cards', 'Alchemic Stance asks Tressa to select a discarded card')
  assert(selection.candidates.some(candidate => candidate.cardId === 'spark'),
    'Alchemic Stance can return Tressa\'s Spell')
  assert(selection.candidates.some(candidate => candidate.cardId === 'flexing_dagger'),
    'Alchemic Stance can return Tressa\'s Relic')
  assert(!selection.candidates.some(candidate => candidate.cardId === 'crystal' || candidate.cardId === 'essence_theft'),
    'Alchemic Stance excludes Gems and cards in the ally\'s discard')
  resolvePendingDecision(game, selection.id, {
    kind: 'select_cards', choices: [selection.candidates.find(candidate => candidate.cardId === 'spark')!],
  })
  assert(tressa.hand.includes('spark'), 'The chosen Spell returns to Tressa\'s hand')
  assert(!tressa.discard.includes('spark'), 'The returned Spell leaves Tressa\'s discard')
  assert(ally.discard.includes('essence_theft'), 'The ally\'s discard remains unchanged')
  resolvePlayerInPlayPhaseEffects(game, tressa.id, 'end_turn_before_draw')
  assertEqual(game.pendingDecision, null, 'Alchemic Stance is limited to one use per turn')
}

function testTressaKeepsAllPreviouslyRevealedVaultCardsKnown(): void {
  const game = createGame('tressa', 'brama')
  const tressa = game.players[0]!
  clearSetupDecision(game)
  const vault = ['alchemic_stance', 'artifact_stance', 'breach_stance', 'creator_stance', 'overload_stance']
  tressa.specificDeck = [...vault]
  tressa.knownSpecificDeckCards = []

  for (let index = 0; index < vault.length; index++) {
    resolveEffects(game, tressa.id, [{ kind: 'move_specific_deck_top_to_bottom' }], undefined, 0, tressa.id)
  }

  assertEqual(tressa.specificDeck?.join(','), vault.join(','),
    'Cycling every Vault card returns the deck to its original order')
  assert(vault.every(cardId => tressa.knownSpecificDeckCards?.includes(cardId)),
    'Every card revealed while cycling remains known after returning to the bottom')
}

function testCreatorStanceReducesOnlyTressasGemAndRelicCosts(): void {
  const game = freshGame('creator_stance')
  const tressa = game.players[0]!
  const ally = game.players[1]!
  game.market.piles = [
    { cardId: 'jade', remaining: 5 },
    { cardId: 'flexing_dagger', remaining: 5 },
    { cardId: 'spark', remaining: 5 },
  ]
  assertEqual(getMarketCardCost(game, 0, tressa.id), 1, 'Creator Stance reduces Tressa\'s Gem cost by one')
  assertEqual(getMarketCardCost(game, 1, tressa.id), 1, 'Creator Stance reduces Tressa\'s Relic cost by one')
  assertEqual(getMarketCardCost(game, 2, tressa.id), 0, 'Creator Stance does not reduce Spell costs')
  assertEqual(getMarketCardCost(game, 0, ally.id), 2, 'Creator Stance does not discount the ally\'s purchases')
}

testArtifactStanceUsesTressaAsYou()
testArtifactStanceIsNotActionableWithoutAnEligibleHandCard()
testBreachStanceUsesTressaAsYou()
testBreachStanceCannotBeActivatedDuringAnAllysMainPhase()
testBreachStanceIsUnavailableWithoutDiscardAndFocusTargets()
testReconnectTissueChecksTressasTreasureAfterAllyChoice()
testReconnectTissueCanSkipAllyDestruction()
testOverloadStanceCountsOnlySpellsThatWereCast()
testTressaSetupPutsOneOfTwoRevealedTreasuresIntoPlay()
testTransmateriumChargesTressaOnly()
testTranslocateDealsDamageAndOptionallyCyclesTressasVault()
testTressaKeepsAllPreviouslyRevealedVaultCardsKnown()
testAlchemicStanceReturnsOnlyTressasDiscardedRelicOrSpell()
testCreatorStanceReducesOnlyTressasGemAndRelicCosts()
console.log('Wave 9 Tressa Treasure and ability tests passed.')
