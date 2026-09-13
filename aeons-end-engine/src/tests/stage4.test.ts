import {
  advanceNemesisTurn,
  canPlayerAct,
  buyCard,
  buySpecificPileCard,
  createGame,
  dealDamage,
  discardNemesisPower,
  getDamageTargets,
  resolveEffects,
  resolvePendingDecision,
} from '../engine'
import { createTwoPlayerScenario, getCard } from '../data'
import type { GameState, NemesisCardDef } from '../types'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function nemesisGame(): GameState {
  const game = createGame('jian', 'brama')
  game.currentTurn = 'nemesis'
  game.currentPhase = 'nemesis_main'
  game.nemesis.deck = []
  game.nemesis.playArea = []
  return game
}

function confirmNemesisDraw(game: GameState): string[] {
  const decision = game.pendingDecision
  assert(decision?.kind === 'confirm_nemesis_draw', 'Nemesis draw pauses for confirmation')
  return resolvePendingDecision(game, decision.id, { kind: 'confirm_nemesis_draw', accepted: true })
}

function advanceNemesisMain(game: GameState): string[] {
  const messages: string[] = []
  for (let attempt = 0; attempt < 10; attempt++) {
    messages.push(...advanceNemesisTurn(game))
    const decision = game.pendingDecision
    if (decision?.kind === 'confirm_nemesis_effect') {
      messages.push(...resolvePendingDecision(game, decision.id, { kind: 'confirm_nemesis_effect', accepted: true }))
      continue
    }
    if (decision?.kind === 'confirm_nemesis_draw') {
      messages.push(...resolvePendingDecision(game, decision.id, { kind: 'confirm_nemesis_draw', accepted: true }))
      continue
    }
    break
  }
  return messages
}

function testAttackEffectAndUnleash(): void {
  const game = nemesisGame()
  game.nemesis.deck = ['slaughter']
  const initial = advanceNemesisTurn(game)
  assert(game.pendingDecision?.kind === 'confirm_nemesis_draw', 'Attack reveal is presented before resolution')
  const messages = [...initial, ...confirmNemesisDraw(game), ...advanceNemesisTurn(game)]
  assert(messages.some(message => message.includes('Slaughter')), 'Attack card is drawn and resolved by the Nemesis state machine')
  assertEqual(game.gravehold.hp, 27, 'Slaughter deals its typed Gravehold damage')
  assertEqual(game.nemesis.counters.fury, 2, 'Slaughter unleashes once')
  assert(game.nemesis.discard.includes('slaughter'), 'Resolved Attack enters the Nemesis discard pile')

  const repeatedUnleashGame = nemesisGame()
  resolveEffects(repeatedUnleashGame, repeatedUnleashGame.players[0]!.id, [{ kind: 'unleash', amount: 2 }])
  assertEqual(repeatedUnleashGame.nemesis.counters.fury, 3,
    'Unleash twice repeats the complete configured Rageborne Unleash effect')
}

function testPersistentAndPowerEffects(): void {
  const game = nemesisGame()
  game.nemesis.playArea = [{
    cardId: 'bane_sire', cardType: 'minion', placedAt: 1,
    instanceId: 'bane-sire:1', enteredOnNemesisTurn: 0, lifeTokens: 6,
  }]
  const messages = advanceNemesisMain(game)
  assert(messages.some(message => message.includes('Persistent for Bane Sire')), 'Persistent effect is resolved during Nemesis Main Phase')
  assertEqual(game.nemesis.counters.fury, 2, 'Bane Sire persistent effect unleashes')

  const powerGame = nemesisGame()
  powerGame.nemesis.playArea = [{
    cardId: 'blood_cry', cardType: 'power', placedAt: 1,
    instanceId: 'blood-cry:1', enteredOnNemesisTurn: 0, powerTokens: 1,
  }]
  powerGame.nemesis.strikeDeck = ['devastate']
  const powerMessages = advanceNemesisMain(powerGame)
  assertEqual(powerMessages.filter(message => message.includes('gains 1 fury')).length, 4,
    'Power resolution repeats the complete Unleash effect four times')
  assertEqual(powerGame.nemesis.counters.fury, 2, 'End-of-turn Strike applies its configured Fury loss')
  assert(powerGame.nemesis.discard.includes('blood_cry'), 'Resolved Power enters the Nemesis discard pile')
}

function testStrikeEffectsAndMinionDamageRule(): void {
  const game = nemesisGame()
  game.nemesis.strikeDeck = ['devastate']
  game.nemesis.counters.fury = 2
  const messages = resolveEffects(game, game.players[0]!.id, [{ kind: 'resolve_strike' }])
  const strikeDecision = game.pendingDecision
  assert(strikeDecision?.kind === 'confirm_nemesis_draw' && strikeDecision.source === 'specific_deck', 'Strike draw uses the generic Nemesis reveal confirmation')
  const confirmedStrike = resolvePendingDecision(game, strikeDecision.id, { kind: 'confirm_nemesis_draw', accepted: true })
  assert([...messages, ...confirmedStrike].some(message => message.includes('Devastate')), 'Strike cards are drawn and resolved through typed effects')
  assertEqual(game.gravehold.hp, 25, 'Devastate deals five damage to Gravehold')
  assertEqual(game.nemesis.counters.fury, 0, 'Card-triggered Strike loses three Fury and clamps at zero')
  assertEqual(game.nemesis.strikeDeck[0], 'devastate', 'Resolved Strike is shuffled back into the Strike deck')

  const cauterizerGame = nemesisGame()
  cauterizerGame.nemesis.playArea = [{
    cardId: 'cauterizer', cardType: 'minion', placedAt: 1,
    instanceId: 'cauterizer:1', lifeTokens: 3,
  }]
  const target = getDamageTargets(cauterizerGame, 'minion')[0]!
  dealDamage(cauterizerGame, target, 4)
  assertEqual(cauterizerGame.nemesis.playArea[0]!.lifeTokens, 2, 'Cauterizer caps each damage instance at one')
}

function testMostExpensivePreppedSpellSelection(): void {
  const game = nemesisGame()
  game.players[0]!.breaches[0]!.prepSpells = ['spark', 'spark']
  game.players[1]!.breaches[0]!.prepSpells = ['lava_tendril']

  const messages = resolveEffects(game, game.players[0]!.id, [{
    kind: 'discard_prepped_spells', amount: 2, target: 'any_player', mostExpensive: true,
  }])
  assert(messages.some(message => message.includes('Decision required')), 'A tied cutoff opens a confirmation choice before changing the board')
  assertEqual(game.players[1]!.breaches[0]!.prepSpells[0], 'lava_tendril', 'The uniquely highest-cost spell remains until confirmation')
  assertEqual(game.players[1]!.discard.length, 0, 'No prepped spell is discarded before confirmation')
  assertEqual(game.pendingDecision?.kind, 'select_prepped_spells', 'A tied cutoff opens a choice for the complete selection')
  assert(game.pendingDecision?.kind !== 'select_prepped_spells' || game.pendingDecision.candidates.length === 3, 'The 4-cost spell and both zero-cost Spark cards are shown')
  assert(game.pendingDecision?.kind !== 'select_prepped_spells' || game.pendingDecision.requiredChoices?.length === 1, 'The uniquely highest-cost spell is required in the selection')

  const decision = game.pendingDecision!
  assert(decision.kind === 'select_prepped_spells', 'The remaining tied spells are selectable')
  const required = decision.requiredChoices![0]!
  resolvePendingDecision(game, decision.id, { kind: 'select_prepped_spells', choices: [required, decision.candidates.find(choice => choice.cardId === 'spark')!] })
  assertEqual(game.players[1]!.breaches[0]!.prepSpells.length, 0, 'The confirmed high-cost spell is discarded')
  assertEqual(game.players[1]!.discard[0], 'lava_tendril', 'The confirmed high-cost spell enters its owner discard pile')
  assertEqual(game.players[0]!.breaches[0]!.prepSpells.length, 1, 'Selecting one tied Spark removes exactly one Spark')

  const sameBreachGame = nemesisGame()
  sameBreachGame.players[0]!.breaches[0]!.prepSpells = ['lava_tendril', 'spark', 'spark']
  resolveEffects(sameBreachGame, sameBreachGame.players[0]!.id, [{
    kind: 'discard_prepped_spells', amount: 2, target: 'any_player', mostExpensive: true,
  }])
  const sameBreachDecision = sameBreachGame.pendingDecision
  assert(sameBreachDecision?.kind === 'select_prepped_spells', 'A same-Breach cutoff tie remains selectable')
  assertEqual(sameBreachGame.players[0]!.breaches[0]!.prepSpells.join(','), 'lava_tendril,spark,spark', 'Same-Breach spells remain until confirmation')
  resolvePendingDecision(sameBreachGame, sameBreachDecision.id, {
    kind: 'select_prepped_spells', choices: [sameBreachDecision.requiredChoices![0]!, sameBreachDecision.candidates.find(choice => choice.cardId === 'spark')!],
  })
  assertEqual(sameBreachGame.players[0]!.breaches[0]!.prepSpells.join(','), 'spark', 'Prepped-spell indexes stay valid after forced removal')
}

function testAdelheimPreResolutionResponse(): void {
  const game = createGame('adelheim', 'brama')
  game.currentTurn = 'nemesis'
  game.currentPhase = 'nemesis_draw'
  game.nemesis.deck = ['slaughter']
  game.players[0]!.charge = game.players[0]!.chargeThreshold
  advanceNemesisTurn(game)
  confirmNemesisDraw(game)
  const messages = advanceNemesisTurn(game)
  assert(messages.some(message => message.includes('Aethereal Ward')), 'Adelheim is offered a response before an Attack resolves')
  const decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Adelheim response pauses for Activate or Skip')
  const completed = resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: true })
  assert(completed.some(message => message.includes('Discarded revealed Nemesis card')), 'Adelheim cancels the revealed card')
  assertEqual(game.nemesis.discard[0], 'slaughter', 'Cancelled Attack enters the Nemesis discard pile')
  assertEqual(game.gravehold.hp, 30, 'Cancelled Attack has no effect')
  assertEqual(game.players[0]!.charge, 0, 'Adelheim charge is consumed')

  const powerGame = createGame('adelheim', 'brama')
  powerGame.currentTurn = 'nemesis'
  powerGame.currentPhase = 'nemesis_draw'
  powerGame.nemesis.deck = ['eye_of_nothing']
  powerGame.players[0]!.charge = powerGame.players[0]!.chargeThreshold
  advanceNemesisTurn(powerGame)
  confirmNemesisDraw(powerGame)
  advanceNemesisTurn(powerGame)
  const powerDecision = powerGame.pendingDecision
  assert(powerDecision?.kind === 'choose_optional', 'Adelheim may respond to a revealed Power')
  resolvePendingDecision(powerGame, powerDecision.id, { kind: 'choose_optional', accepted: true })
  assertEqual(powerGame.nemesis.discard[0], 'eye_of_nothing', 'Cancelled Power enters the Nemesis discard pile')
  assert(!powerGame.nemesis.playArea.some(card => card.cardId === 'eye_of_nothing'), 'Cancelled Power does not enter play')

  const skippedGame = createGame('adelheim', 'brama')
  skippedGame.currentTurn = 'nemesis'
  skippedGame.currentPhase = 'nemesis_draw'
  skippedGame.nemesis.deck = ['slaughter']
  skippedGame.players[0]!.charge = skippedGame.players[0]!.chargeThreshold
  advanceNemesisTurn(skippedGame)
  confirmNemesisDraw(skippedGame)
  advanceNemesisTurn(skippedGame)
  const skippedDecision = skippedGame.pendingDecision
  assert(skippedDecision?.kind === 'choose_optional', 'Adelheim can decline the response')
  resolvePendingDecision(skippedGame, skippedDecision.id, { kind: 'choose_optional', accepted: false })
  assertEqual(skippedGame.nemesis.discard[0], 'slaughter', 'A skipped Attack resolves into the Nemesis discard pile')
  assertEqual(skippedGame.gravehold.hp, 27, 'A skipped Attack resolves normally')
  assertEqual(skippedGame.players[0]!.charge, skippedGame.players[0]!.chargeThreshold, 'Skipping preserves Adelheim charge')

  const minionGame = createGame('adelheim', 'brama')
  minionGame.currentTurn = 'nemesis'
  minionGame.currentPhase = 'nemesis_draw'
  minionGame.nemesis.deck = ['bane_sire']
  minionGame.players[0]!.charge = minionGame.players[0]!.chargeThreshold
  advanceNemesisTurn(minionGame)
  confirmNemesisDraw(minionGame)
  advanceNemesisTurn(minionGame)
  assert(minionGame.pendingDecision?.kind !== 'choose_optional', 'Adelheim cannot respond to a Minion')
  assert(minionGame.nemesis.playArea.some(card => card.cardId === 'bane_sire'), 'The Minion enters play normally')

  const unchargedGame = createGame('adelheim', 'brama')
  unchargedGame.currentTurn = 'nemesis'
  unchargedGame.currentPhase = 'nemesis_draw'
  unchargedGame.nemesis.deck = ['slaughter']
  unchargedGame.players[0]!.charge = unchargedGame.players[0]!.chargeThreshold - 1
  advanceNemesisTurn(unchargedGame)
  confirmNemesisDraw(unchargedGame)
  advanceNemesisTurn(unchargedGame)
  assert(unchargedGame.pendingDecision?.kind !== 'choose_optional', 'Adelheim cannot respond without full charge')
  assertEqual(unchargedGame.gravehold.hp, 27, 'An Attack resolves normally when Adelheim is uncharged')
}

function testPrinceOfGluttonsDevouredPileAndCards(): void {
  const game = createGame('jian', 'brama', 'standard', 'prince_of_gluttons')
  assertEqual(game.nemesis.name, 'Prince of Gluttons', 'Prince of Gluttons is registered as a selectable Nemesis')
  assertEqual(game.nemesis.strikeDeck.length, 3, 'Prince setup creates the three-card Devoured pile')
  assertEqual(game.nemesis.strikeDeck[0], 'vriswood_amber', 'Devoured setup leaves the least expensive gem on top')
  for (const pile of game.market.piles.filter(pile => ['vriswood_amber', 'diamond_cluster', 'burning_opal'].includes(pile.cardId))) {
    assertEqual(pile.remaining, 6, 'Prince setup removes one card from each gem supply')
  }

  const increasedGame = createGame(createTwoPlayerScenario(['jian', 'brama'], 'prince_of_gluttons', 'increased'))
  assertEqual(increasedGame.nemesis.difficulty, 'increased', 'Prince stores the selected increased difficulty')
  for (let selection = 9; selection > 0; selection--) {
    const setupDecision = increasedGame.pendingDecision
    assert(setupDecision?.kind === 'select_setup_devour_pile', 'Increased Prince setup asks players to choose each Devour')
    assertEqual(setupDecision.remainingChoices, selection, 'Setup Devour prompt shows the remaining choice count')
    const choice = setupDecision.candidates[0]!
    resolvePendingDecision(increasedGame, setupDecision.id, { kind: 'select_setup_devour_pile', choice })
  }
  assertEqual(increasedGame.pendingDecision, null, 'The ninth setup Devour completes setup')
  assertEqual(increasedGame.nemesis.strikeDeck.length, 12, 'Increased Prince setup Devours nine additional cards')

  const player = game.players[0]!
  game.currentTurn = player.id
  game.currentPhase = 'main'
  player.bonusAether = 3
  const gainMessage = buySpecificPileCard(game, player.id)
  assert(gainMessage?.includes('Devoured pile'), 'The top Devoured card can be gained like a supply card')
  assertEqual(player.discard[0], 'vriswood_amber', 'Gained Devoured card enters the player discard pile')
  assertEqual(game.nemesis.strikeDeck.length, 2, 'Gaining removes only the top Devoured card')

  const emptySupplyGame = createGame('jian', 'brama', 'standard', 'prince_of_gluttons')
  const lastSupply = emptySupplyGame.market.piles.find(pile => pile.cardId === 'vriswood_amber')!
  for (const pile of emptySupplyGame.market.piles) pile.remaining = 0
  lastSupply.remaining = 1
  const lastSupplyPlayer = emptySupplyGame.players[0]!
  lastSupplyPlayer.bonusAether = 3
  buyCard(emptySupplyGame, lastSupplyPlayer.id, emptySupplyGame.market.piles.indexOf(lastSupply))
  assert(emptySupplyGame.gameOver && emptySupplyGame.winner === 'nemesis', 'Players lose when the last regular supply card is gained')

  const unleashGame = createGame('jian', 'brama', 'standard', 'prince_of_gluttons')
  const unleashPlayer = unleashGame.players[0]!
  const cheapestPile = [...unleashGame.market.piles]
    .sort((left, right) => getCard(left.cardId).cost - getCard(right.cardId).cost)[0]!
  const cheapestCard = getCard(cheapestPile.cardId)
  const liveCheapestPile = unleashGame.market.piles.find(pile => pile.cardId === cheapestPile.cardId)!
  liveCheapestPile.remaining = 1
  const unleashMessages = resolveEffects(unleashGame, unleashPlayer.id, [{ kind: 'unleash' }])
  assert(unleashMessages.some(message => message.includes(`Devoured 1 ${cheapestCard.name}`)), 'Unleash Devours from the least expensive supply')
  assertEqual(unleashGame.nemesis.strikeDeck[0], cheapestPile.cardId, 'Devoured cards are placed on top of the specific pile')
  assertEqual(unleashGame.gravehold.hp, 26, 'Missing cards from a started Devour deal two Gravehold damage each')
  const afterOverflow = unleashGame.nemesis.strikeDeck.length
  const nextCheapestPile = [...unleashGame.market.piles]
    .filter(pile => pile.remaining > 0)
    .sort((left, right) => getCard(left.cardId).cost - getCard(right.cardId).cost)[0]!
  const nextCheapestCard = getCard(nextCheapestPile.cardId)
  const nextCheapestStart = nextCheapestPile.remaining
  const nextUnleashMessages = resolveEffects(unleashGame, unleashPlayer.id, [{ kind: 'unleash' }])
  const tiedCostDecision = unleashGame.pendingDecision
  assert(tiedCostDecision?.kind === 'select_market_pile',
    'Unleash pauses when multiple non-empty supply piles tie for the lowest cost')
  assert(tiedCostDecision.candidates.some(choice => choice.cardId === 'vriswood_amber') &&
    tiedCostDecision.candidates.some(choice => choice.cardId === 'bottled_vortex'),
    'Unleash offers every tied least-expensive supply pile')
  assert(nextUnleashMessages.every(message => !message.includes('Devoured 3')),
    'Unleash does not choose a tied supply pile automatically')
  const selectedTiedPile = tiedCostDecision.candidates.find(choice => choice.cardId === nextCheapestPile.cardId)!
  const resolvedTiedMessages = resolvePendingDecision(unleashGame, tiedCostDecision.id, {
    kind: 'select_market_pile', choice: selectedTiedPile,
  })
  assert(resolvedTiedMessages.some(message => message.includes(`Devoured 3 ${nextCheapestCard.name}`)),
    'Unleash Devours from the selected least-expensive supply pile')
  assertEqual(unleashGame.nemesis.strikeDeck.length, afterOverflow + 3,
    'Unleash adds three cards from the next cheapest non-empty supply')
  assertEqual(nextCheapestPile.remaining, nextCheapestStart - 3,
    'The next cheapest non-empty supply loses all three Devoured cards')
  assertEqual(unleashGame.gravehold.hp, 26,
    'A complete Devour from the replacement supply deals no Gravehold damage')

  const repeatedPrinceUnleashGame = createGame('jian', 'brama', 'standard', 'prince_of_gluttons')
  const repeatedPrincePlayer = repeatedPrinceUnleashGame.players[0]!
  const twoCostRelicPile = repeatedPrinceUnleashGame.market.piles.find(pile => pile.cardId === 'flexing_dagger')!
  const higherCostPile = repeatedPrinceUnleashGame.market.piles.find(pile => pile.cardId === 'bottled_vortex')!
  for (const pile of repeatedPrinceUnleashGame.market.piles) pile.remaining = 0
  twoCostRelicPile.remaining = 5
  higherCostPile.remaining = 1
  const repeatedPrinceMessages = resolveEffects(repeatedPrinceUnleashGame, repeatedPrincePlayer.id, [{ kind: 'unleash', amount: 2 }])
  assertEqual(twoCostRelicPile.remaining, 0,
    'Unleash twice repeats Prince Devour against the current least expensive supply pile')
  assertEqual(repeatedPrinceUnleashGame.nemesis.strikeDeck.length, 8,
    'Unleash twice Devours all five cards from the two-cost relic supply pile')
  assertEqual(repeatedPrinceUnleashGame.gravehold.hp, 28,
    'The second incomplete Devour deals two Gravehold damage')
  assertEqual(repeatedPrinceMessages.filter(message => message.includes('Devoured')).length, 2,
    'Unleash twice resolves two separate Devour effects')

  const cerephageGame = createGame('jian', 'brama', 'standard', 'prince_of_gluttons')
  const cerephage = cerephageGame.nemesis.playArea = [{
    cardId: 'cerephage', cardType: 'minion', placedAt: 1, lifeTokens: 4,
  }]
  const cerephageDef = getCard('cerephage') as NemesisCardDef
  resolveEffects(cerephageGame, cerephageGame.players[0]!.id, cerephageDef.nemesisEffects![0]!.effects, 'cerephage')
  const pileDecision = cerephageGame.pendingDecision
  assert(pileDecision?.kind === 'select_market_pile', 'Cerephage asks players which supply pile to Devour')
  const gemChoice = pileDecision.candidates.find(choice => choice.cardId === 'vriswood_amber')!
  resolvePendingDecision(cerephageGame, pileDecision.id, { kind: 'select_market_pile', choice: gemChoice })
  assertEqual(cerephageGame.nemesis.strikeDeck[0], 'vriswood_amber', 'Chosen supply cards enter the Devoured pile')
  assertEqual(cerephage[0]!.lifeTokens, 2, 'Cerephage loses two life after Devouring')

  const mindguzzlerGame = createGame('jian', 'brama', 'standard', 'prince_of_gluttons')
  mindguzzlerGame.currentTurn = 'nemesis'
  mindguzzlerGame.currentPhase = 'nemesis_draw'
  mindguzzlerGame.nemesis.deck = ['mindguzzler']
  advanceNemesisTurn(mindguzzlerGame)
  confirmNemesisDraw(mindguzzlerGame)
  advanceNemesisTurn(mindguzzlerGame)
  assertEqual(mindguzzlerGame.nemesis.playArea[0]!.lifeTokens, 8, 'Mindguzzler life includes the number of empty supply piles')

  const uniqueCards = ['gorge', 'lobotomize', 'thought_biter', 'cerephage', 'godfeeders', 'mindguzzler', 'digest', 'memory_eater', 'vile_feast']
  for (const cardId of uniqueCards) {
    const card = getCard(cardId) as NemesisCardDef
    assert(card.nemesisEffects && card.nemesisEffects.length > 0, `${cardId} has typed Nemesis effects`)
  }
}

function testToDiscardKeepsMainPhaseActionsAvailable(): void {
  const aetherGame = createGame('jian', 'brama')
  aetherGame.currentTurn = aetherGame.players[0]!.id
  aetherGame.currentPhase = 'main'
  aetherGame.players[0]!.hand = []
  aetherGame.players[0]!.bonusAether = 6
  aetherGame.nemesis.playArea = [{
    cardId: 'eye_of_nothing', cardType: 'power', placedAt: 1,
    instanceId: 'eye-of-nothing:1', powerTokens: 2,
  }]
  assert(canPlayerAct(aetherGame, aetherGame.players[0]!.id), 'A Power To Discard action remains available after other resources are spent')
  discardNemesisPower(aetherGame, aetherGame.players[0]!.id, 'eye-of-nothing:1')
  assertEqual(aetherGame.nemesis.playArea.length, 0, 'Aether To Discard removes the Power from play')

  const chargeGame = createGame('jian', 'brama')
  chargeGame.currentTurn = chargeGame.players[0]!.id
  chargeGame.currentPhase = 'main'
  chargeGame.players[0]!.hand = []
  chargeGame.players[0]!.charge = 4
  chargeGame.nemesis.playArea = [{
    cardId: 'blood_cry', cardType: 'power', placedAt: 1,
    instanceId: 'blood-cry:1', powerTokens: 2,
  }]
  assert(canPlayerAct(chargeGame, chargeGame.players[0]!.id), 'A Charge-based To Discard action remains available after charging')

  const discardGame = createGame('jian', 'brama')
  discardGame.currentTurn = discardGame.players[0]!.id
  discardGame.currentPhase = 'main'
  discardGame.players[0]!.hand = ['crystal', 'crystal', 'spark', 'crystal']
  discardGame.nemesis.playArea = [{
    cardId: 'woven_sky', cardType: 'power', placedAt: 1,
    instanceId: 'woven-sky:1', powerTokens: 2,
  }]
  discardNemesisPower(discardGame, discardGame.players[0]!.id, 'woven-sky:1')
  assertEqual(discardGame.pendingDecision?.kind, 'select_cards', 'Discard-card To Discard opens a card selection')
  assert(discardGame.pendingDecision?.kind !== 'select_cards' || discardGame.pendingDecision.prompt.includes('discard the Power'), 'Discard-card prompt uses discard rather than destroy')
}

function testCollectiveGemMitigation(): void {
  const game = nemesisGame()
  game.players[0]!.hand = ['crystal']
  const messages = resolveEffects(game, game.players[0]!.id, [{
    kind: 'deal_gravehold_damage_with_gem_discard', amount: 18, maxGems: 6, reductionPerGem: 3,
  }])
  assert(messages.some(message => message.includes('Decision required')), 'Collective gem mitigation pauses for a shared choice')
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_collective_cards', 'Collective effects expose a multi-player card selection')
  const completed = resolvePendingDecision(game, decision.id, {
    kind: 'select_collective_cards',
    choices: [decision.candidates[0]!],
  })
  assert(completed.some(message => message.includes('15 damage')), 'Discarded gem reduces Gravehold damage')
  assertEqual(game.gravehold.hp, 15, 'One discarded gem prevents three damage')
  assertEqual(game.players[0]!.discard[0], 'crystal', 'The mitigating gem enters its owner discard pile')
}

testAttackEffectAndUnleash()
testPersistentAndPowerEffects()
testStrikeEffectsAndMinionDamageRule()
testMostExpensivePreppedSpellSelection()
testAdelheimPreResolutionResponse()
testPrinceOfGluttonsDevouredPileAndCards()
testToDiscardKeepsMainPhaseActionsAvailable()
testCollectiveGemMitigation()
console.log('Stage 4 Rageborne effects and Strike tests passed.')
