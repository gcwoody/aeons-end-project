import {
  buyCard,
  castSpell,
  activateAbility,
  createGame,
  getBreachActionCosts,
  getPreppedCardActions,
  activatePreppedCardAction,
  activatePreppedSpellAction,
  getConditionalAetherByType,
  playCard,
  resolvePendingDecision,
  resolvePreppedEffects,
  getPreppedSpellChoices,
  getCastableSpells,
  movePreppedSpell,
  returnPreppedSpellToHand,
  getSpellDamagePreview,
  prepSpell,
  resolveDrawPhase,
  gainLife,
  startTurn,
  canActivateAbilityDuringMain,
  canPlayerAct,
  dealDamage,
  sufferPlayerDamage,
  getSpellDamagePreviewRange,
} from '../engine'
import { arcaneNexus, getCard, INITIAL_CARDS, MARKET_CARDS, MAGES } from '../data'
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
  game.currentTurn = game.players[0]!.id
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
  assertEqual(Object.keys(MARKET_CARDS).length, 27, 'All Wave 1 market cards are registered')
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
  const pendingMageCards = new Set([
    'amethyst_shard', 'emerald_shard', 'quartz_shard', 'garnet_shard', 'tourmaline_shard',
  ])
  for (const card of currentCards) {
    if (pendingMageCards.has(card.id)) {
      assert(Array.isArray(card.effects), `${card.name} has a typed-effects placeholder`)
    } else {
      assert((card.effects?.length ?? 0) > 0, `${card.name} uses typed effects`)
    }
  }
}

function testWave1MageStaticData(): void {
  const expected: Record<string, {
    hand: string[]
    deck: string[]
    directions: Array<string | null>
    present: boolean[]
  }> = {
    adelheim: {
      hand: ['amethyst_shard', 'crystal', 'crystal', 'spark', 'spark'],
      deck: ['crystal', 'crystal', 'crystal', 'crystal', 'crystal'],
      directions: ['north', 'west', 'east', 'south'],
      present: [true, true, true, true],
    },
    kadir: {
      hand: ['emerald_shard', 'crystal', 'crystal', 'crystal', 'spark'],
      deck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
      directions: ['north', 'west', 'south', 'west'],
      present: [true, true, true, true],
    },
    lash: {
      hand: ['quartz_shard', 'crystal', 'crystal', 'crystal', 'spark'],
      deck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
      directions: ['north', 'west', 'east', 'west'],
      present: [true, true, true, true],
    },
    mist: {
      hand: ['garnet_shard', 'crystal', 'crystal', 'crystal', 'spark'],
      deck: ['crystal', 'crystal', 'crystal', 'spark', 'spark'],
      directions: ['north', 'west', 'south', 'south'],
      present: [true, true, true, true],
    },
    phaedraxa: {
      hand: ['tourmaline_shard', 'crystal', 'crystal', 'crystal', 'spark'],
      deck: ['crystal', 'crystal', 'crystal', 'crystal', 'spark'],
      directions: ['north', 'north', 'south', 'west'],
      present: [false, true, true, true],
    },
  }

  for (const [mageType, setup] of Object.entries(expected)) {
    const game = createGame(mageType, 'jian')
    const player = game.players[0]!
    assertEqual(player.mageType, mageType, `${mageType} type`)
    assertEqual(player.hp, 10, `${mageType} starting HP`)
    assertEqual(player.chargeThreshold, 5, `${mageType} charge threshold`)
    assertEqual(player.hand.join(','), setup.hand.join(','), `${mageType} starting hand`)
    assertEqual(player.deck.join(','), setup.deck.join(','), `${mageType} starting deck`)
    assertEqual(player.breaches.map(b => b.focusDirection).join(','), setup.directions.join(','), `${mageType} breach directions`)
    assertEqual(player.breaches.map(b => b.present !== false).join(','), setup.present.join(','), `${mageType} breach presence`)
  }
}

function testCommonBreachCosts(): void {
  const expected: Record<number, { focus: number; open: Record<string, number> }> = {
    2: { focus: 2, open: { east: 5, south: 4, west: 3, north: 2 } },
    3: { focus: 3, open: { east: 9, south: 7, west: 5, north: 3 } },
    4: { focus: 4, open: { east: 13, south: 10, west: 7, north: 4 } },
  }

  for (const mageType of Object.keys(MAGES)) {
    const otherMage = mageType === 'jian' ? 'brama' : 'jian'
    const game = createGame(mageType, otherMage)
    const player = game.players[0]!
    for (const breach of player.breaches) {
      if (breach.present === false || breach.opened) continue
      const costs = expected[breach.index]
      assert(costs, `${mageType} has a supported common breach index`)
      assertEqual(breach.focusCost, costs.focus, `${mageType} Breach ${breach.index} focus cost`)
      for (const [direction, amount] of Object.entries(costs.open)) {
        assertEqual(breach.openCost[direction as keyof typeof breach.openCost], amount,
          `${mageType} Breach ${breach.index} ${direction} open cost`)
      }
    }
  }
}

function testStage3AbilityTriggers(): void {
  const mistGame = createGame('mist', 'brama')
  const mist = mistGame.players[0]!
  const mistAlly = mistGame.players[1]!
  mistGame.currentTurn = mist.id
  mistGame.currentPhase = 'main'
  mist.charge = mist.chargeThreshold
  const allyHandBefore = mistAlly.hand.length
  assert(canActivateAbilityDuringMain(mistGame, mist.id), 'Mist ability is available during its main phase')
  activateAbility(mistGame, mist.id)
  assertEqual(mist.charge, 0, 'Mist charge is consumed')
  assertEqual(mistAlly.hand.length, allyHandBefore + 4, 'Mist ally draws four cards')

  const lashGame = createGame('lash', 'brama')
  const lash = lashGame.players[0]!
  lashGame.currentTurn = lash.id
  lashGame.currentPhase = 'main'
  lash.charge = lash.chargeThreshold
  lashGame.turnOrderDiscard = ['nemesis']
  assert(!canActivateAbilityDuringMain(lashGame, lash.id), 'Lash is blocked without a player turn-order card')
  lashGame.turnOrderDiscard = [lashGame.players[1]!.id, 'nemesis']
  assert(canActivateAbilityDuringMain(lashGame, lash.id), 'Lash activates when a player card is available')
  activateAbility(lashGame, lash.id)
  assertEqual(lashGame.pendingDecision?.kind, 'select_turn_order_card', 'Lash asks which player turn-order card to shuffle')
  const otherPlayerHpBefore = lashGame.players[1]!.hp
  resolvePendingDecision(lashGame, lashGame.pendingDecision!.id, {
    kind: 'select_turn_order_card', choice: { index: 0, cardId: lashGame.players[1]!.id },
  })
  assertEqual(lashGame.players[1]!.hp, otherPlayerHpBefore - 1, 'Lash damages the owner of the selected turn-order card')
  assert(!lashGame.turnOrderDiscard.includes(lashGame.players[1]!.id), 'Lash removes the selected card from the turn-order discard')
  assert(lashGame.turnOrderDeck.includes(lashGame.players[1]!.id), 'Lash shuffles the selected card into the turn-order deck')

  const phaedraxaGame = createGame('phaedraxa', 'brama')
  const phaedraxa = phaedraxaGame.players[0]!
  phaedraxa.charge = phaedraxa.chargeThreshold
  phaedraxaGame.turnOrderDeck = [phaedraxa.id]
  startTurn(phaedraxaGame)
  assertEqual(phaedraxaGame.pendingDecision?.kind, 'choose_optional', 'Phaedraxa prompts after a turn-order card is drawn')
  resolvePendingDecision(phaedraxaGame, phaedraxaGame.pendingDecision!.id, {
    kind: 'choose_optional', accepted: true,
  })
  assertEqual(phaedraxa.charge, 0, 'Phaedraxa charge is consumed on activation')
  assert(phaedraxaGame.damagePrevention, 'Phaedraxa protection lasts through the current turn')
  const protectedHp = phaedraxa.hp
  const protectedGravehold = phaedraxaGame.gravehold.hp
  sufferPlayerDamage(phaedraxaGame, phaedraxa.id, 3)
  dealDamage(phaedraxaGame, { kind: 'gravehold', id: 'gravehold', label: 'Gravehold' }, 3)
  assertEqual(phaedraxa.hp, protectedHp, 'Phaedraxa prevents player damage')
  assertEqual(phaedraxaGame.gravehold.hp, protectedGravehold, 'Phaedraxa prevents Gravehold damage')
  phaedraxaGame.turnOrderDeck = [phaedraxaGame.players[1]!.id]
  startTurn(phaedraxaGame)
  assert(!phaedraxaGame.damagePrevention, 'Phaedraxa protection resets at the next turn')
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
  buyCard(skipped, skipped.players[0]!.id, skippedPile)
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
  spellPlayer.breaches[0]!.prepSpells = ['buried_light']
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

  const duplicateDaggerGame = freshGame()
  const duplicateDaggerPlayer = duplicateDaggerGame.players[0]!
  duplicateDaggerGame.nemesis.hp = 20
  duplicateDaggerPlayer.hand = ['flexing_dagger', 'flexing_dagger']
  assert(playCard(duplicateDaggerGame, duplicateDaggerPlayer.id, 'flexing_dagger')?.includes('Played Flexing Dagger'),
    'The first Flexing Dagger plays with an identical Dagger still in hand')
  assertEqual(duplicateDaggerGame.pendingDecision?.kind, 'choose_one', 'Flexing Dagger waits for its selected effect')
  resolvePendingDecision(duplicateDaggerGame, duplicateDaggerGame.pendingDecision!.id,
    { kind: 'choose_one', optionId: 'destroy_for_damage' })
  assertEqual(duplicateDaggerPlayer.hand.join(','), 'flexing_dagger',
    'Destroying Flexing Dagger leaves its identical unplayed copy in hand')
  assertEqual(duplicateDaggerPlayer.playedThisTurn.length, 0,
    'Destroying Flexing Dagger removes the copy in the played area')
  assertEqual(duplicateDaggerPlayer.destroyedCards.filter(cardId => cardId === 'flexing_dagger').length, 1,
    'Exactly the played Flexing Dagger is destroyed')
  assertEqual(duplicateDaggerGame.nemesis.hp, 19, 'Destroying Flexing Dagger deals 1 damage')

  player.hand = ['bottled_vortex', 'spark', 'crystal']
  player.discard = ['moonstone_shard']
  assert(playCard(game, player.id, 'bottled_vortex')?.includes('Played Bottled Vortex'), 'Bottled Vortex plays')
  assertEqual(game.pendingDecision?.kind, 'select_cards', 'Bottled Vortex asks for cards to destroy')
  assert(game.pendingDecision?.kind === 'select_cards', 'Bottled Vortex decision exposes its card layout')
  assertEqual(game.pendingDecision.layout, 'simple', 'Bottled Vortex uses a plain effect-selection layout')
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

  const allBreachesOpenGame = freshGame()
  const allBreachesOpenPlayer = allBreachesOpenGame.players[0]!
  allBreachesOpenPlayer.hand = ['flexing_dagger']
  for (const breach of allBreachesOpenPlayer.breaches) {
    if (breach.present !== false) breach.opened = true
  }
  playCard(allBreachesOpenGame, allBreachesOpenPlayer.id, 'flexing_dagger')
  assertEqual(allBreachesOpenGame.pendingDecision?.kind, 'choose_one', 'Flexing Dagger still presents its OR choice')
  if (allBreachesOpenGame.pendingDecision?.kind === 'choose_one') {
    const reduceOption = allBreachesOpenGame.pendingDecision.options.find(option => option.id === 'reduce_breach_cost')
    assertEqual(reduceOption?.disabled, true, 'Flexing Dagger disables breach-cost reduction when every breach is open')
    const invalidMessages = resolvePendingDecision(
      allBreachesOpenGame,
      allBreachesOpenGame.pendingDecision.id,
      { kind: 'choose_one', optionId: 'reduce_breach_cost' },
    )
    assert(invalidMessages.some(message => message.includes('not available')), 'Disabled OR options cannot be selected')
    assertEqual(allBreachesOpenGame.pendingDecision?.kind, 'choose_one', 'Invalid disabled choice keeps the decision open')
  }
}

function testSpellEffects(): void {
  const game = freshGame()
  const player = game.players[0]!
  game.nemesis.hp = 20
  player.breaches[0]!.prepSpells = ['lava_tendril']
  const lavaMessages = resolvePreppedEffects(game, player.id, 'casting_phase_end')
  assert(lavaMessages.some(message => message.includes('Decision required')), 'Lava Tendril pauses for confirmation')
  assertEqual(game.pendingDecision?.kind, 'confirm_prepped_effect', 'Lava Tendril requires confirmation')
  assertEqual(game.nemesis.hp, 20, 'Lava Tendril waits before dealing while-prepped damage')
  resolvePendingDecision(game, game.pendingDecision!.id, { kind: 'confirm_prepped_effect', accepted: true })
  assertEqual(game.nemesis.hp, 19, 'Lava Tendril deals one after confirmation')
  assertEqual(resolvePreppedEffects(game, player.id, 'casting_phase_end').length, 0, 'Lava Tendril resolves once per turn')
  const castGame = freshGame()
  const caster = castGame.players[0]!
  caster.breaches[0]!.prepSpells = ['essence_theft']
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
  targeted.players[0]!.breaches[0]!.prepSpells = ['lava_tendril']
  targeted.nemesis.playArea = [{
    cardId: 'bane_sire', cardType: 'minion', placedAt: 1, lifeTokens: 3,
  }]
  assert(castSpell(targeted, targeted.players[0]!.id, 1)?.includes('Cast Lava Tendril'), 'Lava Tendril can target a minion')
  assertEqual(targeted.pendingDecision?.kind, 'select_damage_target', 'Damage target selection is exposed')
  assertEqual(targeted.players[0]!.breaches[0]!.prepSpells.length, 0, 'A cast spell leaves its breach before its target is resolved')
  assertEqual(targeted.players[0]!.discard[0], 'lava_tendril', 'A cast spell enters discard before its target is resolved')
  resolvePendingDecision(targeted, targeted.pendingDecision!.id, {
    kind: 'select_damage_target',
    target: { kind: 'minion', id: 'minion:1', placedAt: 1, cardId: 'bane_sire', label: 'Bane Sire' },
  })
  assertEqual(targeted.nemesis.playArea.length, 0, 'Selected minion is defeated by damage')
  assertEqual(targeted.players[0]!.breaches[0]!.prepSpells.length, 0, 'The spell remains removed from its Breach after target confirmation')
  assertEqual(targeted.players[0]!.discard[0], 'lava_tendril', 'The resolved spell remains on top of discard')

  const planar = freshGame()
  planar.players[0]!.breaches[0]!.prepSpells = ['planar_insight']
  planar.players[0]!.breaches[1]!.opened = true
  planar.nemesis.hp = 20
  assert(castSpell(planar, planar.players[0]!.id, 1)?.includes('Cast Planar Insight'), 'Planar Insight casts')
  assertEqual(planar.nemesis.hp, 16, 'Planar Insight counts open breaches')

  const thirdBreachBonus = freshGame()
  const thirdBreachCaster = thirdBreachBonus.players[0]!
  thirdBreachCaster.breaches[2]!.opened = true
  thirdBreachCaster.breaches[2]!.prepSpells = ['planar_insight']
  thirdBreachBonus.nemesis.hp = 20
  assert(castSpell(thirdBreachBonus, thirdBreachBonus.players[0]!.id, 3)?.includes('Cast Planar Insight'), 'Planar Insight casts from breach III')
  assertEqual(thirdBreachBonus.nemesis.hp, 14, 'Breach III adds one damage to typed spell effects')

  const sparkBreachBonus = freshGame()
  const sparkCaster = sparkBreachBonus.players[0]!
  sparkCaster.breaches[2]!.opened = true
  sparkCaster.breaches[2]!.prepSpells = ['spark']
  sparkBreachBonus.nemesis.hp = 20
  castSpell(sparkBreachBonus, sparkBreachBonus.players[0]!.id, 3)
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
    noDamageCaster.breaches[2]!.prepSpells = ['arcane_nexus']
    noDamageSpell.nemesis.hp = 20
    const noDamageMessage = castSpell(noDamageSpell, noDamageSpell.players[0]!.id, 3)
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
    twoDamageCaster.breaches[2]!.prepSpells = ['arcane_nexus']
    twoDamageInstances.nemesis.hp = 20
    castSpell(twoDamageInstances, twoDamageInstances.players[0]!.id, 3)
    assertEqual(twoDamageInstances.nemesis.hp, 16, 'Breach III boosts each damage instance')
  } finally {
    arcaneNexus.effects = originalArcaneNexusEffects
  }

  const castingAether = freshGame()
  const brama = castingAether.players[1]!
  brama.breaches[0]!.prepSpells = ['buried_light']
  assert(castSpell(castingAether, brama.id, 1)?.includes('gains 1 Aether'), 'Buried Light grants casting-phase aether')
  assertEqual(brama.bonusAether, 1, 'Casting-phase aether is stored immediately')
}

function testSpellDamagePreview(): void {
  const game = freshGame()
  const player = game.players[0]!
  for (const breach of player.breaches) {
    breach.opened = breach.index <= 3
  }
  player.breaches[2]!.prepSpells = ['planar_insight']
  assertEqual(
    getSpellDamagePreview(game, player.id, player.id, 3),
    6,
    'Spell damage preview includes Planar Insight damage and the third-breach bonus',
  )
}

function testMovePreppedSpell(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.breaches[0]!.prepSpells = ['spark']
  player.breaches[1]!.opened = false
  player.breaches[1]!.focusedThisTurn = false
  assertEqual(
    movePreppedSpell(game, player.id, 1, 0, 2),
    'The target Breach is not available for preparation',
    'A closed Breach cannot receive a moved spell',
  )
  player.breaches[1]!.opened = true
  assert(movePreppedSpell(game, player.id, 1, 0, 2)?.includes('Moved Spark'), 'A moved spell can use a Breach opened later')
  assertEqual(player.breaches[0]!.prepSpells.length, 0, 'Moving removes the spell from its source Breach')
  assertEqual(player.breaches[1]!.prepSpells.join(','), 'spark', 'Moving places the spell on the newly opened Breach')

  player.breaches[0]!.prepSpells = ['flare']
  assert(movePreppedSpell(game, player.id, 1, 0, 2)?.includes('Swapped'), 'Moving onto a prepared Breach swaps spells')
  assertEqual(player.breaches[0]!.prepSpells.join(','), 'spark', 'The target spell moves to the source Breach')
  assertEqual(player.breaches[1]!.prepSpells.join(','), 'flare', 'The dragged spell moves to the target Breach')
}

function testHandAndBreachSpellTransfers(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.hand = ['flare']
  player.breaches[0]!.prepSpells = ['spark']
  player.breaches[0]!.opened = true

  assert(
    prepSpell(game, player.id, 'flare', 1, 0)?.includes('Breach already has'),
    'A hand spell cannot replace a spell already prepped on an available Breach',
  )
  assertEqual(player.hand.join(','), 'flare', 'The rejected hand spell remains in hand')
  assertEqual(player.breaches[0]!.prepSpells.join(','), 'spark', 'The existing prepped spell remains on the Breach')

  assert(
    returnPreppedSpellToHand(game, player.id, 1, 0)?.includes('Returned Spark'),
    'A prepped spell can be returned to hand during Main Phase',
  )
  assertEqual(player.hand.join(','), 'flare,spark', 'Returned spells are appended to hand')
  assertEqual(player.breaches[0]!.prepSpells.length, 0, 'Returning a spell clears its Breach slot')
}

function testPreppedSpellRepositionDoesNotKeepMainPhaseOpen(): void {
  const game = freshGame()
  const player = game.players[0]!
  game.currentTurn = player.id
  game.currentPhase = 'main'
  player.hand = []
  player.bonusAether = 0
  player.breaches[0]!.opened = true
  player.breaches[0]!.prepSpells = ['spark']
  player.breaches[1]!.opened = true

  assert(!canPlayerAct(game, player.id), 'Prepped spell repositioning is not a Main Phase action')
  assert(
    movePreppedSpell(game, player.id, 1, 0, 2)?.includes('Moved Spark'),
    'A prepped spell can move after other Main Phase actions are exhausted',
  )
  assertEqual(player.breaches[0]!.prepSpells.length, 0, 'The source Breach is cleared after repositioning')
  assertEqual(player.breaches[1]!.prepSpells.join(','), 'spark', 'The spell reaches the newly available Breach')
}

function testClosedBreachRepositionForSpecialSpell(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.breaches[0]!.prepSpells = ['feral_lightning']
  player.breaches[1]!.opened = false
  player.breaches[1]!.focusedThisTurn = false

  assert(
    movePreppedSpell(game, player.id, 1, 0, 2)?.includes('Moved Feral Lightning'),
    'Feral Lightning can be moved onto a closed Breach',
  )
  assertEqual(player.breaches[0]!.prepSpells.length, 0, 'Moving Feral Lightning clears its source Breach')
  assertEqual(player.breaches[1]!.prepSpells.join(','), 'feral_lightning', 'Feral Lightning reaches the closed Breach')

  const regular = freshGame()
  const regularPlayer = regular.players[0]!
  regularPlayer.breaches[0]!.prepSpells = ['spark']
  regularPlayer.breaches[1]!.opened = false
  regularPlayer.breaches[1]!.focusedThisTurn = false
  assertEqual(
    movePreppedSpell(regular, regularPlayer.id, 1, 0, 2),
    'The target Breach is not available for preparation',
    'Regular spells still cannot be moved onto a closed Breach',
  )
}

function testPreppedOncePerTurnAndTargets(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.breaches[0]!.prepSpells = ['arcane_nexus']
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
  afterPrepPlayer.breaches[0]!.prepSpells = ['arcane_nexus']
  assertEqual(getPreppedCardActions(afterPrep, afterPrepPlayer.id).length, 0, 'No gem is selectable before it is played')
  afterPrepPlayer.hand = ['crystal']
  assert(playCard(afterPrep, afterPrepPlayer.id, 'crystal')?.includes('Played Crystal'), 'Crystal can be played after prep')
  assertEqual(getPreppedCardActions(afterPrep, afterPrepPlayer.id).length, 1, 'A gem played after prep is selectable')
  assert(damageTarget(game).id === 'nemesis', 'Damage target reference is serializable')
}

function testManualWhilePreppedSpellAction(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.hand = []
  player.breaches[0]!.prepSpells = ['oblivion_swell']

  assertEqual(resolvePreppedEffects(game, player.id, 'main_phase').length, 0, 'Oblivion Swell waits for a click in Main Phase')
  assertEqual(game.pendingDecision, null, 'Oblivion Swell does not open an optional-effect modal')
  const actions = getPreppedCardActions(game, player.id)
  assertEqual(actions.length, 1, 'Oblivion Swell exposes one clickable spell action')
  assertEqual(actions[0]!.kind, 'activate_effect', 'Oblivion Swell action targets the prepped spell')
  assert(canPlayerAct(game, player.id), 'A manual while-prepped action keeps the Main Phase open')

  const messages = activatePreppedSpellAction(game, player.id, 1, 0)
  assert(messages.some(message => message.includes('gains 1 Aether')), 'Clicking Oblivion Swell grants one Aether')
  assertEqual(player.bonusAether, 1, 'Oblivion Swell grants exactly one Aether')
  assertEqual(getPreppedCardActions(game, player.id).length, 0, 'Oblivion Swell cannot be activated twice in one turn')
}

function testRepeatableWhilePreppedSpellAction(): void {
  const game = freshGame()
  const player = game.players[0]!
  const ally = game.players[1]!
  game.nemesis.hp = 20
  player.bonusAether = 4
  player.hand = []
  player.breaches[0]!.prepSpells = ['wildfire_whip']
  ally.breaches[0]!.prepSpells = ['spark']

  assertEqual(resolvePreppedEffects(game, player.id, 'main_phase').length, 0, 'Wildfire Whip waits for a click in Main Phase')
  const action = getPreppedCardActions(game, player.id)[0]
  assert(action?.repeatable === true, 'Wildfire Whip exposes a repeatable clickable action')
  const firstMessages = activatePreppedSpellAction(game, player.id, 1, 0)
  assert(firstMessages.some(message => message.includes('spends 2 Aether')), 'Wildfire Whip spends two Aether on each activation')
  assertEqual(player.regularAetherSpent, 2, 'Wildfire Whip records two spent Aether after activation')
  assertEqual(game.pendingDecision?.kind, 'select_prepped_spell', 'Wildfire Whip asks which prepped spell to cast')
  resolvePendingDecision(game, game.pendingDecision!.id, {
    kind: 'select_prepped_spell',
    choice: { playerId: ally.id, breachIndex: 1, spellIndex: 0, cardId: 'spark', cardName: 'Spark' },
  })
  assertEqual(game.pendingDecision, null, 'Wildfire Whip resolves the selected spell without a second modal')
  assertEqual(ally.breaches[0]!.prepSpells.length, 0, 'Wildfire Whip removes the selected spell from its Breach')
  assertEqual(ally.discard[0], 'spark', 'Wildfire Whip puts the cast spell into its owner discard pile')
  assert(getPreppedCardActions(game, player.id).length === 1, 'Wildfire Whip remains available after its first activation')

  const insufficient = freshGame()
  const insufficientPlayer = insufficient.players[0]!
  insufficientPlayer.bonusAether = 1
  insufficientPlayer.breaches[0]!.prepSpells = ['wildfire_whip']
  assertEqual(getPreppedCardActions(insufficient, insufficientPlayer.id).length, 0,
    'Wildfire Whip is not clickable without two Aether')
  const noOpMessages = activatePreppedSpellAction(insufficient, insufficientPlayer.id, 1, 0)
  assert(noOpMessages[0]?.includes('no available'), 'Wildfire Whip rejects activation without enough Aether')
  assertEqual(insufficientPlayer.regularAetherSpent, 0, 'Wildfire Whip does not spend insufficient Aether')
}

function testReturnedGemKeepsPlayCount(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.breaches[0]!.prepSpells = ['arcane_nexus']
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

function testPlayerDeckRecycle(): void {
  const game = freshGame()
  const player = game.players[0]!
  player.hand = []
  player.deck = ['crystal']
  player.discard = ['spark', 'crystal', 'crystal', 'crystal']

  resolveDrawPhase(game, player.id)

  assertEqual(player.hand.length, 5, 'Draw phase fills hand after recycling the discard pile')
  assertEqual(player.deck.length, 0, 'Recycled deck is exhausted exactly at the hand limit')
  assertEqual(player.discard.length, 0, 'Recycled discard pile is moved into the deck')
}

function testMageAbilities(): void {
  const duplicateSpellGame = freshGame()
  const duplicateSpellPlayer = duplicateSpellGame.players[0]!
  duplicateSpellPlayer.hand = ['spark', 'crystal', 'crystal', 'crystal', 'spark']
  assert(prepSpell(duplicateSpellGame, duplicateSpellPlayer.id, 'spark', 1, 4)?.includes('Prepped Spark'), 'Preparing a duplicate spell uses the selected hand index')
  assertEqual(duplicateSpellPlayer.hand.join(','), 'spark,crystal,crystal,crystal', 'Preparing the rightmost duplicate preserves the remaining hand order')

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
  jian.breaches[0]!.prepSpells = ['spark']
  allyWithSpell.breaches[0]!.prepSpells = ['spark']
  jianGame.nemesis.hp = 20
  assertEqual(getPreppedSpellChoices(jianGame).length, 2, 'Jian sees prepped spells from both players')
  assert(activateAbility(jianGame, jian.id)?.includes('Black Mirror activated'), 'Jian ability activates')
  assertEqual(jianGame.pendingDecision?.kind, 'select_prepped_spell', 'Jian asks for a prepped spell')
  resolvePendingDecision(jianGame, jianGame.pendingDecision!.id, {
    kind: 'select_prepped_spell',
    choice: {
      playerId: allyWithSpell.id,
      breachIndex: 1,
      spellIndex: 0,
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
      spellIndex: 0,
      cardId: 'spark',
      cardName: 'Spark',
    },
  })
  assertEqual(jianGame.nemesis.hp, 18, 'Jian casts the selected spell twice')
  assertEqual(allyWithSpell.breaches[0]!.prepSpells.length, 0, 'Jian discards the spell after the second cast')
  assertEqual(allyWithSpell.discard[0], 'spark', 'The second cast puts the spell in its owner discard pile')
  assertEqual(jian.charge, 0, 'Jian charge is consumed')

  const crossPlayerGame = freshGame()
  const crossPlayerJian = crossPlayerGame.players[0]!
  const brama = crossPlayerGame.players[1]!
  crossPlayerJian.mageType = 'jian'
  brama.mageType = 'brama'
  crossPlayerJian.charge = crossPlayerJian.chargeThreshold
  brama.breaches[0]!.prepSpells = ['buried_light']
  crossPlayerGame.nemesis.hp = 20
  assert(activateAbility(crossPlayerGame, crossPlayerJian.id)?.includes('Black Mirror activated'), 'Jian activates across players')
  resolvePendingDecision(crossPlayerGame, crossPlayerGame.pendingDecision!.id, {
    kind: 'select_prepped_spell',
    choice: {
      playerId: brama.id,
      breachIndex: 1,
      spellIndex: 0,
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
      spellIndex: 0,
      cardId: 'buried_light',
      cardName: 'Buried Light',
    },
  })
  assertEqual(crossPlayerJian.bonusAether, 2, 'Both cross-player casts grant Aether to Jian')
  assertEqual(brama.bonusAether, 0, 'Spell owner still receives no cross-player Aether')

  const xaxosGame = createGame('xaxos', 'brama')
  const xaxos = xaxosGame.players[0]!
  const xaxosAlly = xaxosGame.players[1]!
  assertEqual(xaxos.hand.join(','), 'flare,crystal,crystal,crystal,crystal', 'Xaxos starting hand')
  assertEqual(xaxos.deck.join(','), 'crystal,crystal,crystal,crystal,spark', 'Xaxos starting deck')
  assert(xaxos.breaches[0]!.opened, 'Xaxos first breach starts open')
  assertEqual(xaxos.breaches[1]!.focusDirection, 'east', 'Xaxos second breach points right')
  assertEqual(xaxos.breaches[2]!.focusDirection, 'east', 'Xaxos third breach points right')
  assertEqual(xaxos.breaches[3]!.focusDirection, 'south', 'Xaxos fourth breach points down')
  xaxosGame.currentTurn = xaxosAlly.id
  xaxosGame.currentPhase = 'main'
  xaxos.charge = xaxos.chargeThreshold
  xaxosGame.turnOrderDeck = [xaxos.id, 'nemesis', xaxosAlly.id]
  assert(activateAbility(xaxosGame, xaxos.id)?.includes('Metaphysical Link activated'), 'Xaxos activates during an ally main phase')
  assertEqual(xaxos.charge, 0, 'Xaxos charge is consumed')
  assertEqual(xaxosAlly.charge, 4, 'Xaxos allies collectively gain four charges')
  assertEqual(xaxosGame.pendingDecision?.kind, 'reorder_turn_order', 'Xaxos can reveal the remaining turn-order deck')
  resolvePendingDecision(xaxosGame, xaxosGame.pendingDecision!.id, {
    kind: 'reorder_turn_order', order: [2, 0, 1],
  })
  assertEqual(xaxosGame.turnOrderDeck.join(','), `${xaxosAlly.id},${xaxos.id},nemesis`, 'Xaxos returns revealed cards in the chosen order')

  const flareGame = createGame('xaxos', 'brama')
  const flareMage = flareGame.players[0]!
  flareMage.breaches[0]!.prepSpells = ['flare']
  flareGame.currentTurn = flareMage.id
  flareGame.currentPhase = 'casting'
  flareGame.turnOrderDeck = [flareGame.players[1]!.id]
  flareGame.nemesis.hp = 20
  const flareRange = getSpellDamagePreviewRange(flareGame, flareMage.id, flareMage.id, 1)
  assertEqual(flareRange?.min, 1, 'Flare preview shows its guaranteed Nemesis-card damage')
  assertEqual(flareRange?.max, 3, 'Flare preview shows its possible Player-card damage')
  castSpell(flareGame, flareMage.id, 1)
  assertEqual(flareGame.pendingDecision?.kind, 'confirm_turn_order_reveal', 'Flare pauses to confirm its revealed card')
  resolvePendingDecision(flareGame, flareGame.pendingDecision!.id, {
    kind: 'confirm_turn_order_reveal', accepted: true,
  })
  assertEqual(flareGame.nemesis.hp, 17, 'Flare deals three damage for a revealed player turn-order card')
  assertEqual(flareGame.turnOrderDeck[0], flareGame.players[1]!.id, 'Flare leaves the revealed turn-order card on top')

  const finalTurnFlareGame = createGame('xaxos', 'brama')
  const finalTurnFlareMage = finalTurnFlareGame.players[0]!
  finalTurnFlareMage.breaches[0]!.prepSpells = ['flare']
  finalTurnFlareGame.currentTurn = finalTurnFlareMage.id
  finalTurnFlareGame.currentPhase = 'casting'
  finalTurnFlareGame.turnOrderDeck = []
  finalTurnFlareGame.turnOrderDiscard = [finalTurnFlareGame.players[1]!.id]
  finalTurnFlareGame.nemesis.hp = 20
  castSpell(finalTurnFlareGame, finalTurnFlareMage.id, 1)
  assertEqual(finalTurnFlareGame.pendingDecision?.kind, 'confirm_turn_order_reveal', 'Flare pauses after recycling the turn-order discard')
  resolvePendingDecision(finalTurnFlareGame, finalTurnFlareGame.pendingDecision!.id, {
    kind: 'confirm_turn_order_reveal', accepted: true,
  })
  assertEqual(finalTurnFlareGame.nemesis.hp, 17, 'Flare recycles the turn-order discard before revealing on an empty deck')
  assertEqual(finalTurnFlareGame.turnOrderDeck[0], finalTurnFlareGame.players[1]!.id, 'Recycled turn-order card remains on top after Flare')
  assertEqual(finalTurnFlareGame.turnOrderDiscard.length, 0, 'Recycling clears the previous round turn-order bar')

  const nemesisFlareGame = createGame('xaxos', 'brama')
  const nemesisFlareMage = nemesisFlareGame.players[0]!
  nemesisFlareMage.breaches[0]!.prepSpells = ['flare']
  nemesisFlareGame.currentTurn = nemesisFlareMage.id
  nemesisFlareGame.currentPhase = 'casting'
  nemesisFlareGame.turnOrderDeck = ['nemesis']
  nemesisFlareGame.nemesis.hp = 20
  castSpell(nemesisFlareGame, nemesisFlareMage.id, 1)
  assertEqual(nemesisFlareGame.pendingDecision?.kind, 'confirm_turn_order_reveal', 'Flare pauses before resolving Nemesis reveal damage')
  resolvePendingDecision(nemesisFlareGame, nemesisFlareGame.pendingDecision!.id, {
    kind: 'confirm_turn_order_reveal', accepted: true,
  })
  assertEqual(nemesisFlareGame.nemesis.hp, 19, 'Flare deals one damage for a revealed Nemesis turn-order card')
}

function testKadirMultiSpellPreparation(): void {
  const game = createGame('kadir', 'brama')
  const kadir = game.players[0]!
  const activePlayer = game.players[1]!
  game.currentTurn = activePlayer.id
  game.currentPhase = 'main'
  kadir.charge = kadir.chargeThreshold
  activePlayer.hand = []
  activePlayer.discard = ['spark', 'buried_light', 'crystal']

  assert(activateAbility(game, kadir.id)?.includes('Otherworldly Gate activated'), 'Kadir activates during an ally main phase')
  assertEqual(game.pendingDecision?.kind, 'select_cards', 'Kadir asks which discard spells to return')
  assert(!('playerId' in (game.pendingDecision ?? {})), 'Kadir decision is global rather than permission-bound')
  const returnDecision = game.pendingDecision!
  assert(returnDecision.kind === 'select_cards', 'Kadir return decision has card choices')
  assertEqual(returnDecision.layout, 'simple', 'Kadir uses a plain discard selection layout')
  resolvePendingDecision(game, returnDecision.id, {
    kind: 'select_cards', choices: returnDecision.candidates.filter(choice => choice.cardId !== 'crystal'),
  })
  assertEqual(game.pendingDecision, null, 'Kadir ability finishes after returning cards')
  assertEqual(activePlayer.hand.join(','), 'spark,buried_light', 'Kadir returns only discard spells')
  assertEqual(activePlayer.turnEffects.prepSpellLimit, 2, 'Kadir increases preparation capacity for the turn')

  assert(prepSpell(game, activePlayer.id, 'spark', 1)?.includes('Prepped Spark'), 'Kadir prepares the first spell')
  assert(prepSpell(game, activePlayer.id, 'buried_light', 1)?.includes('Prepped Buried Light'), 'Kadir prepares a second spell on one breach')
  assertEqual(activePlayer.breaches[0]!.prepSpells.join(','), 'spark,buried_light', 'Breach keeps both spells in order')
  assertEqual(getCastableSpells(game, activePlayer.id).length, 2, 'Both spells are available during casting')

  game.currentPhase = 'casting'
  castSpell(game, activePlayer.id, 1, 1)
  assertEqual(activePlayer.breaches[0]!.prepSpells.join(','), 'spark', 'Casting the second spell leaves the first spell visible')
  assertEqual(activePlayer.discard[0], 'buried_light', 'The selected spell enters its owner discard pile')
  castSpell(game, activePlayer.id, 1, 0)
  assertEqual(activePlayer.breaches[0]!.prepSpells.length, 0, 'The remaining spell can be cast normally')

  const saved = JSON.parse(JSON.stringify(game)) as GameState
  assertEqual(saved.players[1]!.breaches[0]!.prepSpells.length, 0, 'Multi-spell state remains serializable')
  resolveDrawPhase(game, activePlayer.id)
  assertEqual(activePlayer.turnEffects.prepSpellLimit, 1, 'Kadir preparation capacity resets next turn')
}

function testMageUniqueCardEffects(): void {
  const amethystGame = createGame('adelheim', 'brama')
  const adelheim = amethystGame.players[0]!
  const brama = amethystGame.players[1]!
  adelheim.hand = ['amethyst_shard']
  brama.deck = ['spark']
  brama.hand = ['crystal']
  assert(playCard(amethystGame, adelheim.id, 'amethyst_shard')?.includes('Played Amethyst Shard'), 'Amethyst Shard plays')
  assertEqual(amethystGame.pendingDecision?.kind, 'choose_optional', 'Amethyst Shard offers the ally draw effect')
  resolvePendingDecision(amethystGame, amethystGame.pendingDecision!.id, { kind: 'choose_optional', accepted: true })
  assertEqual(amethystGame.pendingDecision?.kind, 'select_cards', 'Amethyst Shard asks the ally to discard after drawing')
  const amethystDiscard = amethystGame.pendingDecision!
  assert(amethystDiscard.kind === 'select_cards', 'Amethyst discard decision is a card selection')
  resolvePendingDecision(amethystGame, amethystDiscard.id, {
    kind: 'select_cards', choices: [amethystDiscard.candidates[0]!],
  })
  assertEqual(adelheim.bonusAether, 1, 'Amethyst Shard grants one aether')
  assertEqual(brama.hand.length, 1, 'Ally draws before discarding')

  const emeraldGame = createGame('kadir', 'brama')
  const emeraldPlayer = emeraldGame.players[0]!
  const emeraldAlly = emeraldGame.players[1]!
  emeraldPlayer.hand = ['emerald_shard']
  emeraldAlly.hp = emeraldAlly.maxHp - 1
  assert(playCard(emeraldGame, emeraldPlayer.id, 'emerald_shard')?.includes('Played Emerald Shard'), 'Emerald Shard plays')
  resolvePendingDecision(emeraldGame, emeraldGame.pendingDecision!.id, { kind: 'choose_one', optionId: 'gain_life' })
  assertEqual(emeraldGame.pendingDecision?.kind, 'select_life_target', 'Emerald Shard asks for a life target')
  resolvePendingDecision(emeraldGame, emeraldGame.pendingDecision!.id, {
    kind: 'select_life_target', target: { kind: 'player', playerId: emeraldAlly.id },
  })
  assertEqual(emeraldAlly.hp, emeraldAlly.maxHp, 'Emerald Shard restores the selected player')

  const quartzGame = createGame('lash', 'brama')
  const quartzPlayer = quartzGame.players[0]!
  quartzPlayer.hand = ['quartz_shard']
  quartzGame.turnOrderDeck = [quartzGame.players[1]!.id, 'nemesis']
  assert(playCard(quartzGame, quartzPlayer.id, 'quartz_shard')?.includes('Played Quartz Shard'), 'Quartz Shard plays')
  assertEqual(quartzGame.pendingDecision?.kind, 'confirm_turn_order_reveal', 'Quartz Shard pauses for the reveal')
  resolvePendingDecision(quartzGame, quartzGame.pendingDecision!.id, {
    kind: 'confirm_turn_order_reveal', accepted: true,
  })
  assertEqual(quartzGame.pendingDecision?.kind, 'choose_turn_order_position', 'Quartz Shard asks where to place the revealed card')
  resolvePendingDecision(quartzGame, quartzGame.pendingDecision!.id, {
    kind: 'choose_turn_order_position', position: 'bottom',
  })
  assertEqual(quartzPlayer.bonusAether, 2, 'Quartz Shard grants an extra aether for a player card')
  assertEqual(quartzGame.turnOrderDeck.join(','), `nemesis,${quartzGame.players[1]!.id}`, 'Quartz Shard can place the revealed card on the bottom')

  const garnetGame = createGame('mist', 'brama')
  const garnetPlayer = garnetGame.players[0]!
  const garnetAlly = garnetGame.players[1]!
  garnetPlayer.hand = ['garnet_shard']
  garnetAlly.breaches[0]!.prepSpells = ['spark']
  assert(playCard(garnetGame, garnetPlayer.id, 'garnet_shard')?.includes('Played Garnet Shard'), 'Garnet Shard plays')
  resolvePendingDecision(garnetGame, garnetGame.pendingDecision!.id, { kind: 'choose_one', optionId: 'cast_prepped_spell' })
  assertEqual(garnetGame.pendingDecision?.kind, 'select_prepped_spell', 'Garnet Shard asks for a prepped spell')
  resolvePendingDecision(garnetGame, garnetGame.pendingDecision!.id, {
    kind: 'select_prepped_spell', choice: {
      playerId: garnetAlly.id, breachIndex: 1, spellIndex: 0, cardId: 'spark', cardName: 'Spark',
    },
  })
  assertEqual(garnetAlly.breaches[0]!.prepSpells.length, 0, 'Garnet Shard casts and discards the selected spell')
  assertEqual(garnetAlly.discard[0], 'spark', 'Garnet Shard puts the cast spell in its owner discard pile')

  const tourmalineGame = createGame('phaedraxa', 'brama')
  const tourmalinePlayer = tourmalineGame.players[0]!
  const tourmalineAlly = tourmalineGame.players[1]!
  tourmalinePlayer.hand = ['tourmaline_shard']
  tourmalineAlly.hand = ['crystal']
  assert(playCard(tourmalineGame, tourmalinePlayer.id, 'tourmaline_shard')?.includes('Played Tourmaline Shard'), 'Tourmaline Shard plays')
  resolvePendingDecision(tourmalineGame, tourmalineGame.pendingDecision!.id, { kind: 'choose_optional', accepted: true })
  assertEqual(tourmalineAlly.hp, tourmalineAlly.maxHp - 1, 'Tourmaline Shard damages the selected ally')
  assertEqual(tourmalineGame.pendingDecision?.kind, 'select_cards', 'Tourmaline Shard asks the damaged ally to destroy a card')
  const destroyDecision = tourmalineGame.pendingDecision!
  assert(destroyDecision.kind === 'select_cards', 'Tourmaline destroy decision is a card selection')
  resolvePendingDecision(tourmalineGame, destroyDecision.id, {
    kind: 'select_cards', choices: [destroyDecision.candidates[0]!],
  })
  assert(tourmalineAlly.destroyedCards.includes('crystal'), 'Tourmaline Shard destroys the selected ally card')
  assertEqual(tourmalinePlayer.bonusAether, 1, 'Tourmaline Shard grants one aether')
}

function run(): void {
  testSupplyData()
  testAllCurrentPlayerCardsUseTypedEffects()
  testWave1MageStaticData()
  testCommonBreachCosts()
  testStage3AbilityTriggers()
  testGainAndSaveShape()
  testGemEffects()
  testInitialCardEffects()
  testRelicEffects()
  testSpellEffects()
  testSpellDamagePreview()
  testMovePreppedSpell()
  testHandAndBreachSpellTransfers()
  testPreppedSpellRepositionDoesNotKeepMainPhaseOpen()
  testClosedBreachRepositionForSpecialSpell()
  testPreppedOncePerTurnAndTargets()
  testManualWhilePreppedSpellAction()
  testRepeatableWhilePreppedSpellAction()
  testReturnedGemKeepsPlayCount()
  testTurnReset()
  testPlayerDeckRecycle()
  testMageAbilities()
  testKadirMultiSpellPreparation()
  testMageUniqueCardEffects()
  console.log('Stage 7 engine regression tests passed (typed card effects + JSON save shape).')
}

run()
