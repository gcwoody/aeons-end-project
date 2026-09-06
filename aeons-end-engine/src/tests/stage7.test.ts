import {
  buyCard,
  castSpell,
  activateAbility,
  createGame,
  getBreachActionCosts,
  getPreppedCardActions,
  activatePreppedCardAction,
  getConditionalAetherByType,
  playCard,
  resolvePendingDecision,
  resolvePreppedEffects,
  getPreppedSpellChoices,
  resolveDrawPhase,
  gainLife,
} from '../engine'
import { arcaneNexus, getCard, INITIAL_CARDS, MARKET_CARDS } from '../data'
import type { CardChoice, DamageTargetRef, GameState, PendingDecisionAnswer } from '../types'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function freshGame(): GameState {
  const game = createGame('jian', 'brama')
  game.currentTurn = 'p1'
  game.currentPhase = 'main'
  return game
}

function handChoice(game: GameState, playerId: string, cardId: string): CardChoice {
  const player = game.players.find(candidate => candidate.id === playerId)!
  const index = player.hand.indexOf(cardId)
  assert(index >= 0, `Expected ${cardId} in ${playerId} hand`)
  return { zone: 'hand', index, cardId, cardName: getCard(cardId).name }
}

function damageTarget(game: GameState): DamageTargetRef {
  return { kind: 'nemesis', id: 'nemesis', label: game.nemesis.type }
}

function testSupplyData(): void {
  const expected: Record<string, { type: string; cost: number }> = {
    vriswood_amber: { type: 'gem', cost: 3 },
    diamond_cluster: { type: 'gem', cost: 4 },
    burning_opal: { type: 'gem', cost: 5 },
    flexing_dagger: { type: 'relic', cost: 2 },
    bottled_vortex: { type: 'relic', cost: 3 },
    lava_tendril: { type: 'spell', cost: 4 },
    essence_theft: { type: 'spell', cost: 5 },
    planar_insight: { type: 'spell', cost: 6 },
    arcane_nexus: { type: 'spell', cost: 7 },
  }
  assertEqual(Object.keys(MARKET_CARDS).length, 9, 'Nine market cards are registered')
  for (const [cardId, definition] of Object.entries(expected)) {
    const card = getCard(cardId)
    assertEqual(card.type, definition.type, `${cardId} type`)
    assertEqual(card.cost, definition.cost, `${cardId} cost`)
    assert((card.effects?.length ?? 0) > 0, `${cardId} has typed effects`)
  }
  assertEqual(getCard('burning_opal').name, 'Burning Opal', 'Third gem name')
  assertEqual(getCard('arcane_nexus').effects?.length, 2, 'Arcane Nexus has both effect blocks')
}

function testAllCurrentPlayerCardsUseTypedEffects(): void {
  const currentCards = [...Object.values(INITIAL_CARDS), ...Object.values(MARKET_CARDS)]
  for (const card of currentCards) {
    assert((card.effects?.length ?? 0) > 0, `${card.name} uses typed effects`)
  }
}

function testGainAndSaveShape(): void {
  const game = freshGame()
  const player = game.players[0]!
  const pileIndex = game.market.piles.findIndex(pile => pile.cardId === 'vriswood_amber')
  player.bonusAether = 3
  const before = player.discard.length
  player.hand = []
  const message = buyCard(game, player.id, pileIndex)
  assert(message?.includes("Gained V'riswood Amber"), 'Buying a card gains it through the engine')
  assertEqual(game.market.piles[pileIndex]!.remaining, 6, 'Market pile decremented')
  assertEqual(player.discard.length, before + 1, 'Gained card enters discard pile')
  assertEqual(game.pendingDecision?.kind, 'choose_optional', 'Vriswood asks its on-gain choice')

  const saved = JSON.parse(JSON.stringify(game)) as GameState
  assert(saved.pendingDecision?.id === game.pendingDecision?.id, 'Pending decision survives JSON save')
  const restored = saved
  const decisionId = restored.pendingDecision!.id
  resolvePendingDecision(restored, decisionId, { kind: 'choose_optional', accepted: true })
  assertEqual(restored.players[0]!.deck[0], 'vriswood_amber', 'Restored pending gain can continue')

  const skipped = freshGame()
  skipped.players[0]!.bonusAether = 3
  const skippedPile = skipped.market.piles.findIndex(pile => pile.cardId === 'vriswood_amber')
  buyCard(skipped, 'p1', skippedPile)
  resolvePendingDecision(skipped, skipped.pendingDecision!.id, { kind: 'choose_optional', accepted: false })
  assertEqual(skipped.pendingDecision, null, 'Optional gain effect can be cancelled')
  assertEqual(skipped.players[0]!.discard[0], 'vriswood_amber', 'Cancelled Vriswood stays in discard')
}

function testGemEffects(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.hand = ['diamond_cluster', 'diamond_cluster', 'burning_opal']
  player.discard = []
  assert(playCard(game, player.id, 'diamond_cluster')?.includes('Played Diamond Cluster'), 'First Diamond Cluster plays')
  assertEqual(player.bonusAether, 2, 'First Diamond Cluster gains two aether')
  assert(playCard(game, player.id, 'diamond_cluster')?.includes('Played Diamond Cluster'), 'Second Diamond Cluster plays')
  assertEqual(player.bonusAether, 6, 'Second Diamond Cluster gains its additional two aether')

  const ally = game.players[1]!
  ally.deck = ['crystal']
  ally.discard = []
  player.hand = ['burning_opal', 'spark']
  assert(playCard(game, player.id, 'burning_opal')?.includes('Played Burning Opal'), 'Burning Opal plays')
  assertEqual(game.pendingDecision?.kind, 'choose_optional', 'Burning Opal asks whether to discard')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_optional', accepted: true })
  assertEqual(game.pendingDecision, null, 'Burning Opal resolves unique discard and ally automatically')
  assert(player.discard.includes('spark'), 'Burning Opal discards the selected hand card')
  assertEqual(ally.hand[ally.hand.length - 1], 'crystal', 'Ally draws the card')
}

function testInitialCardEffects(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.hand = ['crystal', 'moonstone_shard']

  assert(playCard(game, player.id, 'crystal')?.includes('Played Crystal'), 'Crystal uses typed on-play effect')
  assertEqual(player.bonusAether, 1, 'Crystal gains one aether through the effect interpreter')
  assert(playCard(game, player.id, 'moonstone_shard')?.includes('Played Moonstone Shard'), 'Moonstone Shard uses typed on-play effect')
  assertEqual(player.bonusAether, 2, 'Moonstone Shard gains one regular aether')
  assertEqual(getConditionalAetherByType(player, 'gem'), 1, 'Moonstone Shard gains gem-only aether')
  assertEqual(player.conditionalAetherEarned.gem, 1, 'Conditional aether is stored in player turn state')

  const conditionalSpend = freshGame()
  const conditionalPlayer = conditionalSpend.players[0]!
  conditionalPlayer.hand = ['moonstone_shard', 'moonstone_shard']
  playCard(conditionalSpend, conditionalPlayer.id, 'moonstone_shard')
  playCard(conditionalSpend, conditionalPlayer.id, 'moonstone_shard')
  conditionalPlayer.regularAetherSpent = 2
  const relicPile = conditionalSpend.market.piles.findIndex(pile => pile.cardId === 'flexing_dagger')
  assert(buyCard(conditionalSpend, conditionalPlayer.id, relicPile)?.includes('Need 2 Aether, have 0'),
    'Gem-only conditional aether cannot buy a relic')

  const spellGame = freshGame()
  const spellPlayer = spellGame.players[0]!
  spellPlayer.breaches[0]!.prepSpell = 'buried_light'
  spellGame.nemesis.hp = 20
  const message = castSpell(spellGame, spellPlayer.id, 1)
  assert(message?.includes('gains 1 Aether'), 'Buried Light uses typed on-cast gain')
  assertEqual(spellGame.nemesis.hp, 19, 'Buried Light uses typed on-cast damage')
  assertEqual(spellPlayer.bonusAether, 1, 'Buried Light aether is resolved by gain_aether')
}

function testRelicEffects(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.hand = ['flexing_dagger']
  assert(playCard(game, player.id, 'flexing_dagger')?.includes('Played Flexing Dagger'), 'Flexing Dagger plays')
  assertEqual(game.pendingDecision?.kind, 'choose_one', 'Flexing Dagger presents two choices')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'choose_one', optionId: 'reduce_breach_cost' })
  assertEqual(player.turnEffects.nextBreachCostReductions[0]!.amount, 3, 'Flexing Dagger stores a reduction')

  player.hand = ['bottled_vortex', 'spark', 'crystal']
  player.discard = ['moonstone_shard']
  assert(playCard(game, player.id, 'bottled_vortex')?.includes('Played Bottled Vortex'), 'Bottled Vortex plays')
  assertEqual(game.pendingDecision?.kind, 'select_cards', 'Bottled Vortex asks for cards to destroy')
  const selected = [handChoice(game, player.id, 'spark'), handChoice(game, player.id, 'crystal')]
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'select_cards', choices: selected })
  assert(player.destroyedCards.includes('spark') && player.destroyedCards.includes('crystal'), 'Cards are permanently destroyed')
  assertEqual(player.hand.length, 1, 'Vortex draws one card after destruction')

  const costsGame = freshGame()
  const costsPlayer = costsGame.players[0]!
  costsPlayer.turnEffects.nextBreachCostReductions.push({ amount: 3, actions: ['focus', 'open'] })
  const costs = getBreachActionCosts(costsGame, costsPlayer.id, 3)!
  assertEqual(costs.focus, 0, 'Focus cost is clamped at zero after reduction')
  assertEqual(costs.open, 6, 'Open cost reflects the next-action reduction')
}

function testSpellEffects(): void {
  const game = freshGame()
  const player = game.players[0]!
  game.nemesis.hp = 20
  player.breaches[0]!.prepSpell = 'lava_tendril'
  const lavaMessages = resolvePreppedEffects(game, player.id, 'casting_phase_end')
  assert(lavaMessages.some(message => message.includes('Decision required')), 'Lava Tendril pauses for confirmation')
  assertEqual(game.pendingDecision?.kind, 'confirm_prepped_effect', 'Lava Tendril requires confirmation')
  assertEqual(game.nemesis.hp, 20, 'Lava Tendril waits before dealing while-prepped damage')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'confirm_prepped_effect', accepted: true })
  assertEqual(game.nemesis.hp, 19, 'Lava Tendril deals one after confirmation')
  assertEqual(resolvePreppedEffects(game, player.id, 'casting_phase_end').length, 0, 'Lava Tendril resolves once per turn')
  const castGame = freshGame()
  const caster = castGame.players[0]!
  caster.breaches[0]!.prepSpell = 'essence_theft'
  caster.hand = ['spark']
  castGame.nemesis.hp = 20
  assert(castSpell(castGame, caster.id, 1)?.includes('Cast Essence Theft'), 'Essence Theft casts')
  assertEqual(castGame.nemesis.hp, 17, 'Essence Theft deals three damage')
  assertEqual(castGame.pendingDecision?.kind, 'choose_optional', 'Essence Theft asks about life gain')
  resolvePendingDecision(castGame, castGame.pendingDecision!.id, { kind: 'choose_optional', accepted: true })
  assertEqual(castGame.pendingDecision?.kind, 'select_life_target', 'Essence Theft asks for any life target')
  assert(caster.discard.includes('spark'), 'Essence Theft discards the only available hand card')
  caster.hp = caster.maxHp - 1
  resolvePendingDecision(castGame, castGame.pendingDecision!.id, {
    kind: 'select_life_target', target: { kind: 'player', playerId: caster.id },
  })
  assertEqual(caster.hp, caster.maxHp, 'Gain life is capped at the player maximum')

  const lifeCaps = freshGame()
  lifeCaps.nemesis.hp = lifeCaps.nemesis.maxHp - 1
  lifeCaps.gravehold.hp = lifeCaps.gravehold.maxHp - 1
  gainLife(lifeCaps, { kind: 'nemesis' }, 3)
  gainLife(lifeCaps, { kind: 'gravehold' }, 3)
  assertEqual(lifeCaps.nemesis.hp, lifeCaps.nemesis.maxHp, 'Nemesis life is capped at its maximum')
  assertEqual(lifeCaps.gravehold.hp, lifeCaps.gravehold.maxHp, 'Gravehold life is capped at its maximum')

  const targeted = freshGame()
  targeted.players[0]!.breaches[0]!.prepSpell = 'lava_tendril'
  targeted.nemesis.playArea = [{
    cardId: 'attack_t1_1', cardType: 'minion', placedAt: 1, lifeTokens: 3,
  }]
  assert(castSpell(targeted, 'p1', 1)?.includes('Cast Lava Tendril'), 'Lava Tendril can target a minion')
  assertEqual(targeted.pendingDecision?.kind, 'select_damage_target', 'Damage target selection is exposed')
  resolvePendingDecision(targeted, targeted.pendingDecision!.id, {
    kind: 'select_damage_target',
    target: { kind: 'minion', id: 'minion:1', placedAt: 1, cardId: 'attack_t1_1', label: 'Attack T1 1' },
  })
  assertEqual(targeted.nemesis.playArea.length, 0, 'Selected minion is defeated by damage')

  const planar = freshGame()
  planar.players[0]!.breaches[0]!.prepSpell = 'planar_insight'
  planar.players[0]!.breaches[1]!.opened = true
  planar.nemesis.hp = 20
  assert(castSpell(planar, 'p1', 1)?.includes('Cast Planar Insight'), 'Planar Insight casts')
  assertEqual(planar.nemesis.hp, 16, 'Planar Insight counts open breaches')

  const thirdBreachBonus = freshGame()
  const thirdBreachCaster = thirdBreachBonus.players[0]!
  thirdBreachCaster.breaches[2]!.opened = true
  thirdBreachCaster.breaches[2]!.prepSpell = 'planar_insight'
  thirdBreachBonus.nemesis.hp = 20
  assert(castSpell(thirdBreachBonus, 'p1', 3)?.includes('Cast Planar Insight'), 'Planar Insight casts from breach III')
  assertEqual(thirdBreachBonus.nemesis.hp, 14, 'Breach III adds one damage to typed spell effects')

  const sparkBreachBonus = freshGame()
  const sparkCaster = sparkBreachBonus.players[0]!
  sparkCaster.breaches[2]!.opened = true
  sparkCaster.breaches[2]!.prepSpell = 'spark'
  sparkBreachBonus.nemesis.hp = 20
  castSpell(sparkBreachBonus, 'p1', 3)
  assertEqual(sparkBreachBonus.nemesis.hp, 18, 'Spark uses typed cast damage and breach bonus')

  const originalArcaneNexusEffects = arcaneNexus.effects
  try {
    arcaneNexus.effects = [{
      trigger: { kind: 'on_cast' },
      effects: [{ kind: 'gain_aether', amount: 1 }],
    }]
    const noDamageSpell = freshGame()
    const noDamageCaster = noDamageSpell.players[0]!
    noDamageCaster.breaches[2]!.opened = true
    noDamageCaster.breaches[2]!.prepSpell = 'arcane_nexus'
    noDamageSpell.nemesis.hp = 20
    const noDamageMessage = castSpell(noDamageSpell, 'p1', 3)
    assertEqual(noDamageSpell.nemesis.hp, 19, `Breach III adds damage when a spell has no damage effect (${noDamageMessage})`)

    arcaneNexus.effects = [{
      trigger: { kind: 'on_cast' },
      effects: [
        { kind: 'deal_damage', amount: 1, target: 'nemesis' },
        { kind: 'deal_damage', amount: 1, target: 'nemesis' },
      ],
    }]
    const twoDamageInstances = freshGame()
    const twoDamageCaster = twoDamageInstances.players[0]!
    twoDamageCaster.breaches[2]!.opened = true
    twoDamageCaster.breaches[2]!.prepSpell = 'arcane_nexus'
    twoDamageInstances.nemesis.hp = 20
    castSpell(twoDamageInstances, 'p1', 3)
    assertEqual(twoDamageInstances.nemesis.hp, 16, 'Breach III boosts each damage instance')
  } finally {
    arcaneNexus.effects = originalArcaneNexusEffects
  }

  const castingAether = freshGame()
  const brama = castingAether.players[1]!
  brama.breaches[0]!.prepSpell = 'buried_light'
  assert(castSpell(castingAether, brama.id, 1)?.includes('gains 1 Aether'), 'Buried Light grants casting-phase aether')
  assertEqual(brama.bonusAether, 1, 'Casting-phase aether is stored immediately')
}

function testPreppedOncePerTurnAndTargets(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.breaches[0]!.prepSpell = 'arcane_nexus'
  player.playedThisTurn = ['crystal']
  player.hand = []
  resolvePreppedEffects(game, player.id, 'main_phase')
  assertEqual(game.pendingDecision, null, 'Arcane Nexus does not block the main phase')
  const actionsBefore = getPreppedCardActions(game, player.id)
  assertEqual(actionsBefore.length, 1, 'Arcane Nexus exposes a played gem action')
  assert(activatePreppedCardAction(game, player.id, actionsBefore[0]!.choices[0]!)?.includes('Returned'), 'Arcane Nexus returns a played gem')
  assert(player.hand.includes('crystal'), 'Arcane Nexus returns the selected gem to hand')
  assertEqual(getPreppedCardActions(game, player.id).length, 0, 'Arcane Nexus is once per turn')

  const afterPrep = freshGame()
  const afterPrepPlayer = afterPrep.players[0]!
  afterPrepPlayer.breaches[0]!.prepSpell = 'arcane_nexus'
  assertEqual(getPreppedCardActions(afterPrep, afterPrepPlayer.id).length, 0, 'No gem is selectable before it is played')
  afterPrepPlayer.hand = ['crystal']
  assert(playCard(afterPrep, afterPrepPlayer.id, 'crystal')?.includes('Played Crystal'), 'Crystal can be played after prep')
  assertEqual(getPreppedCardActions(afterPrep, afterPrepPlayer.id).length, 1, 'A gem played after prep is selectable')
  assert(damageTarget(game).id === 'nemesis', 'Damage target reference is serializable')
}

function testReturnedGemKeepsPlayCount(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.breaches[0]!.prepSpell = 'arcane_nexus'
  player.hand = ['diamond_cluster', 'diamond_cluster']

  assert(playCard(game, player.id, 'diamond_cluster')?.includes('Played Diamond Cluster'), 'First Diamond Cluster plays')
  assertEqual(player.bonusAether, 2, 'First Diamond Cluster gains only its base aether')
  assert(playCard(game, player.id, 'diamond_cluster')?.includes('Played Diamond Cluster'), 'Second Diamond Cluster plays')
  assertEqual(player.bonusAether, 6, 'Second Diamond Cluster gains the bonus aether')

  const action = getPreppedCardActions(game, player.id)[0]!
  assert(activatePreppedCardAction(game, player.id, action.choices[0]!)?.includes('Returned'), 'Arcane Nexus returns one Diamond Cluster')
  assert(playCard(game, player.id, 'diamond_cluster')?.includes('Played Diamond Cluster'), 'Returned Diamond Cluster plays a third time')
  assertEqual(player.bonusAether, 8, 'Third Diamond Cluster does not gain the second-play bonus')
  assertEqual(player.cardPlayCountsThisTurn.diamond_cluster, 3, 'Diamond Cluster play count includes returned cards')
}

function testTurnReset(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.turnEffects.nextBreachCostReductions.push({ amount: 3, actions: ['focus'] })
  player.turnEffects.usedPreppedEffects.push('arcane_nexus:0:main_phase:0')
  resolveDrawPhase(game, player.id)
  assertEqual(player.turnEffects.nextBreachCostReductions.length, 0, 'Temporary breach reductions reset')
  assertEqual(player.turnEffects.usedPreppedEffects.length, 0, 'Once-per-turn markers reset')
}

function testMageAbilities(): void {
  const bramaGame = freshGame()
  const bramaMage = bramaGame.players[0]!
  const ally = bramaGame.players[1]!
  bramaMage.mageType = 'brama'
  bramaMage.charge = bramaMage.chargeThreshold
  ally.hp = ally.maxHp - 3
  assert(activateAbility(bramaGame, bramaMage.id)?.includes('Brink Siphon activated'), 'Brama ability activates')
  assertEqual(bramaGame.pendingDecision?.kind, 'select_life_target', 'Brama asks for a life target')
  const bramaAnswer: PendingDecisionAnswer = {
    kind: 'select_life_target', target: { kind: 'player', playerId: ally.id },
  }
  resolvePendingDecision(bramaGame, bramaGame.pendingDecision!.id, bramaAnswer)
  assertEqual(ally.hp, ally.maxHp, 'Brama restores the selected ally up to maximum life')
  assertEqual(bramaMage.charge, 0, 'Brama charge is consumed')

  const jianGame = freshGame()
  const jian = jianGame.players[0]!
  const allyWithSpell = jianGame.players[1]!
  jian.charge = jian.chargeThreshold
  jian.breaches[0]!.prepSpell = 'spark'
  allyWithSpell.breaches[0]!.prepSpell = 'spark'
  jianGame.nemesis.hp = 20
  assertEqual(getPreppedSpellChoices(jianGame).length, 2, 'Jian sees prepped spells from both players')
  assert(activateAbility(jianGame, jian.id)?.includes('Black Mirror activated'), 'Jian ability activates')
  assertEqual(jianGame.pendingDecision?.kind, 'select_prepped_spell', 'Jian asks for a prepped spell')
  resolvePendingDecision(jianGame, jianGame.pendingDecision!.id, {
    kind: 'select_prepped_spell',
    choice: {
      playerId: allyWithSpell.id,
      breachIndex: 1,
      cardId: 'spark',
      cardName: 'Spark',
    },
  })
  assertEqual(jianGame.nemesis.hp, 19, 'Jian performs the first cast without discarding')
  assertEqual(jianGame.pendingDecision?.kind, 'select_prepped_spell', 'Jian pauses before the second cast')
  resolvePendingDecision(jianGame, jianGame.pendingDecision!.id, {
    kind: 'select_prepped_spell',
    choice: {
      playerId: allyWithSpell.id,
      breachIndex: 1,
      cardId: 'spark',
      cardName: 'Spark',
    },
  })
  assertEqual(jianGame.nemesis.hp, 18, 'Jian casts the selected spell twice')
  assertEqual(allyWithSpell.breaches[0]!.prepSpell, null, 'Jian discards the spell after the second cast')
  assertEqual(allyWithSpell.discard[0], 'spark', 'The second cast puts the spell in its owner discard pile')
  assertEqual(jian.charge, 0, 'Jian charge is consumed')

  const crossPlayerGame = freshGame()
  const crossPlayerJian = crossPlayerGame.players[0]!
  const brama = crossPlayerGame.players[1]!
  crossPlayerJian.mageType = 'jian'
  brama.mageType = 'brama'
  crossPlayerJian.charge = crossPlayerJian.chargeThreshold
  brama.breaches[0]!.prepSpell = 'buried_light'
  crossPlayerGame.nemesis.hp = 20
  assert(activateAbility(crossPlayerGame, crossPlayerJian.id)?.includes('Black Mirror activated'), 'Jian activates across players')
  resolvePendingDecision(crossPlayerGame, crossPlayerGame.pendingDecision!.id, {
    kind: 'select_prepped_spell',
    choice: {
      playerId: brama.id,
      breachIndex: 1,
      cardId: 'buried_light',
      cardName: 'Buried Light',
    },
  })
  assertEqual(crossPlayerJian.bonusAether, 1, 'Cross-player Buried Light grants Aether to Jian')
  assertEqual(brama.bonusAether, 0, 'Cross-player Buried Light does not grant Aether to the spell owner')
  resolvePendingDecision(crossPlayerGame, crossPlayerGame.pendingDecision!.id, {
    kind: 'select_prepped_spell',
    choice: {
      playerId: brama.id,
      breachIndex: 1,
      cardId: 'buried_light',
      cardName: 'Buried Light',
    },
  })
  assertEqual(crossPlayerJian.bonusAether, 2, 'Both cross-player casts grant Aether to Jian')
  assertEqual(brama.bonusAether, 0, 'Spell owner still receives no cross-player Aether')
}

function run(): void {
  testSupplyData()
  testAllCurrentPlayerCardsUseTypedEffects()
  testGainAndSaveShape()
  testGemEffects()
  testInitialCardEffects()
  testRelicEffects()
  testSpellEffects()
  testPreppedOncePerTurnAndTargets()
  testReturnedGemKeepsPlayCount()
  testTurnReset()
  testMageAbilities()
  console.log('Stage 7 engine regression tests passed (typed card effects + JSON save shape).')
}

run()
