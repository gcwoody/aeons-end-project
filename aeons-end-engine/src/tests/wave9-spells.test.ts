import { ALL_MARKET_CARDS, createTwoPlayerScenario, getCard } from '../data'
import {
  activatePreppedSpellAction, activateRecall, castSpell, createGame,
  getPreppedCardActions, getRecallActions, resolveCardEffects, resolveDrawPhase,
  movePreppedSpell, playCard, prepSpell, resolveEffects, resolvePendingDecision, returnPreppedSpellToHand,
} from '../engine'
import type { GameState, PreppedSpellChoice } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function scenarioWithSpell(cardId: string) {
  const scenario = createTwoPlayerScenario(['jian', 'brama'])
  const slots = [...scenario.marketSetup!.slots]
  const spellSlot = slots.findIndex((id, index) => index >= 5 && getCard(id).type === 'spell')
  assert(spellSlot >= 0, 'The default market has a spell slot')
  slots[spellSlot] = cardId
  scenario.marketSetup = { mode: 'manual', slots }
  return scenario
}

function setMainPhase(game: GameState, playerId: string): void {
  game.currentTurn = playerId
  game.currentPhase = 'main'
}

function prepareSpell(game: GameState, playerId: string, cardId: string): PreppedSpellChoice {
  const player = game.players.find(candidate => candidate.id === playerId)!
  const breach = player.breaches.find(candidate => candidate.present !== false)!
  breach.opened = true
  const spellIndex = breach.prepSpells.length
  breach.prepSpells.push(cardId)
  breach.preppedThisTurn ??= []
  breach.preppedThisTurn.push(false)
  breach.preppedSpellFaceDown ??= []
  breach.preppedSpellFaceDown.push(false)
  return {
    playerId, breachIndex: breach.index, spellIndex, cardId, cardName: getCard(cardId).name,
  }
}

function resolveCurrentDamageTarget(game: GameState, targetId: string): void {
  const decision = game.pendingDecision
  assert(decision?.kind === 'allocate_divided_damage', 'A divided damage allocation is pending')
  assert(decision.targets.some(candidate => candidate.id === targetId), `The damage target ${targetId} is available`)
  resolvePendingDecision(game, decision.id, { kind: 'allocate_divided_damage', action: 'add', targetId })
}

function cancelCurrentDamageTarget(game: GameState, targetId: string): void {
  const decision = game.pendingDecision
  assert(decision?.kind === 'allocate_divided_damage', 'A divided damage allocation is pending')
  resolvePendingDecision(game, decision.id, { kind: 'allocate_divided_damage', action: 'remove', targetId })
}

function confirmCurrentDamageAllocation(game: GameState): string[] {
  const decision = game.pendingDecision
  assert(decision?.kind === 'allocate_divided_damage', 'A divided damage allocation is pending')
  return resolvePendingDecision(game, decision.id, { kind: 'allocate_divided_damage', action: 'confirm' })
}

function testWave9SupplySpellCatalogAndMechanics(): void {
  const expected: Array<[string, number]> = [
    ['deadly_accord', 3], ['descent_of_destruction', 8], ['ember_gale', 5],
    ['eternitys_echo', 7], ['frostfire_maelstrom', 4], ['inundate', 8],
    ['jeweled_shrapnel', 4], ['megaflux_slice', 4], ['stonefury_eruption', 5],
    ['vitrification', 6], ['worldshift', 6], ['boundless_fire', 3],
    ['cosmic_pulse', 6], ['obliterating_arc', 7], ['infernal_cascade', 5],
    ['torrential_spike', 4],
  ]
  for (const [cardId, cost] of expected) {
    assert(ALL_MARKET_CARDS[cardId], `${cardId} is in the Supply catalog`)
    assertEqual(getCard(cardId).type, 'spell', `${cardId} is a Spell`)
    assertEqual(getCard(cardId).cost, cost, `${cardId} has its printed cost`)
  }
  assert(getCard('boundless_fire').mechanics?.includes('recall'), 'Boundless Fire enables Recall')
  assert(getCard('eternitys_echo').mechanics?.includes('recall'), "Eternity's Echo enables Recall")
  assert(getCard('frostfire_maelstrom').mechanics?.includes('pulse_token'), 'Frostfire enables Pulse token setup')
  assert(getCard('jeweled_shrapnel').mechanics?.includes('trinket'), 'Jeweled Shrapnel enables Trinket setup')
  assert(getCard('cosmic_pulse').mechanics?.includes('unlimited_conjure'), 'Cosmic Pulse grants its breach extra Conjure capacity')
}

function testInfernalCascadeCastsTheChosenSpellOnceWithoutDiscardingThenNormally(): void {
  const game = createGame(scenarioWithSpell('infernal_cascade'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  const cascade = prepareSpell(game, caster.id, 'infernal_cascade')
  const allySpark = prepareSpell(game, ally.id, 'spark')
  const before = game.nemesis.hp

  castSpell(game, caster.id, cascade.breachIndex, cascade.spellIndex)
  const choice = game.pendingDecision
  assert(choice?.kind === 'select_prepped_spell', 'Infernal Cascade offers a prepped spell')
  assert(choice.candidates.some(candidate => candidate.cardId === 'spark' && candidate.playerId === ally.id),
    'Infernal Cascade can cast an ally spell')
  resolvePendingDecision(game, choice.id, {
    kind: 'select_prepped_spell', choice: choice.candidates.find(candidate => candidate.cardId === 'spark')!,
  })

  const repeatChoice = game.pendingDecision
  assert(repeatChoice?.kind === 'select_prepped_spell' && repeatChoice.repeat === true,
    'Infernal Cascade asks the player to confirm the repeated cast')
  resolvePendingDecision(game, repeatChoice.id, {
    kind: 'select_prepped_spell', choice: repeatChoice.candidates[0]!,
  })

  const allyBreach = ally.breaches.find(breach => breach.index === allySpark.breachIndex)!
  assertEqual(allyBreach.prepSpells[allySpark.spellIndex], undefined, 'The second cast discards the repeated spell')
  assert(ally.discard.includes('spark'), 'The first cast exception does not carry into the second cast')
  assertEqual(game.nemesis.hp, before - 4, 'Cascade deals 2 and the Spark is cast twice for 1 each')
  assertEqual(game.pendingDecision, null, 'Both casts finish after the explicit second confirmation')
}

function testGenericPreppedSpellCastKeepsNestedInfernalChoicesIndependent(): void {
  const game = createGame(scenarioWithSpell('infernal_cascade'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const firstBreach = player.breaches[0]!
  const secondBreach = player.breaches[1]!
  firstBreach.opened = true
  secondBreach.opened = true
  firstBreach.prepSpells = ['spark', 'cosmic_pulse']
  firstBreach.preppedThisTurn = [false, false]
  firstBreach.preppedSpellFaceDown = [true, false]
  firstBreach.preppedSpellInstanceIds = [`${player.id}:debug:1`, `${player.id}:debug:2`]
  secondBreach.prepSpells = ['infernal_cascade']
  secondBreach.preppedThisTurn = [false]
  secondBreach.preppedSpellFaceDown = [false]
  secondBreach.preppedSpellInstanceIds = [`${player.id}:debug:3`]

  // This is the same generic effect used by the Debug Tools button. Its
  // selected Infernal Cascade must not leak into Infernal's nested choice.
  resolveEffects(game, player.id, [{
    kind: 'cast_prepped_spell', source: 'any_prepped_spell', ownerScope: 'any_player',
  }])
  const initial = game.pendingDecision
  assert(initial?.kind === 'select_prepped_spell', 'Debug casting opens a prepped spell choice')
  resolvePendingDecision(game, initial.id, {
    kind: 'select_prepped_spell',
    choice: initial.candidates.find(candidate => candidate.cardId === 'infernal_cascade')!,
  })

  const nested = game.pendingDecision
  assert(nested?.kind === 'select_prepped_spell', 'Infernal Cascade keeps its nested cast choice')
  assertEqual(nested.candidates.length, 1, 'Infernal filters the nested choice to the face-down two-cost spell')
  assertEqual(nested.candidates[0]!.cardId, 'spark', 'The nested choice is the face-down Spark')
  resolvePendingDecision(game, nested.id, { kind: 'select_prepped_spell', choice: nested.candidates[0]! })
  const repeat = game.pendingDecision
  assert(repeat?.kind === 'select_prepped_spell' && repeat.repeat === true,
    'The nested Infernal cast still asks for its explicit repeat confirmation')
  resolvePendingDecision(game, repeat.id, { kind: 'select_prepped_spell', choice: repeat.candidates[0]! })
  assertEqual(game.pendingDecision, null, 'The Debug Tools cast completes the full Infernal sequence')
  assert(player.discard.includes('spark'), 'The repeated face-down spell is discarded after its second cast')
}

function testCosmicPulseAllowsAdditionalConjuresOnItsBreach(): void {
  const game = createGame(scenarioWithSpell('cosmic_pulse'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const breach = player.breaches.find(candidate => candidate.present !== false)!
  breach.opened = true
  breach.prepSpells = ['cosmic_pulse', 'spark']
  breach.preppedThisTurn = [false, false]
  breach.preppedSpellFaceDown = [false, false]
  player.deck = ['spark']
  player.discard = []
  const action = getPreppedCardActions(game, player.id).find(candidate => candidate.cardId === 'cosmic_pulse')
  assert(action?.kind === 'activate_effect', 'Cosmic Pulse exposes its once-per-turn Conjure action')
  activatePreppedSpellAction(game, player.id, breach.index, action.spellIndex)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_conjure_breach', 'Cosmic Pulse reveals a spell and asks where to Conjure')
  const target = decision.candidates.find(candidate => candidate.breachIndex === breach.index)
  assert(target, 'Cosmic Pulse itself makes its full Breach a valid Conjure target')
  resolvePendingDecision(game, decision.id, { kind: 'select_conjure_breach', choice: target })
  assertEqual(breach.prepSpells.length, 3, 'The conjured spell exceeds the normal prep limit')
  assertEqual(breach.prepSpells[2], 'spark', 'The revealed spell is placed on Cosmic Pulse’s Breach')
  assertEqual(breach.preppedSpellFaceDown?.[2], true, 'The conjured spell is face down')
}

function testOncePerTurnPreppedSpellUseFollowsItsCardInstance(): void {
  const movedGame = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const movedPlayer = movedGame.players[0]!
  setMainPhase(movedGame, movedPlayer.id)
  movedPlayer.pulseTokens = 0
  movedPlayer.hand = ['frostfire_maelstrom']
  const [sourceBreach, targetBreach] = movedPlayer.breaches.filter(breach => breach.present !== false)
  assert(sourceBreach && targetBreach, 'The Mage has two present Breaches')
  sourceBreach.opened = true
  targetBreach.opened = true
  assert(prepSpell(movedGame, movedPlayer.id, 'frostfire_maelstrom', sourceBreach.index, 0),
    'Frostfire Maelstrom can be prepped')

  const sourceAction = getPreppedCardActions(movedGame, movedPlayer.id)
    .find(action => action.cardId === 'frostfire_maelstrom')
  assert(sourceAction, 'Frostfire Maelstrom exposes its once-per-turn action')
  activatePreppedSpellAction(movedGame, movedPlayer.id, sourceAction.breachIndex, sourceAction.spellIndex)
  assertEqual(movedPlayer.pulseTokens, 1, 'Frostfire Maelstrom grants its Pulse token once')
  assertEqual(getPreppedCardActions(movedGame, movedPlayer.id).filter(action =>
    action.cardId === 'frostfire_maelstrom').length, 0, 'The used action is no longer available in its original Breach')

  assert(movePreppedSpell(movedGame, movedPlayer.id, sourceBreach.index, 0, targetBreach.index),
    'A used Frostfire Maelstrom can move to another Breach')
  assertEqual(getPreppedCardActions(movedGame, movedPlayer.id).filter(action =>
    action.cardId === 'frostfire_maelstrom').length, 0, 'Moving the spell does not reset its once-per-turn use')

  const returnedGame = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const returnedPlayer = returnedGame.players[0]!
  setMainPhase(returnedGame, returnedPlayer.id)
  returnedPlayer.pulseTokens = 0
  returnedPlayer.hand = ['frostfire_maelstrom']
  const [firstBreach, secondBreach] = returnedPlayer.breaches.filter(breach => breach.present !== false)
  assert(firstBreach && secondBreach, 'The Mage has two present Breaches')
  firstBreach.opened = true
  secondBreach.opened = true
  prepSpell(returnedGame, returnedPlayer.id, 'frostfire_maelstrom', firstBreach.index, 0)
  const firstAction = getPreppedCardActions(returnedGame, returnedPlayer.id)
    .find(action => action.cardId === 'frostfire_maelstrom')
  assert(firstAction, 'The returned-path Frostfire action is available at first')
  activatePreppedSpellAction(returnedGame, returnedPlayer.id, firstAction.breachIndex, firstAction.spellIndex)
  assert(returnPreppedSpellToHand(returnedGame, returnedPlayer.id, firstBreach.index, 0),
    'The used spell can be returned to hand')
  prepSpell(returnedGame, returnedPlayer.id, 'frostfire_maelstrom', secondBreach.index, 0)
  assertEqual(getPreppedCardActions(returnedGame, returnedPlayer.id).filter(action =>
    action.cardId === 'frostfire_maelstrom').length, 0,
  'Returning the spell to hand and re-prepping it does not restore the once-per-turn action')

  const duplicateGame = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const duplicatePlayer = duplicateGame.players[0]!
  setMainPhase(duplicateGame, duplicatePlayer.id)
  duplicatePlayer.pulseTokens = 0
  duplicatePlayer.hand = ['frostfire_maelstrom', 'frostfire_maelstrom']
  const [leftBreach, rightBreach] = duplicatePlayer.breaches.filter(breach => breach.present !== false)
  assert(leftBreach && rightBreach, 'The Mage has two present Breaches for duplicate copies')
  leftBreach.opened = true
  rightBreach.opened = true
  prepSpell(duplicateGame, duplicatePlayer.id, 'frostfire_maelstrom', leftBreach.index, 0)
  prepSpell(duplicateGame, duplicatePlayer.id, 'frostfire_maelstrom', rightBreach.index, 0)
  const duplicateActions = getPreppedCardActions(duplicateGame, duplicatePlayer.id)
    .filter(action => action.cardId === 'frostfire_maelstrom')
  assertEqual(duplicateActions.length, 2, 'Separate physical copies retain separate once-per-turn uses')
  for (const action of duplicateActions) {
    activatePreppedSpellAction(duplicateGame, duplicatePlayer.id, action.breachIndex, action.spellIndex)
  }
  assertEqual(duplicatePlayer.pulseTokens, 2, 'Each physical copy can resolve once during the turn')
}

function testDescentBonusAppliesToLaterLowCostSpellsAndExpires(): void {
  const game = createGame(scenarioWithSpell('descent_of_destruction'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const before = game.nemesis.hp
  resolveCardEffects(game, player.id, 'descent_of_destruction', { kind: 'on_cast' })
  assertEqual(game.nemesis.hp, before - 4, 'Descent deals its printed four damage')
  assertEqual(player.turnEffects.spellDamageBonuses?.length, 1, 'Descent records a turn-long low-cost spell bonus')

  const spark = prepareSpell(game, player.id, 'spark')
  castSpell(game, player.id, spark.breachIndex, spark.spellIndex)
  assertEqual(game.nemesis.hp, before - 7, 'The next zero-cost spell deals two additional damage')
  resolveDrawPhase(game, player.id)
  assertEqual(player.turnEffects.spellDamageBonuses?.length, 0, 'The temporary bonus expires in Draw Phase')
}

function testDescentConjureCanTargetAClosedBreach(): void {
  const game = createGame(scenarioWithSpell('descent_of_destruction'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const [sourceBreach, closedBreach] = player.breaches.filter(breach => breach.present !== false)
  assert(sourceBreach && closedBreach, 'The Mage has two present Breaches')
  sourceBreach.opened = true
  closedBreach.opened = false
  closedBreach.focusedThisTurn = false
  sourceBreach.prepSpells = ['descent_of_destruction']
  sourceBreach.preppedThisTurn = [false]
  sourceBreach.preppedSpellFaceDown = [false]
  player.deck = ['spark']
  player.discard = []

  const action = getPreppedCardActions(game, player.id)
    .find(candidate => candidate.cardId === 'descent_of_destruction')
  assert(action?.kind === 'activate_effect', 'Descent exposes its once-per-turn Conjure action')
  activatePreppedSpellAction(game, player.id, action.breachIndex, action.spellIndex)
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_conjure_breach', 'Descent asks where to Conjure the revealed card')
  assert(decision.candidates.some(candidate => candidate.breachIndex === closedBreach.index),
    'Descent allows Conjure onto a closed Breach')
}

function testBoundlessFireRecallSpendsChargeAndReturnsItToHand(): void {
  const game = createGame(scenarioWithSpell('boundless_fire'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  player.discard = ['boundless_fire']
  player.charge = 1
  assertEqual(getRecallActions(game, player.id).length, 1, 'Boundless Fire Recall is available with one charge')
  activateRecall(game, player.id, 0)
  assertEqual(player.charge, 0, 'Boundless Fire Recall spends one charge')
  assert(player.hand.includes('boundless_fire'), 'Boundless Fire returns from discard to hand')
  assert(!player.discard.includes('boundless_fire'), 'The recalled card leaves discard')
}

function testEternitysEchoRecallCastsThenConjuresInOrder(): void {
  const game = createGame(scenarioWithSpell('eternitys_echo'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  player.discard = ['eternitys_echo']
  const spark = prepareSpell(game, player.id, 'spark')
  player.deck = ['crystal']
  const before = game.nemesis.hp
  activateRecall(game, player.id, 0)
  const spellChoice = game.pendingDecision
  assert(spellChoice?.kind === 'select_prepped_spell', "Eternity's Echo offers one of its prepped spells")
  const selected = spellChoice.candidates.find(candidate => candidate.cardId === 'spark')!
  resolvePendingDecision(game, spellChoice.id, { kind: 'select_prepped_spell', choice: selected })
  assertEqual(game.nemesis.hp, before - 1, "Eternity's Echo casts the selected spell first")
  assert(player.discard.includes('spark'), 'The selected spell goes to its owner discard after casting')

  const conjure = game.pendingDecision
  assert(conjure?.kind === 'select_conjure_breach', "Eternity's Echo proceeds to Conjure after its spell cast")
  const target = conjure.candidates.find(candidate => candidate.breachIndex === spark.breachIndex)
  assert(target, 'The now empty opened Breach can receive the conjured card')
  resolvePendingDecision(game, conjure.id, { kind: 'select_conjure_breach', choice: target })
  const breach = player.breaches.find(candidate => candidate.index === spark.breachIndex)!
  assertEqual(breach.prepSpells[0], 'crystal', 'Recall Conjure preps the revealed top card')
}

function testDeadlyAccordUsesTheAllyDiscardAndAddsDamage(): void {
  const game = createGame(scenarioWithSpell('deadly_accord'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  const spell = prepareSpell(game, caster.id, 'deadly_accord')
  ally.hand = ['deadly_accord']
  ally.deck = ['spark']
  caster.hand = ['crystal']
  const before = game.nemesis.hp

  castSpell(game, caster.id, spell.breachIndex, spell.spellIndex)
  let decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Deadly Accord asks whether its ally will discard')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: true })
  assert(ally.discard.includes('deadly_accord'), 'The ally discards the matching Deadly Accord')
  assert(ally.hand.includes('spark'), 'The ally draws the replacement card')
  assertEqual(game.nemesis.hp, before - 3, 'The successful discard adds damage to the same damage instance')
  decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'The caster may destroy a card after the bonus damage')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: false })
}

function testInundateDoesNotOfferAnIllegalLowCostAllyDiscard(): void {
  const game = createGame(scenarioWithSpell('inundate'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  const spell = prepareSpell(game, caster.id, 'inundate')
  ally.hand = ['spark', 'crystal']
  const before = game.nemesis.hp
  castSpell(game, caster.id, spell.breachIndex, spell.spellIndex)
  assertEqual(game.nemesis.hp, before - 6, 'Inundate deals its base damage')
  assertEqual(game.pendingDecision, null, 'Inundate skips its optional branch when the ally has no card costing four')
}

function testInundateAllyDiscardDrawsAndDealsFourMoreDamage(): void {
  const game = createGame(scenarioWithSpell('inundate'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  const spell = prepareSpell(game, caster.id, 'inundate')
  ally.hand = ['descent_of_destruction']
  ally.deck = ['spark']
  const before = game.nemesis.hp
  castSpell(game, caster.id, spell.breachIndex, spell.spellIndex)
  assertEqual(game.nemesis.hp, before - 6, 'Inundate deals its base damage before the optional ally effect')
  let decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Inundate offers the eligible ally discard')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: true })
  decision = game.pendingDecision
  assert(decision?.kind === 'select_cards', 'The ally selects their card costing at least four')
  const selected = decision.candidates.find(candidate => candidate.cardId === 'descent_of_destruction')!
  resolvePendingDecision(game, decision.id, { kind: 'select_cards', choices: [selected] })
  assert(ally.discard.includes('descent_of_destruction'), 'The ally discards the selected high-cost card')
  assert(ally.hand.includes('spark'), 'The ally draws one card after discarding')
  assertEqual(game.nemesis.hp, before - 10, 'A successful discard adds a separate four-damage effect')
  assertEqual(game.pendingDecision, null, 'The Inundate bonus effect completes')
}

function testTorrentialSpikeRevealsAndTakesAnAllySpell(): void {
  const game = createGame(scenarioWithSpell('torrential_spike'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  const spell = prepareSpell(game, caster.id, 'torrential_spike')
  ally.deck = ['spark']
  ally.discard = []
  castSpell(game, caster.id, spell.breachIndex, spell.spellIndex)
  const decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Torrential Spike lets an ally choose whether to reveal')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: true })
  const revealDecision = game.pendingDecision
  assert(revealDecision?.kind === 'confirm_revealed_card', 'Torrential Spike uses the generic reveal confirmation')
  assertEqual(game.pendingEffect?.revealedTopCard?.cardId, 'spark', 'The revealed card remains available for the image modal')
  resolvePendingDecision(game, revealDecision.id, { kind: 'confirm_revealed_card', accepted: true })
  assertEqual(ally.deck.length, 0, 'The revealed spell leaves the top of the deck')
  assertEqual(ally.hand[ally.hand.length - 1], 'spark', 'The revealed spell enters the ally hand after confirmation')
  assertEqual(game.pendingDecision, null, 'The reveal resolves after confirmation')
}

function testStonefuryEruptionOnlyChargesEligibleAllies(): void {
  const game = createGame(scenarioWithSpell('stonefury_eruption'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  const spell = prepareSpell(game, caster.id, 'stonefury_eruption')
  ally.discard = ['stonefury_eruption']
  const beforeCharge = ally.charge
  castSpell(game, caster.id, spell.breachIndex, spell.spellIndex)
  assertEqual(ally.charge, beforeCharge + 1, 'An ally with Stonefury Eruption in discard gains a charge')
  assertEqual(caster.charge, 0, 'Stonefury Eruption does not give its caster the ally reward')
}

function testEmberGaleFocusesOnlyAlliesWithSixDiscardCards(): void {
  const game = createGame(scenarioWithSpell('ember_gale'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  const spell = prepareSpell(game, caster.id, 'ember_gale')
  const targetBreach = ally.breaches.find(candidate => candidate.present !== false && !candidate.opened)!
  ally.breaches.filter(candidate => candidate.present !== false && candidate.index !== targetBreach.index)
    .forEach(candidate => { candidate.opened = true })
  ally.discard = ['crystal', 'crystal', 'crystal', 'crystal', 'crystal', 'crystal']
  const before = targetBreach.focusCount
  castSpell(game, caster.id, spell.breachIndex, spell.spellIndex)
  assertEqual(targetBreach.focusCount, before + 1, 'The qualifying ally focuses one of their own Breaches')
  assertEqual(targetBreach.focusedThisTurn, true, 'The ally Breach remains prep-eligible for the current turn')

  // The focus marker belongs to the active turn, even when another Mage's
  // effect focused this Breach. It must not leak into the ally's next turn.
  resolveDrawPhase(game, caster.id)
  assertEqual(targetBreach.focusedThisTurn, false, 'A focused ally Breach is cleared when the caster turn ends')
  setMainPhase(game, ally.id)
  ally.hand = ['spark']
  assertEqual(prepSpell(game, ally.id, 'spark', targetBreach.index), 'Cannot prep on this breach',
    'The ally cannot prep on a Breach focused during the previous Mage turn')
}

function testMegafluxSliceSpendsPulseForItsSevenDamageMode(): void {
  const game = createGame(scenarioWithSpell('megaflux_slice'))
  const player = game.players[0]!
  player.pulseTokens = 3
  const before = game.nemesis.hp
  resolveCardEffects(game, player.id, 'megaflux_slice', { kind: 'on_cast' })
  const decision = game.pendingDecision
  assert(decision?.kind === 'choose_one', 'Megaflux Slice presents its two Cast modes')
  assertEqual(decision.layout, 'two-button-choice', 'Megaflux uses the reusable two-button decision layout')
  assertEqual(decision.options.find(option => option.id === 'spend_pulse')?.disabled, false,
    'The seven-damage mode is enabled with three Pulse tokens')
  resolvePendingDecision(game, decision.id, { kind: 'choose_one', optionId: 'spend_pulse' })
  assertEqual(player.pulseTokens, 0, 'Megaflux spends exactly three Pulse tokens')
  assertEqual(game.nemesis.hp, before - 7, 'Megaflux deals seven damage after paying its Pulse cost')
}

function testTrinketSpellsPutTheRequiredNumberOnTopOfTheDeck(): void {
  const jeweledGame = createGame(scenarioWithSpell('jeweled_shrapnel'))
  const jeweledPlayer = jeweledGame.players[0]!
  setMainPhase(jeweledGame, jeweledPlayer.id)
  const jeweled = prepareSpell(jeweledGame, jeweledPlayer.id, 'jeweled_shrapnel')
  jeweledPlayer.hand = []
  jeweledGame.trinketDeck = ['clouded_trinket', 'golden_trinket', 'power_trinket']
  jeweledGame.trinketDeckRevealed = [false, false, false]
  castSpell(jeweledGame, jeweledPlayer.id, jeweled.breachIndex, jeweled.spellIndex)
  assert(jeweledPlayer.deck.includes('clouded_trinket') && jeweledPlayer.deck.includes('golden_trinket'),
    'Jeweled Shrapnel places two gained Trinkets on the deck')
  assertEqual(jeweledGame.pendingDecision, null, 'Jeweled Shrapnel skips its destroy prompt when hand is empty')

  const vitrificationGame = createGame(scenarioWithSpell('vitrification'))
  const vitrificationPlayer = vitrificationGame.players[0]!
  setMainPhase(vitrificationGame, vitrificationPlayer.id)
  const vitrification = prepareSpell(vitrificationGame, vitrificationPlayer.id, 'vitrification')
  vitrificationGame.trinketDeck = ['clouded_trinket', 'golden_trinket', 'power_trinket', 'ethereal_trinket']
  vitrificationGame.trinketDeckRevealed = [false, false, false, false]
  castSpell(vitrificationGame, vitrificationPlayer.id, vitrification.breachIndex, vitrification.spellIndex)
  assert(['clouded_trinket', 'golden_trinket', 'power_trinket'].every(cardId => vitrificationPlayer.deck.includes(cardId)),
    'Vitrification places three gained Trinkets on the deck')
}

function testTurnSpellBonusAppliesWhenCastingAnAllyHandSpell(): void {
  const game = createGame(scenarioWithSpell('descent_of_destruction'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  resolveCardEffects(game, caster.id, 'descent_of_destruction', { kind: 'on_cast' })
  ally.hand = ['spark']
  const before = game.nemesis.hp
  resolveEffects(game, caster.id, [{ kind: 'cast_spell_from_hand', times: 1 }])
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_collective_cards', 'The caster can select an ally spell to cast')
  const selected = decision.candidates.find(candidate => candidate.choice.cardId === 'spark')!
  resolvePendingDecision(game, decision.id, { kind: 'select_collective_cards', choices: [selected] })
  assertEqual(game.nemesis.hp, before - 3, 'A hand spell cast this turn receives Descent’s +2 bonus')
}

function testFrostfireMaelstromAllocatesDamageAndGroupsTargetHits(): void {
  const game = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const player = game.players[0]!
  player.pulseTokens = 2
  game.nemesis.playArea = [{
    cardId: 'needlemaw', cardType: 'minion', placedAt: 1234, lifeTokens: 10,
  }]
  const beforeNemesis = game.nemesis.hp
  resolveCardEffects(game, player.id, 'frostfire_maelstrom', { kind: 'on_cast' })
  let decision = game.pendingDecision
  assert(decision?.kind === 'choose_token_amount', 'Frostfire asks for a Pulse token amount')
  assertEqual(decision.maxAmount, 2, 'The amount chooser is capped by the Pulse tokens held')
  resolvePendingDecision(game, decision.id, { kind: 'choose_token_amount', amount: 1 })
  assertEqual(player.pulseTokens, 1, 'The selected option spends one Pulse token')
  decision = game.pendingDecision
  assert(decision?.kind === 'allocate_divided_damage', 'The player reviews the automatic divided damage assignment')
  assert(decision.targets.some(target => target.kind === 'minion'), 'The Minion is a legal damage target')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.total, 3,
    'The base damage plus one Pulse token forms a three-point pool')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.amounts['minion:1234'], 3,
    'Automatic assignment initially places the damage on the lowest-life enemy')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.remaining, 0,
    'All damage starts assigned')
  assertEqual(game.nemesis.playArea[0]?.lifeTokens, 10, 'Damage waits until all allocation choices are made')
  cancelCurrentDamageTarget(game, 'minion:1234')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.remaining, 1,
    'Right-click cancellation leaves one point to reassign')
  const incomplete = confirmCurrentDamageAllocation(game)
  assert(incomplete[0]?.startsWith('Choose a target'), 'Confirmation is rejected while damage remains unassigned')
  resolveCurrentDamageTarget(game, 'nemesis')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.amounts['minion:1234'], 2,
    'Cancelled damage can be reassigned from the Minion')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.amounts.nemesis, 1,
    'The Nemesis receives the reassigned point')
  confirmCurrentDamageAllocation(game)
  assertEqual(game.nemesis.playArea[0]?.lifeTokens, 8,
    'Damage assigned to the Minion is applied together when confirmed')
  assertEqual(game.nemesis.hp, beforeNemesis - 1, 'The Nemesis takes its assigned damage on confirmation')
  assertEqual(game.pendingDecision, null, 'Explicit confirmation completes the divided damage effect')
}

function testFrostfireAddsBreachDamageToTheDividedPoolOnce(): void {
  const game = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const player = game.players[0]!
  player.pulseTokens = 1
  const breach = player.breaches.find(candidate => candidate.index === 3)!
  breach.opened = true
  breach.damageBonus = 1
  breach.prepSpells = ['frostfire_maelstrom']
  breach.preppedThisTurn = [false]
  breach.preppedSpellFaceDown = [false]
  game.nemesis.playArea = [{
    cardId: 'needlemaw', cardType: 'minion', placedAt: 4321, lifeTokens: 2,
  }]
  const beforeNemesis = game.nemesis.hp

  castSpell(game, player.id, breach.index, 0)
  const pulseChoice = game.pendingDecision
  assert(pulseChoice?.kind === 'choose_token_amount', 'Frostfire offers an adjustable Pulse amount')
  assertEqual(pulseChoice.summary?.template,
    'Deal {amount} damage divided however you choose among enemies.',
    'The token prompt carries the card-only damage summary template')
  assertEqual(pulseChoice.summary?.baseAmount, 2,
    'The token prompt summary excludes Breach damage bonuses')
  resolvePendingDecision(game, pulseChoice.id, { kind: 'choose_token_amount', amount: 1 })

  const allocationDecision = game.pendingDecision
  assert(allocationDecision?.kind === 'allocate_divided_damage', 'Four damage is staged across enemies')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.total, 4,
    'Two base damage, one Pulse bonus, and Breach III damage form one four-point pool')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.amounts['minion:4321'], 2,
    'Automatic allocation fills the Minion to its current life')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.amounts.nemesis, 2,
    'Remaining damage goes to the Nemesis')
  assertEqual(game.nemesis.playArea[0]?.lifeTokens, 2, 'Damage remains staged before spell confirmation')
  assertEqual(game.nemesis.hp, beforeNemesis, 'Nemesis damage remains staged before spell confirmation')

  confirmCurrentDamageAllocation(game)
  assertEqual(game.nemesis.playArea.length, 0, 'The Minion takes its assigned lethal damage on confirmation')
  assertEqual(game.nemesis.hp, beforeNemesis - 2, 'The Nemesis receives its assigned damage on confirmation')
  assertEqual(game.pendingDecision, null, 'Explicit spell confirmation completes the cast')
}

function testAdditionalDamageModifiesADividedDamagePool(): void {
  const game = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const player = game.players[0]!
  game.nemesis.playArea = [{
    cardId: 'needlemaw', cardType: 'minion', placedAt: 5678, lifeTokens: 10,
  }]
  const beforeNemesis = game.nemesis.hp
  resolveEffects(game, player.id, [{
    kind: 'deal_damage_divided', amount: 2, target: 'nemesis_or_minion',
    additionalDamage: [{ amount: 2 }],
  }])

  assertEqual(game.pendingEffect?.dividedDamageAllocation?.total, 4,
    'Typed additional damage increases the same divided pool')
  assertEqual(game.pendingEffect?.dividedDamageAllocation?.amounts['minion:5678'], 4,
    'Automatic allocation assigns the full pool to the enemy with lower current life')
  assertEqual(game.nemesis.playArea[0]?.lifeTokens, 10, 'The divided pool does not apply damage before confirmation')
  confirmCurrentDamageAllocation(game)
  assertEqual(game.nemesis.playArea[0]?.lifeTokens, 6, 'Additional damage is part of the same assigned instance')
  assertEqual(game.nemesis.hp, beforeNemesis, 'No damage is assigned to the Nemesis in this scenario')
}

function testDividedDamageAutomaticallyFillsLowestLifeEnemiesFirst(): void {
  const game = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const player = game.players[0]!
  game.nemesis.playArea = [
    { cardId: 'needlemaw', cardType: 'minion', placedAt: 220, lifeTokens: 2 },
    { cardId: 'needlemaw', cardType: 'minion', placedAt: 110, lifeTokens: 1 },
  ]
  const beforeNemesis = game.nemesis.hp
  resolveEffects(game, player.id, [{
    kind: 'deal_damage_divided', amount: 5, target: 'nemesis_or_minion',
  }])

  const decision = game.pendingDecision
  assert(decision?.kind === 'allocate_divided_damage', 'The automatic assignment can be reviewed')
  const allocation = game.pendingEffect?.dividedDamageAllocation
  assertEqual(allocation?.amounts['minion:110'], 1, 'The 1-life Minion is filled first')
  assertEqual(allocation?.amounts['minion:220'], 2, 'The 2-life Minion is filled second')
  assertEqual(allocation?.amounts.nemesis, 2, 'The remaining damage is assigned to the Nemesis')
  assertEqual(game.nemesis.playArea[0]?.lifeTokens, 2, 'Damage remains staged while allocations are reviewed')
  assertEqual(game.nemesis.hp, beforeNemesis, 'Nemesis damage remains staged while allocations are reviewed')

  confirmCurrentDamageAllocation(game)
  assertEqual(game.nemesis.playArea.length, 0, 'Both low-life Minions take their assigned damage')
  assertEqual(game.nemesis.hp, beforeNemesis - 2, 'The Nemesis takes the remaining two damage')
}

function testOneAvailableDividedDamageTargetResolvesImmediately(): void {
  const game = createGame(scenarioWithSpell('frostfire_maelstrom'))
  const beforeNemesis = game.nemesis.hp
  resolveEffects(game, game.players[0]!.id, [{
    kind: 'deal_damage_divided', amount: 5, target: 'nemesis_or_minion',
  }])
  assertEqual(game.nemesis.hp, beforeNemesis - 5, 'A sole Nemesis target receives the full pool immediately')
  assertEqual(game.pendingDecision, null, 'A sole damage target does not open an allocation decision')
}

function testObliteratingArcDestroysSupplyAndPunishesAnEmptyPile(): void {
  const game = createGame(scenarioWithSpell('obliterating_arc'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const pile = game.market.piles.find(candidate => candidate.cardId === 'obliterating_arc')!
  const breach = player.breaches.find(candidate => candidate.present !== false)!
  breach.opened = true
  pile.remaining = 1
  breach.prepSpells = ['obliterating_arc']
  breach.preppedThisTurn = [false]
  breach.preppedSpellFaceDown = [false]
  const hp = player.hp
  castSpell(game, player.id, breach.index, 0)
  assertEqual(pile.remaining, 0, 'The spell destroys one card from its own supply pile')
  assertEqual(player.hp, hp, 'The first cast does not cause player damage while supply remains')

  breach.prepSpells = ['obliterating_arc']
  breach.preppedThisTurn = [false]
  breach.preppedSpellFaceDown = [false]
  castSpell(game, player.id, breach.index, 0)
  assertEqual(player.hp, hp - 2, 'A later cast suffers two damage when its supply pile is empty')
  assertEqual(pile.remaining, 0, 'An empty supply pile stays empty')
}

function testGenericPreppedSpellCastResolvesObliteratingArcSupplyEffect(): void {
  const game = createGame(scenarioWithSpell('obliterating_arc'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  const pile = game.market.piles.find(candidate => candidate.cardId === 'obliterating_arc')!
  pile.remaining = 1
  const breach = player.breaches.find(candidate => candidate.present !== false)!
  breach.opened = true
  breach.prepSpells = ['obliterating_arc']
  breach.preppedThisTurn = [false]
  breach.preppedSpellFaceDown = [false]

  // This is the exact effect submitted by the Debug Tools “Cast Prepped
  // Spell” button.  The selected spell must retain its identity while its
  // on-cast effects run, so the card's own supply pile is destroyed.
  resolveEffects(game, player.id, [{
    kind: 'cast_prepped_spell', source: 'any_prepped_spell', ownerScope: 'any_player',
  }])
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_prepped_spell', 'Debug casting opens a prepped spell choice')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_prepped_spell', choice: decision.candidates[0]!,
  })
  assertEqual(pile.remaining, 0, 'Debug casting resolves Obliterating Arc’s mandatory supply destruction')
  assertEqual(game.pendingDecision, null, 'Obliterating Arc finishes without an extra decision')
}

function testGarnetShardCastUsesTheActiveSpellAsSource(): void {
  const scenario = createTwoPlayerScenario(['mist', 'brama'])
  const slots = [...scenario.marketSetup!.slots]
  const spellSlot = slots.findIndex((id, index) => index >= 5 && getCard(id).type === 'spell')
  assert(spellSlot >= 0, 'The default market has a spell slot')
  slots[spellSlot] = 'obliterating_arc'
  scenario.marketSetup = { mode: 'manual', slots }
  const game = createGame(scenario)
  const player = game.players[0]!
  setMainPhase(game, player.id)
  player.hand = ['garnet_shard']
  const pile = game.market.piles.find(candidate => candidate.cardId === 'obliterating_arc')!
  pile.remaining = 1
  const spell = prepareSpell(game, player.id, 'obliterating_arc')

  playCard(game, player.id, 'garnet_shard')
  const mode = game.pendingDecision
  assert(mode?.kind === 'choose_one', 'Garnet Shard asks which effect to use')
  resolvePendingDecision(game, mode.id, { kind: 'choose_one', optionId: 'cast_prepped_spell' })
  const selection = game.pendingDecision
  assert(selection?.kind === 'select_prepped_spell', 'Garnet Shard opens the generic spell selection')
  resolvePendingDecision(game, selection.id, { kind: 'select_prepped_spell', choice: {
    playerId: player.id,
    breachIndex: spell.breachIndex,
    spellIndex: spell.spellIndex,
    cardId: 'obliterating_arc',
    cardName: 'Obliterating Arc',
  } })
  assertEqual(pile.remaining, 0,
    'Garnet Shard resolves the selected spell’s mandatory supply destruction')
}

function testWorldshiftFocusesOnlyAnAllyBreach(): void {
  const game = createGame(scenarioWithSpell('worldshift'))
  const [caster, ally] = game.players
  assert(caster && ally, 'The scenario has two players')
  setMainPhase(game, caster.id)
  caster.pulseTokens = 2
  const spell = prepareSpell(game, caster.id, 'worldshift')
  const targetBreach = ally.breaches.find(candidate => candidate.present !== false && !candidate.opened)!
  ally.breaches.filter(candidate => candidate.present !== false && candidate.index !== targetBreach.index)
    .forEach(candidate => { candidate.opened = true })
  const beforeFocus = targetBreach.focusCount
  castSpell(game, caster.id, spell.breachIndex, spell.spellIndex)
  const optional = game.pendingDecision
  assert(optional?.kind === 'choose_optional', 'Worldshift offers its Pulse payment')
  resolvePendingDecision(game, optional.id, { kind: 'choose_optional', accepted: true })
  assertEqual(caster.pulseTokens, 0, 'Worldshift spends two Pulse tokens')
  const breachDecision = game.pendingDecision
  if (breachDecision?.kind === 'select_breach') {
    const choice = breachDecision.candidates.find(candidate =>
      candidate.playerId === ally.id && candidate.breachIndex === targetBreach.index)
    assert(choice, 'Worldshift allows selecting the eligible ally Breach')
    resolvePendingDecision(game, breachDecision.id, { kind: 'select_breach', choice })
  }
  assertEqual(targetBreach.focusCount, beforeFocus + 1, 'Worldshift focuses an ally Breach')
}

testWave9SupplySpellCatalogAndMechanics()
testInfernalCascadeCastsTheChosenSpellOnceWithoutDiscardingThenNormally()
testGenericPreppedSpellCastKeepsNestedInfernalChoicesIndependent()
testCosmicPulseAllowsAdditionalConjuresOnItsBreach()
testOncePerTurnPreppedSpellUseFollowsItsCardInstance()
testDescentBonusAppliesToLaterLowCostSpellsAndExpires()
testDescentConjureCanTargetAClosedBreach()
testBoundlessFireRecallSpendsChargeAndReturnsItToHand()
testEternitysEchoRecallCastsThenConjuresInOrder()
testDeadlyAccordUsesTheAllyDiscardAndAddsDamage()
testInundateDoesNotOfferAnIllegalLowCostAllyDiscard()
testInundateAllyDiscardDrawsAndDealsFourMoreDamage()
testTorrentialSpikeRevealsAndTakesAnAllySpell()
testStonefuryEruptionOnlyChargesEligibleAllies()
testEmberGaleFocusesOnlyAlliesWithSixDiscardCards()
testMegafluxSliceSpendsPulseForItsSevenDamageMode()
testTrinketSpellsPutTheRequiredNumberOnTopOfTheDeck()
testTurnSpellBonusAppliesWhenCastingAnAllyHandSpell()
testFrostfireMaelstromAllocatesDamageAndGroupsTargetHits()
testFrostfireAddsBreachDamageToTheDividedPoolOnce()
testAdditionalDamageModifiesADividedDamagePool()
testDividedDamageAutomaticallyFillsLowestLifeEnemiesFirst()
testOneAvailableDividedDamageTargetResolvesImmediately()
testObliteratingArcDestroysSupplyAndPunishesAnEmptyPile()
testGenericPreppedSpellCastResolvesObliteratingArcSupplyEffect()
testGarnetShardCastUsesTheActiveSpellAsSource()
testWorldshiftFocusesOnlyAnAllyBreach()

console.log('Wave 9 Spell tests passed')
