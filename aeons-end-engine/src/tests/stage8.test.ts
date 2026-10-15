import {
  ALL_MARKET_CARDS,
  DEFAULT_MARKET_SLOTS,
  createTwoPlayerScenario,
  getCard,
  resolveMarketCardIds,
} from '../data'
import {
  castSpell,
  createGame,
  getSpellDamagePreview,
  playCard,
  prepSpell,
  resolveEffects,
  resolvePendingDecision,
} from '../engine'

declare const console: { log(message?: unknown): void }

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function testWave1CatalogAndMarketSetup(): void {
  assertEqual(Object.keys(ALL_MARKET_CARDS).length, 62, 'All Wave 1 and implemented Wave 9 market cards are registered')
  assert(Object.values(ALL_MARKET_CARDS).every(card => (card.effects?.length ?? 0) > 0), 'Every registered market card has a playable effect definition')
  assertEqual(DEFAULT_MARKET_SLOTS.length, 9, 'Default market has nine slots')
  const manual = resolveMarketCardIds({ mode: 'manual', slots: ['jade', 'searing_ruby', 'clouded_sapphire', 'flexing_dagger', 'blasting_staff', 'phoenix_flame', 'ignite', 'dark_fire', 'chaos_arc'] })
  assertEqual(manual[0], 'jade', 'Manual market slot is preserved')
  let invalidError = ''
  try {
    resolveMarketCardIds({ mode: 'manual', slots: ['jade', 'jade'] })
  } catch (error) {
    invalidError = String(error)
  }
  assert(invalidError.includes('exactly nine slots'), 'Invalid manual setup reports a clear validation error')
  const template = resolveMarketCardIds({ mode: 'template1', slots: [] })
  assertEqual(template.length, 9, 'Template 1 creates nine market slots')
  const deterministicTemplate = resolveMarketCardIds({ mode: 'template1', slots: [] }, () => 0.25)
  assertEqual(JSON.stringify(deterministicTemplate), JSON.stringify(resolveMarketCardIds({ mode: 'template1', slots: [] }, () => 0.25)), 'Template 1 accepts a deterministic random source')
  assertEqual(JSON.stringify(resolveMarketCardIds({ mode: 'template1', slots: deterministicTemplate })), JSON.stringify(deterministicTemplate), 'Template 1 preserves the previewed roll when slots are already resolved')
  const cards = template.map(cardId => getCard(cardId))
  assertEqual(cards.filter(card => card.type === 'gem').length, 3, 'Template 1 selects three gems')
  assertEqual(cards.filter(card => card.type === 'relic').length, 2, 'Template 1 selects two relics')
  assertEqual(cards.filter(card => card.type === 'spell').length, 4, 'Template 1 selects four spells')
  assert(cards.some(card => card.type === 'gem' && card.cost <= 3), 'Template 1 includes a low-cost gem')
  assert(cards.some(card => card.type === 'gem' && card.cost === 4), 'Template 1 includes a four-cost gem')
  assert(cards.some(card => card.type === 'gem' && card.cost >= 5), 'Template 1 includes a high-cost gem')
}

function testNewCardEffectPrimitives(): void {
  const scenario = createTwoPlayerScenario(['jian', 'brama'], 'rageborne', 'standard', {
    mode: 'manual',
    slots: ['clouded_sapphire', 'jade', 'searing_ruby', 'flexing_dagger', 'blasting_staff', 'phoenix_flame', 'ignite', 'dark_fire', 'chaos_arc'],
  })
  const game = createGame(scenario)
  const player = game.players[0]!
  game.currentTurn = player.id
  game.currentPhase = 'main'
  player.hand = ['clouded_sapphire', 'jade']
  playCard(game, player.id, 'clouded_sapphire')
  assertEqual(player.bonusAether, 3, 'Clouded Sapphire grants three Aether')
  assertEqual(game.players[1]!.charge, 1, 'Clouded Sapphire grants an ally one charge')

  const rubyGame = createGame(scenario)
  const rubyPlayer = rubyGame.players[0]!
  rubyGame.currentTurn = rubyPlayer.id
  rubyGame.currentPhase = 'main'
  rubyPlayer.hand = ['searing_ruby']
  playCard(rubyGame, rubyPlayer.id, 'searing_ruby')
  assertEqual(rubyPlayer.conditionalAetherEarned.spell, 1, 'Searing Ruby stores one spell-only Aether')

  const prepGame = createGame(scenario)
  const prepPlayer = prepGame.players[0]!
  prepGame.currentTurn = prepPlayer.id
  prepGame.currentPhase = 'main'
  prepPlayer.hand = ['feral_lightning']
  const prepMessage = prepSpell(prepGame, prepPlayer.id, 'feral_lightning', 3)
  assert(prepMessage?.includes('Prepped Feral Lightning'), 'Feral Lightning can prep on a closed breach')

  const focusGame = createGame(scenario)
  const focusPlayer = focusGame.players[0]!
  focusGame.currentTurn = focusPlayer.id
  focusGame.currentPhase = 'main'
  focusPlayer.hand = ['amplify_vision']
  focusPlayer.breaches[2]!.opened = true
  prepSpell(focusGame, focusPlayer.id, 'amplify_vision', 3)
  const castMessage = castSpell(focusGame, focusPlayer.id, 3)
  assert(castMessage?.includes('Cast Amplify Vision'), 'Amplify Vision casts successfully')
  assert(focusPlayer.breaches.some(breach => breach.focusedThisTurn), 'Amplify Vision focuses a breach')

  const destroyedBreachGame = createGame(scenario)
  const destroyedBreachPlayer = destroyedBreachGame.players[0]!
  destroyedBreachGame.currentTurn = destroyedBreachPlayer.id
  destroyedBreachGame.currentPhase = 'main'
  destroyedBreachPlayer.hand = ['amplify_vision']
  // Jian has Breaches I and II open by default. Simulate Breach III having
  // been destroyed while Breach IV is open: only the three present Breaches
  // should be considered by Amplify Vision's condition.
  destroyedBreachPlayer.breaches[2]!.present = false
  destroyedBreachPlayer.breaches[2]!.opened = false
  destroyedBreachPlayer.breaches[3]!.opened = true
  prepSpell(destroyedBreachGame, destroyedBreachPlayer.id, 'amplify_vision', 1)
  assertEqual(getSpellDamagePreview(
    destroyedBreachGame,
    destroyedBreachPlayer.id,
    destroyedBreachPlayer.id,
    1,
  ), 3, 'Amplify Vision preview includes conditional damage when destroyed Breaches are excluded')
  const hpBeforeAmplify = destroyedBreachGame.nemesis.hp
  castSpell(destroyedBreachGame, destroyedBreachPlayer.id, 1)
  assertEqual(destroyedBreachGame.nemesis.hp, hpBeforeAmplify - 3,
    'Amplify Vision counts only present Breaches when checking all Breaches opened')

  const oblivionNoGemGame = createGame(scenario)
  const oblivionNoGemPlayer = oblivionNoGemGame.players[0]!
  oblivionNoGemGame.currentTurn = oblivionNoGemPlayer.id
  oblivionNoGemGame.currentPhase = 'main'
  oblivionNoGemPlayer.hand = ['oblivion_swell']
  prepSpell(oblivionNoGemGame, oblivionNoGemPlayer.id, 'oblivion_swell', 1)
  const noGemHp = oblivionNoGemGame.nemesis.hp
  castSpell(oblivionNoGemGame, oblivionNoGemPlayer.id, 1)
  assertEqual(oblivionNoGemGame.pendingDecision, null,
    'Oblivion Swell automatically skips its discard option when no gem can be discarded')
  assertEqual(oblivionNoGemGame.nemesis.hp, noGemHp - 2,
    'Oblivion Swell deals its base damage after automatically skipping the unavailable discard')

  const oblivionGemGame = createGame(scenario)
  const oblivionGemPlayer = oblivionGemGame.players[0]!
  oblivionGemGame.currentTurn = oblivionGemPlayer.id
  oblivionGemGame.currentPhase = 'main'
  oblivionGemPlayer.hand = ['oblivion_swell', 'jade']
  prepSpell(oblivionGemGame, oblivionGemPlayer.id, 'oblivion_swell', 1)
  const gemHp = oblivionGemGame.nemesis.hp
  castSpell(oblivionGemGame, oblivionGemPlayer.id, 1)
  const gemOptional = oblivionGemGame.pendingDecision
  assert(gemOptional?.kind === 'choose_optional', 'Oblivion Swell offers the discard when a gem is available')
  if (!gemOptional || gemOptional.kind !== 'choose_optional') return
  assertEqual(gemOptional.accept.disabled, false,
    'Oblivion Swell enables Yes when a gem can be discarded')
  resolvePendingDecision(oblivionGemGame, gemOptional.id, {
    kind: 'choose_optional', accepted: true,
  })
  const gemDiscard = oblivionGemGame.pendingDecision
  assert(gemDiscard?.kind === 'select_cards', 'Oblivion Swell asks which gem to discard')
  if (!gemDiscard || gemDiscard.kind !== 'select_cards') return
  resolvePendingDecision(oblivionGemGame, gemDiscard.id, {
    kind: 'select_cards', choices: [gemDiscard.candidates[0]!],
  })
  assertEqual(oblivionGemGame.nemesis.hp, gemHp - 4,
    'Oblivion Swell combines its base and discarded gem cost into one damage instance')

  const oblivionTargetGame = createGame(scenario)
  const oblivionTargetPlayer = oblivionTargetGame.players[0]!
  oblivionTargetGame.currentTurn = oblivionTargetPlayer.id
  oblivionTargetGame.currentPhase = 'main'
  oblivionTargetPlayer.hand = ['oblivion_swell']
  oblivionTargetGame.nemesis.playArea = [{
    cardId: 'cauterizer',
    cardType: 'minion',
    placedAt: 1,
    instanceId: 'cauterizer:oblivion',
    lifeTokens: 3,
  }]
  prepSpell(oblivionTargetGame, oblivionTargetPlayer.id, 'oblivion_swell', 1)
  castSpell(oblivionTargetGame, oblivionTargetPlayer.id, 1)
  const targetOptional = oblivionTargetGame.pendingDecision
  assert(targetOptional?.kind === 'choose_optional',
    'Oblivion Swell asks before resolving its damage target')
  if (!targetOptional || targetOptional.kind !== 'choose_optional') return
  resolvePendingDecision(oblivionTargetGame, targetOptional.id, {
    kind: 'choose_optional', accepted: false,
  })
  const targetChoice = oblivionTargetGame.pendingDecision
  assert(targetChoice?.kind === 'select_damage_target',
    'Oblivion Swell exposes one target choice for its complete damage instance')
  if (!targetChoice || targetChoice.kind !== 'select_damage_target') return
  const targetMinion = targetChoice.targets.find(target => target.kind === 'minion')
  assert(targetMinion, 'Oblivion Swell exposes its Minion target')
  if (!targetMinion) return
  resolvePendingDecision(oblivionTargetGame, targetChoice.id, {
    kind: 'select_damage_target', target: targetMinion,
  })
  assertEqual(oblivionTargetGame.nemesis.playArea[0]?.lifeTokens, 2,
    'Oblivion Swell deals its base damage as one event when no gem is discarded')
  assertEqual(oblivionTargetGame.pendingDecision, null,
    'Oblivion Swell does not create a second target choice for its additional damage')

  const phoenixGame = createGame(scenario)
  const phoenixPlayer = phoenixGame.players[0]!
  phoenixGame.currentTurn = phoenixPlayer.id
  phoenixGame.currentPhase = 'main'
  phoenixPlayer.hand = ['phoenix_flame']
  phoenixPlayer.charge = 1
  phoenixGame.nemesis.playArea = [{
    cardId: 'cauterizer',
    cardType: 'minion',
    placedAt: 1,
    instanceId: 'cauterizer:phoenix',
    lifeTokens: 3,
  }]
  prepSpell(phoenixGame, phoenixPlayer.id, 'phoenix_flame', 1)
  castSpell(phoenixGame, phoenixPlayer.id, 1)
  const phoenixOptional = phoenixGame.pendingDecision
  assert(phoenixOptional?.kind === 'choose_optional',
    'Phoenix Flame asks whether to pay its optional charge cost')
  if (!phoenixOptional || phoenixOptional.kind !== 'choose_optional') return
  assertEqual(phoenixOptional.accept.disabled, false,
    'Phoenix Flame enables its additional-damage choice when charge is available')
  resolvePendingDecision(phoenixGame, phoenixOptional.id, {
    kind: 'choose_optional', accepted: true,
  })
  assertEqual(phoenixPlayer.charge, 0, 'Phoenix Flame spends one charge for its additional damage')
  const phoenixTarget = phoenixGame.pendingDecision
  assert(phoenixTarget?.kind === 'select_damage_target',
    'Phoenix Flame exposes one target choice for its complete damage instance')
  if (!phoenixTarget || phoenixTarget.kind !== 'select_damage_target') return
  const phoenixMinion = phoenixTarget.targets.find(target => target.kind === 'minion')
  assert(phoenixMinion, 'Phoenix Flame exposes its Minion target')
  if (!phoenixMinion) return
  resolvePendingDecision(phoenixGame, phoenixTarget.id, {
    kind: 'select_damage_target', target: phoenixMinion,
  })
  assertEqual(phoenixGame.nemesis.playArea[0]?.lifeTokens, 2,
    'Phoenix Flame additional damage remains part of one damage event')
  assertEqual(phoenixGame.pendingDecision, null,
    'Phoenix Flame does not create a second target choice for additional damage')

  const phoenixNoChargeGame = createGame(scenario)
  const phoenixNoChargePlayer = phoenixNoChargeGame.players[0]!
  phoenixNoChargeGame.currentTurn = phoenixNoChargePlayer.id
  phoenixNoChargeGame.currentPhase = 'main'
  phoenixNoChargePlayer.hand = ['phoenix_flame']
  phoenixNoChargePlayer.charge = 0
  prepSpell(phoenixNoChargeGame, phoenixNoChargePlayer.id, 'phoenix_flame', 1)
  const phoenixNoChargeHp = phoenixNoChargeGame.nemesis.hp
  castSpell(phoenixNoChargeGame, phoenixNoChargePlayer.id, 1)
  const phoenixNoChargeOptional = phoenixNoChargeGame.pendingDecision
  assert(phoenixNoChargeOptional?.kind === 'choose_optional',
    'Phoenix Flame still shows its optional choice without charge')
  if (!phoenixNoChargeOptional || phoenixNoChargeOptional.kind !== 'choose_optional') return
  assertEqual(phoenixNoChargeOptional.accept.disabled, true,
    'Phoenix Flame disables the charge-payment choice when charge is unavailable')
  resolvePendingDecision(phoenixNoChargeGame, phoenixNoChargeOptional.id, {
    kind: 'choose_optional', accepted: false,
  })
  assertEqual(phoenixNoChargeGame.nemesis.hp, phoenixNoChargeHp - 2,
    'Phoenix Flame still deals its base damage when the bonus is skipped')

  const singleInstanceGame = createGame(scenario)
  const singleInstancePlayer = singleInstanceGame.players[0]!
  singleInstanceGame.currentTurn = singleInstancePlayer.id
  singleInstanceGame.currentPhase = 'main'
  singleInstancePlayer.hand = ['amplify_vision']
  singleInstancePlayer.breaches[2]!.present = false
  singleInstancePlayer.breaches[2]!.opened = false
  singleInstancePlayer.breaches[3]!.opened = true
  singleInstanceGame.nemesis.playArea = [{
    cardId: 'cauterizer',
    cardType: 'minion',
    placedAt: 1,
    instanceId: 'cauterizer:1',
    lifeTokens: 3,
  }]
  prepSpell(singleInstanceGame, singleInstancePlayer.id, 'amplify_vision', 1)
  castSpell(singleInstanceGame, singleInstancePlayer.id, 1)
  const damageChoice = singleInstanceGame.pendingDecision
  assert(damageChoice?.kind === 'select_damage_target',
    'Amplify Vision asks for one target when a Minion is also in play')
  if (!damageChoice || damageChoice.kind !== 'select_damage_target') return
  const cauterizerTarget = damageChoice.targets.find(target => target.kind === 'minion')
  assert(cauterizerTarget, 'Amplify Vision exposes the Cauterizer as a damage target')
  if (!cauterizerTarget) return
  resolvePendingDecision(singleInstanceGame, damageChoice.id, {
    kind: 'select_damage_target',
    target: cauterizerTarget,
  })
  assertEqual(singleInstanceGame.nemesis.playArea[0]?.lifeTokens, 2,
    'Amplify Vision additional damage is part of one damage instance')
  assertEqual(singleInstanceGame.pendingDecision, null,
    'Amplify Vision does not create a second target choice for additional damage')

  const separateDamageGame = createGame(scenario)
  const separateDamagePlayer = separateDamageGame.players[0]!
  separateDamageGame.currentTurn = separateDamagePlayer.id
  separateDamageGame.currentPhase = 'main'
  separateDamageGame.nemesis.playArea = [{
    cardId: 'needlemaw',
    cardType: 'minion',
    placedAt: 1,
    instanceId: 'needlemaw:1',
    lifeTokens: 11,
  }]
  const separateDamage = resolveEffects(separateDamageGame, separateDamagePlayer.id, [
    { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
    { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
  ])
  assert(separateDamage.some(message => message.includes('Decision required')),
    'Separate damage effects still pause for a target choice')
  const firstSeparateChoice = separateDamageGame.pendingDecision
  assert(firstSeparateChoice?.kind === 'select_damage_target',
    'The first independent damage effect asks for a target')
  if (!firstSeparateChoice || firstSeparateChoice.kind !== 'select_damage_target') return
  const firstNeedlemawTarget = firstSeparateChoice.targets.find(target => target.kind === 'minion')
  assert(firstNeedlemawTarget, 'The first independent damage effect exposes Needlemaw')
  if (!firstNeedlemawTarget) return
  resolvePendingDecision(separateDamageGame, firstSeparateChoice.id, {
    kind: 'select_damage_target', target: firstNeedlemawTarget,
  })
  const secondSeparateChoice = separateDamageGame.pendingDecision
  assert(secondSeparateChoice?.kind === 'select_damage_target',
    'A second independent damage effect asks for its own target')
  if (!secondSeparateChoice || secondSeparateChoice.kind !== 'select_damage_target') return
  const secondNeedlemawTarget = secondSeparateChoice.targets.find(target => target.kind === 'minion')
  assert(secondNeedlemawTarget, 'The second independent damage effect exposes Needlemaw')
  if (!secondNeedlemawTarget) return
  resolvePendingDecision(separateDamageGame, secondSeparateChoice.id, {
    kind: 'select_damage_target', target: secondNeedlemawTarget,
  })
  assertEqual(separateDamageGame.nemesis.playArea[0]?.lifeTokens, 8,
    'Two separate damage effects resolve as two damage instances')

  const closedBreachGame = createGame(scenario)
  const closedBreachPlayer = closedBreachGame.players[0]!
  closedBreachGame.currentTurn = closedBreachPlayer.id
  closedBreachGame.currentPhase = 'main'
  closedBreachPlayer.hand = ['amplify_vision']
  closedBreachPlayer.breaches[3]!.opened = true
  prepSpell(closedBreachGame, closedBreachPlayer.id, 'amplify_vision', 1)
  assertEqual(getSpellDamagePreview(
    closedBreachGame,
    closedBreachPlayer.id,
    closedBreachPlayer.id,
    1,
  ), 2, 'Amplify Vision preview omits conditional damage while a present Breach is closed')
  const hpBeforeClosed = closedBreachGame.nemesis.hp
  castSpell(closedBreachGame, closedBreachPlayer.id, 1)
  assertEqual(closedBreachGame.nemesis.hp, hpBeforeClosed - 2,
    'Amplify Vision does not grant its bonus while a present Breach is closed')

  const discardGame = createGame(scenario)
  const discardPlayer = discardGame.players[0]!
  discardGame.currentTurn = discardPlayer.id
  discardGame.currentPhase = 'main'
  discardPlayer.hand = ['dark_fire', 'jade', 'searing_ruby']
  discardPlayer.breaches[0]!.prepSpells = ['dark_fire']
  const discardDecisionMessage = castSpell(discardGame, discardPlayer.id, 1)
  assert(discardDecisionMessage?.includes('Decision required'), 'Dark Fire pauses for an optional discard selection')
  const pending = discardGame.pendingDecision
  assert(pending?.kind === 'select_cards', 'Dark Fire exposes hand cards for selection')
  if (!pending || pending.kind !== 'select_cards') return
  const selected = pending.candidates[0]!
  resolvePendingDecision(discardGame, pending.id, { kind: 'select_cards', choices: [selected] })
  assertEqual(discardPlayer.discard[0], selected.cardId, 'Dark Fire discards the selected card')
  assertEqual(discardGame.nemesis.hp, discardGame.nemesis.maxHp - 3, 'Dark Fire deals three damage per discarded card')

  const prismNoGemGame = createGame(scenario)
  const prismNoGemPlayer = prismNoGemGame.players[0]!
  prismNoGemGame.currentTurn = prismNoGemPlayer.id
  prismNoGemGame.currentPhase = 'main'
  prismNoGemPlayer.hand = ['unstable_prism']
  playCard(prismNoGemGame, prismNoGemPlayer.id, 'unstable_prism')
  const prismNoGemDecision = prismNoGemGame.pendingDecision
  assert(prismNoGemDecision?.kind === 'choose_one',
    'Unstable Prism shows its choices without a Gem in hand')
  if (!prismNoGemDecision || prismNoGemDecision.kind !== 'choose_one') return
  const playGemOption = prismNoGemDecision.options.find(option => option.id === 'play_gem')
  assertEqual(playGemOption?.disabled, true,
    'Unstable Prism disables the play-Gem option when no Gem is in hand')
  const rejectedPrismChoice = resolvePendingDecision(prismNoGemGame, prismNoGemDecision.id, {
    kind: 'choose_one', optionId: 'play_gem',
  })
  assert(rejectedPrismChoice.some(message => message.includes('not available')),
    'A disabled Unstable Prism play-Gem option cannot be accepted through the engine')
  assertEqual(prismNoGemGame.pendingDecision?.id, prismNoGemDecision.id,
    'Unstable Prism keeps its choice open after an unavailable option is attempted')

  const prismGame = createGame(scenario)
  const prismPlayer = prismGame.players[0]!
  prismGame.currentTurn = prismPlayer.id
  prismGame.currentPhase = 'main'
  prismPlayer.hand = ['unstable_prism', 'jade']
  playCard(prismGame, prismPlayer.id, 'unstable_prism')
  const prismDecision = prismGame.pendingDecision
  assert(prismDecision?.kind === 'choose_one', 'Unstable Prism presents its two effects')
  if (!prismDecision || prismDecision.kind !== 'choose_one') return
  resolvePendingDecision(prismGame, prismDecision.id, { kind: 'choose_one', optionId: 'play_gem' })
  const gemDecision = prismGame.pendingDecision
  assert(gemDecision?.kind === 'select_cards', 'Unstable Prism asks which gem to play')
  if (!gemDecision || gemDecision.kind !== 'select_cards') return
  resolvePendingDecision(prismGame, gemDecision.id, { kind: 'select_cards', choices: [gemDecision.candidates[0]!] })
  assert(!prismPlayer.hand.includes('jade'), 'Unstable Prism removes the selected gem from hand')
  assert(!prismPlayer.playedThisTurn.includes('jade'), 'Unstable Prism destroys the selected gem after replaying it')
  assert(prismPlayer.destroyedCards.includes('jade'), 'Unstable Prism records the replayed gem as destroyed')

  const revealGame = createGame(scenario)
  const revealPlayer = revealGame.players[0]!
  const otherRevealPlayer = revealGame.players[1]!
  revealGame.currentTurn = revealPlayer.id
  revealGame.currentPhase = 'main'
  revealPlayer.hand = ['sifters_pearl']
  revealPlayer.deck = []
  revealPlayer.discard = ['jade']
  otherRevealPlayer.deck = []
  otherRevealPlayer.discard = ['clouded_sapphire']
  playCard(revealGame, revealPlayer.id, 'sifters_pearl')
  const firstReveal = revealGame.pendingDecision
  assert(firstReveal?.kind === 'choose_one' && revealGame.pendingEffect?.revealedTopCard?.playerId === revealPlayer.id, 'Sifter records the first revealed card owner')
  assertEqual(revealGame.pendingEffect?.revealedTopCard?.cardId, 'jade', 'Sifter keeps the revealed card available for the image modal')
  assertEqual(revealPlayer.discard.length, 0, 'A single-card reveal recycles the player discard pile without shuffling')
  if (!firstReveal || firstReveal.kind !== 'choose_one') return
  resolvePendingDecision(revealGame, firstReveal.id, { kind: 'choose_one', optionId: 'keep' })
  const secondReveal = revealGame.pendingDecision
  assert(secondReveal?.kind === 'choose_one' && revealGame.pendingEffect?.revealedTopCard?.playerId === otherRevealPlayer.id, 'Sifter switches the revealed card owner')
  if (!secondReveal || secondReveal.kind !== 'choose_one') return
  resolvePendingDecision(revealGame, secondReveal.id, { kind: 'choose_one', optionId: 'discard' })
  assertEqual(revealPlayer.deck[0], 'jade', 'Keeping a revealed card returns it to the top of its deck')
  assertEqual(otherRevealPlayer.discard[0], 'clouded_sapphire', 'Discarding a revealed card moves it to that player discard')

  const optionalGame = createGame(scenario)
  const optionalPlayer = optionalGame.players[0]!
  const optionalAlly = optionalGame.players[1]!
  optionalGame.currentTurn = optionalPlayer.id
  optionalGame.currentPhase = 'main'
  optionalPlayer.hand = ['burning_opal']
  optionalAlly.hand = []
  optionalAlly.deck = ['jade']
  playCard(optionalGame, optionalPlayer.id, 'burning_opal')
  assertEqual(optionalGame.pendingDecision, null, 'Burning Opal skips its discard offer when no card is available')
  assertEqual(optionalAlly.hand.length, 0, 'Burning Opal does not draw when no card was discarded')

  const replayGame = createGame(scenario)
  const replayPlayer = replayGame.players[0]!
  const replayAlly = replayGame.players[1]!
  replayGame.currentTurn = replayPlayer.id
  replayGame.currentPhase = 'main'
  replayPlayer.hand = ['unstable_prism', 'burning_opal', 'jade']
  replayAlly.hand = []
  replayAlly.deck = ['jade']
  playCard(replayGame, replayPlayer.id, 'unstable_prism')
  const replayOption = replayGame.pendingDecision
  if (!replayOption || replayOption.kind !== 'choose_one') return
  resolvePendingDecision(replayGame, replayOption.id, { kind: 'choose_one', optionId: 'play_gem' })
  const replayCard = replayGame.pendingDecision
  if (!replayCard || replayCard.kind !== 'select_cards') return
  resolvePendingDecision(replayGame, replayCard.id, { kind: 'select_cards', choices: [replayCard.candidates.find(choice => choice.cardId === 'burning_opal')!] })
  const replayDiscardPrompt = replayGame.pendingDecision
  if (!replayDiscardPrompt || replayDiscardPrompt.kind !== 'choose_optional') return
  resolvePendingDecision(replayGame, replayDiscardPrompt.id, { kind: 'choose_optional', accepted: true })
  const replayDiscard = replayGame.pendingDecision
  if (!replayDiscard || replayDiscard.kind !== 'select_cards') return
  resolvePendingDecision(replayGame, replayDiscard.id, { kind: 'select_cards', choices: [replayDiscard.candidates.find(choice => choice.cardId === 'jade')!] })
  assert(replayPlayer.destroyedCards.includes('burning_opal'), 'Unstable Prism destroys the replayed card owner\'s physical card after nested effects')
  assert(!replayPlayer.playedThisTurn.includes('burning_opal'), 'Unstable Prism removes the replayed card from the owner\'s played area')
}

testWave1CatalogAndMarketSetup()
testNewCardEffectPrimitives()
console.log('Stage 8 Wave 1 supply catalog, setup, and effect tests passed.')
