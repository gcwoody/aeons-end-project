import {
  buyCard, canPlayerAct, createGame, developCardFromSupply,
  developCardFromZone, getBuyableCards, getDevelopActions, getDevelopZoneCards, getGameZoneVisibility,
  resolveCardEffects,
} from '../engine'
import { createTwoPlayerScenario, getCard } from '../data'

declare const console: { log(...messages: unknown[]): void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function scenarioWithMarketCard(
  cardId: string,
  mageTypes: [string, string] = ['jian', 'brama'],
  nemesisType = 'rageborne',
) {
  const scenario = createTwoPlayerScenario(mageTypes, nemesisType)
  const slots = [...scenario.marketSetup!.slots]
  slots[0] = cardId
  scenario.marketSetup = { mode: 'manual', slots }
  return scenario
}

function setMainPhase(game: ReturnType<typeof createGame>, playerId: string): void {
  game.currentTurn = playerId
  game.currentPhase = 'main'
}

function testDevelopZoneVisibilityIsSetupWideAndSwapCardsStayPublic(): void {
  const noDevelop = createGame(scenarioWithMarketCard('vriswood_amber', ['nook', 'brama']))
  assertEqual(getGameZoneVisibility(noDevelop).swap, true, 'A Mage needing Swap enables it for the whole game')
  assertEqual(getGameZoneVisibility(noDevelop).develop, false, 'Develop stays hidden if no setup card needs it')

  const withDevelop = createGame(scenarioWithMarketCard('chromia_sphere', ['nook', 'brama']))
  assertEqual(getGameZoneVisibility(withDevelop).swap, true, 'Swap visibility is not limited to the selected Mage')
  assertEqual(getGameZoneVisibility(withDevelop).develop, true, 'A developable supply pile enables the shared zone')
  assertEqual(withDevelop.players[0]!.swapZone?.length, 6, 'Swap contents remain owned by Nook')
  assertEqual(withDevelop.developZone?.length, 0, 'The shared Develop zone starts empty')

  const withoutSwap = createGame(scenarioWithMarketCard('chromia_sphere'))
  assertEqual(getGameZoneVisibility(withoutSwap).swap, false, 'Games without Swap users do not reserve that zone')
  assertEqual(getGameZoneVisibility(withoutSwap).develop, true, 'Develop visibility stays enabled across player views')
}

function testDevelopPaymentsAndBothTransitions(): void {
  const game = createGame(scenarioWithMarketCard('chromia_sphere', ['nook', 'brama']))
  const player = game.players.find(candidate => candidate.mageType === 'nook')!
  setMainPhase(game, player.id)
  const pile = game.market.piles.find(candidate => candidate.cardId === 'chromia_sphere')!

  player.bonusAether = 2
  player.conditionalAetherEarned = { gem: 1 }
  assertEqual(getDevelopActions(game, player.id).some(action => action.source === 'supply'), false,
    'Type-restricted Aether cannot pay a Develop cost')
  const denied = developCardFromSupply(game, player.id, game.market.piles.indexOf(pile))
  assert(denied?.includes('Need 3 Aether') && denied.includes('have 2'),
    'Develop reports only unrestricted Aether as available')
  assertEqual(pile.remaining, 7, 'A failed Develop does not remove a supply copy')

  player.aetherTokens = 1
  assertEqual(getDevelopActions(game, player.id).some(action => action.source === 'supply'), true,
    'Aether tokens can pay a Develop cost')
  developCardFromSupply(game, player.id, game.market.piles.indexOf(pile))
  assertEqual(player.aetherTokens, 0, 'Develop spends Aether tokens first')
  assertEqual(player.regularAetherSpent, 2, 'Develop spends the remaining unrestricted Aether')
  assertEqual(player.conditionalAetherEarned.gem, 1, 'Develop leaves conditional Aether untouched')
  assertEqual(pile.remaining, 6, 'Developing from supply removes exactly one copy from the supply')
  assertEqual(getDevelopZoneCards(game).join(','), 'chromia_sphere', 'The developed copy enters the shared zone')
  assertEqual(player.discard.length, 0, 'Developing from supply does not gain the card')

  player.bonusAether = 3
  player.regularAetherSpent = 0
  const zoneAction = getDevelopActions(game, player.id).find(action => action.source === 'develop_zone')
  assert(zoneAction, 'An affordable shared-zone card can be developed')
  developCardFromZone(game, player.id, zoneAction.index)
  assertEqual(getDevelopZoneCards(game).length, 0, 'Developing from the shared zone removes its copy')
  assertEqual(player.discard[0], 'chromia_sphere', 'Developing from the zone gains the card to discard')
  assertEqual(pile.remaining, 6, 'Developing from the zone does not change supply count')
}

function testDevelopAndGainTriggersResolveAtTheirCorrectSources(): void {
  const jade = getCard('jade')
  const originalDevelopCost = jade.developCost
  const originalMechanics = jade.mechanics
  const originalEffects = jade.effects
  try {
    jade.developCost = 1
    jade.mechanics = [...(jade.mechanics ?? []), 'develop']
    jade.effects = [
      { trigger: { kind: 'on_gain' }, effects: [
        { kind: 'gain_pulse_token', amount: 1 },
        { kind: 'move_gained_card', destination: 'deck_top' },
      ] },
      { trigger: { kind: 'on_develop' }, effects: [{ kind: 'gain_charge', amount: 1, target: 'self' }] },
    ]
    const game = createGame(scenarioWithMarketCard('jade'))
    const player = game.players[0]!
    setMainPhase(game, player.id)
    player.bonusAether = 1
    const pileIndex = game.market.piles.findIndex(pile => pile.cardId === 'jade')

    developCardFromSupply(game, player.id, pileIndex)
    assertEqual(player.charge, 1, 'Developing from supply resolves the on_develop trigger')
    assertEqual(player.pulseTokens, 0, 'Developing from supply does not resolve on_gain')

    player.bonusAether = 1
    player.regularAetherSpent = 0
    developCardFromZone(game, player.id, 0)
    assertEqual(player.charge, 2, 'Developing from the zone also resolves on_develop')
    assertEqual(player.pulseTokens, 1, 'Gaining from the Develop zone resolves on_gain')
    assertEqual(player.deck[0], 'jade', 'A move_gained_card on_gain effect can move the developed card after it is gained')
    assertEqual(player.discard.includes('jade'), false, 'The developed card leaves discard when its on_gain effect moves it')
  } finally {
    jade.developCost = originalDevelopCost
    jade.mechanics = originalMechanics
    jade.effects = originalEffects
  }
}

function testDevelopZoneCardCountConditionDrivesChromiaSphere(): void {
  const game = createGame(scenarioWithMarketCard('chromia_sphere'))
  const player = game.players[0]!
  game.developZone = ['chromia_sphere']
  resolveCardEffects(game, player.id, 'chromia_sphere', { kind: 'on_play' })
  assertEqual(player.bonusAether, 2, 'One Chromia Sphere in Develop does not enable the bonus')

  player.bonusAether = 0
  game.developZone.push('chromia_sphere')
  resolveCardEffects(game, player.id, 'chromia_sphere', { kind: 'on_play' })
  assertEqual(player.bonusAether, 4, 'Two Chromia Spheres in Develop grant the additional Aether')
}

function testCoiledTrilliumDevelopsToTheZoneThenGainsWithoutAnImmediateEffect(): void {
  const game = createGame(scenarioWithMarketCard('coiled_trillium'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  player.bonusAether = 6
  const pileIndex = game.market.piles.findIndex(pile => pile.cardId === 'coiled_trillium')
  const pile = game.market.piles[pileIndex]!

  assertEqual(getCard('coiled_trillium').developCost, 3, 'Coiled Trillium has a three-Aether Develop cost')
  assert(getDevelopActions(game, player.id).some(action => action.source === 'supply' && action.cardId === 'coiled_trillium'),
    'Coiled Trillium can be Developed from the Supply')
  developCardFromSupply(game, player.id, pileIndex)
  assertEqual(getDevelopZoneCards(game).join(','), 'coiled_trillium', 'The first Develop moves Coiled Trillium into the shared zone')
  assertEqual(player.aetherTokens, 0, 'Developing Coiled Trillium does not grant its play effect')
  assertEqual(player.charge, 0, 'Developing Coiled Trillium has no immediate effect')

  const zoneAction = getDevelopActions(game, player.id).find(action =>
    action.source === 'develop_zone' && action.cardId === 'coiled_trillium')
  assert(zoneAction, 'A second Develop can gain Coiled Trillium from the zone')
  developCardFromZone(game, player.id, zoneAction.index)
  assertEqual(getDevelopZoneCards(game).length, 0, 'The second Develop removes it from the shared zone')
  assertEqual(player.discard[0], 'coiled_trillium', 'The second Develop gains Coiled Trillium to discard')
  assertEqual(pile.remaining, 6, 'Two Develops consume one supply copy total')
  assertEqual(player.regularAetherSpent, 6, 'Each Develop independently spends three Aether')
}

function testMarketAffordabilityRejectsFourAetherWithTwoAndMigratesMissingSpendState(): void {
  const game = createGame(scenarioWithMarketCard('coiled_trillium', ['tressa', 'brama']))
  const player = game.players[0]!
  game.pendingDecision = null
  game.pendingEffect = null
  setMainPhase(game, player.id)
  player.playerCardsInPlay = []
  player.playerCardSupplyTargets = []
  player.playerCardPowerTokens = []
  player.bonusAether = 1
  player.aetherTokens = 1
  Reflect.deleteProperty(player, 'regularAetherSpent')
  const pileIndex = game.market.piles.findIndex(pile => pile.cardId === 'coiled_trillium')
  const pile = game.market.piles[pileIndex]!

  const result = buyCard(game, player.id, pileIndex)
  assert(result?.includes('Need 4 Aether, have 2'), 'Buying a four-cost card with one Aether and one token is rejected')
  assertEqual(player.regularAetherSpent, 0, 'Missing legacy spend state is normalized before affordability checks')
  assertEqual(pile.remaining, 7, 'An unaffordable purchase leaves the pile unchanged')
  assertEqual(getBuyableCards(game).find(card => card.cardId === 'coiled_trillium')?.affordable, false,
    'The market reports the four-cost card as unaffordable with two total Aether')
  assertEqual(getDevelopActions(game, player.id).some(action =>
    action.source === 'supply' && action.cardId === 'coiled_trillium'), false,
  'A three-Aether Develop action is unavailable with two total Aether')
}

function testTressaCreatorStanceDiscountsBuyingButNotDeveloping(): void {
  const game = createGame(scenarioWithMarketCard('coiled_trillium', ['tressa', 'brama']))
  const player = game.players[0]!
  game.pendingDecision = null
  game.pendingEffect = null
  setMainPhase(game, player.id)
  player.playerCardsInPlay = ['creator_stance']
  player.playerCardSupplyTargets = [null]
  player.playerCardPowerTokens = [0]
  player.bonusAether = 1
  player.aetherTokens = 1
  const buyable = getBuyableCards(game).find(card => card.cardId === 'coiled_trillium')!

  assertEqual(buyable.cost, 3, 'Creator Stance reduces the printed four-Aether Gem purchase cost to three')
  assertEqual(buyable.affordable, false, 'Tressa cannot buy the discounted Gem with only two Aether')
  assertEqual(getDevelopActions(game, player.id).some(action =>
    action.source === 'supply' && action.cardId === 'coiled_trillium'), false,
  'Creator Stance does not reduce Coiled Trillium\'s three-Aether Develop cost')
}

function testDevelopRemainsAValidMainPhaseActionAndMigratesOldZones(): void {
  const jade = getCard('jade')
  const originalDevelopCost = jade.developCost
  const originalMechanics = jade.mechanics
  try {
    jade.developCost = 1
    jade.mechanics = [...(jade.mechanics ?? []), 'develop']
    const game = createGame(scenarioWithMarketCard('jade'))
    const player = game.players[0]!
    setMainPhase(game, player.id)
    player.hand = []
    player.breaches.forEach(breach => { breach.opened = true })
    player.charge = 0
    player.chargeThreshold = 99
    player.bonusAether = 1
    game.market.piles.forEach(pile => { if (pile.cardId !== 'jade') pile.remaining = 0 })
    assertEqual(canPlayerAct(game, player.id), true, 'An affordable Develop action prevents premature turn end')
    player.bonusAether = 0
    assertEqual(canPlayerAct(game, player.id), false, 'An unaffordable Develop action does not keep the turn open')

    player.bonusAether = 1
    delete game.developZone
    player.developZone = ['jade']
    const actions = getDevelopActions(game, player.id)
    assert(actions.some(action => action.source === 'develop_zone'), 'Old per-player Develop cards migrate to the shared zone')
    assertEqual(player.developZone, undefined, 'The old per-player Develop field is removed after migration')
    assertEqual(game.developZone?.[0], 'jade', 'Migrated cards preserve their order in the shared zone')
  } finally {
    jade.developCost = originalDevelopCost
    jade.mechanics = originalMechanics
  }
}

function testDevelopingTheLastSupplyCopyChecksDevouredPileVictory(): void {
  const game = createGame(scenarioWithMarketCard('chromia_sphere', ['jian', 'brama'], 'prince_of_gluttons'))
  const player = game.players[0]!
  setMainPhase(game, player.id)
  player.bonusAether = 3
  game.market.piles.forEach(pile => { pile.remaining = 0 })
  const pileIndex = game.market.piles.findIndex(pile => pile.cardId === 'chromia_sphere')
  game.market.piles[pileIndex]!.remaining = 1

  const message = developCardFromSupply(game, player.id, pileIndex)
  assertEqual(game.gameOver, true, 'Developing the final Supply card ends a Devoured-pile game')
  assertEqual(game.winner, 'nemesis', 'The Nemesis wins when Develop empties the final Supply pile')
  assert(message?.includes('All supply piles have been Devoured'), 'The Develop result reports the game-ending condition')
}

testDevelopZoneVisibilityIsSetupWideAndSwapCardsStayPublic()
testDevelopPaymentsAndBothTransitions()
testDevelopAndGainTriggersResolveAtTheirCorrectSources()
testDevelopZoneCardCountConditionDrivesChromiaSphere()
testCoiledTrilliumDevelopsToTheZoneThenGainsWithoutAnImmediateEffect()
testMarketAffordabilityRejectsFourAetherWithTwoAndMigratesMissingSpendState()
testTressaCreatorStanceDiscountsBuyingButNotDeveloping()
testDevelopRemainsAValidMainPhaseActionAndMigratesOldZones()
testDevelopingTheLastSupplyCopyChecksDevouredPileVictory()

console.log('Wave 9 Develop tests passed')
