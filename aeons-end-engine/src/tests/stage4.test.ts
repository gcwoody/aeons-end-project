import {
  advanceNemesisTurn,
  canPlayerAct,
  createGame,
  dealDamage,
  discardNemesisPower,
  getDamageTargets,
  resolveEffects,
  resolvePendingDecision,
} from '../engine'
import type { GameState } from '../types'

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
  assert(powerMessages.some(message => message.includes('gains 4 fury')), 'Power resolution executes multiple typed Unleash effects')
  assertEqual(powerGame.nemesis.counters.fury, 2, 'End-of-turn Strike applies its configured Fury loss')
  assert(powerGame.nemesis.discard.includes('blood_cry'), 'Resolved Power enters the Nemesis discard pile')
}

function testStrikeEffectsAndMinionDamageRule(): void {
  const game = nemesisGame()
  game.nemesis.strikeDeck = ['devastate']
  game.nemesis.counters.fury = 2
  const messages = resolveEffects(game, 'p1', [{ kind: 'resolve_strike' }])
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

  const messages = resolveEffects(game, 'p1', [{
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
  resolveEffects(sameBreachGame, 'p1', [{
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
  assert(!game.nemesis.discard.includes('slaughter'), 'Cancelled Attack does not enter the Nemesis discard pile')
  assertEqual(game.gravehold.hp, 30, 'Cancelled Attack has no effect')
  assertEqual(game.players[0]!.charge, 0, 'Adelheim charge is consumed')
}

function testToDiscardKeepsMainPhaseActionsAvailable(): void {
  const aetherGame = createGame('jian', 'brama')
  aetherGame.currentTurn = 'p1'
  aetherGame.currentPhase = 'main'
  aetherGame.players[0]!.hand = []
  aetherGame.players[0]!.bonusAether = 6
  aetherGame.nemesis.playArea = [{
    cardId: 'eye_of_nothing', cardType: 'power', placedAt: 1,
    instanceId: 'eye-of-nothing:1', powerTokens: 2,
  }]
  assert(canPlayerAct(aetherGame, 'p1'), 'A Power To Discard action remains available after other resources are spent')
  discardNemesisPower(aetherGame, 'p1', 'eye-of-nothing:1')
  assertEqual(aetherGame.nemesis.playArea.length, 0, 'Aether To Discard removes the Power from play')

  const chargeGame = createGame('jian', 'brama')
  chargeGame.currentTurn = 'p1'
  chargeGame.currentPhase = 'main'
  chargeGame.players[0]!.hand = []
  chargeGame.players[0]!.charge = 4
  chargeGame.nemesis.playArea = [{
    cardId: 'blood_cry', cardType: 'power', placedAt: 1,
    instanceId: 'blood-cry:1', powerTokens: 2,
  }]
  assert(canPlayerAct(chargeGame, 'p1'), 'A Charge-based To Discard action remains available after charging')

  const discardGame = createGame('jian', 'brama')
  discardGame.currentTurn = 'p1'
  discardGame.currentPhase = 'main'
  discardGame.players[0]!.hand = ['crystal', 'crystal', 'spark', 'crystal']
  discardGame.nemesis.playArea = [{
    cardId: 'woven_sky', cardType: 'power', placedAt: 1,
    instanceId: 'woven-sky:1', powerTokens: 2,
  }]
  discardNemesisPower(discardGame, 'p1', 'woven-sky:1')
  assertEqual(discardGame.pendingDecision?.kind, 'select_cards', 'Discard-card To Discard opens a card selection')
  assert(discardGame.pendingDecision?.kind !== 'select_cards' || discardGame.pendingDecision.prompt.includes('discard the Power'), 'Discard-card prompt uses discard rather than destroy')
}

function testCollectiveGemMitigation(): void {
  const game = nemesisGame()
  game.players[0]!.hand = ['crystal']
  const messages = resolveEffects(game, 'p1', [{
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
testToDiscardKeepsMainPhaseActionsAvailable()
testCollectiveGemMitigation()
console.log('Stage 4 Rageborne effects and Strike tests passed.')
