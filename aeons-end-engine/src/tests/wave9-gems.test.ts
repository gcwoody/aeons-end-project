import { ALL_MARKET_CARDS, createTwoPlayerScenario, getCard } from '../data'
import {
  activateRecall, createGame, gainCard, getRecallActions, getSupplyMechanics,
  resolveCardEffects, resolvePendingDecision,
} from '../engine'
import type { GameState, PreppedSpellChoice } from '../types'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function setMainPhase(game: GameState, playerId: string): void {
  game.currentTurn = playerId
  game.currentPhase = 'main'
}

function prepareSpell(game: GameState, playerId: string, cardId = 'spark'): PreppedSpellChoice {
  const player = game.players.find(candidate => candidate.id === playerId)!
  const breach = player.breaches.find(candidate => candidate.present !== false)!
  breach.opened = true
  breach.prepSpells.push(cardId)
  breach.preppedThisTurn ??= []
  breach.preppedThisTurn.push(false)
  return {
    playerId,
    breachIndex: breach.index,
    spellIndex: breach.prepSpells.length - 1,
    cardId,
    cardName: getCard(cardId).name,
  }
}

function answerSpellChoice(game: GameState, choice: PreppedSpellChoice): void {
  const decision = game.pendingDecision
  assert(decision?.kind === 'select_prepped_spell', 'A prepped spell choice is pending')
  assert(decision.candidates.some(candidate =>
    candidate.playerId === choice.playerId && candidate.breachIndex === choice.breachIndex &&
    candidate.spellIndex === choice.spellIndex && candidate.cardId === choice.cardId,
  ), 'The intended spell is a legal candidate')
  resolvePendingDecision(game, decision.id, { kind: 'select_prepped_spell', choice })
}

function testAllNineWave9GemsAreRegisteredWithTheirCostsAndMechanics(): void {
  const expected: Array<[string, number]> = [
    ['atomized_ash', 3], ['hewn_gravitite', 3], ['irradiax_lump', 6],
    ['luminous_facet', 4], ['phosphor_nugget', 4], ['chromia_sphere', 5],
    ['nebulae_fragment', 3], ['coiled_trillium', 4], ['ice_dusted_jewel', 3],
  ]
  for (const [cardId, cost] of expected) {
    assert(ALL_MARKET_CARDS[cardId], `${cardId} is in the Supply catalog`)
    assertEqual(getCard(cardId).cost, cost, `${cardId} has its printed cost`)
    assertEqual(getCard(cardId).type, 'gem', `${cardId} is a Gem`)
  }
  assert(getCard('atomized_ash').mechanics?.includes('pulse_token'), 'Atomized Ash enables Pulse setup UI')
  assert(getCard('hewn_gravitite').mechanics?.includes('recall'), 'Hewn Gravitite supports Recall')
  assert(getCard('irradiax_lump').mechanics?.includes('trinket'), 'Irradiax Lump uses Trinkets')
  assert(getCard('phosphor_nugget').mechanics?.includes('recall'), 'Phosphor Nugget supports Recall')
  assert(!getCard('nebulae_fragment').mechanics?.includes('pulse_token'), 'Nebulae Fragment does not enable Pulse Token UI')
  assert(!getCard('coiled_trillium').mechanics?.includes('pulse_token'), 'Coiled Trillium does not enable Pulse Token UI')
}

function testAtomizedAshGainPlayAndRecallPayment(): void {
  const scenario = createTwoPlayerScenario(['jian', 'brama'])
  const slots = [...scenario.marketSetup!.slots]
  slots[0] = 'atomized_ash'
  scenario.marketSetup = { mode: 'manual', slots }
  const game = createGame(scenario)
  const player = game.players[0]!
  setMainPhase(game, player.id)
  player.pulseTokens = 4
  assert(getSupplyMechanics(game).includes('pulse_token'), 'A Pulse-tagged Gem in the starting market enables Pulse UI')
  const pileIndex = game.market.piles.findIndex(pile => pile.cardId === 'atomized_ash')
  gainCard(game, player.id, 'atomized_ash', 'discard_top', pileIndex)
  assertEqual(player.pulseTokens, 5, 'Gaining Atomized Ash grants a capped Pulse token')

  resolveCardEffects(game, player.id, 'atomized_ash', { kind: 'on_play' })
  assertEqual(player.bonusAether, 2, 'Playing Atomized Ash grants 2 Aether')

  player.discard = ['atomized_ash']
  player.pulseTokens = 0
  assertEqual(getRecallActions(game, player.id).length, 0, 'Atomized Ash Recall is unavailable without its payment')
  player.pulseTokens = 1
  assertEqual(getRecallActions(game, player.id).length, 1, 'Atomized Ash Recall becomes available with one Pulse')
  const beforeDamage = game.nemesis.hp
  activateRecall(game, player.id, 0)
  assertEqual(player.pulseTokens, 0, 'Atomized Ash Recall spends exactly one Pulse token')
  assertEqual(game.nemesis.hp, beforeDamage - 1, 'Atomized Ash Recall deals one damage')
}

function testHewnGravititeOptionalCastChecksCostAndCastsAnyPlayerSpell(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const [player, ally] = game.players
  setMainPhase(game, player!.id)
  const allySpell = prepareSpell(game, ally!.id)
  resolveCardEffects(game, player!.id, 'hewn_gravitite', { kind: 'on_play' })
  assertEqual(game.pendingDecision, null, 'Hewn does not prompt when its Pulse cost is unavailable')

  player!.pulseTokens = 2
  resolveCardEffects(game, player!.id, 'hewn_gravitite', { kind: 'on_play' })
  let decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Hewn offers its optional spell cast when legal')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: false })
  assertEqual(player!.pulseTokens, 2, 'Skipping Hewn does not spend Pulse tokens')
  assertEqual(ally!.breaches.find(breach => breach.index === allySpell.breachIndex)?.prepSpells.includes('spark'), true,
    'Skipping Hewn leaves the ally spell prepped')

  resolveCardEffects(game, player!.id, 'hewn_gravitite', { kind: 'on_play' })
  decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Hewn can be activated after a skipped offer')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: true })
  assertEqual(player!.pulseTokens, 0, 'Accepting Hewn spends two Pulse tokens')
  decision = game.pendingDecision
  assert(decision?.kind === 'select_prepped_spell', 'Hewn lets the player choose any Mage\'s prepped spell')
  answerSpellChoice(game, allySpell)
  assertEqual(ally!.breaches.find(breach => breach.index === allySpell.breachIndex)?.prepSpells.includes('spark'), false,
    'The selected ally spell is removed after casting')
  assert(ally!.discard.includes('spark'), 'The cast ally spell goes to its owner\'s discard pile')
}

function testIrradiaxAndLuminousGainTrinketsCorrectly(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  game.trinketDeck = ['clouded_trinket', 'golden_trinket', 'power_trinket']
  game.trinketDeckRevealed = [false, false, false]
  resolveCardEffects(game, player.id, 'irradiax_lump', { kind: 'on_play' })
  assertEqual(player.bonusAether, 3, 'Irradiax Lump grants 3 Aether')
  const decision = game.pendingDecision
  assert(decision?.kind === 'choose_one', 'Irradiax asks which distinct gained Trinket goes into hand')
  assertEqual(decision.options.length, 2, 'Only the two gained Trinket types are offered')
  assertEqual(decision.layout, 'large-card-choice', 'Irradiax uses the immediate large-card choice layout')
  assertEqual(decision.options.map(option => option.cardId).sort().join(','),
    'clouded_trinket,golden_trinket', 'Irradiax includes both card identities for visual selection')
  const saved = JSON.parse(JSON.stringify(game)) as GameState
  const savedDecision = saved.pendingDecision!
  resolvePendingDecision(saved, savedDecision.id, { kind: 'choose_one', optionId: 'golden_trinket' })
  assert(saved.players[0]!.hand.includes('golden_trinket'), 'The chosen Trinket moves into hand after save/load')
  assert(saved.players[0]!.discard.includes('clouded_trinket'), 'The unchosen Trinket remains in discard')

  game.pendingDecision = null
  game.pendingEffect = null
  game.trinketDeck = ['ethereal_trinket']
  game.trinketDeckRevealed = [false]
  player.bonusAether = 0
  resolveCardEffects(game, player.id, 'luminous_facet', { kind: 'on_play' })
  assertEqual(player.bonusAether, 3, 'Luminous Facet grants 3 Aether')
  assertEqual(player.discard[0], 'ethereal_trinket', 'Luminous Facet gains one Trinket to discard')
  assertEqual(game.pendingDecision, null, 'A one-Trinket gain needs no extra choice')
}

function testPhosphorNuggetRecallTargetsItsAlly(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const [player, ally] = game.players
  setMainPhase(game, player!.id)
  player!.discard = ['phosphor_nugget']
  resolveCardEffects(game, player!.id, 'phosphor_nugget', { kind: 'on_play' })
  assertEqual(player!.bonusAether, 2, 'Phosphor Nugget grants 2 Aether')
  activateRecall(game, player!.id, 0)
  assertEqual(ally!.aetherTokens, 1, 'Phosphor Nugget Recall gives an Aether token to its ally')
  assertEqual(player!.aetherTokens, 0, 'Phosphor Nugget does not give the token to its owner')
}

function testNebulaeFragmentAllyDiscardConjuresToAClosedBreach(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const [player, ally] = game.players
  const closedBreach = ally!.breaches.find(breach => breach.present !== false && !breach.opened)!
  ally!.hand = ['nebulae_fragment', 'crystal']
  ally!.deck = ['crystal']
  resolveCardEffects(game, player!.id, 'nebulae_fragment', { kind: 'on_play' })
  let decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Nebulae offers its ally discard when a matching card exists')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: true })
  assertEqual(ally!.hand.includes('nebulae_fragment'), false, 'The ally discards the required Nebulae Fragment')
  assertEqual(ally!.aetherTokens, 1, 'The discarding ally gains one Aether token')
  assertEqual(ally!.pulseTokens, 0, 'Nebulae Fragment does not grant a Pulse token')
  decision = game.pendingDecision
  assert(decision?.kind === 'select_conjure_breach', 'Conjure reveals the ally\'s deck card and asks for a Breach')
  assert(decision.candidates.some(candidate => candidate.breachIndex === closedBreach.index),
    'A closed present Breach is a legal Nebulae Conjure target')
  assert(decision.candidates.some(candidate =>
    candidate.breachIndex === closedBreach.index && candidate.playerId === ally!.id,
  ), 'The Conjure choice belongs to the ally whose effect is resolving')
  resolvePendingDecision(game, decision.id, {
    kind: 'select_conjure_breach',
    choice: decision.candidates.find(candidate => candidate.breachIndex === closedBreach.index)!,
  })
  assertEqual(closedBreach.opened, false, 'Conjure does not open the chosen Breach')
  assertEqual(closedBreach.prepSpells[0], 'crystal', 'The revealed card is prepped on the selected closed Breach')
  assertEqual(closedBreach.preppedSpellFaceDown?.[0], true, 'Conjured cards are prepped face-down')
}

function testNebulaeOptionalBranchSkipsWithoutAnEligibleAllyCard(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  game.players[1]!.hand = ['crystal']
  resolveCardEffects(game, player.id, 'nebulae_fragment', { kind: 'on_play' })
  assertEqual(player.bonusAether, 2, 'Nebulae still grants its Aether')
  assertEqual(game.pendingDecision, null, 'Nebulae skips the ally prompt when no matching card can be discarded')

  const skipGame = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const skipAlly = skipGame.players[1]!
  skipAlly.hand = ['nebulae_fragment']
  resolveCardEffects(skipGame, skipGame.players[0]!.id, 'nebulae_fragment', { kind: 'on_play' })
  const decision = skipGame.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Nebulae presents Skip when a matching ally card is available')
  resolvePendingDecision(skipGame, decision.id, { kind: 'choose_optional', accepted: false })
  assertEqual(skipAlly.hand.includes('nebulae_fragment'), true, 'Skipping Nebulae preserves the ally card')
  assertEqual(skipAlly.pulseTokens, 0, 'Skipping Nebulae grants no Pulse token')
  assertEqual(skipGame.pendingDecision, null, 'Skipping Nebulae does not start Conjure')
}

function testCoiledTrilliumGrantsAllyAetherTokensAndCharge(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const [player, ally] = game.players
  ally!.hand = ['coiled_trillium']
  ally!.pulseTokens = 4
  resolveCardEffects(game, player!.id, 'coiled_trillium', { kind: 'on_play' })
  const decision = game.pendingDecision
  assert(decision?.kind === 'choose_optional', 'Coiled Trillium offers its discard when an ally has a copy')
  resolvePendingDecision(game, decision.id, { kind: 'choose_optional', accepted: true })
  assertEqual(ally!.hand.includes('coiled_trillium'), false, 'The ally discards Coiled Trillium from hand')
  assertEqual(ally!.aetherTokens, 2, 'The discarding ally gains two Aether tokens')
  assertEqual(ally!.pulseTokens, 4, 'Coiled Trillium does not grant Pulse tokens')
  assertEqual(ally!.charge, 1, 'The ally gains one charge')
  assertEqual(player!.charge, 0, 'The source Mage does not receive the ally reward')
  assertEqual(game.chargeGainEvents?.length, 1, 'Charge gain feedback records the actual recipient')
  assertEqual(game.chargeGainEvents?.[0]?.playerId, ally!.id, 'Charge feedback identifies the ally who gained it')
  assertEqual(game.chargeGainEvents?.[0]?.amount, 1, 'Charge feedback records the gained amount')

  ally!.hand = ['coiled_trillium']
  resolveCardEffects(game, player!.id, 'coiled_trillium', { kind: 'on_play' })
  const skipDecision = game.pendingDecision
  assert(skipDecision?.kind === 'choose_optional', 'Coiled Trillium presents its optional discard again')
  resolvePendingDecision(game, skipDecision.id, { kind: 'choose_optional', accepted: false })
  assertEqual(ally!.hand.includes('coiled_trillium'), true, 'Skipping Coiled Trillium preserves the card')
  assertEqual(ally!.charge, 1, 'Skipping Coiled Trillium grants no additional charge')
}

function testIceDustedJewelShowsBothModesAndPreservesCastSpell(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const [player, ally] = game.players
  const allySpell = prepareSpell(game, ally!.id)
  resolveCardEffects(game, player!.id, 'ice_dusted_jewel', { kind: 'on_play' })
  let decision = game.pendingDecision
  assertEqual(decision, null, 'Ice-Dusted Jewel skips the unavailable Pulse-cost mode')
  assertEqual(player!.bonusAether, 2, 'The first mode grants 2 Aether')
  assertEqual(player!.pulseTokens, 1, 'The first mode grants one Pulse token')

  player!.pulseTokens = 5
  resolveCardEffects(game, player!.id, 'ice_dusted_jewel', { kind: 'on_play' })
  decision = game.pendingDecision
  assert(decision?.kind === 'choose_one', 'The second Ice-Dusted choice can be reconsidered on another play')
  assertEqual(decision.options.find(option => option.id === 'cast_prepped_spell')?.disabled, false,
    'The cast option becomes enabled with its cost and spell available')
  resolvePendingDecision(game, decision.id, { kind: 'choose_one', optionId: 'cast_prepped_spell' })
  assertEqual(player!.pulseTokens, 0, 'The cast mode spends exactly five Pulse tokens')
  decision = game.pendingDecision
  assert(decision?.kind === 'select_prepped_spell', 'The player chooses which Mage\'s spell to cast')
  answerSpellChoice(game, allySpell)
  assertEqual(ally!.breaches.find(breach => breach.index === allySpell.breachIndex)?.prepSpells[allySpell.spellIndex], 'spark',
    'The spell stays prepped when cast without discarding')
  assertEqual(ally!.discard.includes('spark'), false, 'The preserved spell is not moved to discard')

  const noSpellGame = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const noSpellPlayer = noSpellGame.players[0]!
  noSpellPlayer.pulseTokens = 5
  resolveCardEffects(noSpellGame, noSpellPlayer.id, 'ice_dusted_jewel', { kind: 'on_play' })
  const noSpellDecision = noSpellGame.pendingDecision
  assertEqual(noSpellDecision, null, 'Ice-Dusted Jewel skips the cast mode when no player has a prepared spell')
  assertEqual(noSpellPlayer.bonusAether, 2, 'The Aether mode resolves when the cast mode has no valid spell')
  assertEqual(noSpellPlayer.pulseTokens, 6, 'The default mode grants its Pulse token when the cast mode is unavailable')
}

function testChromiaSphereRetainsItsExistingDevelopBonus(): void {
  const game = createGame(createTwoPlayerScenario(['jian', 'brama']))
  const player = game.players[0]!
  game.developZone = ['chromia_sphere', 'chromia_sphere']
  resolveCardEffects(game, player.id, 'chromia_sphere', { kind: 'on_play' })
  assertEqual(player.bonusAether, 4, 'Two Chromia Spheres in Develop grant four Aether')
}

testAllNineWave9GemsAreRegisteredWithTheirCostsAndMechanics()
testAtomizedAshGainPlayAndRecallPayment()
testHewnGravititeOptionalCastChecksCostAndCastsAnyPlayerSpell()
testIrradiaxAndLuminousGainTrinketsCorrectly()
testPhosphorNuggetRecallTargetsItsAlly()
testNebulaeFragmentAllyDiscardConjuresToAClosedBreach()
testNebulaeOptionalBranchSkipsWithoutAnEligibleAllyCard()
testCoiledTrilliumGrantsAllyAetherTokensAndCharge()
testIceDustedJewelShowsBothModesAndPreservesCastSpell()
testChromiaSphereRetainsItsExistingDevelopBonus()

console.log('Wave 9 Gem tests passed')
