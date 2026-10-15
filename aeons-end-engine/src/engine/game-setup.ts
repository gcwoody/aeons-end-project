import type {
  GameState, NemesisDifficulty, PendingDecision, Phase, PlayerId, PlayerState, ScenarioConfig,
} from '../types'
import {
  MAGES, createTwoPlayerScenario, getCard, getNemesisDefinition,
  getStartingSupplyPileCount, resolveMarketCardIds, resolveMageStartingCardId,
} from '../data'
import { getNemesisRules } from '../nemesis/registry'
import { marketPileChoices } from '../nemesis/market'
import { buildTrinketDeck } from '../data/wave9/special-decks/trinkets'
import { initializeCardInstanceZone, markCardInstanceHidden, markCardInstanceRevealed } from './card-instances'
import { captureCardInstanceLocations } from './card-movement'
import { shuffle } from './decks'
import { clone } from './utilities'

export interface GameSetupServices {
  createDecision(
    game: GameState,
    prompt: string,
    kind: PendingDecision['kind'],
    details: Record<string, unknown>,
  ): PendingDecision
  resolveMageSetups(game: GameState): string[]
}

export function playerIdForMage(mageType: string): PlayerId {
  const mage = MAGES[mageType]
  if (!mage) throw new Error(`Unknown Mage: ${mageType}`)
  return `wave${mage.wave}_${mage.type.toUpperCase()}`
}

export function buildScenarioTurnOrder(scenario: ScenarioConfig, playerIds: PlayerId[]): string[] {
  if (
    scenario.id !== 'two_player'
    || scenario.playerCount !== 2
    || scenario.turnOrderDeckSize !== 6
    || scenario.playerTurnOrderCardsPerPlayer !== 2
    || scenario.nemesisTurnOrderCards !== 2
    || playerIds.length !== 2
  ) {
    throw new Error('Only the two-player scenario is currently supported')
  }
  const cards = [
    ...playerIds.flatMap(playerId => Array.from(
      { length: scenario.playerTurnOrderCardsPerPlayer }, () => playerId,
    )),
    ...Array.from({ length: scenario.nemesisTurnOrderCards }, () => 'nemesis' as const),
  ]
  if (cards.length !== scenario.turnOrderDeckSize) {
    throw new Error(`Scenario turn-order configuration must produce ${scenario.turnOrderDeckSize} cards`)
  }
  return shuffle(cards)
}

export function createInitialGameState(
  scenarioOrMage1: ScenarioConfig | string,
  mage2Type: string | undefined,
  nemesisDifficulty: NemesisDifficulty,
  nemesisType: string,
  services: GameSetupServices,
): GameState {
  const scenario = typeof scenarioOrMage1 === 'string'
    ? createTwoPlayerScenario([scenarioOrMage1, mage2Type!], nemesisType, nemesisDifficulty)
    : scenarioOrMage1
  const mage1Def = MAGES[scenario.mageTypes[0]]
  const mage2Def = MAGES[scenario.mageTypes[1]]
  const nemesisDef = getNemesisDefinition(scenario.nemesisType)
  if (!mage1Def || !mage2Def) throw new Error('Scenario contains an unknown Mage')
  if (scenario.mageTypes[0] === scenario.mageTypes[1]) {
    throw new Error('This Mage has already been selected by another player')
  }
  if (!nemesisDef) throw new Error(`Unknown Nemesis: ${scenario.nemesisType}`)

  function createPlayer(id: string, definition: typeof mage1Def): PlayerState {
    return {
      id, mageType: definition.type,
      hp: definition.hp, maxHp: definition.hp,
      deck: definition.startDeck.map(cardId => resolveMageStartingCardId(definition.wave, cardId)),
      hand: definition.startHand.map(cardId => resolveMageStartingCardId(definition.wave, cardId)),
      discard: [],
      playedThisTurn: [],
      swapZone: [...(definition.swapZone ?? [])],
      specificDeck: definition.specificDeckShuffled
        ? shuffle(definition.specificDeck ?? [])
        : [...(definition.specificDeck ?? [])],
      knownSpecificDeckCards: [],
      mageFormSide: definition.initialFormSide,
      mageSetupComplete: !(definition.setupEffects?.length),
      drawPhaseSetupComplete: false,
      spellsCastThisTurn: 0,
      playerCardsInPlay: [],
      playerCardSupplyTargets: [],
      playerCardPowerTokens: [],
      aetherTokens: 0,
      pulseTokens: 0,
      knowledge: 0,
      doomTokens: definition.tracksDoom ? 0 : undefined,
      cardPlayCountsThisTurn: {},
      conditionalAetherEarned: {},
      regularAetherSpent: 0,
      condAetherSpent: {},
      bonusAether: 0,
      breaches: clone(definition.breaches),
      charge: 0,
      chargeThreshold: definition.chargeThreshold,
      exhausted: false,
      destroyedCards: [],
      turnEffects: {
        nextBreachCostReductions: [],
        usedPreppedEffects: [],
        usedPlayerCardEffects: [],
        usedRecallEffects: {},
        usedBreachUpgradeEffects: [],
        prepSpellLimit: 1,
        prepSpellLimitByBreach: {},
      },
    }
  }

  const player1 = createPlayer(playerIdForMage(mage1Def.type), mage1Def)
  const player2 = createPlayer(playerIdForMage(mage2Def.type), mage2Def)
  const marketPiles = resolveMarketCardIds(scenario.marketSetup).map(cardId => {
    const card = getCard(cardId)
    return { cardId, remaining: getStartingSupplyPileCount(card) }
  })
  const supplyMechanics = [...new Set(marketPiles.flatMap(pile => {
    const card = getCard(pile.cardId)
    return [...(card.mechanics ?? []), ...(card.developCost === undefined ? [] : ['develop' as const])]
  }))]
  const hasSwapZone = supplyMechanics.includes('swap') || [mage1Def, mage2Def].some(definition =>
    definition.hasSwapZone === true || (definition.swapZone?.length ?? 0) > 0,
  )
  const hasDevelopZone = supplyMechanics.includes('develop') || [mage1Def, mage2Def].some(definition =>
    definition.hasDevelopZone === true,
  )

  const nemesisDeck = nemesisDef.deckBuilder?.() ?? []
  const strikeDeck = nemesisDef.specificDeckBuilder?.() ?? []
  const corruptionDeck = nemesisDef.corruptionDeckBuilder?.() ?? []
  if (scenario.nemesisType === 'crooked_mask' && scenario.nemesisDifficulty === 'increased') {
    // Increased Difficulty gives each Mage one unseen Corruption on the
    // bottom of their starting deck. Corruption deck order is top-first.
    for (const player of [player1, player2]) {
      const corruptionId = corruptionDeck.pop()
      if (corruptionId) player.deck.push(corruptionId)
    }
  }
  const trinketDeck = buildTrinketDeck()
  const turnOrder = buildScenarioTurnOrder(scenario, [player1.id, player2.id])

  const game: GameState = {
    scenario: clone(scenario),
    players: [player1, player2],
    nemesis: {
      definitionId: nemesisDef.type,
      name: nemesisDef.name,
      type: nemesisDef.type,
      hp: nemesisDef.hp, maxHp: nemesisDef.hp,
      difficultyLevel: nemesisDef.difficultyLevel,
      difficulty: scenario.nemesisDifficulty,
      deck: nemesisDeck, discard: [],
      strikeDeck, strikeDiscard: [],
      corruptionDeck,
      corruptionDeckRevealed: corruptionDeck.map(() => false),
      counters: { ...nemesisDef.startingCounters },
      playArea: [],
      tierAnnounced: [false, false, false],
    },
    gravehold: { hp: 30, maxHp: 30 },
    market: { piles: marketPiles },
    developZone: [],
    trinketDeck,
    trinketDeckRevealed: trinketDeck.map(() => false),
    hasSwapZone,
    hasDevelopZone,
    supplyMechanics,
    turnOrderDeck: turnOrder, turnOrderDiscard: [],
    currentTurn: '', currentPhase: 'casting' as Phase,
    round: 1, gameOver: false, winner: null, timestamp: 0,
    pendingDecision: null,
    pendingEffect: null,
    pendingNemesisDiscard: null,
    nemesisResolution: null,
    decisionCounter: 0,
    damagePrevention: false,
  }

  game.nemesis.deckInstanceIds = initializeCardInstanceZone(game, game.nemesis.deck)
  game.nemesis.discardInstanceIds = initializeCardInstanceZone(game, game.nemesis.discard, true)
  game.nemesis.strikeDeckInstanceIds = initializeCardInstanceZone(game, game.nemesis.strikeDeck)
  if (nemesisDef.specificDeckVisibility === 'revealed') {
    for (const instanceId of game.nemesis.strikeDeckInstanceIds) markCardInstanceRevealed(game, instanceId)
  }
  game.nemesis.strikeDiscardInstanceIds = initializeCardInstanceZone(game, game.nemesis.strikeDiscard, true)
  game.nemesis.corruptionDeckInstanceIds = initializeCardInstanceZone(game, game.nemesis.corruptionDeck ?? [])
  game.trinketDeckInstanceIds = initializeCardInstanceZone(game, game.trinketDeck ?? [])
  for (const player of game.players) {
    player.specificDeckInstanceIds = initializeCardInstanceZone(game, player.specificDeck ?? [])
  }
  game.cardInstanceStates ??= {}
  for (const card of game.nemesis.playArea) {
    const instanceId = card.instanceId ?? `${card.cardId}:${card.placedAt}`
    card.instanceId = instanceId
    game.cardInstanceStates![instanceId] = { cardId: card.cardId, revealed: true }
    markCardInstanceRevealed(game, instanceId)
  }

  // Assign saved physical identities before setup effects can move cards.
  captureCardInstanceLocations(game)
  // The starting Mage deck has known contents and order. A later shuffle
  // explicitly clears this memory for every copy in the deck.
  for (const player of game.players) {
    for (const instanceId of player.deckInstanceIds ?? []) {
      markCardInstanceRevealed(game, instanceId)
    }
    if (scenario.nemesisType === 'crooked_mask' && scenario.nemesisDifficulty === 'increased') {
      const lastIndex = player.deck.length - 1
      const unseenCorruption = player.deckInstanceIds?.[lastIndex]
      if (unseenCorruption && getCard(player.deck[lastIndex]!).type === 'corruption') {
        // Increased Difficulty adds an unseen Corruption to the deck bottom.
        markCardInstanceHidden(game, unseenCorruption)
      }
    }
  }

  getNemesisRules(nemesisDef.rulesModuleId ?? nemesisDef.type)?.setup?.({
    game,
    definition: nemesisDef,
    marketPileChoices,
    createDecision: (prompt, kind, details) => services.createDecision(game, prompt, kind, details),
  })
  if (!game.pendingDecision && !game.pendingEffect) services.resolveMageSetups(game)
  // Setup may create or move cards; make every resulting zone identity-ready.
  captureCardInstanceLocations(game)
  return game
}
