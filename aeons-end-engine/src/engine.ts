import {
  GameState, PlayerState, Phase, Direction,
  BreachState, CardChoice, CollectiveCardChoice, CardGainDestination, CardSelectionSource, CardZone,
  DamageTargetRef, DamageTargetScope, LifeTargetRef, LifeTargetScope,
  PendingDecision, PendingDecisionAnswer, PendingEffectResolution, PendingSpellCast,
  CardEffect, CardEffectBlock, CardEffectCondition, CardEffectOption, SimultaneousEffectGroup,
  CardEffectTrigger, CardMechanic, PlayerTargetRef, PlayerTargetScope, PlayerSelectionRule, PlayerTurnEffects,
  PreppedSpellChoice, BreachChoice, TurnOrderCardChoice, MarketPileChoice, NemesisDifficulty, ScenarioConfig, PlayerId,
  NemesisCardDef, NemesisCardInPlay, NemesisDiscardCost, NemesisEffectTrigger,
  NemesisResolutionState, PendingNemesisDiscard, EffectAmount, AdditionalDamage, CardMoveZoneAddress,
} from './types'
import {
  getCard, MAGES, rageborne, getNemesisDefinition, COMMON_BREACH_OPEN_COSTS,
} from './data'
import { buildScenarioTurnOrder, createInitialGameState, playerIdForMage } from './engine/game-setup'
import { getNemesisRules } from './nemesis/registry'
import { leastExpensiveMarketPiles, marketPileChoices } from './nemesis/market'
import { buildTrinketDeck } from './data/wave9/special-decks/trinkets'
import { advanceBreachFocus, canPrepOnBreach, isPresentBreach, rotateDirection } from './engine/breaches'
import { drawFromDeck, ensureDeckForReveal, preparePlayerDeckForReveal, shuffle } from './engine/decks'
import {
  breachCostReduction, consumeBreachCostReductions, getAllRemainingConditional,
  getConditionalAetherByType, getRemainingConditionalAether, getSpendableAether,
  getTotalAether, spendAether,
} from './engine/aether'
import type { SpendType } from './engine/aether'
import {
  ensurePlayerCollections, getPrepSpellLimit, getPlayerTurnEffects,
  createPreppedSpellInstanceId, getZoneCards, hasUsedPreppedSpellEffect, isFaceDownPreppedSpell,
  MAX_PULSE_TOKENS, preppedSpellEffectMarker,
} from './engine/player-state'
import {
  getSpellDamagePreview as previewSpellDamage,
  getSpellDamagePreviewRange as previewSpellDamageRange,
} from './engine/spell-damage-preview'
import type { SpellDamagePreviewRange } from './engine/spell-damage-preview'
import {
  conditionMatches as evaluateEffectCondition,
  matchingBlocks as findMatchingEffectBlocks,
} from './engine/effect-conditions'
import type { EffectConditionServices } from './engine/effect-conditions'
import { createNemesisTurnRuntime } from './engine/nemesis-turn'
import type { NemesisDiscardAction as NemesisDiscardActionType } from './engine/nemesis-turn'
import { createEffectResolver } from './engine/effect-resolution'
import { gainPlayerCharge } from './engine/charge-feedback'
import { createDecisionResolver } from './engine/decision-resolution'
import {
  checkGameOver as combatCheckGameOver,
  checkPlayerDeath as combatCheckPlayerDeath,
  damageNemesis as combatDamageNemesis,
  dealDamage as combatDealDamage,
  finishGame as combatFinishGame,
  sufferPlayerDamage as combatSufferPlayerDamage,
} from './engine/combat'
import {
  ensureSharedDevelopZone, ensureTrinketDeckState, getDevelopZoneCards, getGameZoneVisibility, getPlayer, getSupplyMechanics,
  drawPlayerDeckCards, getTrinketDeckCards, isTrinketDeckCardRevealed,
  preparePlayerDeckForRevealWithInstances, putPlayerCardInDeck, returnCorruptionToBottom,
} from './engine/zones'
import {
  createCardInstance, ensureCardInstanceZone, insertCardInstanceAt, markCardInstanceRevealed,
} from './engine/card-instances'
import {
  createCardInZone, destroyCardFromZone, drawPlayerCardsToHand, getBreachCardInstanceZone,
  getBreachAttachedRelicZone, getNemesisCardInstanceZone, getNemesisCardStackZone, getPlayerCardInstanceZone, getSharedDevelopCardInstanceZone,
  moveCardBetweenZones, placeTemporaryCardInZone,
} from './engine/card-movement'
import {
  automaticallyAllocateDamage, effectTargetPlayerId, gainLife, getDamageTargets, getDoomOwner,
  getEffectPlayerTargets, getLifeTargets, getPlayerTargets, getSelectedDamagePlayerTargets,
  getSelectedPlayerTargets,
} from './engine/targets'

export { rotateDirection } from './engine/breaches'
export { clone } from './engine/utilities'
export { playerIdForMage } from './engine/game-setup'
export { getLifeTargets, getPlayerTargets, gainLife, getDamageTargets } from './engine/targets'
export { drawFromDeck, shuffle } from './engine/decks'
export * from './engine/card-movement'
export { getPrepSpellLimit, getPlayerTurnEffects, MAX_PULSE_TOKENS } from './engine/player-state'
export {
  drawPlayerDeckCards, ensurePlayerDeckInstances, getDevelopZoneCards, getGameZoneVisibility, getPlayer, getSupplyMechanics,
  isPlayerDeckCardRevealed, putPlayerCardInDeck,
  getTrinketDeckCards, isTrinketDeckCardRevealed, isCorruptionDeckCardRevealed,
  isNemesisDeckCardRevealed, isNemesisSpecificDeckCardRevealed,
  isSpecificDeckCardRevealed, returnNemesisDiscardCardToDeck,
} from './engine/zones'
export {
  getAllRemainingConditional, getConditionalAetherByType, getRemainingConditionalAether, getTotalAether,
} from './engine/aether'
export type { SpendType } from './engine/aether'
export type { NemesisDiscardAction } from './engine/nemesis-turn'
export const checkGameOver = combatCheckGameOver
export const checkPlayerDeath = combatCheckPlayerDeath
export const damageNemesis = combatDamageNemesis
export const dealDamage = combatDealDamage
export const sufferPlayerDamage = combatSufferPlayerDamage
const finishGame = combatFinishGame

// ===== Utilities =====

const DIR_ARROW: Record<string, string> = { east: '→', south: '↓', west: '←', north: '↑' }

/** Use the shared index/direction table, including for existing saves whose cached map may be stale. */
function currentBreachOpenCost(breach: BreachState): number {
  return COMMON_BREACH_OPEN_COSTS[breach.index]?.[breach.focusDirection]
    ?? breach.openCost[breach.focusDirection]
}

// ===== Game Init =====

export function createGame(scenario: ScenarioConfig): GameState
export function createGame(
  mage1Type: string,
  mage2Type: string,
  nemesisDifficulty?: NemesisDifficulty,
  nemesisType?: string,
): GameState
export function createGame(
  scenarioOrMage1: ScenarioConfig | string,
  mage2Type?: string,
  nemesisDifficulty: NemesisDifficulty = 'standard',
  nemesisType = rageborne.type,
): GameState {
  return createInitialGameState(scenarioOrMage1, mage2Type, nemesisDifficulty, nemesisType, {
    createDecision: (game, prompt, kind, details) => createDecision(game, prompt, kind, details),
    resolveMageSetups,
  })
}
/** Resolve any Mage-specific choices that are required before turn one. */
export function resolveMageSetups(g: GameState): string[] {
  if (g.pendingDecision || g.pendingEffect) return []
  const messages: string[] = []
  for (const player of g.players) {
    if (player.mageSetupComplete) continue
    const setupEffects = MAGES[player.mageType]?.setupEffects ?? []
    player.mageSetupComplete = true
    if (setupEffects.length > 0) {
      messages.push(...resolveEffects(g, player.id, setupEffects, `setup:${player.mageType}`, 0, player.id))
    }
    if (g.pendingDecision || g.pendingEffect) break
  }
  return messages
}

// ===== Turn Management =====

function clearFocusedBreachMarkers(g: GameState): void {
  for (const player of g.players) {
    for (const breach of player.breaches) breach.focusedThisTurn = false
  }
}

export function startTurn(g: GameState): GameState {
  g.damagePrevention = false
  if (g.turnOrderDeck.length === 0) {
    if (g.nemesis.turnOrderDeckResetCardId) {
      const nemesisCards = g.turnOrderDiscard.filter(cardId => cardId === 'nemesis')
      const playerCards = g.turnOrderDiscard.filter(cardId => cardId !== 'nemesis')
      g.turnOrderDeck = [...nemesisCards, ...shuffle(playerCards)]
      const cardId = g.nemesis.turnOrderDeckResetCardId
      const stationedIndex = g.nemesis.setAsideCards?.findIndex(card =>
        card.cardId === cardId && (!g.nemesis.turnOrderDeckResetCardInstanceId ||
          card.instanceId === g.nemesis.turnOrderDeckResetCardInstanceId),
      ) ?? -1
      const stationedCard = stationedIndex >= 0
        ? g.nemesis.setAsideCards!.splice(stationedIndex, 1)[0]
        : undefined
      const instanceId = g.nemesis.turnOrderDeckResetCardInstanceId ?? stationedCard?.instanceId
        ?? createCardInstance(g, cardId, true).instanceId
      insertCardInstanceAt(g, g.nemesis.discard, g.nemesis.discardInstanceIds ??= [], {
        cardId, instanceId, revealed: true,
      }, 0, true)
      g.nemesis.turnOrderDeckResetCardId = undefined
      g.nemesis.turnOrderDeckResetCardInstanceId = undefined
    } else {
      g.turnOrderDeck = buildScenarioTurnOrder(g.scenario, g.players.map(player => player.id))
    }
    g.turnOrderDiscard = []
    g.round++
  }
  const turn = g.turnOrderDeck.shift()!
  g.turnOrderDiscard.push(turn)
  g.currentTurn = turn
  g.timestamp++

  // A focus marker is only valid for the turn in which it was created. Clear
  // it at every turn boundary so a Breach focused during the Nemesis turn (or
  // another Mage's turn) cannot become prep-eligible on the next Mage's turn.
  clearFocusedBreachMarkers(g)

  g.currentPhase = turn === 'nemesis' ? 'nemesis_main' : 'casting'
  if (turn === 'nemesis') initializeNemesisTurn(g)
  else if (g.nemesis.corruptionDeck) {
    const player = getPlayer(g, turn)
    player.corruptionsDrawnThisTurn = []
    if (player.hand.some(cardId => getCard(cardId).type === 'corruption')) {
      g.pendingCorruptionStartPlayerId = player.id
    } else {
      g.pendingCorruptionStartPlayerId = undefined
    }
  }
  queueTurnOrderCardDrawnAbilities(g)
  return g
}

function gainPulseTokens(player: PlayerState, requestedAmount: number): number {
  ensurePlayerCollections(player)
  const amount = Math.max(0, Math.floor(requestedAmount))
  const gained = Math.min(amount, MAX_PULSE_TOKENS - player.pulseTokens!)
  player.pulseTokens! += gained
  return gained
}

function losePulseTokens(player: PlayerState, requestedAmount: number): number {
  ensurePlayerCollections(player)
  const amount = Math.max(0, Math.floor(requestedAmount))
  if (player.pulseTokens! < amount) return 0
  player.pulseTokens! -= amount
  return amount
}

/** Queue the optional abilities that trigger immediately after a turn-order draw. */
function queueTurnOrderCardDrawnAbilities(g: GameState): void {
  const candidate = g.players.find(player => {
    const def = MAGES[player.mageType]
    return player.charge >= player.chargeThreshold
      && !!def
      && def.abilityEffects.length > 0
      && def.abilityTrigger.kind === 'turn_order_card_drawn'
  })
  if (!candidate) return
  const def = MAGES[candidate.mageType]!
  resolveEffects(
    g,
    candidate.id,
    [{ kind: 'activate_ability', mageId: candidate.id }],
    `ability:${def.abilityName}`,
  )
}

function pendingActionMessage(g: GameState): string | null {
  return g.pendingDecision ? 'Resolve the pending card decision first' : null
}

/** Return the Breaches that can legally receive a spell from hand right now. */
export function getSpellBreachTargets(
  g: GameState, playerId: string, cardId: string,
): number[] {
  if (g.currentPhase !== 'main' || g.currentTurn !== playerId || pendingActionMessage(g)) return []
  const player = g.players.find(candidate => candidate.id === playerId)
  if (!player) return []
  if (!player.hand.includes(cardId)) return []
  const card = getCard(cardId)
  if (card.type !== 'spell') return []
  return player.breaches
    .filter(breach => isPresentBreach(breach)
      && breach.prepSpells.length < getPrepSpellLimit(player, breach.index)
      && canPrepOnBreach(breach, card.prepToClosedBreach === true))
    .map(breach => breach.index)
}

// ===== Card Zones, Gain, and Destruction =====

export function getCardChoices(
  g: GameState, playerId: string, source: CardSelectionSource,
): CardChoice[] {
  const p = getPlayer(g, playerId)
  const choices: CardChoice[] = []
  const addZone = (zone: CardZone, predicate: (cardId: string) => boolean = () => true) => {
    for (const [index, cardId] of getZoneCards(p, zone).entries()) {
      if (!predicate(cardId)) continue
      choices.push({ zone, index, cardId, cardName: getCard(cardId).name })
    }
  }

  if (source === 'hand') addZone('hand')
  if (source === 'discard') addZone('discard')
  if (source === 'deck') addZone('deck')
  if (source === 'hand_or_discard') {
    addZone('hand')
    addZone('discard')
  }
  if (source === 'deck_or_discard') {
    addZone('deck')
    addZone('discard')
  }
  if (source === 'played_gem_this_turn') {
    addZone('played_this_turn', cardId => getCard(cardId).type === 'gem')
  }
  if (source === 'played_this_turn') addZone('played_this_turn')
  if (source === 'swap_zone') addZone('swap_zone')
  if (source === 'specific_deck') addZone('specific_deck')
  if (source === 'player_cards_in_play') addZone('player_cards_in_play')
  return choices
}

function getCollectiveCardChoices(g: GameState, source: 'hand'): CollectiveCardChoice[] {
  return g.players.flatMap(player => getCardChoices(g, player.id, source)
    .map(choice => ({ playerId: player.id, choice })))
}

function selectedCollectiveCardsAreCurrent(
  g: GameState,
  candidates: CollectiveCardChoice[],
  selected: CollectiveCardChoice[],
): boolean {
  const candidateKeys = new Set(candidates.map(item =>
    `${item.playerId}:${item.choice.zone}:${item.choice.index}:${item.choice.cardId}`))
  const selectedKeys = new Set<string>()
  for (const item of selected) {
    const key = `${item.playerId}:${item.choice.zone}:${item.choice.index}:${item.choice.cardId}`
    if (selectedKeys.has(key) || !candidateKeys.has(key)) return false
    const player = getPlayer(g, item.playerId)
    if (getZoneCards(player, item.choice.zone)[item.choice.index] !== item.choice.cardId) return false
    selectedKeys.add(key)
  }
  return true
}

function discardCollectiveCards(
  g: GameState, selected: CollectiveCardChoice[], preserveSelectionOrder = false,
): string[] {
  const valid = selected.filter(item => {
    const player = getPlayer(g, item.playerId)
    return getZoneCards(player, item.choice.zone)[item.choice.index] === item.choice.cardId
  })
  const grouped = new Map<string, Array<CollectiveCardChoice & { instanceId: string }>>()
  for (const item of valid) {
    const source = getPlayerCardInstanceZone(g, item.playerId, item.choice.zone)
    const instanceId = source.instanceIds[item.choice.index]
    if (!instanceId) continue
    const group = grouped.get(item.playerId) ?? []
    group.push({ ...item, instanceId })
    grouped.set(item.playerId, group)
  }
  for (const [playerId, items] of grouped) {
    const discard = getPlayerCardInstanceZone(g, playerId, 'discard')
    const ordered = preserveSelectionOrder ? items : [...items].sort((a, b) => b.choice.index - a.choice.index)
    for (const item of ordered) {
      const source = getPlayerCardInstanceZone(g, playerId, item.choice.zone)
      const sourceIndex = source.instanceIds.indexOf(item.instanceId)
      if (sourceIndex < 0) continue
      moveCardBetweenZones(g, source, sourceIndex, discard, 0, 'discard')
    }
  }
  if (preserveSelectionOrder) return valid.map(item => item.choice.cardId)
  return [...grouped.values()].flatMap(items =>
    [...items].sort((a, b) => b.choice.index - a.choice.index).map(item => item.choice.cardId),
  )
}

/** Return every currently prepped spell, including spells belonging to allies. */
export function getPreppedSpellChoices(g: GameState): PreppedSpellChoice[] {
  const choices: PreppedSpellChoice[] = []
  for (const player of g.players) {
    for (const breach of player.breaches) {
      if (!isPresentBreach(breach)) continue
      for (const [spellIndex, cardId] of breach.prepSpells.entries()) {
        choices.push({
          playerId: player.id,
          breachIndex: breach.index,
          spellIndex,
          cardId,
          cardName: getCard(cardId).name,
        })
      }
    }
  }
  return choices
}

/** Return the rules cost of a prepared card (Conjure face-down cards cost 2). */
export function getPreppedSpellCost(
  g: GameState, playerId: string, breachIndex: number, spellIndex: number,
): number | null {
  const player = getPlayer(g, playerId)
  const breach = player.breaches.find(item => item.index === breachIndex)
  const cardId = breach?.prepSpells[spellIndex]
  if (!breach || !cardId) return null
  return isFaceDownPreppedSpell(breach, spellIndex) ? 2 : getCard(cardId).cost
}

function getBreachChoices(g: GameState, target: 'self' | 'ally' | 'any_player', playerId: string): BreachChoice[] {
  const players = target === 'self'
    ? [getPlayer(g, playerId)]
    : target === 'ally'
      ? g.players.filter(player => player.id !== playerId)
      : g.players
  return players.flatMap(player => player.breaches
    .filter(breach => isPresentBreach(breach) && !breach.opened && breach.focusCount < breach.focusToOpen)
    .map(breach => ({
      playerId: player.id,
      breachIndex: breach.index,
      playerName: player.mageType,
      focusCost: breach.focusCost,
      focusCount: breach.focusCount,
      focusToOpen: breach.focusToOpen,
    })))
}

/** Return every Breach that can be destroyed as part of a player's exhaustion. */
function getExhaustBreachChoices(g: GameState, playerId: string): BreachChoice[] {
  const player = getPlayer(g, playerId)
  return player.breaches
    .filter(breach => isPresentBreach(breach) && !breach.indestructible)
    .map(breach => ({
      playerId: player.id,
      breachIndex: breach.index,
      playerName: player.mageType,
      focusCost: breach.focusCost,
      focusCount: breach.focusCount,
      focusToOpen: breach.focusToOpen,
    }))
}

function applyFreeBreachFocus(g: GameState, choice: BreachChoice): string {
  const player = getPlayer(g, choice.playerId)
  const breach = player.breaches.find(item => item.index === choice.breachIndex)
  if (!breach || !isPresentBreach(breach) || breach.opened || breach.focusCount >= breach.focusToOpen) {
    return 'The selected breach is no longer available'
  }
  const opened = advanceBreachFocus(breach)
  if (!opened) {
    return `Focused ${player.mageType}'s Breach ${toRoman(breach.index)} (${breach.focusCount}/${breach.focusToOpen})`
  }
  return `${player.mageType}'s Breach ${toRoman(breach.index)} OPENED!`
}

/** Destroy a Breach and move every spell prepared on it to its owner's discard pile. */
function destroyExhaustedBreach(g: GameState, choice: BreachChoice): string {
  const player = getPlayer(g, choice.playerId)
  const breach = player.breaches.find(item => item.index === choice.breachIndex)
  if (!breach || !isPresentBreach(breach) || breach.indestructible) return 'The selected breach is no longer available'

  const prepared = [...breach.prepSpells]
  // Keep all moved cards available in the discard pile. Their exact order is
  // immaterial to the rules, while unshifting preserves the normal discard
  // convention used by the rest of the engine.
  const source = getBreachCardInstanceZone(g, player.id, breach.index)
  const discard = getPlayerCardInstanceZone(g, player.id, 'discard')
  while (source.cards.length > 0) {
    moveCardBetweenZones(g, source, 0, discard, 0, 'destroy')
  }
  if (breach.attachedRelic) {
    const attached = breach.attachedRelic
    const attachedZone = getBreachAttachedRelicZone(g, player.id, breach.index)
    const ownerDiscard = getPlayerCardInstanceZone(g, attached.ownerId, 'discard')
    if (attachedZone) moveCardBetweenZones(g, attachedZone, 0, ownerDiscard, 0, 'destroy')
  }
  breach.prepSpells = []
  breach.preppedThisTurn = []
  breach.preppedSpellFaceDown = []
  breach.preppedSpellInstanceIds = []
  breach.present = false
  breach.opened = false
  breach.focusedThisTurn = false
  return prepared.length > 0
    ? `${player.mageType} destroys Breach ${toRoman(breach.index)} and discards ${prepared.length} prepared spell(s)`
    : `${player.mageType} destroys Breach ${toRoman(breach.index)}`
}

/** Move selected prepped spells to their owners' discard piles. */
function discardPreppedSpellChoices(
  g: GameState, choices: PreppedSpellChoice[], preserveSelectionOrder = false,
): string[] {
  const valid = choices.filter(choice => {
    const owner = getPlayer(g, choice.playerId)
    const breach = owner.breaches.find(item => item.index === choice.breachIndex)
    return !!breach && breach.prepSpells[choice.spellIndex] === choice.cardId
  })
  const ordered = preserveSelectionOrder ? valid : [...valid].sort((a, b) =>
    a.playerId.localeCompare(b.playerId) || a.breachIndex - b.breachIndex || b.spellIndex - a.spellIndex)
  const selected = ordered.flatMap(choice => {
    const source = getBreachCardInstanceZone(g, choice.playerId, choice.breachIndex)
    const instanceId = source.instanceIds[choice.spellIndex]
    return instanceId ? [{ choice, instanceId }] : []
  })
  for (const item of selected) {
    const source = getBreachCardInstanceZone(g, item.choice.playerId, item.choice.breachIndex)
    const sourceIndex = source.instanceIds.indexOf(item.instanceId)
    const discard = getPlayerCardInstanceZone(g, item.choice.playerId, 'discard')
    if (sourceIndex >= 0) moveCardBetweenZones(g, source, sourceIndex, discard, 0, 'discard')
  }
  return ordered.map(choice => choice.cardName)
}

function cardNameMatchesAny(cardId: string, nameIncludes: string[]): boolean {
  const name = getCard(cardId).name
  return nameIncludes.some(fragment => name.includes(fragment))
}

function gainSwapZoneCard(g: GameState, p: PlayerState, choice: CardChoice): string | null {
  const swapZone = getPlayerCardInstanceZone(g, p.id, 'swap_zone')
  if (choice.zone !== 'swap_zone' || swapZone.cards[choice.index] !== choice.cardId) return null
  const discard = getPlayerCardInstanceZone(g, p.id, 'discard')
  return moveCardBetweenZones(g, swapZone, choice.index, discard, 0, 'gain')?.cardId ?? null
}

/** Place a Mage-specific card face-up in the Player cards in play area. */
function putPlayerCardIntoPlay(
  g: GameState, playerId: string, cardId: string, actorPlayerId = playerId,
  restoreContext: CardEffect = {
    kind: 'restore_effect_context', sourcePlayerId: actorPlayerId,
    sourceCardOwnerId: actorPlayerId, effectPlayerId: actorPlayerId,
  },
  instanceId?: string,
): CardEffect[] {
  const player = getPlayer(g, playerId)
  ensurePlayerCollections(player)
  const inPlay = getPlayerCardInstanceZone(g, player.id, 'player_cards_in_play')
  if (instanceId && !inPlay.instanceIds.includes(instanceId)) {
    placeTemporaryCardInZone(g, instanceId, cardId,
      { zoneId: `temporary:specific_deck:${player.id}`, zone: 'temporary', ownerId: player.id, index: 0 },
      inPlay, inPlay.cards.length, 'gain', true)
  } else if (!instanceId) {
    createCardInZone(g, inPlay, cardId, inPlay.cards.length, 'gain', true)
  }
  return matchingBlocks(cardId, playerId, g, { kind: 'on_put_into_play' }, undefined,
    playerId, undefined, actorPlayerId).flatMap(block => {
      const contextualBlock = {
        ...block,
        effects: block.effects.map(effect =>
          effect.kind === 'set_next_to_supply_pile' ? { ...effect, cardId } : effect,
        ),
      }
      return contextualizeCardEffectBlock(
        contextualBlock, cardId, playerId, actorPlayerId, restoreContext,
      )
    })
}

function findPlayerCardInPlayIndex(
  p: PlayerState, cardId: string, preferredIndex?: number,
): number {
  ensurePlayerCollections(p)
  if (preferredIndex !== undefined && p.playerCardsInPlay![preferredIndex] === cardId) return preferredIndex
  return p.playerCardsInPlay!.lastIndexOf(cardId)
}

function setPlayerCardSupplyTarget(
  g: GameState, playerId: string, cardId: string, pileIndex: number,
): boolean {
  const player = getPlayer(g, playerId)
  const index = findPlayerCardInPlayIndex(player, cardId)
  if (index < 0) return false
  player.playerCardSupplyTargets![index] = pileIndex
  return true
}

function playerCardSupplyTarget(
  p: PlayerState, cardIndex: number,
): number | null {
  ensurePlayerCollections(p)
  return p.playerCardSupplyTargets?.[cardIndex] ?? null
}

function playerCardPowerTokenCount(
  p: PlayerState, cardId: string, preferredIndex?: number,
): number {
  const index = findPlayerCardInPlayIndex(p, cardId, preferredIndex)
  return index < 0 ? 0 : p.playerCardPowerTokens?.[index] ?? 0
}

function collectPlayerCardTriggerEffects(
  g: GameState, trigger: CardEffectTrigger, actorPlayerId: string,
  restoreContext: CardEffect = { kind: 'restore_effect_context', sourcePlayerId: actorPlayerId },
): CardEffect[] {
  const effects: CardEffect[] = []
  for (const owner of g.players) {
    ensurePlayerCollections(owner)
    for (const cardId of owner.playerCardsInPlay ?? []) {
      for (const block of matchingBlocks(cardId, owner.id, g, trigger, undefined,
        actorPlayerId, undefined, actorPlayerId)) {
        const blockActorId = block.effectPlayerScope === 'owner' ? owner.id : actorPlayerId
        effects.push(
          { ...restoreContext, kind: 'restore_effect_context', sourcePlayerId: blockActorId,
            sourceCardOwnerId: owner.id, sourceCardId: cardId, effectPlayerId: blockActorId } as Extract<CardEffect, { kind: 'restore_effect_context' }>,
          ...block.effects.map(effect => effect.kind === 'gain_power_token'
            ? { ...effect, playerId: owner.id }
            : effect),
          { ...restoreContext, preserveSpellDamageState: true } as Extract<CardEffect, { kind: 'restore_effect_context' }>,
        )
      }
    }
  }
  return effects
}

function collectBreachOpenedEffects(
  g: GameState, actorPlayerId: string,
  restoreContext: CardEffect = { kind: 'restore_effect_context', sourcePlayerId: actorPlayerId },
): CardEffect[] {
  const inPlayEffects = collectPlayerCardTriggerEffects(
    g, { kind: 'on_breach_open' }, actorPlayerId, restoreContext,
  )
  const preppedEffects = g.players.flatMap(owner => owner.breaches
    .filter(isPresentBreach)
    .flatMap(breach => breach.prepSpells.flatMap(cardId =>
      matchingBlocks(cardId, owner.id, g, { kind: 'on_breach_open' }, undefined,
        actorPlayerId, undefined, actorPlayerId).flatMap(block => {
          const blockActorId = block.effectPlayerScope === 'owner' ? owner.id : actorPlayerId
          return [
            { ...restoreContext, sourcePlayerId: blockActorId, sourceCardOwnerId: owner.id,
              sourceCardId: cardId, effectPlayerId: blockActorId },
            ...block.effects,
            { ...restoreContext, preserveSpellDamageState: true } as Extract<CardEffect, { kind: 'restore_effect_context' }>,
          ]
        }),
    )),
  )
  return [...inPlayEffects, ...preppedEffects]
}

export function resolvePlayerInPlayPhaseEffects(
  g: GameState,
  playerId: string,
  phase: 'casting_phase_end' | 'end_turn_before_draw',
): string[] {
  const player = getPlayer(g, playerId)
  ensurePlayerCollections(player)
  const turnEffects = getPlayerTurnEffects(player)
  const effects: CardEffect[] = []
  for (const [cardIndex, cardId] of (player.playerCardsInPlay ?? []).entries()) {
    const blocks = matchingBlocks(cardId, player.id, g, { kind: 'while_in_play', phase }, cardIndex)
    for (const [blockIndex, block] of blocks.entries()) {
      if (block.oncePerTurn) {
        const marker = `in_play:${cardId}:${cardIndex}:${phase}:${blockIndex}`
        if (turnEffects.usedPlayerCardEffects!.includes(marker)) continue
        turnEffects.usedPlayerCardEffects!.push(marker)
      }
      const effectPlayer = block.effectPlayerScope === 'owner' ? player.id : playerId
      effects.push(
        {
          kind: 'restore_effect_context', sourcePlayerId: effectPlayer,
          sourceCardOwnerId: player.id, sourceCardId: cardId, effectPlayerId: effectPlayer,
        },
        ...block.effects,
        { kind: 'restore_effect_context', sourcePlayerId: playerId },
      )
    }
  }
  return effects.length > 0
    ? resolveEffects(g, playerId, effects, undefined, 0, playerId)
    : []
}

function resolveBreachOpenedEffects(g: GameState, playerId: string): string[] {
  const effects = collectBreachOpenedEffects(g, playerId)
  return effects.length > 0 ? resolveEffects(g, playerId, effects, undefined, 0, playerId) : []
}

function getSupplyPileGainEffects(
  g: GameState,
  pileIndex: number,
  gainingPlayerId: string,
  gainedCardId: string,
  destination: CardGainDestination,
  restoreContext: CardEffect = {
    kind: 'restore_effect_context', sourcePlayerId: gainingPlayerId,
    sourceCardOwnerId: gainingPlayerId, sourceCardId: gainedCardId,
    effectPlayerId: gainingPlayerId,
  },
): CardEffect[] {
  const attachedCardEffects = g.players.flatMap(owner => {
    ensurePlayerCollections(owner)
    return (owner.playerCardsInPlay ?? []).flatMap((placedCardId, cardIndex) => {
      if (playerCardSupplyTarget(owner, cardIndex) !== pileIndex) return []
      return matchingBlocks(placedCardId, owner.id, g, { kind: 'on_gain_from_supply_pile' },
        undefined, owner.id, undefined, gainingPlayerId).flatMap(block =>
        contextualizeCardEffectBlock(block, placedCardId, owner.id, gainingPlayerId, restoreContext))
    })
  })
  const mageFormEffects = g.players.flatMap(owner => (owner.specificDeck ?? []).flatMap(formCardId => {
    if (getCard(formCardId).type !== 'mage_form') return []
    return matchingBlocks(
      formCardId, owner.id, g, { kind: 'on_gain_from_supply_pile' }, undefined, owner.id,
      undefined, gainingPlayerId,
    ).flatMap(block => {
      const contextualBlock = {
        ...block,
        effects: block.effects.map(effect => effect.kind === 'resolve_mage_form_supply_gain'
          ? {
              ...effect,
              formCardId,
              formOwnerId: owner.id,
              gainingPlayerId,
              gainedCardId,
              destination,
            }
          : effect),
      }
      return contextualizeCardEffectBlock(
        contextualBlock, formCardId, owner.id, gainingPlayerId, restoreContext,
      )
    })
  }))
  return [...attachedCardEffects, ...mageFormEffects]
}

function moveGainedSupplyCardToDeck(
  g: GameState,
  effect: Extract<CardEffect, { kind: 'resolve_mage_form_supply_gain' }>,
  recipientId: string,
): string[] {
  if (!effect.formOwnerId || !effect.gainingPlayerId || !effect.gainedCardId) {
    return ['The gained supply card is no longer available']
  }
  const owner = getPlayer(g, effect.formOwnerId)
  const gainer = getPlayer(g, effect.gainingPlayerId)
  const recipient = getPlayer(g, recipientId)
  ensurePlayerCollections(gainer)
  const zones = effect.destination === 'deck_top'
    ? [gainer.deck, gainer.discard, gainer.hand]
    : [gainer.discard, gainer.deck, gainer.hand]
  let gainedCard: string | undefined
  for (const zone of zones) {
    const index = zone.indexOf(effect.gainedCardId)
    if (index < 0) continue
    gainedCard = zone.splice(index, 1)[0]
    break
  }
  if (!gainedCard) return ['The gained supply card is no longer available']

  putPlayerCardInDeck(g, recipient, gainedCard, 'top')
  const chargePlayer = effect.formSide === 'giver' ? owner : gainer
  const gainedCharge = gainPlayerCharge(g, chargePlayer, 1)
  owner.mageFormSide = effect.formSide === 'giver' ? 'taker' : 'giver'

  const messages = [`Placed ${getCard(gainedCard).name} on top of ${recipient.mageType}'s deck`]
  messages.push(gainedCharge > 0
    ? `${chargePlayer.mageType} gains 1 charge (${chargePlayer.charge}/${chargePlayer.chargeThreshold})`
    : `${chargePlayer.mageType} cannot gain more charge`)
  messages.push(`${owner.mageType}'s Form changes to ${owner.mageFormSide === 'giver' ? 'Giver' : 'Taker'}`)
  return messages
}

/** Permanently remove a selected card from a player's card zones. */
export function destroyCard(g: GameState, playerId: string, choice: CardChoice): string | null {
  const p = getPlayer(g, playerId)
  ensurePlayerCollections(p)
  const cards = getZoneCards(p, choice.zone)
  if (cards[choice.index] !== choice.cardId) return 'Card selection is no longer valid'

  const sourceZone = getPlayerCardInstanceZone(g, p.id, choice.zone)
  const cardId = destroyCardFromZone(g, sourceZone, choice.index)
  if (!cardId) return 'Card not found'
  return getCard(cardId).returnToSwapZoneOnDestroy
    ? `${getCard(cardId).name} returns to the Swap zone`
    : `Destroyed ${getCard(cardId).name}`
}

/** Gain a card into the requested top-of-pile destination. */
export function gainCard(
  g: GameState,
  playerId: string,
  cardId: string,
  destination: CardGainDestination = 'discard_top',
  marketPileIndex?: number,
  triggerEffects = true,
  specificPile = false,
): string | null {
  if (triggerEffects) {
    const blocked = pendingActionMessage(g)
    if (blocked) return blocked
  }
  const card = getCard(cardId)
  if (!card) return `Unknown card: ${cardId}`

  let marketSource: CardMoveZoneAddress | undefined

  if (specificPile && getNemesisCardInstanceZone(g, 'strike_deck').cards[0] !== cardId) {
    return 'The top specific-pile card is no longer available'
  }

  if (marketPileIndex !== undefined) {
    const pile = g.market.piles[marketPileIndex]
    if (!pile || pile.cardId !== cardId) return 'Invalid market pile'
    if (pile.remaining <= 0) return 'Pile empty'
    pile.remaining--
    marketSource = {
      zoneId: `supply:${marketPileIndex}`,
      zone: 'supply',
      ownerId: null,
      index: pile.remaining,
    }
    if (usesDevouredPile(g) && g.market.piles.every(candidate => candidate.remaining <= 0)) {
      finishGame(g, 'nemesis')
    }
  }
  const p = getPlayer(g, playerId)
  if (specificPile) {
    const source = getNemesisCardInstanceZone(g, 'strike_deck')
    if (source.cards[0] !== cardId) return 'The top specific-pile card is no longer available'
    const target = destination === 'deck_top'
      ? getPlayerCardInstanceZone(g, playerId, 'deck')
      : getPlayerCardInstanceZone(g, playerId, 'discard')
    const moved = moveCardBetweenZones(g, source, 0, target, 0, 'gain')
    if (!moved) return 'The top specific-pile card is no longer available'
  } else if (destination === 'deck_top') {
    putPlayerCardInDeck(g, p, cardId, 'top', marketSource)
  } else {
    createCardInZone(g, getPlayerCardInstanceZone(g, playerId, 'discard'), cardId, 0, 'gain', true, marketSource)
  }
  const message = `Gained ${card.name} -> ${destination === 'deck_top' ? 'deck' : 'discard pile'}`
  if (!triggerEffects) return message
  const effectMessages = resolveCardEffects(g, playerId, cardId, { kind: 'on_gain' }, cardId)
  if (marketPileIndex !== undefined) {
    const restoreContext: CardEffect = g.pendingEffect
      ? captureEffectContext(g.pendingEffect)
      : {
          kind: 'restore_effect_context', sourcePlayerId: playerId,
          sourceCardOwnerId: playerId, sourceCardId: cardId, effectPlayerId: playerId,
        }
    const placedEffects = getSupplyPileGainEffects(
      g, marketPileIndex, playerId, cardId, destination, restoreContext,
    )
    if (placedEffects.length > 0) {
      if (g.pendingEffect) {
        g.pendingEffect.remainingEffects.push(...placedEffects)
      } else {
        effectMessages.push(...resolveEffects(
          g, playerId, placedEffects, cardId, 0, playerId, false, undefined, cardId,
        ))
      }
    }
  }
  return [...[message], ...effectMessages].join('; ')
}

/** Spend five Aether to gain the revealed top Firethorn during Inco's main phase. */
export function gainFirethornTopCard(g: GameState, playerId: string): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (g.currentPhase !== 'main' || g.currentTurn !== playerId) return 'The Firethorn may only be gained during Inco’s Main Phase'
  const player = getPlayer(g, playerId)
  if (player.mageType !== 'inco') return 'Only Inco can gain a Firethorn from this deck'
  const cardId = player.specificDeck?.[0]
  if (!cardId) return 'The Firethorn deck is empty'
  const card = getCard(cardId)
  const spendType: SpendType = card.type === 'gem' || card.type === 'spell' || card.type === 'relic'
    ? card.type
    : 'gain'
  const available = getSpendableAether(player, spendType)
  if (available < 5) return `Need 5 Aether, have ${available}`
  spendAether(player, 5, spendType)
  const specificDeck = getPlayerCardInstanceZone(g, player.id, 'specific_deck')
  const discard = getPlayerCardInstanceZone(g, player.id, 'discard')
  moveCardBetweenZones(g, specificDeck, 0, discard, 0, 'gain')
  forgetSpecificDeckCard(player, cardId)
  return `Gained ${getCard(cardId).name} from the Firethorn deck for 5 Aether`
}

// ===== Pending Decisions and Targets =====

export function nextPendingDecisionId(g: GameState): string {
  g.decisionCounter = (g.decisionCounter ?? 0) + 1
  return `decision-${g.decisionCounter}`
}

export function setPendingDecision(g: GameState, decision: PendingDecision): string | null {
  if (g.pendingDecision) return 'Another decision is already pending'
  g.pendingDecision = decision
  return null
}

export function clearPendingDecision(g: GameState): PendingDecision | null {
  const decision = g.pendingDecision
  g.pendingDecision = null
  return decision
}

// ===== Card Effect Resolution =====

function amountValue(
  g: GameState,
  playerId: string,
  amount: Extract<CardEffect, { kind: 'deal_damage' }>['amount'],
  sourceCardId?: string,
  resolution?: PendingEffectResolution,
): number {
  if (typeof amount === 'number') return Math.max(0, amount)
  if (amount.kind === 'per_open_breach') {
    const openBreaches = getPlayer(g, playerId).breaches.filter(b => isPresentBreach(b) && b.opened).length
    return Math.max(0, amount.base + openBreaches * amount.amountPerBreach)
  }
  if (amount.kind === 'per_nemesis_counter') {
    const counter = g.nemesis.counters[amount.counter] ?? 0
    return Math.max(0, amount.base + counter * amount.amountPerCounter)
  }
  if (amount.kind === 'current_minion_life') {
    const activeInstanceId = g.nemesisResolution?.activeCardInstanceId
    const sourceMinion = activeInstanceId
      ? g.nemesis.playArea.find(card =>
        card.cardType === 'minion' && card.cardId === sourceCardId &&
        (card.instanceId ?? `${card.cardId}:${card.placedAt}`) === activeInstanceId,
      )
      : g.nemesis.playArea.find(card =>
        card.cardType === 'minion' && (!sourceCardId || card.cardId === sourceCardId),
      )
    return Math.max(0, sourceMinion?.lifeTokens ?? 0)
  }
  if (amount.kind === 'per_prepped_spell') {
    const prepped = getPlayer(g, playerId).breaches
      .reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    return Math.max(0, amount.base + prepped * amount.amountPerSpell)
  }
  if (amount.kind === 'per_adjacent_prepped_spell') {
    const cast = resolution?.pendingSpellCast
    const owner = getPlayer(g, cast?.playerId ?? playerId)
    const breachIndex = cast?.breachIndex ?? 0
    const adjacent = owner.breaches.filter(breach =>
      isPresentBreach(breach) && Math.abs(breach.index - breachIndex) === 1,
    )
    const count = adjacent.reduce((sum, breach) => sum + breach.prepSpells.length, 0)
    return Math.max(0, amount.base + count * amount.amountPerSpell)
  }
  if (amount.kind === 'per_empty_market_pile') {
    return Math.max(0, amount.base + emptyMarketPileCount(g) * amount.amountPerPile)
  }
  if (amount.kind === 'per_specific_deck_card_cost') {
    return Math.max(0, amount.base + g.nemesis.strikeDeck.reduce((total, cardId) => total + getCard(cardId).cost, 0))
  }
  if (amount.kind === 'last_selection_cost') {
    return Math.max(0, resolution?.lastSelectedCardCost ?? 0)
  }
  if (amount.kind === 'last_chosen_token_amount') {
    return Math.max(0, resolution?.lastChosenTokenAmount ?? 0)
  }
  if (amount.kind === 'unspent_aether') {
    const player = getPlayer(g, playerId)
    return getUnspentAether(player)
  }
  return 0
}

/** Resolve the amount of one damage effect, including conditional modifiers. */
function damageEffectAmountValue(
  g: GameState,
  playerId: string,
  amount: EffectAmount,
  additionalDamage: AdditionalDamage[] | undefined,
  sourceCardId?: string,
  resolution?: PendingEffectResolution,
): number {
  let total = amountValue(g, playerId, amount, sourceCardId, resolution)
  for (const bonus of additionalDamage ?? []) {
    if (conditionMatches(g, playerId, bonus.condition, resolution)) {
      total += amountValue(g, playerId, bonus.amount, sourceCardId, resolution)
    }
  }
  return Math.max(0, total)
}

/** Aether remaining after regular, conditional, and token spending. */
function getUnspentAether(p: PlayerState): number {
  const regular = Math.max(0, p.bonusAether - p.regularAetherSpent)
  const conditional = Object.entries(p.conditionalAetherEarned ?? {})
    .reduce((sum, [condition, earned]) => sum + Math.max(0, earned - (p.condAetherSpent?.[condition] ?? 0)), 0)
  return regular + conditional + Math.max(0, p.aetherTokens ?? 0)
}

function hasDeferredAdditionalDamage(
  effect: { additionalDamage?: AdditionalDamage[] },
): boolean {
  return (effect.additionalDamage ?? []).some(bonus =>
    (typeof bonus.amount !== 'number' && bonus.amount.kind === 'last_selection_cost') ||
    bonus.condition?.kind === 'last_optional_accepted')
}

function spellBreachDamageBonus(breach: PlayerState['breaches'][number]): number {
  return isPresentBreach(breach) && breach.opened ? Math.max(0, breach.damageBonus) : 0
}

function applySpellDamageBonus(resolution: PendingEffectResolution, amount: number): number {
  const breachBonus = resolution.spellDamageBonus ?? 0
  const additionalBonus = resolution.spellAdditionalDamageBonus ?? 0
  if (additionalBonus > 0) {
    // An external "additional damage" effect (for example Blasting Staff's
    // +2) modifies only the first damage instance of the cast. The Breach III/
    // IV bonus remains per damage instance, as required by the Breach rules.
    resolution.spellAdditionalDamageBonus = 0
  }
  return amount + breachBonus + additionalBonus
}

function spellDamagePreviewServices() {
  return {
    amountValue,
    turnSpellDamageBonus,
    conditionMatches: (game: GameState, playerId: string | undefined, condition?: CardEffectCondition, resolution?: PendingEffectResolution) =>
      conditionMatches(game, playerId, condition, resolution),
    matchingBlocks: (cardId: string, playerId: string, game: GameState, trigger: CardEffectTrigger) =>
      matchingBlocks(cardId, playerId, game, trigger),
  }
}

/** Return the possible damage range shown while a prepped spell waits for its target. */
export function getSpellDamagePreviewRange(
  g: GameState, casterPlayerId: string, spellOwnerPlayerId: string,
  breachIndex: number, spellIndex = 0,
): SpellDamagePreviewRange | null {
  return previewSpellDamageRange(g, casterPlayerId, spellOwnerPlayerId, breachIndex, spellIndex, spellDamagePreviewServices())
}

/** Return the guaranteed damage value for callers that need a single number. */
export function getSpellDamagePreview(
  g: GameState, casterPlayerId: string, spellOwnerPlayerId: string,
  breachIndex: number, spellIndex = 0,
): number | null {
  return previewSpellDamage(g, casterPlayerId, spellOwnerPlayerId, breachIndex, spellIndex, spellDamagePreviewServices())
}
function effectPlayerId(g: GameState, resolution: PendingEffectResolution): string {
  // Nemesis effects have no Mage source. Keep a deterministic effect context
  // for legacy self-targeted card text without treating it as decision access.
  return resolution.effectPlayerId ?? resolution.sourcePlayerId ?? g.players[0]?.id ?? ''
}

const effectConditionServices: EffectConditionServices = {
  hasRecallChoices: (game, sourcePlayerId) => availableRecallChoices(game, true, sourcePlayerId).length > 0,
  getPreppedSpellChoices,
  getPreppedSpellCost,
  getBreachChoices,
  findPlayerCardInPlayIndex,
  playerCardSupplyTarget,
}

function conditionMatches(
  g: GameState,
  playerId: string | undefined,
  condition?: CardEffectCondition,
  resolution?: PendingEffectResolution,
  sourceCardId?: string,
  sourceCardIndex?: number,
  sourcePlayerId?: string,
  pendingPlayCardId?: string,
): boolean {
  return evaluateEffectCondition(g, playerId, condition, resolution, sourceCardId, sourceCardIndex,
    sourcePlayerId, pendingPlayCardId, effectConditionServices)
}

function matchingBlocks(
  cardId: string, playerId: string, g: GameState, trigger: CardEffectTrigger,
  sourceCardIndex?: number,
  conditionPlayerId = playerId,
  pendingPlayCardId?: string,
  effectSourcePlayerId = conditionPlayerId,
): CardEffectBlock[] {
  return findMatchingEffectBlocks(cardId, playerId, g, trigger, sourceCardIndex, conditionPlayerId,
    pendingPlayCardId, effectSourcePlayerId, effectConditionServices)
}

function addRemainingEffects(resolution: PendingEffectResolution, effects: CardEffect[]): void {
  resolution.remainingEffects = [...effects, ...resolution.remainingEffects]
}

/** Queue the complete, ordered exhaustion sequence after a lethal damage hit. */
function queuePlayerExhaustion(
  resolution: PendingEffectResolution,
  playerId: string,
  overflowDamage: number,
): void {
  addRemainingEffects(resolution, [{
    kind: 'exhaust_player',
    playerId,
    overflowDamage: Math.max(0, overflowDamage),
  }])
}

function clearPendingSpellCast(resolution: PendingEffectResolution): void {
  resolution.pendingSpellCast = undefined
}

function captureEffectContext(resolution: PendingEffectResolution): CardEffect {
  return {
    kind: 'restore_effect_context',
    sourcePlayerId: resolution.sourcePlayerId,
    sourceCardOwnerId: resolution.sourceCardOwnerId,
    sourceCardId: resolution.sourceCardId,
    effectPlayerId: resolution.effectPlayerId,
    pendingSpellCast: resolution.pendingSpellCast ? { ...resolution.pendingSpellCast } : undefined,
    spellDamageBonus: resolution.spellDamageBonus,
    spellAdditionalDamageBonus: resolution.spellAdditionalDamageBonus,
  }
}

function contextualizeCardEffectBlock(
  block: CardEffectBlock,
  cardId: string,
  ownerId: string,
  actorId: string,
  restoreContext: CardEffect,
): CardEffect[] {
  const blockActorId = block.effectPlayerScope === 'owner' ? ownerId : actorId
  const context = {
    ...restoreContext,
    kind: 'restore_effect_context' as const,
    // Changing the source/effect actor between blocks must not rewind the
    // in-progress spell's damage bonus or forget that its damage was applied.
    preserveSpellDamageState: true,
    sourcePlayerId: blockActorId,
    sourceCardOwnerId: ownerId,
    sourceCardId: cardId,
    effectPlayerId: blockActorId,
  } as Extract<CardEffect, { kind: 'restore_effect_context' }>
  return [
    context,
    ...block.effects,
    { ...restoreContext, preserveSpellDamageState: true } as Extract<CardEffect, { kind: 'restore_effect_context' }>,
  ]
}

function turnSpellDamageBonus(g: GameState, playerId: string, spellCost: number): number {
  return (getPlayerTurnEffects(getPlayer(g, playerId)).spellDamageBonuses ?? [])
    .filter(bonus => spellCost <= bonus.maxCost)
    .reduce((total, bonus) => total + Math.max(0, bonus.amount), 0)
}

function canConjureToBreach(
  g: GameState,
  player: PlayerState,
  breach: BreachState,
  eligibility: 'standard' | 'any_present' = 'standard',
): boolean {
  return isPresentBreach(breach) &&
    (breach.prepSpells.length < getPrepSpellLimit(player, breach.index) ||
      breach.prepSpells.some(preppedId => getCard(preppedId).mechanics?.includes('unlimited_conjure'))) &&
    (eligibility === 'any_present' || canPrepOnBreach(breach))
}

function forgetSpecificDeckCard(player: PlayerState, cardId: string): void {
  player.knownSpecificDeckCards = (player.knownSpecificDeckCards ?? []).filter(id => id !== cardId)
}

function rememberSpecificDeckCard(
  game: GameState, player: PlayerState, cardId: string, indexHint?: number,
): void {
  player.knownSpecificDeckCards ??= []
  if (!player.knownSpecificDeckCards.includes(cardId)) player.knownSpecificDeckCards.push(cardId)
  const deck = player.specificDeck ?? []
  const index = indexHint !== undefined && deck[indexHint] === cardId ? indexHint : deck.indexOf(cardId)
  if (index < 0) return
  player.specificDeckInstanceIds = ensureCardInstanceZone(game, deck, player.specificDeckInstanceIds)
  const instanceId = player.specificDeckInstanceIds[index]
  if (instanceId) markCardInstanceRevealed(game, instanceId)
}

function rememberSpecificDeckTop(game: GameState, player: PlayerState): void {
  if (MAGES[player.mageType]?.specificDeckDisplay !== 'top_revealed') return
  const cardId = player.specificDeck?.[0]
  if (cardId) rememberSpecificDeckCard(game, player, cardId, 0)
}

function resetBreachToStartingPosition(breach: BreachState): void {
  const direction = breach.startingDirection ?? 'east'
  breach.opened = false
  breach.focusDirection = direction
  breach.focusCost = breach.startingFocusCost ?? breach.focusCost
  breach.focusCount = 0
  breach.focusToOpen = breach.startingFocusToOpen ?? ({ east: 4, south: 3, west: 2, north: 1 }[direction])
  breach.openCost = { ...(breach.startingOpenCost ?? breach.openCost) }
  breach.focusedThisTurn = false
}

/** Move a cast spell to its owner's discard before any on-cast effects run.
 * The pending cast metadata remains available while those effects resolve so
 * damage calculations can still identify the original Breach. */
function discardPendingSpellCast(g: GameState, resolution: PendingEffectResolution): void {
  const pending = resolution.pendingSpellCast
  if (!pending || !pending.discard) return

  const owner = getPlayer(g, pending.playerId)
  const breach = owner.breaches.find(item => item.index === pending.breachIndex)
  if (breach?.prepSpells[pending.spellIndex] !== pending.cardId) return

  const source = getBreachCardInstanceZone(g, owner.id, breach.index)
  const discard = getPlayerCardInstanceZone(g, owner.id, 'discard')
  moveCardBetweenZones(g, source, pending.spellIndex, discard, 0, 'cast_spell')
}

function describeSimultaneousEffect(effect: CardEffect): string {
  if (effect.kind === 'conjure') {
    return effect.target === 'ally' ? 'Any ally may Conjure' : 'Conjure'
  }
  if (effect.kind === 'draw_cards') {
    const amount = `${effect.amount} card${effect.amount === 1 ? '' : 's'}`
    if (effect.target === 'ally') return `Any ally draws ${amount}`
    if (effect.target === 'any_player') return `A player draws ${amount}`
    return `Draw ${amount}`
  }
  if (effect.kind === 'gain_knowledge') return `Gain ${effect.amount} Knowledge`
  if (effect.kind === 'gain_aether_token') return `Gain ${effect.amount ?? 1} Aether token${(effect.amount ?? 1) === 1 ? '' : 's'}`
  if (effect.kind === 'gain_charge') return `Gain ${effect.amount} charge`
  if (effect.kind === 'gain_life') return `Gain ${effect.amount} life`
  if (effect.kind === 'deal_damage') {
    return typeof effect.amount === 'number' ? `Deal ${effect.amount} damage` : 'Deal damage'
  }
  if (effect.kind === 'focus_breach') return 'Focus a Breach'
  if (effect.kind === 'choose_optional' || effect.kind === 'choose_one') return effect.prompt
  return `Resolve ${effect.kind.replace(/_/g, ' ')}`
}

function createSimultaneousEffectGroup(
  id: string,
  sourceLabel: string,
  effects: CardEffect[],
): SimultaneousEffectGroup | null {
  if (effects.length === 0) return null
  const descriptions = effects.map(describeSimultaneousEffect)
  const effectLabel = descriptions.length <= 2
    ? descriptions.join('; ')
    : `${descriptions.slice(0, 2).join('; ')}; and ${descriptions.length - 2} more effect${descriptions.length === 3 ? '' : 's'}`
  return { id, sourceLabel, effectLabel, effects }
}

function resolveSimultaneousEffectGroups(groups: SimultaneousEffectGroup[]): CardEffect[] {
  const activeGroups = groups.filter(group => group.effects.length > 0)
  if (activeGroups.length <= 1) return activeGroups.flatMap(group => group.effects)
  return [{ kind: 'resolve_simultaneous_effects', groups: activeGroups }]
}

function breachOnCastEffects(
  g: GameState,
  breachOwner: PlayerState,
  breach: BreachState,
  casterPlayerId: string,
  restoreContext: CardEffect,
): SimultaneousEffectGroup[] {
  const groups: SimultaneousEffectGroup[] = []
  const breachEffects: CardEffect[] = []
  if (breach.opened) {
    if (breach.special === 'rift') {
      breachEffects.push({ kind: 'draw_cards', amount: 1, target: 'ally', relativeToSpellCaster: true })
    }
    if (breach.special === 'prototype') {
      breachEffects.push({ kind: 'gain_knowledge', amount: 1, target: 'breach_owner' })
    }
    if (breach.special === 'intoned') {
      breachEffects.push({ kind: 'focus_breach', target: 'any_player', selection: 'choose' })
    }
    const breachGroup = createSimultaneousEffectGroup(
      `breach:${breach.index}:intrinsic`, `Breach ${toRoman(breach.index)}`, breachEffects,
    )
    if (breachGroup) groups.push(breachGroup)

    const activeTurnPlayer = g.players.find(player => player.id === casterPlayerId) ?? breachOwner
    const turnEffects = getPlayerTurnEffects(activeTurnPlayer)
    for (const [upgradeIndex, cardId] of (breach.installedUpgrades ?? []).entries()) {
      const matchingUpgradeBlocks: CardEffectBlock[] = []
      for (const [blockIndex, block] of (getCard(cardId).effects ?? []).entries()) {
        const blockActorId = block.effectPlayerScope === 'owner' ? breachOwner.id : casterPlayerId
        if (block.trigger.kind !== 'on_cast' ||
          !conditionMatches(g, blockActorId, block.condition, undefined, cardId, undefined, casterPlayerId)) continue
        if (block.oncePerTurn) {
          const marker = `${breach.index}:${cardId}:${blockIndex}`
          if (turnEffects.usedBreachUpgradeEffects!.includes(marker)) continue
          turnEffects.usedBreachUpgradeEffects!.push(marker)
        }
        matchingUpgradeBlocks.push(block)
      }
      const upgradeEffects = matchingUpgradeBlocks.flatMap(block => block.effects)
      const upgradeGroup = createSimultaneousEffectGroup(
        `breach:${breach.index}:upgrade:${upgradeIndex}:${cardId}`,
        getCard(cardId).name,
        upgradeEffects,
      )
      if (upgradeGroup) {
        upgradeGroup.effects = matchingUpgradeBlocks.flatMap(block =>
          contextualizeCardEffectBlock(block, cardId, breachOwner.id, casterPlayerId, restoreContext))
        groups.push(upgradeGroup)
      }
    }
  }
  if (breach.attachedRelic) {
    const attachment = breach.attachedRelic
    const attachedBlocks = matchingBlocks(
      attachment.cardId,
      attachment.ownerId,
      g,
      { kind: 'on_attached_breach_spell_cast' },
      undefined, casterPlayerId, undefined, casterPlayerId,
    )
    const attachedEffects = attachedBlocks.flatMap(block => block.effects)
    const attachmentGroup = createSimultaneousEffectGroup(
      `breach:${breach.index}:attached:${attachment.cardId}`,
      getCard(attachment.cardId).name,
      attachedEffects,
    )
    if (attachmentGroup) {
      attachmentGroup.effects = attachedBlocks.flatMap(block =>
        contextualizeCardEffectBlock(block, attachment.cardId, attachment.ownerId, casterPlayerId, restoreContext))
      groups.push(attachmentGroup)
    }
  }
  return groups
}

function cardChoiceMatches(choice: CardChoice, expectedSource: CardSelectionSource): boolean {
  if (expectedSource === 'hand') return choice.zone === 'hand'
  if (expectedSource === 'discard') return choice.zone === 'discard'
  if (expectedSource === 'deck') return choice.zone === 'deck'
  if (expectedSource === 'hand_or_discard') return choice.zone === 'hand' || choice.zone === 'discard'
  if (expectedSource === 'deck_or_discard') return choice.zone === 'deck' || choice.zone === 'discard'
  if (expectedSource === 'specific_deck') return choice.zone === 'specific_deck'
  if (expectedSource === 'player_cards_in_play') return choice.zone === 'player_cards_in_play'
  return choice.zone === 'played_this_turn'
}

function findOptionalCardSelection(
  effects: CardEffect[],
): Extract<CardEffect, { kind: 'discard_cards' | 'destroy_cards' }> | null {
  for (const effect of effects) {
    if (effect.kind === 'discard_cards' || (effect.kind === 'destroy_cards' && effect.source !== 'self')) return effect
    if (effect.kind === 'conditional' || effect.kind === 'choose_optional') {
      const nested = findOptionalCardSelection(effect.effects)
      if (nested) return nested
    }
    if (effect.kind === 'choose_one') {
      const nested = effect.options
        .map(option => findOptionalCardSelection(option.effects))
        .find(Boolean)
      if (nested) return nested
    }
  }
  return null
}

function findOptionalPreppedSpellCast(
  effects: CardEffect[],
): Extract<CardEffect, { kind: 'cast_prepped_spell' }> | null {
  for (const effect of effects) {
    if (effect.kind === 'cast_prepped_spell' && effect.source !== 'selected_prepped_spell') return effect
    if (effect.kind === 'conditional' || effect.kind === 'choose_optional') {
      const nested = findOptionalPreppedSpellCast(effect.effects)
      if (nested) return nested
    }
    if (effect.kind === 'choose_one') {
      const nested = effect.options
        .map(option => findOptionalPreppedSpellCast(option.effects))
        .find(Boolean)
      if (nested) return nested
    }
  }
  return null
}

/** Whether an opt-in effect has an available card or spell for its nested selection. */
function optionalEffectAvailable(
  g: GameState,
  playerId: string,
  effects: CardEffect[],
  sourcePlayerId = playerId,
): boolean {
  const selection = findOptionalCardSelection(effects)
  if (selection) {
    if (selection.kind === 'destroy_cards' && (selection.maxAmount ?? 1) <= 0) return false
    const targets = getSelectedPlayerTargets(
      g, playerId, selection.target ?? 'self',
      'selection' in selection ? selection.selection : undefined,
    )
    const hasEligibleCard = targets.some(target => getCardChoices(g, target.playerId, selection.source as CardSelectionSource)
      .some(choice => (!('cardType' in selection) || !selection.cardType || getCard(choice.cardId).type === selection.cardType) &&
        (!('cardTypes' in selection) || !selection.cardTypes || selection.cardTypes.includes(getCard(choice.cardId).type)) &&
        (!('cardIds' in selection) || !selection.cardIds || selection.cardIds.includes(choice.cardId)) &&
        getCard(choice.cardId).cost >= (selection.minCost ?? 0)))
    if (!hasEligibleCard) return false
  }

  const spellCast = findOptionalPreppedSpellCast(effects)
  if (spellCast) {
    const hasEligibleSpell = getPreppedSpellChoices(g).some(choice => {
      if (spellCast.source === 'prepped_spell_prepped_this_turn') {
        const owner = getPlayer(g, choice.playerId)
        const breach = owner.breaches.find(item => item.index === choice.breachIndex)
        if (breach?.preppedThisTurn?.[choice.spellIndex] !== true) return false
      }
      if (spellCast.ownerScope === 'ally' && choice.playerId === sourcePlayerId) return false
      if (spellCast.ownerScope === 'self' && choice.playerId !== sourcePlayerId) return false
      const cost = getPreppedSpellCost(g, choice.playerId, choice.breachIndex, choice.spellIndex)
      return cost !== null && (spellCast.minCost === undefined || cost >= spellCast.minCost) &&
        (spellCast.maxCost === undefined || cost <= spellCast.maxCost)
    })
    if (!hasEligibleSpell) return false
  }

  return true
}

function selectedChoicesAreCurrent(
  g: GameState, playerId: string, candidates: CardChoice[], selected: CardChoice[],
): boolean {
  const p = getPlayer(g, playerId)
  const candidateKeys = new Set(candidates.map(choice => `${choice.zone}:${choice.index}:${choice.cardId}`))
  const selectedKeys = new Set<string>()
  for (const choice of selected) {
    const key = `${choice.zone}:${choice.index}:${choice.cardId}`
    if (selectedKeys.has(key) || !candidateKeys.has(key)) return false
    if (getZoneCards(p, choice.zone)[choice.index] !== choice.cardId) return false
    selectedKeys.add(key)
  }
  return true
}

function discardSelectedCards(
  g: GameState, playerId: string, choices: CardChoice[], preserveSelectionOrder = false,
): string[] {
  const p = getPlayer(g, playerId)
  const selected = choices.flatMap(choice => {
    if (getZoneCards(p, choice.zone)[choice.index] !== choice.cardId) return []
    const source = getPlayerCardInstanceZone(g, playerId, choice.zone)
    const instanceId = source.instanceIds[choice.index]
    return instanceId ? [{ choice, instanceId }] : []
  })
  const ordered = preserveSelectionOrder ? selected : [...selected].sort((a, b) => b.choice.index - a.choice.index)
  const discard = getPlayerCardInstanceZone(g, playerId, 'discard')
  for (const item of ordered) {
    const source = getPlayerCardInstanceZone(g, playerId, item.choice.zone)
    const sourceIndex = source.instanceIds.indexOf(item.instanceId)
    if (sourceIndex >= 0) moveCardBetweenZones(g, source, sourceIndex, discard, 0, 'discard')
  }
  return ordered.map(item => item.choice.cardId)
}

function returnSelectedCard(g: GameState, playerId: string, choice: CardChoice): string | null {
  const p = getPlayer(g, playerId)
  if (choice.zone !== 'played_this_turn' || p.playedThisTurn[choice.index] !== choice.cardId) {
    return null
  }
  const played = getPlayerCardInstanceZone(g, playerId, 'played_this_turn')
  const hand = getPlayerCardInstanceZone(g, playerId, 'hand')
  const moved = moveCardBetweenZones(g, played, choice.index, hand, hand.cards.length, 'return')
  return moved?.cardId ?? null
}

function createDecision(
  g: GameState, prompt: string, kind: PendingDecision['kind'],
  details: Record<string, unknown>,
  sourceCardId?: string,
): PendingDecision {
  return {
    id: nextPendingDecisionId(g),
    prompt,
    context: sourceCardId ? { sourceCardId } : undefined,
    ...details,
    kind,
  } as PendingDecision
}

function pauseEffect(
  g: GameState, resolution: PendingEffectResolution, effect: CardEffect,
  decision: PendingDecision,
): string[] {
  const error = setPendingDecision(g, decision)
  if (error) return [error]
  resolution.awaiting = effect
  g.pendingEffect = resolution
  return [`Decision required: ${decision.prompt}`]
}

export function drawCardsForPlayer(g: GameState, playerId: string, amount: number): number {
  const p = getPlayer(g, playerId)
  const drawn = drawPlayerCardsToHand(g, playerId, Math.max(0, amount))
  if (g.currentTurn === playerId && (g.currentPhase === 'casting' || g.currentPhase === 'main')) {
    p.corruptionsDrawnThisTurn ??= []
    p.corruptionsDrawnThisTurn.push(...drawn.filter(cardId => getCard(cardId).type === 'corruption'))
  }
  return drawn.length
}

/** Apply one player-dealt damage instance to a Nemesis target and queue its on-hit text. */
function dealNemesisTargetDamage(
  g: GameState, resolution: PendingEffectResolution, target: DamageTargetRef, amount: number,
): string {
  const minion = target.kind === 'minion'
    ? g.nemesis.playArea.find(card => card.cardType === 'minion' && card.placedAt === target.placedAt)
    : undefined
  const before = minion?.lifeTokens ?? 0
  const message = dealDamage(g, target, amount, resolution.sourceCardId)
  if (!minion) return message

  const actorId = resolution.sourcePlayerId
  const dealtDamage = before > (minion.lifeTokens ?? 0)
  const definition = getCard(minion.cardId) as NemesisCardDef
  const onDamage = dealtDamage ? definition.onDamage ?? [] : []
  const onSpellDamage = amount > 0 && resolution.pendingSpellCast ? definition.onSpellDamage ?? [] : []
  if (before > 0 && (minion.lifeTokens ?? 0) === 0 && definition.gainCardsUnderneathOnDefeat && actorId) {
    const stacked = getNemesisCardStackZone(g, minion)
    const discard = getPlayerCardInstanceZone(g, actorId, 'discard')
    for (let index = stacked.cards.length - 1; index >= 0; index--) {
      moveCardBetweenZones(g, stacked, index, discard, 0, 'effect', { reveal: true })
    }
  }
  if (!actorId || (onDamage.length === 0 && onSpellDamage.length === 0)) return message

  const outerContext = captureEffectContext(resolution)
  addRemainingEffects(resolution, [
    {
      kind: 'restore_effect_context',
      sourcePlayerId: actorId,
      sourceCardOwnerId: undefined,
      sourceCardId: minion.cardId,
      effectPlayerId: actorId,
      pendingSpellCast: resolution.pendingSpellCast ? { ...resolution.pendingSpellCast } : undefined,
      spellDamageBonus: undefined,
      spellAdditionalDamageBonus: undefined,
    },
    ...onDamage,
    ...onSpellDamage,
    outerContext,
  ])
  return message
}

function getPlayerTurnOrderCards(g: GameState): TurnOrderCardChoice[] {
  return g.turnOrderDiscard
    .map((cardId, index) => ({ cardId, index }))
    .filter(choice => g.players.some(player => player.id === choice.cardId))
}

/** Ensure the turn-order deck has cards available for a reveal effect. */
function replenishTurnOrderDeckForReveal(g: GameState, amount: number): void {
  // A reveal can happen after the final card of a round. Turn-order discards
  // are shuffled into the deck; player discards use their own no-shuffle rule.
  ensureDeckForReveal(g.turnOrderDeck, g.turnOrderDiscard, amount, 'shuffle_discard', () => {
    g.round++
  })
}

/** @internal Dependencies for the typed CardEffect execution loop. */
export interface EffectResolutionServices {
  activeNemesisRules: typeof activeNemesisRules,
  addRemainingEffects: typeof addRemainingEffects,
  advanceNemesisTurn: typeof advanceNemesisTurn,
  amountValue: typeof amountValue,
  applyFreeBreachFocus: typeof applyFreeBreachFocus,
  applySpellDamageBonus: typeof applySpellDamageBonus,
  automaticallyAllocateDamage: typeof automaticallyAllocateDamage,
  availableRecallChoices: typeof availableRecallChoices,
  breachOnCastEffects: typeof breachOnCastEffects,
  canConjureToBreach: typeof canConjureToBreach,
  captureEffectContext: typeof captureEffectContext,
  cardNameMatchesAny: typeof cardNameMatchesAny,
  checkGameOver: typeof checkGameOver,
  checkPlayerDeath: typeof checkPlayerDeath,
  clearPendingSpellCast: typeof clearPendingSpellCast,
  collectBreachOpenedEffects: typeof collectBreachOpenedEffects,
  collectPlayerCardTriggerEffects: typeof collectPlayerCardTriggerEffects,
  conditionMatches: typeof conditionMatches,
  contextualizeCardEffectBlock: typeof contextualizeCardEffectBlock,
  createDecision: typeof createDecision,
  damageEffectAmountValue: typeof damageEffectAmountValue,
  damageNemesis: typeof damageNemesis,
  dealDamage: typeof dealDamage,
  dealNemesisTargetDamage: typeof dealNemesisTargetDamage,
  destroyCard: typeof destroyCard,
  destroyExhaustedBreach: typeof destroyExhaustedBreach,
  devourMarketPile: typeof devourMarketPile,
  discardCollectiveCards: typeof discardCollectiveCards,
  discardCompletedNemesisCard: typeof discardCompletedNemesisCard,
  discardPendingSpellCast: typeof discardPendingSpellCast,
  discardPreppedSpellChoices: typeof discardPreppedSpellChoices,
  discardSelectedCards: typeof discardSelectedCards,
  drawCardsForPlayer: typeof drawCardsForPlayer,
  drawFromDeck: typeof drawFromDeck,
  drawStrikeCard: typeof drawStrikeCard,
  effectPlayerId: typeof effectPlayerId,
  effectTargetPlayerId: typeof effectTargetPlayerId,
  emptyMarketPileCount: typeof emptyMarketPileCount,
  ensurePlayerCollections: typeof ensurePlayerCollections,
  ensureTrinketDeckState: typeof ensureTrinketDeckState,
  findPlayerCardInPlayIndex: typeof findPlayerCardInPlayIndex,
  fixedDevourPile: typeof fixedDevourPile,
  forgetSpecificDeckCard: typeof forgetSpecificDeckCard,
  gainCard: typeof gainCard,
  gainLife: typeof gainLife,
  gainPulseTokens: typeof gainPulseTokens,
  gainSwapZoneCard: typeof gainSwapZoneCard,
  getBreachChoices: typeof getBreachChoices,
  getCard: typeof getCard,
  getCardChoices: typeof getCardChoices,
  getCollectiveCardChoices: typeof getCollectiveCardChoices,
  getDamageTargets: typeof getDamageTargets,
  getDoomOwner: typeof getDoomOwner,
  getEffectPlayerTargets: typeof getEffectPlayerTargets,
  getExhaustBreachChoices: typeof getExhaustBreachChoices,
  getLifeTargets: typeof getLifeTargets,
  getMarketCardCost: typeof getMarketCardCost,
  getNemesisDefinition: typeof getNemesisDefinition,
  getPlayer: typeof getPlayer,
  getPlayerTargets: typeof getPlayerTargets,
  getPlayerTurnEffects: typeof getPlayerTurnEffects,
  getPlayerTurnOrderCards: typeof getPlayerTurnOrderCards,
  getPreppedSpellChoices: typeof getPreppedSpellChoices,
  getPreppedSpellCost: typeof getPreppedSpellCost,
  getSelectedDamagePlayerTargets: typeof getSelectedDamagePlayerTargets,
  getSelectedPlayerTargets: typeof getSelectedPlayerTargets,
  getSpendableAether: typeof getSpendableAether,
  getSupplyPileGainEffects: typeof getSupplyPileGainEffects,
  getUnspentAether: typeof getUnspentAether,
  getZoneCards: typeof getZoneCards,
  hasDeferredAdditionalDamage: typeof hasDeferredAdditionalDamage,
  isFaceDownPreppedSpell: typeof isFaceDownPreppedSpell,
  isPresentBreach: typeof isPresentBreach,
  leastExpensiveMarketPiles: typeof leastExpensiveMarketPiles,
  losePulseTokens: typeof losePulseTokens,
  marketPileChoices: typeof marketPileChoices,
  matchingBlocks: typeof matchingBlocks,
  moveGainedSupplyCardToDeck: typeof moveGainedSupplyCardToDeck,
  optionalEffectAvailable: typeof optionalEffectAvailable,
  pauseEffect: typeof pauseEffect,
  pauseRevealTopCard: typeof pauseRevealTopCard,
  pendingDecision: typeof pendingDecision,
  playerCardPowerTokenCount: typeof playerCardPowerTokenCount,
  preparePlayerDeckForReveal: typeof preparePlayerDeckForReveal,
  putPlayerCardIntoPlay: typeof putPlayerCardIntoPlay,
  queuePlayerExhaustion: typeof queuePlayerExhaustion,
  rememberSpecificDeckCard: typeof rememberSpecificDeckCard,
  rememberSpecificDeckTop: typeof rememberSpecificDeckTop,
  replenishTurnOrderDeckForReveal: typeof replenishTurnOrderDeckForReveal,
  resetBreachToStartingPosition: typeof resetBreachToStartingPosition,
  resolveSimultaneousEffectGroups: typeof resolveSimultaneousEffectGroups,
  returnSelectedCard: typeof returnSelectedCard,
  returnStrikeCardToDeck: typeof returnStrikeCardToDeck,
  shuffle: typeof shuffle,
  spellBreachDamageBonus: typeof spellBreachDamageBonus,
  spendAether: typeof spendAether,
  sufferPlayerDamage: typeof sufferPlayerDamage,
  toRoman: typeof toRoman,
  turnSpellDamageBonus: typeof turnSpellDamageBonus,
  MAGES: typeof MAGES,
  MAX_PULSE_TOKENS: typeof MAX_PULSE_TOKENS
}

const runEffectResolution = createEffectResolver({
  activeNemesisRules,
  addRemainingEffects,
  advanceNemesisTurn,
  amountValue,
  applyFreeBreachFocus,
  applySpellDamageBonus,
  automaticallyAllocateDamage,
  availableRecallChoices,
  breachOnCastEffects,
  canConjureToBreach,
  captureEffectContext,
  cardNameMatchesAny,
  checkGameOver,
  checkPlayerDeath,
  clearPendingSpellCast,
  collectBreachOpenedEffects,
  collectPlayerCardTriggerEffects,
  conditionMatches,
  contextualizeCardEffectBlock,
  createDecision,
  damageEffectAmountValue,
  damageNemesis,
  dealDamage,
  dealNemesisTargetDamage,
  destroyCard,
  destroyExhaustedBreach,
  devourMarketPile,
  discardCollectiveCards,
  discardCompletedNemesisCard,
  discardPendingSpellCast,
  discardPreppedSpellChoices,
  discardSelectedCards,
  drawCardsForPlayer,
  drawFromDeck,
  drawStrikeCard,
  effectPlayerId,
  effectTargetPlayerId,
  emptyMarketPileCount,
  ensurePlayerCollections,
  ensureTrinketDeckState,
  findPlayerCardInPlayIndex,
  fixedDevourPile,
  forgetSpecificDeckCard,
  gainCard,
  gainLife,
  gainPulseTokens,
  gainSwapZoneCard,
  getBreachChoices,
  getCard,
  getCardChoices,
  getCollectiveCardChoices,
  getDamageTargets,
  getDoomOwner,
  getEffectPlayerTargets,
  getExhaustBreachChoices,
  getLifeTargets,
  getMarketCardCost,
  getNemesisDefinition,
  getPlayer,
  getPlayerTargets,
  getPlayerTurnEffects,
  getPlayerTurnOrderCards,
  getPreppedSpellChoices,
  getPreppedSpellCost,
  getSelectedDamagePlayerTargets,
  getSelectedPlayerTargets,
  getSpendableAether,
  getSupplyPileGainEffects,
  getUnspentAether,
  getZoneCards,
  hasDeferredAdditionalDamage,
  isFaceDownPreppedSpell,
  isPresentBreach,
  leastExpensiveMarketPiles,
  losePulseTokens,
  marketPileChoices,
  matchingBlocks,
  moveGainedSupplyCardToDeck,
  optionalEffectAvailable,
  pauseEffect,
  pauseRevealTopCard,
  pendingDecision,
  playerCardPowerTokenCount,
  preparePlayerDeckForReveal,
  putPlayerCardIntoPlay,
  queuePlayerExhaustion,
  rememberSpecificDeckCard,
  rememberSpecificDeckTop,
  replenishTurnOrderDeckForReveal,
  resetBreachToStartingPosition,
  resolveSimultaneousEffectGroups,
  returnSelectedCard,
  returnStrikeCardToDeck,
  shuffle,
  spellBreachDamageBonus,
  spendAether,
  sufferPlayerDamage,
  toRoman,
  turnSpellDamageBonus,
  MAGES,
  MAX_PULSE_TOKENS
})
/** Resolve the matching effect blocks for a card event. */
export function resolveEffects(
  g: GameState, sourcePlayerId: string | undefined, effects: CardEffect[],
  sourceCardId?: string, spellDamageBonus = 0, effectPlayerIdOverride?: string,
  nemesisResume = false, pendingSpellCast?: PendingSpellCast,
  lastGainedCardId?: string, afterAbilityPlayerId?: string,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  return runEffectResolution(g, {
    sourcePlayerId,
    sourceCardId,
    remainingEffects: [...effects],
    spellDamageBonus,
    effectPlayerId: effectPlayerIdOverride,
    nemesisResume,
    pendingSpellCast,
    lastGainedCardId,
    afterAbilityPlayerId,
  })
}

export function resolveCardEffects(
  g: GameState, playerId: string, sourceCardId: string, trigger: CardEffectTrigger,
  lastGainedCardId?: string, spellDamageBonus = 0, pendingSpellCast?: PendingSpellCast,
): string[] {
  const blocks = matchingBlocks(sourceCardId, playerId, g, trigger, undefined,
    playerId, undefined, playerId)
  if (blocks.length === 0 && !pendingSpellCast) return []
  const restoreContext: CardEffect = {
    kind: 'restore_effect_context', sourcePlayerId: playerId,
    sourceCardOwnerId: playerId, sourceCardId, effectPlayerId: playerId,
    pendingSpellCast: pendingSpellCast ? { ...pendingSpellCast } : undefined,
    spellDamageBonus,
  }
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    sourceCardOwnerId: playerId,
    sourceCardId,
    remainingEffects: blocks.flatMap(block =>
      contextualizeCardEffectBlock(block, sourceCardId, playerId, playerId, restoreContext)),
    lastGainedCardId,
    spellDamageBonus,
    pendingSpellCast,
  })
}

function pauseRevealTopCard(
  g: GameState,
  resolution: PendingEffectResolution,
  effect: Extract<CardEffect, { kind: 'reveal_top_card_to_hand_if_spell' }>,
  playerId: string,
): string[] {
  const player = getPlayer(g, playerId)
  preparePlayerDeckForRevealWithInstances(g, player, 1)
  const cardId = player.deck[0]
  if (!cardId) return [`${player.mageType} has no card to reveal`]
  resolution.revealedTopCard = { playerId, cardId }
  const decision = createDecision(
    g,
    `${player.mageType} reveals ${getCard(cardId).name}: confirm to resolve this effect`,
    'confirm_revealed_card',
    { cardId, playerId },
    resolution.sourceCardId,
  )
  return pauseEffect(g, resolution, effect, decision)
}

export interface RecallCardAction {
  discardIndex: number
  cardId: string
}

function recallBlockMarker(cardId: string, blockIndex: number): string {
  return `${cardId}:${blockIndex}`
}

/** Return Recall card copies in every player's discard pile. */
function availableRecallChoices(
  g: GameState, includeAlreadyUsed = false, effectSourcePlayerId?: string,
): CollectiveCardChoice[] {
  return g.players.flatMap(player => player.discard.flatMap((cardId, index) => {
    const blocks = matchingBlocks(cardId, player.id, g, { kind: 'recall' }, undefined,
      player.id, undefined, effectSourcePlayerId ?? player.id)
    const ordinal = player.discard.slice(0, index).filter(id => id === cardId).length
    const used = getPlayerTurnEffects(player).usedRecallEffects!
    const available = blocks.some((block, blockIndex) =>
      block.effects.length > 0 && (includeAlreadyUsed || ordinal >= (used[recallBlockMarker(cardId, blockIndex)] ?? 0)),
    )
    return available ? [{
      playerId: player.id,
      choice: { zone: 'discard' as const, index, cardId, cardName: getCard(cardId).name },
    }] : []
  }))
}

/** Return Recall cards that the active player may activate from their discard. */
export function getRecallActions(g: GameState, playerId: string): RecallCardAction[] {
  if (g.gameOver || g.currentPhase !== 'main' || g.currentTurn !== playerId ||
    g.pendingDecision || g.pendingEffect) return []
  const player = g.players.find(candidate => candidate.id === playerId)
  if (!player) return []
  ensurePlayerCollections(player)
  const used = player.turnEffects.usedRecallEffects!
  const actions: RecallCardAction[] = []

  for (const [discardIndex, cardId] of player.discard.entries()) {
    const copyOrdinal = player.discard.slice(0, discardIndex).filter(id => id === cardId).length
    const blocks = matchingBlocks(cardId, playerId, g, { kind: 'recall' })
    const available = blocks.some((block, blockIndex) =>
      block.effects.length > 0 && copyOrdinal >= (used[recallBlockMarker(cardId, blockIndex)] ?? 0),
    )
    if (available) actions.push({ discardIndex, cardId })
  }
  return actions
}

/** Resolve the clicked Recall card and spend that copy's once-per-turn use. */
export function activateRecall(g: GameState, playerId: string, discardIndex: number): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Resolve the pending card decision first']
  if (g.gameOver || g.currentPhase !== 'main' || g.currentTurn !== playerId) {
    return ['Recall can only be activated from the active player\'s Discard during their Main Phase']
  }
  if (!getRecallActions(g, playerId).some(action => action.discardIndex === discardIndex)) {
    return ['That card has no available Recall effect']
  }

  const player = getPlayer(g, playerId)
  const cardId = player.discard[discardIndex]
  if (!cardId) return ['That Recall card is no longer in the Discard']
  const copyOrdinal = player.discard.slice(0, discardIndex).filter(id => id === cardId).length
  const used = player.turnEffects.usedRecallEffects!
  const blocks = matchingBlocks(cardId, playerId, g, { kind: 'recall' })
  const availableBlocks = blocks.filter((block, blockIndex) =>
    block.effects.length > 0 && copyOrdinal >= (used[recallBlockMarker(cardId, blockIndex)] ?? 0),
  )
  if (availableBlocks.length === 0) return ['That Recall effect was already used this turn']

  for (const block of availableBlocks) {
    const blockIndex = blocks.indexOf(block)
    const marker = recallBlockMarker(cardId, blockIndex)
    used[marker] = (used[marker] ?? 0) + 1
  }
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    effectPlayerId: playerId,
    sourceCardId: cardId,
    remainingEffects: availableBlocks.flatMap(block => block.effects),
    spellDamageBonus: 0,
  })
}

export interface PreppedCardAction {
  breachIndex: number
  spellIndex: number
  cardId: string
  /** Whether the action targets a played card or the prepped spell itself. */
  kind: 'return_card_to_hand' | 'activate_effect'
  choices: CardChoice[]
  marker: string
  /** Whether the action can be activated repeatedly while its conditions remain true. */
  repeatable: boolean
}

function findReturnCardEffect(effects: CardEffect[]): Extract<CardEffect, { kind: 'return_card_to_hand' }> | null {
  for (const effect of effects) {
    if (effect.kind === 'return_card_to_hand') return effect
    if (effect.kind === 'choose_optional' || effect.kind === 'choose_one') {
      const nested = effect.kind === 'choose_optional'
        ? findReturnCardEffect(effect.effects)
        : effect.options.map(option => findReturnCardEffect(option.effects)).find(Boolean) ?? null
      if (nested) return nested
    }
  }
  return null
}

function isDeferredReturnAction(effects: CardEffect[]): boolean {
  if (effects.length !== 1) return false
  const effect = effects[0]!
  if (effect.kind === 'return_card_to_hand') return true
  if (effect.kind === 'choose_optional') return isDeferredReturnAction(effect.effects)
  if (effect.kind === 'choose_one') {
    return effect.options.length > 0 && effect.options.every(option => isDeferredReturnAction(option.effects))
  }
  return false
}

/** Main-phase while-prepped blocks are either board-card actions or explicit
 * clicks on the spell itself. Automatic resolution must leave both kinds
 * untouched until the player activates them. */
function isManualPreppedActionBlock(block: CardEffectBlock): boolean {
  return block.manualActivation === true || isDeferredReturnAction(block.effects)
}

/** Whether a typed effect sequence requires at least one prepared spell. */
function containsCastAnyNumberPreppedSpells(effects: CardEffect[]): boolean {
  return effects.some(effect => {
    if (effect.kind === 'cast_any_number_prepped_spells') return true
    if (effect.kind === 'conditional' || effect.kind === 'choose_optional') {
      return containsCastAnyNumberPreppedSpells(effect.effects)
    }
    if (effect.kind === 'choose_one') {
      return effect.options.some(option => containsCastAnyNumberPreppedSpells(option.effects))
    }
    return false
  })
}

function getPreppedReturnActions(
  g: GameState, playerId: string, phase: 'main_phase',
): PreppedCardAction[] {
  const p = getPlayer(g, playerId)
  const turnEffects = getPlayerTurnEffects(p)
  const actions: PreppedCardAction[] = []
  for (const breach of p.breaches) {
    if (!isPresentBreach(breach)) continue
    for (const [spellIndex, cardId] of breach.prepSpells.entries()) {
      const blocks = matchingBlocks(cardId, playerId, g, { kind: 'while_prepped', phase })
      for (const [blockIndex, block] of blocks.entries()) {
        const effect = findReturnCardEffect(block.effects)
        const isReturnAction = !!effect && isDeferredReturnAction(block.effects)
        if (!isReturnAction && !block.manualActivation) continue
        const instanceId = breach.preppedSpellInstanceIds![spellIndex]!
        const marker = preppedSpellEffectMarker(instanceId, phase, blockIndex)
        if (block.oncePerTurn && hasUsedPreppedSpellEffect(p, marker, cardId, phase, blockIndex)) continue
        if (isReturnAction && effect) {
          const choices = getCardChoices(g, playerId, effect.source)
          if (choices.length === 0) continue
          actions.push({ breachIndex: breach.index, spellIndex, cardId, kind: effect.kind, choices, marker, repeatable: !block.oncePerTurn })
        } else if (block.effects.length > 0) {
          actions.push({ breachIndex: breach.index, spellIndex, cardId, kind: 'activate_effect', choices: [], marker, repeatable: !block.oncePerTurn })
        }
      }
    }
  }
  return actions
}

/** Return main-phase prepped-spell actions that can be activated without blocking the turn. */
export function getPreppedCardActions(g: GameState, playerId: string): PreppedCardAction[] {
  if (g.pendingDecision || g.pendingEffect) return []
  return getPreppedReturnActions(g, playerId, 'main_phase')
}

/** Activate a selected main-phase action from a currently prepped spell. */
export function activatePreppedCardAction(
  g: GameState, playerId: string, choice: CardChoice,
): string | null {
  if (g.pendingDecision || g.pendingEffect) return 'Resolve the pending card decision first'
  const action = getPreppedCardActions(g, playerId)
    .find(candidate => candidate.choices.some(item =>
      item.zone === choice.zone && item.index === choice.index && item.cardId === choice.cardId))
  if (!action || action.kind !== 'return_card_to_hand') return 'That card is not an available prepped action'
  const p = getPlayer(g, playerId)
  const turnEffects = getPlayerTurnEffects(p)
  const breach = p.breaches.find(item => item.index === action.breachIndex)
  const block = breach?.prepSpells[action.spellIndex]
    ? matchingBlocks(breach.prepSpells[action.spellIndex]!, playerId, g, { kind: 'while_prepped', phase: 'main_phase' })
      .find((item, index) => preppedSpellEffectMarker(
        breach.preppedSpellInstanceIds![action.spellIndex]!, 'main_phase', index,
      ) === action.marker)
    : undefined
  const returned = returnSelectedCard(g, playerId, choice)
  if (!returned) return 'That card is no longer available'
  if (block?.oncePerTurn) turnEffects.usedPreppedEffects.push(action.marker)
  return `Returned ${getCard(returned).name} to hand`
}

/** Activate a Main Phase while-prepped effect by clicking the prepped spell. */
export function activatePreppedSpellAction(
  g: GameState, playerId: string, breachIndex: number, spellIndex: number,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Resolve the pending card decision first']
  const action = getPreppedCardActions(g, playerId).find(candidate =>
    candidate.kind === 'activate_effect'
      && candidate.breachIndex === breachIndex
      && candidate.spellIndex === spellIndex,
  )
  if (!action) return ['That prepped spell has no available Main Phase action']

  const p = getPlayer(g, playerId)
  const breach = p.breaches.find(item => item.index === breachIndex)
  const cardId = breach?.prepSpells[spellIndex]
  if (!breach || !cardId || cardId !== action.cardId) return ['That prepped spell is no longer available']
  const block = matchingBlocks(cardId, playerId, g, { kind: 'while_prepped', phase: 'main_phase' })
    .find((item, index) => preppedSpellEffectMarker(
      breach.preppedSpellInstanceIds![spellIndex]!, 'main_phase', index,
    ) === action.marker)
  if (!block || !block.manualActivation) return ['That prepped spell has no available Main Phase action']

  if (block.oncePerTurn) getPlayerTurnEffects(p).usedPreppedEffects.push(action.marker)
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    sourceCardId: cardId,
    remainingEffects: [...block.effects],
    preppedPhase: 'main_phase',
  })
}

/** A clickable Main Phase action exposed by a face-up Mage-specific card in play. */
export interface PlayerCardInPlayAction {
  cardIndex: number
  cardId: string
  marker: string
  repeatable: boolean
}

/** Check conditions that decide whether an explicit in-play action can do anything. */
function manualActionHasAvailableChoice(
  g: GameState,
  playerId: string,
  effects: CardEffect[],
  sourceCardId: string,
  sourceCardIndex: number,
  sourcePlayerId: string,
): boolean {
  for (const effect of effects) {
    if (effect.kind === 'choose_one') {
      return effect.options.some(option => conditionMatches(
        g, playerId, option.condition, undefined, sourceCardId, sourceCardIndex, sourcePlayerId,
      ))
    }
    if (effect.kind === 'choose_optional' && (effect.disableIfUnavailable || effect.skipIfUnavailable) && (
      !optionalEffectAvailable(g, playerId, effect.effects, sourcePlayerId) ||
      (effect.skipIfUnavailable && effect.acceptCondition !== undefined && !conditionMatches(
        g, playerId, effect.acceptCondition, undefined, sourceCardId, sourceCardIndex, sourcePlayerId,
      )) ||
      !manualActionHasAvailableChoice(
        g, playerId, effect.effects, sourceCardId, sourceCardIndex, sourcePlayerId,
      )
    )) {
      return false
    }
    if (effect.kind === 'conditional' && conditionMatches(
      g, playerId, effect.condition, undefined, sourceCardId, sourceCardIndex, sourcePlayerId,
    ) && !manualActionHasAvailableChoice(
      g, playerId, effect.effects, sourceCardId, sourceCardIndex, sourcePlayerId,
    )) {
      return false
    }
    if (effect.kind === 'focus_breach' && getBreachChoices(
      g, effect.target, playerId,
    ).length === 0) {
      return false
    }
  }
  return true
}

/** Return actions from a displayed player's in-play cards using the current turn actor's state. */
export function getPlayerCardInPlayActions(g: GameState, playerId: string): PlayerCardInPlayAction[] {
  if (g.pendingDecision || g.pendingEffect || g.currentPhase !== 'main' || g.currentTurn === 'nemesis') return []
  const player = getPlayer(g, playerId)
  const actingPlayerId = g.currentTurn
  ensurePlayerCollections(player)
  const used = getPlayerTurnEffects(getPlayer(g, actingPlayerId)).usedPlayerCardEffects ?? []
  const actions: PlayerCardInPlayAction[] = []
  for (const [cardIndex, cardId] of player.playerCardsInPlay!.entries()) {
    const blocks = matchingBlocks(
      cardId, playerId, g, { kind: 'while_in_play', phase: 'main_phase' }, cardIndex, actingPlayerId,
    )
    for (const [blockIndex, block] of blocks.entries()) {
      if (!block.manualActivation || block.effects.length === 0) continue
      if (block.ownerTurnOnly && playerId !== actingPlayerId) continue
      if (containsCastAnyNumberPreppedSpells(block.effects) &&
        !getPreppedSpellChoices(g).some(choice => choice.playerId === actingPlayerId)) continue
      const effectPlayerId = block.effectPlayerScope === 'owner' ? playerId : actingPlayerId
      if (!manualActionHasAvailableChoice(
        g, effectPlayerId, block.effects, cardId, cardIndex, effectPlayerId,
      )) continue
      const marker = `in_play:${cardId}:${cardIndex}:main_phase:${blockIndex}`
      if (block.oncePerTurn && used.includes(marker)) continue
      actions.push({ cardIndex, cardId, marker, repeatable: !block.oncePerTurn })
    }
  }
  return actions
}

/** Resolve a clicked Main Phase action from a face-up Mage-specific card in play. */
export function activatePlayerCardInPlayAction(
  g: GameState, playerId: string, cardIndex: number,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Resolve the pending card decision first']
  if (g.currentPhase !== 'main' || g.currentTurn === 'nemesis') {
    return ['Player cards in play can only be activated during a player Main Phase']
  }
  const actingPlayerId = g.currentTurn
  const actions = getPlayerCardInPlayActions(g, playerId)
  const action = actions.find(candidate => candidate.cardIndex === cardIndex)
  if (!action) return ['That Player card in play has no available Main Phase action']
  const player = getPlayer(g, playerId)
  const cardId = player.playerCardsInPlay?.[cardIndex]
  if (!cardId || cardId !== action.cardId) return ['That Player card in play is no longer available']
  const block = matchingBlocks(
    cardId, playerId, g, { kind: 'while_in_play', phase: 'main_phase' }, cardIndex, actingPlayerId,
  )
    .find((candidate, blockIndex) => `in_play:${cardId}:${cardIndex}:main_phase:${blockIndex}` === action.marker)
  if (!block || !block.manualActivation) return ['That Player card in play has no available Main Phase action']
  if (block.oncePerTurn) getPlayerTurnEffects(getPlayer(g, actingPlayerId)).usedPlayerCardEffects!.push(action.marker)
  const effectSourcePlayerId = block.effectPlayerScope === 'owner' ? playerId : actingPlayerId
  return runEffectResolution(g, {
    sourcePlayerId: effectSourcePlayerId,
    sourceCardOwnerId: playerId,
    effectPlayerId: effectSourcePlayerId,
    sourceCardId: cardId,
    remainingEffects: [...block.effects],
    preppedPhase: 'main_phase',
  })
}

/** Resolve effects that belong to spells currently prepped on the player's breaches. */
export function resolvePreppedEffects(
  g: GameState, playerId: string, phase: 'casting_phase_end' | 'main_phase',
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  const p = getPlayer(g, playerId)
  const turnEffects = getPlayerTurnEffects(p)
  const allEffects: CardEffect[] = []
  const seen = new Set<string>()

  for (const breach of p.breaches) {
    if (!isPresentBreach(breach)) continue
    for (const [spellIndex, cardId] of breach.prepSpells.entries()) {
      const blocks = matchingBlocks(cardId, playerId, g, { kind: 'while_prepped', phase })
      for (const [blockIndex, block] of blocks.entries()) {
      // Main-phase card actions are exposed as clickable choices instead of a blocking modal.
      if (phase === 'main_phase' && isManualPreppedActionBlock(block)) continue
      const blockEffects: CardEffect[] = phase === 'casting_phase_end' && block.requiresConfirmation
      ? [{
            kind: 'confirm_prepped_effect',
            prompt: `Resolve ${getCard(cardId).name}'s effect`,
            cardId,
            breachIndex: breach.index,
            spellIndex,
            effects: block.effects,
          }]
        : block.effects
      const effectPlayer = block.effectPlayerScope === 'owner' ? p.id : playerId
      const contextualEffects: CardEffect[] = [
        {
          kind: 'restore_effect_context', sourcePlayerId: effectPlayer,
          sourceCardOwnerId: p.id, sourceCardId: cardId, effectPlayerId: effectPlayer,
        },
        ...blockEffects,
        { kind: 'restore_effect_context', sourcePlayerId: playerId },
      ]
      if (!block.oncePerTurn) {
        allEffects.push(...contextualEffects)
        continue
      }
      const instanceId = breach.preppedSpellInstanceIds![spellIndex]!
      const marker = preppedSpellEffectMarker(instanceId, phase, blockIndex)
      if (hasUsedPreppedSpellEffect(p, marker, cardId, phase, blockIndex) || seen.has(marker)) continue
      seen.add(marker)
      turnEffects.usedPreppedEffects.push(marker)
      allEffects.push(...contextualEffects)
      }
    }
  }

  if (allEffects.length === 0) return []
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    remainingEffects: allEffects,
    preppedPhase: phase,
  })
}

/** Complete the currently pending card decision and continue its effect sequence. */
function resolveDividedDamageAllocationAction(
  g: GameState,
  decision: Extract<PendingDecision, { kind: 'allocate_divided_damage' }>,
  answer: Extract<PendingDecisionAnswer, { kind: 'allocate_divided_damage' }>,
): string[] {
  const resolution = g.pendingEffect
  const effect = resolution?.awaiting
  const allocation = resolution?.dividedDamageAllocation
  if (!resolution || effect?.kind !== 'deal_damage_divided' || !allocation) {
    return ['The divided damage allocation is no longer available']
  }

  if (answer.action === 'add' || answer.action === 'remove') {
    const target = decision.targets.find(candidate => candidate.id === answer.targetId)
    const currentTarget = getDamageTargets(g, allocation.target, resolution.sourceCardId)
      .find(candidate => candidate.id === answer.targetId)
    if (!target || !currentTarget) return ['The selected enemy is no longer available']

    const assigned = allocation.amounts[answer.targetId] ?? 0
    if (answer.action === 'add') {
      if (allocation.remaining <= 0) return ['All divided damage is already assigned']
      allocation.amounts[answer.targetId] = assigned + 1
      allocation.remaining--
      return [`Assigned 1 damage to ${target.label}; ${allocation.remaining} damage remains unassigned`]
    }

    if (assigned <= 0) return [`${target.label} has no assigned damage to cancel`]
    if (assigned === 1) delete allocation.amounts[answer.targetId]
    else allocation.amounts[answer.targetId] = assigned - 1
    allocation.remaining++
    return [`Cancelled 1 damage from ${target.label}; ${allocation.remaining} damage remains unassigned`]
  }

  const assignedTotal = Object.values(allocation.amounts).reduce((sum, amount) => sum + amount, 0)
  if (allocation.remaining > 0 || assignedTotal !== allocation.total) {
    return [`Choose a target for all ${allocation.remaining} unassigned damage before confirming`]
  }

  const targets = getDamageTargets(g, allocation.target, resolution.sourceCardId)
  const assignedTargets = Object.entries(allocation.amounts).flatMap(([targetId, amount]) => {
    const target = targets.find(candidate => candidate.id === targetId)
    return target && amount > 0 ? [{ target, amount }] : []
  })
  if (assignedTargets.reduce((sum, item) => sum + item.amount, 0) !== allocation.total) {
    return ['An assigned enemy is no longer available']
  }

  g.pendingDecision = null
  resolution.awaiting = undefined
  resolution.dividedDamageAllocation = undefined
  const messages = [`Resolved ${allocation.total} divided damage`]
  for (const { target, amount } of assignedTargets) {
    messages.push(dealNemesisTargetDamage(g, resolution, target, amount))
    if (g.gameOver) break
  }
  return [...messages, ...runEffectResolution(g, resolution)]
}

/** @internal The callbacks that connect decision resumption to the engine runtime. */
export interface DecisionResolutionServices {
  addRemainingEffects: typeof addRemainingEffects
  amountValue: typeof amountValue
  applyFreeBreachFocus: typeof applyFreeBreachFocus
  applySpellDamageBonus: typeof applySpellDamageBonus
  canConjureToBreach: typeof canConjureToBreach
  captureEffectContext: typeof captureEffectContext
  cardChoiceMatches: typeof cardChoiceMatches
  cardNameMatchesAny: typeof cardNameMatchesAny
  checkGameOver: typeof checkGameOver
  checkPlayerDeath: typeof checkPlayerDeath
  collectBreachOpenedEffects: typeof collectBreachOpenedEffects
  conditionMatches: typeof conditionMatches
  contextualizeCardEffectBlock: typeof contextualizeCardEffectBlock
  continueNemesisDiscard: typeof continueNemesisDiscard
  createDecision: typeof createDecision
  damageEffectAmountValue: typeof damageEffectAmountValue
  dealDamage: typeof dealDamage
  dealNemesisTargetDamage: typeof dealNemesisTargetDamage
  destroyExhaustedBreach: typeof destroyExhaustedBreach
  devourMarketPile: typeof devourMarketPile
  discardCollectiveCards: typeof discardCollectiveCards
  discardPreppedSpellChoices: typeof discardPreppedSpellChoices
  discardSelectedCards: typeof discardSelectedCards
  drawCardsForPlayer: typeof drawCardsForPlayer
  effectPlayerId: typeof effectPlayerId
  ensureTrinketDeckState: typeof ensureTrinketDeckState
  gainCard: typeof gainCard
  gainPulseTokens: typeof gainPulseTokens
  gainSwapZoneCard: typeof gainSwapZoneCard
  getBreachChoices: typeof getBreachChoices
  getCardChoices: typeof getCardChoices
  getExhaustBreachChoices: typeof getExhaustBreachChoices
  getMarketCardCost: typeof getMarketCardCost
  getPreppedSpellCost: typeof getPreppedSpellCost
  getSupplyPileGainEffects: typeof getSupplyPileGainEffects
  losePulseTokens: typeof losePulseTokens
  matchingBlocks: typeof matchingBlocks
  moveGainedSupplyCardToDeck: typeof moveGainedSupplyCardToDeck
  pauseEffect: typeof pauseEffect
  pauseRevealTopCard: typeof pauseRevealTopCard
  pendingDecision: typeof pendingDecision
  playerCardPowerTokenCount: typeof playerCardPowerTokenCount
  putPlayerCardIntoPlay: typeof putPlayerCardIntoPlay
  queuePlayerExhaustion: typeof queuePlayerExhaustion
  recallBlockMarker: typeof recallBlockMarker
  rememberSpecificDeckCard: typeof rememberSpecificDeckCard
  rememberSpecificDeckTop: typeof rememberSpecificDeckTop
  resetBreachToStartingPosition: typeof resetBreachToStartingPosition
  resolveDividedDamageAllocationAction: typeof resolveDividedDamageAllocationAction
  resolveMageSetups: typeof resolveMageSetups
  returnSelectedCard: typeof returnSelectedCard
  runEffectResolution: typeof runEffectResolution
  selectedChoicesAreCurrent: typeof selectedChoicesAreCurrent
  selectedCollectiveCardsAreCurrent: typeof selectedCollectiveCardsAreCurrent
  setPendingDecision: typeof setPendingDecision
  setPlayerCardSupplyTarget: typeof setPlayerCardSupplyTarget
  sufferPlayerDamage: typeof sufferPlayerDamage
  toRoman: typeof toRoman
}

const resolvePendingDecisionWithServices = createDecisionResolver({
  addRemainingEffects,
  amountValue,
  applyFreeBreachFocus,
  applySpellDamageBonus,
  canConjureToBreach,
  captureEffectContext,
  cardChoiceMatches,
  cardNameMatchesAny,
  checkGameOver,
  checkPlayerDeath,
  collectBreachOpenedEffects,
  conditionMatches,
  contextualizeCardEffectBlock,
  continueNemesisDiscard,
  createDecision,
  damageEffectAmountValue,
  dealDamage,
  dealNemesisTargetDamage,
  destroyExhaustedBreach,
  devourMarketPile,
  discardCollectiveCards,
  discardPreppedSpellChoices,
  discardSelectedCards,
  drawCardsForPlayer,
  effectPlayerId,
  ensureTrinketDeckState,
  gainCard,
  gainPulseTokens,
  gainSwapZoneCard,
  getBreachChoices,
  getCardChoices,
  getExhaustBreachChoices,
  getMarketCardCost,
  getPreppedSpellCost,
  getSupplyPileGainEffects,
  losePulseTokens,
  matchingBlocks,
  moveGainedSupplyCardToDeck,
  pauseEffect,
  pauseRevealTopCard,
  pendingDecision,
  playerCardPowerTokenCount,
  putPlayerCardIntoPlay,
  queuePlayerExhaustion,
  recallBlockMarker,
  rememberSpecificDeckCard,
  rememberSpecificDeckTop,
  resetBreachToStartingPosition,
  resolveDividedDamageAllocationAction,
  resolveMageSetups,
  returnSelectedCard,
  runEffectResolution,
  selectedChoicesAreCurrent,
  selectedCollectiveCardsAreCurrent,
  setPendingDecision,
  setPlayerCardSupplyTarget,
  sufferPlayerDamage,
  toRoman,
})

export function resolvePendingDecision(g: GameState, decisionId: string, answer: PendingDecisionAnswer): string[] {
  return resolvePendingDecisionWithServices(g, decisionId, answer)
}
const nemesisTurn = createNemesisTurnRuntime({
  conditionMatches: (game, playerId, condition, sourceCardId) =>
    conditionMatches(game, playerId, condition, undefined, sourceCardId),
  runEffectResolution: (game, resolution) => runEffectResolution(game, resolution),
  resolveEffects,
  createDecision,
  setPendingDecision,
  checkGameOver,
  dealDamage,
  getCardChoices,
  getPreppedSpellChoices,
  getPreppedSpellCost,
  discardSelectedCards,
  drawCardsForPlayer,
})

function ensureNemesisRuntime(g: GameState): void {
  nemesisTurn.ensureNemesisRuntime(g)
}

function cardInstanceKey(card: NemesisCardInPlay): string {
  return nemesisTurn.cardInstanceKey(card)
}

function initializeNemesisTurn(g: GameState): void {
  nemesisTurn.initializeNemesisTurn(g)
}

function activeNemesisRules(g: GameState) {
  return nemesisTurn.activeNemesisRules(g)
}

function usesDevouredPile(g: GameState): boolean {
  return nemesisTurn.usesDevouredPile(g)
}

function emptyMarketPileCount(g: GameState): number {
  return nemesisTurn.emptyMarketPileCount(g)
}

function devourMarketPile(g: GameState, pileIndex: number, amount: number): string[] {
  return nemesisTurn.devourMarketPile(g, pileIndex, amount)
}

function fixedDevourPile(
  g: GameState,
  pile: Extract<CardEffect, { kind: 'devour_market_cards' }>['pile'],
  cardType?: 'gem' | 'relic' | 'spell',
): MarketPileChoice | null {
  return nemesisTurn.fixedDevourPile(g, pile, cardType)
}

function discardCompletedNemesisCard(g: GameState, resolution: NemesisResolutionState): void {
  nemesisTurn.discardCompletedNemesisCard(g, resolution)
}

export function advanceNemesisTurn(g: GameState): string[] {
  return nemesisTurn.advanceNemesisTurn(g)
}

export function resolveNemesisMainPhase(g: GameState): string[] {
  return nemesisTurn.resolveNemesisMainPhase(g)
}

export function resolveNemesisDrawPhase(g: GameState): string[] {
  return nemesisTurn.resolveNemesisDrawPhase(g)
}

export function drawStrikeCard(g: GameState): string | null {
  return nemesisTurn.drawStrikeCard(g)
}

export function returnStrikeCardToDeck(g: GameState, cardId: string, instanceId?: string): void {
  nemesisTurn.returnStrikeCardToDeck(g, cardId, instanceId)
}

export function getNemesisDiscardActions(
  g: GameState, playerId: string, includePending = false,
): NemesisDiscardActionType[] {
  return nemesisTurn.getNemesisDiscardActions(g, playerId, includePending)
}

function continueNemesisDiscard(g: GameState): string[] {
  return nemesisTurn.continueNemesisDiscard(g)
}

export function discardNemesisPower(g: GameState, playerId: string, instanceId: string): string[] {
  return nemesisTurn.discardNemesisPower(g, playerId, instanceId)
}

export function pendingDecision(g: GameState): PendingDecision | null {
  return g.pendingDecision
}

// ===== Casting Phase =====

export interface CastableSpell {
  breachIndex: number; spellIndex: number; cardId: string; cardName: string; mustCast: boolean
}

export function getCastableSpells(g: GameState, playerId: string): CastableSpell[] {
  const p = getPlayer(g, playerId)
  return p.breaches.flatMap(b => {
    if (!isPresentBreach(b)) return []
    return b.prepSpells.map((cardId, spellIndex) => ({
      breachIndex: b.index,
      spellIndex,
      cardId,
      cardName: getCard(cardId).name,
      mustCast: !b.opened,
    }))
  })
}

export function castSpell(g: GameState, playerId: string, breachIndex: number, spellIndex = 0): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b) || !b.prepSpells[spellIndex]) return 'No spell prepped on this breach'

  const cardId = b.prepSpells[spellIndex]!
  const cardDef = getCard(cardId)
  const faceDown = isFaceDownPreppedSpell(b, spellIndex)
  if (cardDef.type !== 'spell' && !faceDown) return 'Only a Spell can be cast'
  p.spellsCastThisTurn = (p.spellsCastThisTurn ?? 0) + 1
  const spellCost = getPreppedSpellCost(g, playerId, breachIndex, spellIndex) ?? cardDef.cost
  const spellDamageBonus = spellBreachDamageBonus(b) + turnSpellDamageBonus(g, playerId, spellCost)

  const name = cardDef.name

  const messages = [`Cast ${name}`]
  const pending: PendingSpellCast = {
    playerId, casterPlayerId: playerId, breachIndex, spellIndex, cardId,
    discard: !(b.special === 'transfer' && b.opened),
    transferToAlly: b.special === 'transfer' && b.opened,
    faceDown,
  }
  const castContext: CardEffect = {
    kind: 'restore_effect_context',
    sourcePlayerId: playerId,
    sourceCardOwnerId: playerId,
    sourceCardId: cardDef.id,
    effectPlayerId: playerId,
    pendingSpellCast: { ...pending },
    spellDamageBonus,
  }
  const spellEffects: CardEffect[] = faceDown
    ? [{ kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' }]
    : matchingBlocks(cardDef.id, playerId, g, { kind: 'on_cast' }, undefined,
      playerId, undefined, playerId).flatMap(block => contextualizeCardEffectBlock(
        block, cardDef.id, playerId, playerId, castContext,
      ))
  const directEffects = [
    ...spellEffects,
    ...resolveSimultaneousEffectGroups(breachOnCastEffects(g, p, b, playerId, castContext)),
  ]
  if (pending.transferToAlly) directEffects.push({ kind: 'place_cast_spell_in_ally_hand' })
  if (pending.transferToAlly) directEffects.push({ kind: 'finalize_spell_cast' })
  messages.push(...resolveEffects(g, playerId, directEffects, cardDef.id, spellDamageBonus, undefined, false, pending))
  return messages.join('; ')
}

// ===== Main Phase =====

export function playCard(
  g: GameState, playerId: string, cardId: string, handIndex?: number,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  // Card IDs identify a card definition, not a physical copy. UI actions pass
  // the selected slot so playing a later duplicate cannot remove the first one.
  const idx = handIndex ?? p.hand.indexOf(cardId)
  if (idx < 0 || idx >= p.hand.length || p.hand[idx] !== cardId) return 'Card not in hand'

  const card = getCard(cardId)
  if (card.type === 'spell') return 'Spells must be prepped, use "r" command'
  if (card.type !== 'gem' && card.type !== 'relic' && card.type !== 'treasure') {
    return `${card.name} cannot be played from hand`
  }

  const onPlayBlocks = matchingBlocks(
    cardId, playerId, g, { kind: 'on_play' }, undefined, playerId, cardId,
  )
  const onPlayEffects = onPlayBlocks.flatMap(block => block.effects)
  const attachEffects = onPlayEffects.filter(effect => effect.kind === 'attach_relic')
  if (attachEffects.length > 0) {
    const remainingEffects = [
      ...attachEffects,
      ...onPlayEffects.filter(effect => effect.kind !== 'attach_relic'),
    ]
    return runEffectResolution(g, {
      sourcePlayerId: playerId,
      sourceCardId: cardId,
      sourceCardInHandPendingPlay: true,
      sourceCardHandIndex: idx,
      remainingEffects,
    }).join('; ')
  }

  const hand = getPlayerCardInstanceZone(g, playerId, 'hand')
  const played = getPlayerCardInstanceZone(g, playerId, 'played_this_turn')
  const moved = moveCardBetweenZones(g, hand, idx, played, played.cards.length, 'play')
  if (!moved) return 'Card not in hand'
  ensurePlayerCollections(p)
  p.cardPlayCountsThisTurn[cardId] = (p.cardPlayCountsThisTurn[cardId] ?? 0) + 1

  const messages = [`Played ${card.name}`]
  messages.push(...resolveCardEffects(g, playerId, cardId, { kind: 'on_play' }))
  return messages.join('; ')
}

export function prepSpell(
  g: GameState, playerId: string, cardId: string, breachIndex: number, handIndex?: number,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (g.currentPhase !== 'main' || g.currentTurn !== playerId) {
    return 'Spells can only be prepped during your Main Phase'
  }
  const p = getPlayer(g, playerId)
  const idx = handIndex ?? p.hand.indexOf(cardId)
  if (idx < 0 || idx >= p.hand.length || p.hand[idx] !== cardId) return 'Card not in hand'

  const card = getCard(cardId)
  if (card.type !== 'spell') return 'Only spell cards can be prepped'

  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  const prepLimit = getPrepSpellLimit(p, breachIndex)
  if (b.prepSpells.length >= prepLimit) return `Breach already has ${prepLimit} spell(s)`
  if (!canPrepOnBreach(b, card.prepToClosedBreach === true)) return 'Cannot prep on this breach'

  ensurePlayerCollections(p)
  const hand = getPlayerCardInstanceZone(g, playerId, 'hand')
  const breachZone = getBreachCardInstanceZone(g, playerId, breachIndex)
  const moved = moveCardBetweenZones(g, hand, idx, breachZone, breachZone.cards.length, 'prep_spell')
  if (!moved) return 'Card not in hand'
  b.preppedThisTurn ??= []
  b.preppedThisTurn.push(true)
  b.preppedSpellFaceDown ??= []
  b.preppedSpellFaceDown.push(false)
  b.preppedSpellInstanceIds ??= []
  b.preppedSpellInstanceIds.push(moved.instanceId)
  return `Prepped ${card.name} on Breach ${toRoman(breachIndex)}`
}

export interface BuyableCard {
  pileIndex: number; cardId: string; cardName: string; cardType: string
  cost: number; remaining: number; affordable: boolean; developCost?: number
}

/** Cost after typed Treasure modifiers attached to a supply pile. */
export function getMarketCardCost(g: GameState, pileIndex: number, playerId?: string): number {
  const pile = g.market.piles[pileIndex]
  if (!pile) return 0
  let reduction = 0
  for (const owner of g.players) {
    ensurePlayerCollections(owner)
    for (const [cardIndex, cardId] of (owner.playerCardsInPlay ?? []).entries()) {
      if (playerCardSupplyTarget(owner, cardIndex) !== pileIndex) continue
      reduction += (getCard(cardId).effects ?? [])
        .filter(block => block.trigger.kind === 'while_set_next_to_supply')
        .flatMap(block => block.effects)
        .filter((effect): effect is Extract<CardEffect, { kind: 'reduce_supply_cost' }> => effect.kind === 'reduce_supply_cost')
        .reduce((sum, effect) => sum + Math.max(0, effect.amount), 0)
    }
  }
  if (playerId) {
    const owner = getPlayer(g, playerId)
    ensurePlayerCollections(owner)
    const cardType = getCard(pile.cardId).type
    for (const cardId of owner.playerCardsInPlay ?? []) {
      reduction += (getCard(cardId).effects ?? [])
        .filter(block => block.trigger.kind === 'while_in_play')
        .flatMap(block => block.effects)
        .filter((effect): effect is Extract<CardEffect, { kind: 'reduce_card_type_cost' }> =>
          effect.kind === 'reduce_card_type_cost' && effect.cardTypes.includes(cardType),
        )
        .reduce((sum, effect) => sum + Math.max(0, effect.amount), 0)
    }
  }
  return Math.max(0, getCard(pile.cardId).cost - reduction)
}

export function getBuyableCards(g: GameState): BuyableCard[] {
  const playerId = g.currentTurn !== 'nemesis' ? g.currentTurn : undefined
  return g.market.piles.map((pile, i) => {
    const card = getCard(pile.cardId)
    const cost = getMarketCardCost(g, i, playerId)
    const player = playerId ? getPlayer(g, playerId) : null
    const spendType: SpendType = card.type === 'gem' ? 'gem'
      : card.type === 'spell' ? 'spell'
      : card.type === 'relic' ? 'relic' : 'general'
    return {
      pileIndex: i, cardId: pile.cardId, cardName: card.name,
      cardType: card.type, cost, remaining: pile.remaining,
      affordable: !!player && pile.remaining > 0 && getSpendableAether(player, spendType) >= cost,
      developCost: card.developCost,
    }
  })
}

export function buyCard(g: GameState, playerId: string, pileIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const pile = g.market.piles[pileIndex]
  if (!pile || pile.remaining <= 0) return 'Pile empty'

  const card = getCard(pile.cardId)
  const p = getPlayer(g, playerId)
  const spendType: SpendType = card.type === 'gem' ? 'gem'
    : card.type === 'spell' ? 'spell'
    : card.type === 'relic' ? 'relic' : 'general'
  const available = getSpendableAether(p, spendType)
  const cost = getMarketCardCost(g, pileIndex, playerId)

  if (available < cost) return `Need ${cost} Aether, have ${available}`

  spendAether(p, cost, spendType)
  const message = gainCard(g, playerId, pile.cardId, 'discard_top', pileIndex)
  if (!message) return null
  const defeat = g.gameOver && g.winner === 'nemesis' && usesDevouredPile(g)
    ? '; DEFEAT! All supply piles have been Devoured!'
    : ''
  return `Bought ${card.name} (${cost}a) -> ${message}${defeat}`
}

export interface DevelopAction {
  source: 'supply' | 'develop_zone'
  index: number
  cardId: string
  cardName: string
  cost: number
}

/** Return affordable Develop actions for the active Mage using unrestricted Aether. */
export function getDevelopActions(g: GameState, playerId: string): DevelopAction[] {
  if (g.gameOver || g.currentTurn !== playerId || g.currentPhase !== 'main' ||
    g.pendingDecision || g.pendingEffect) return []
  const player = g.players.find(candidate => candidate.id === playerId)
  if (!player) return []
  ensurePlayerCollections(player)
  const available = getSpendableAether(player, 'general')
  const actions: DevelopAction[] = []

  g.market.piles.forEach((pile, index) => {
    const card = getCard(pile.cardId)
    if (pile.remaining <= 0 || card.developCost === undefined) return
    const cost = Math.max(0, Math.floor(card.developCost))
    if (available >= cost) actions.push({ source: 'supply', index, cardId: card.id, cardName: card.name, cost })
  })

  ensureSharedDevelopZone(g).forEach((cardId, index) => {
    const card = getCard(cardId)
    if (card.developCost === undefined) return
    const cost = Math.max(0, Math.floor(card.developCost))
    if (available >= cost) actions.push({ source: 'develop_zone', index, cardId, cardName: card.name, cost })
  })
  return actions
}

function canDevelopNow(g: GameState, playerId: string): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (g.gameOver || g.currentTurn !== playerId || g.currentPhase !== 'main') {
    return 'Develop is only available to the active player during their Main Phase'
  }
  return null
}

/** Pay a card's Develop cost and move one copy from the supply into the shared Develop zone. */
export function developCardFromSupply(g: GameState, playerId: string, pileIndex: number): string | null {
  const blocked = canDevelopNow(g, playerId)
  if (blocked) return blocked
  const pile = g.market.piles[pileIndex]
  if (!pile || pile.remaining <= 0) return 'Pile empty'
  const card = getCard(pile.cardId)
  if (card.developCost === undefined) return `${card.name} cannot be Developed`
  const cost = Math.max(0, Math.floor(card.developCost))
  const player = getPlayer(g, playerId)
  const available = getSpendableAether(player, 'general')
  if (available < cost) return `Need ${cost} Aether to Develop ${card.name}, have ${available}`

  spendAether(player, cost, 'general')
  pile.remaining--
  const develop = getSharedDevelopCardInstanceZone(g)
  createCardInZone(g, develop, card.id, develop.cards.length, 'develop', true, {
    zoneId: `supply:${pileIndex}`,
    zone: 'supply',
    ownerId: null,
    index: pile.remaining,
  })
  const messages = [`Developed ${card.name} from the supply (${cost}a) -> Develop zone`]
  if (usesDevouredPile(g) && g.market.piles.every(candidate => candidate.remaining <= 0)) {
    finishGame(g, 'nemesis')
    messages.push('DEFEAT! All supply piles have been Devoured!')
  }
  messages.push(...resolveCardEffects(g, playerId, card.id, { kind: 'on_develop' }, card.id))
  return messages.join('; ')
}

/** Pay a card's Develop cost, gain it from the shared zone, and resolve both gain and Develop effects. */
export function developCardFromZone(g: GameState, playerId: string, zoneIndex: number): string | null {
  const blocked = canDevelopNow(g, playerId)
  if (blocked) return blocked
  const zone = ensureSharedDevelopZone(g)
  const cardId = zone[zoneIndex]
  if (!cardId) return 'Develop zone card is no longer available'
  const card = getCard(cardId)
  if (card.developCost === undefined) return `${card.name} cannot be Developed`
  const cost = Math.max(0, Math.floor(card.developCost))
  const player = getPlayer(g, playerId)
  const available = getSpendableAether(player, 'general')
  if (available < cost) return `Need ${cost} Aether to Develop ${card.name}, have ${available}`

  spendAether(player, cost, 'general')
  const develop = getSharedDevelopCardInstanceZone(g)
  const discard = getPlayerCardInstanceZone(g, playerId, 'discard')
  const moved = moveCardBetweenZones(g, develop, zoneIndex, discard, 0, 'develop')
  if (!moved) return null
  const gainMessage = `Gained ${card.name} -> discard pile`
  const effects = [
    ...matchingBlocks(cardId, playerId, g, { kind: 'on_gain' }).flatMap(block => block.effects),
    ...matchingBlocks(cardId, playerId, g, { kind: 'on_develop' }).flatMap(block => block.effects),
  ]
  const messages = [`Developed ${card.name} from the Develop zone (${cost}a) -> discard pile`, gainMessage]
  if (effects.length > 0) {
    messages.push(...resolveEffects(g, playerId, effects, cardId, 0, playerId, false, undefined, cardId))
  }
  return messages.join('; ')
}

/** Buy the revealed top card of a Nemesis-specific supply pile. */
export function buySpecificPileCard(g: GameState, playerId: string): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (!usesDevouredPile(g)) return 'This Nemesis has no buyable specific pile'
  const cardId = g.nemesis.strikeDeck[0]
  if (!cardId) return 'The Devoured pile is empty'

  const card = getCard(cardId)
  const p = getPlayer(g, playerId)
  const spendType: SpendType = card.type === 'gem' ? 'gem'
    : card.type === 'spell' ? 'spell'
    : card.type === 'relic' ? 'relic' : 'general'
  const available = getSpendableAether(p, spendType)
  if (available < card.cost) return `Need ${card.cost} Aether, have ${available}`

  spendAether(p, card.cost, spendType)
  const message = gainCard(g, playerId, cardId, 'discard_top', undefined, true, true)
  return message ? `Gained ${card.name} from the Devoured pile (${card.cost}a) -> ${message}` : null
}

export function focusBreach(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  if (b.opened) return 'Already open'
  if (b.focusCount >= b.focusToOpen) return 'Already focused'

  const effectiveCost = Math.max(0, b.focusCost - breachCostReduction(p, 'focus'))
  const available = getSpendableAether(p, 'breach')
  if (available < effectiveCost) return `Need ${effectiveCost} Aether, have ${available}`

  spendAether(p, effectiveCost, 'breach')
  consumeBreachCostReductions(p, 'focus')
  const opened = advanceBreachFocus(b)
  if (!opened) {
    const arrow = DIR_ARROW[b.focusDirection]
    return `Focused: facing ${arrow} (${b.focusCount}/${b.focusToOpen})`
  }
  const messages = [`Breach ${toRoman(breachIndex)} OPENED!`]
  messages.push(...resolveBreachOpenedEffects(g, playerId))
  return messages.join('; ')
}

/** Return the currently payable focus and direct-open costs for UI display. */
export function getBreachActionCosts(
  g: GameState, playerId: string, breachIndex: number,
): { focus: number; open: number } | null {
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return null
  return {
    focus: Math.max(0, b.focusCost - breachCostReduction(p, 'focus')),
    open: Math.max(0, currentBreachOpenCost(b) - breachCostReduction(p, 'open')),
  }
}

export function openBreach(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  if (b.opened) return 'Already open'
  if (b.focusCount < b.focusToOpen) return 'Not enough focus'

  b.opened = true
  consumeBreachCostReductions(p, 'open')
  return [`Breach ${toRoman(breachIndex)} opened!`, ...resolveBreachOpenedEffects(g, playerId)].join('; ')
}

export function openBreachDirect(g: GameState, playerId: string, breachIndex: number): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  const p = getPlayer(g, playerId)
  const b = p.breaches.find(br => br.index === breachIndex)
  if (!b || !isPresentBreach(b)) return 'Invalid breach'
  if (b.opened) return 'Already open'

  const cost = Math.max(0, currentBreachOpenCost(b) - breachCostReduction(p, 'open'))
  const available = getSpendableAether(p, 'breach')
  if (available < cost) return `Need ${cost} Aether (direct open), have ${available}`

  spendAether(p, cost, 'breach')
  consumeBreachCostReductions(p, 'open')
  b.opened = true
  b.focusCount = b.focusToOpen
  return [`Breach ${toRoman(breachIndex)} opened (${cost}a direct)!`, ...resolveBreachOpenedEffects(g, playerId)].join('; ')
}

function chargeGainBlockMessage(p: PlayerState, amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return 'Charge amount must be positive'
  const cost = amount * 2
  const available = getSpendableAether(p, 'general')
  if (available < cost) return `Need ${cost} Aether, have ${available}`
  if (p.charge + amount > p.chargeThreshold) return `Charge capped at ${p.chargeThreshold}`
  return null
}

export function canGainCharge(g: GameState, playerId: string, amount = 1): boolean {
  return chargeGainBlockMessage(getPlayer(g, playerId), amount) === null
}

export function gainCharge(g: GameState, playerId: string, amount: number): string | null {
  const p = getPlayer(g, playerId)
  const cost = amount * 2
  const blocked = chargeGainBlockMessage(p, amount)
  if (blocked) return blocked

  spendAether(p, cost, 'general')
  const gained = gainPlayerCharge(g, p, amount)
  return `Gained ${gained} charge (${p.charge}/${p.chargeThreshold})`
}

export function activateAbility(
  g: GameState, playerId: string,
): string | null {
  const blocked = pendingActionMessage(g)
  if (blocked) return blocked
  if (!canActivateAbilityDuringMain(g, playerId)) {
    return 'Abilities can only be activated during your main phase'
  }
  const p = getPlayer(g, playerId)
  if (p.charge < p.chargeThreshold) return `Need ${p.chargeThreshold} charge, have ${p.charge}`

  const def = MAGES[p.mageType]!
  if (def.abilityEffects.length === 0) return 'This ability is not implemented yet'
  if (def.abilityTrigger.kind !== 'main_phase') return 'This ability cannot be activated during the main phase'
  if (def.abilityEffects.some(effect => effect.kind === 'shuffle_turn_order_card') && getPlayerTurnOrderCards(g).length === 0) {
    return 'No player turn order card is available in the discard pile'
  }
  if (def.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') && getPreppedSpellChoices(g).length === 0) {
    return 'No prepped spell is available for this ability'
  }
  p.charge = 0
  const messages = [`${def.abilityName} activated`]
  const targetPlayerId = def.abilityTrigger.kind === 'main_phase' && def.abilityTrigger.scope === 'any_player'
    ? g.currentTurn
    : playerId
  messages.push(...resolveEffects(
    g, playerId, def.abilityEffects, `ability:${def.abilityName}`, 0, targetPlayerId,
    false, undefined, undefined, targetPlayerId,
  ))
  return messages.join('; ')
}

/** Whether this mage may offer its main-phase ability button in the current turn. */
export function canActivateAbilityDuringMain(g: GameState, playerId: string): boolean {
  if (g.currentPhase !== 'main' || g.currentTurn === 'nemesis' || g.pendingDecision || g.pendingEffect) return false
  const player = g.players.find(candidate => candidate.id === playerId)
  if (!player) return false
  const def = MAGES[player.mageType]
  if (!def || def.abilityEffects.length === 0 || def.abilityTrigger.kind !== 'main_phase') return false
  if (def.abilityEffects.some(effect => effect.kind === 'shuffle_turn_order_card') && getPlayerTurnOrderCards(g).length === 0) return false
  return def.abilityTrigger.scope === 'any_player' || g.currentTurn === playerId
}

// ===== Draw Phase =====

export function resolveDrawPhase(g: GameState, playerId: string): string[] {
  g.currentPhase = 'draw'
  const p = getPlayer(g, playerId)
  const msgs: string[] = []
  const unusedAetherTokens = p.aetherTokens ?? 0

  if (!p.drawPhaseSetupComplete) {
    // Capture played-card end-of-turn triggers before moving the cards to the
    // discard pile. They resolve after turn resources are reset, matching the
    // timing of persistent in-play cards and allowing Pact Prism's tokens to
    // survive into the next turn.
    const endTurnCardIds = p.pendingEndTurnCardIds ?? p.playedThisTurn
    const restoreContext: CardEffect = {
      kind: 'restore_effect_context', sourcePlayerId: p.id,
      sourceCardOwnerId: p.id, effectPlayerId: p.id,
    }
    const playedEndTurnEffects = endTurnCardIds.flatMap(cardId =>
      matchingBlocks(cardId, p.id, g, { kind: 'while_in_play', phase: 'end_turn_before_draw' },
        undefined, p.id, undefined, p.id).flatMap(block =>
        contextualizeCardEffectBlock(block, cardId, p.id, p.id, restoreContext)),
    )
    // The snapshot is single-use. If an effect pauses for a decision, a
    // subsequent continuation must not capture the same played cards again.
    p.pendingEndTurnCardIds = undefined
    // Move played cards to discard (reverse order = last played on top).
    const played = getPlayerCardInstanceZone(g, p.id, 'played_this_turn')
    const discard = getPlayerCardInstanceZone(g, p.id, 'discard')
    while (played.cards.length > 0) {
      moveCardBetweenZones(g, played, played.cards.length - 1, discard, 0, 'discard_phase')
    }
    p.cardPlayCountsThisTurn = {}
    p.conditionalAetherEarned = {}
    p.regularAetherSpent = 0
    p.condAetherSpent = {}
    p.bonusAether = 0
    p.corruptionsDrawnThisTurn = []
    p.aetherTokens = 0
    const turnEffects = getPlayerTurnEffects(p)
    turnEffects.nextBreachCostReductions = []
    turnEffects.usedPreppedEffects = []
    turnEffects.usedPlayerCardEffects = []
    turnEffects.usedRecallEffects = {}
    turnEffects.usedBreachUpgradeEffects = []
    turnEffects.prepSpellLimit = 1
    turnEffects.prepSpellLimitByBreach = {}
    turnEffects.spellDamageBonuses = []
    // Clear any focus granted during this Mage's turn before end-of-turn
    // effects resolve. startTurn also clears markers, covering focuses made
    // during the Nemesis turn or after a saved/paused boundary.
    clearFocusedBreachMarkers(g)
    for (const b of p.breaches) b.preppedThisTurn = b.prepSpells.map(() => false)
    p.drawPhaseSetupComplete = true
    if (playedEndTurnEffects.length > 0) {
      msgs.push(...resolveEffects(g, p.id, playedEndTurnEffects, undefined, 0, p.id))
      if (g.pendingDecision || g.pendingEffect) return msgs
    }
    msgs.push(...resolvePlayerInPlayPhaseEffects(g, p.id, 'end_turn_before_draw'))
    if (g.pendingDecision || g.pendingEffect) return msgs
  }

  // Draw to 5
  while (p.hand.length < 5) {
    const drawn = drawPlayerCardsToHand(g, p.id, 1)
    if (drawn.length === 0) break
  }
  msgs.push(`Hand filled to ${p.hand.length}, Aether reset${unusedAetherTokens > 0 ? `; discarded ${unusedAetherTokens} unused Aether token${unusedAetherTokens === 1 ? '' : 's'}` : ''}`)
  p.spellsCastThisTurn = 0
  p.drawPhaseSetupComplete = false

  return msgs
}

/** Start an exhaustion continuation from a caller outside an effect frame. */
export function resolvePlayerExhaustion(
  g: GameState, playerId: string, overflowDamage: number,
): string[] {
  if (g.pendingDecision || g.pendingEffect) return ['Another card effect is already waiting for a decision']
  return runEffectResolution(g, {
    sourcePlayerId: playerId,
    remainingEffects: [{
      kind: 'exhaust_player',
      playerId,
      overflowDamage: Math.max(0, overflowDamage),
    }],
  })
}

export interface MainPhaseActionHint {
  /** Stable UI target for the action that currently prevents the phase from ending. */
  targetId: string
  /** Player area that must be shown to interact with the target, when applicable. */
  viewPlayerId: string
  /** Short user-facing action description. */
  label: string
}

/** Return one currently legal Main Phase action for End Turn guidance. */
export function getMainPhaseActionHint(g: GameState, playerId: string): MainPhaseActionHint | null {
  const p = getPlayer(g, playerId)
  if (g.pendingDecision) return null

  // Playing a Gem or Relic is an available hand action.
  const playableCardIndex = p.hand.findIndex(cardId => getCard(cardId).type !== 'spell')
  if (playableCardIndex >= 0) {
    const card = getCard(p.hand[playableCardIndex]!)
    return {
      targetId: `hand-card:${playerId}:${playableCardIndex}`,
      viewPlayerId: playerId,
      label: `Play ${card.name}`,
    }
  }

  // A spell can be prepped when at least one breach can receive it.
  for (const [handIndex, cardId] of p.hand.entries()) {
    const card = getCard(cardId)
    if (card.type !== 'spell') continue
    const breach = p.breaches.find(candidate => isPresentBreach(candidate)
      && candidate.prepSpells.length < getPrepSpellLimit(p, candidate.index)
      && canPrepOnBreach(candidate, card.prepToClosedBreach === true))
    if (breach) {
      return {
        targetId: `hand-card:${playerId}:${handIndex}`,
        viewPlayerId: playerId,
        label: `Prepare ${card.name}`,
      }
    }
  }

  // A Power card's To Discard action remains a legal Main Phase action even
  // when the player has no Aether left. Keep it in the action check so an
  // Aether or Charge payment cannot end the phase before this interrupt.
  const nemesisDiscardAction = getNemesisDiscardActions(g, playerId)[0]
  if (nemesisDiscardAction) {
    return {
      targetId: `nemesis-card:${nemesisDiscardAction.instanceId}`,
      viewPlayerId: playerId,
      label: `Discard ${nemesisDiscardAction.cardName} in the Nemesis area`,
    }
  }

  // A prepped spell such as Arcane Nexus can expose a once-per-turn Main
  // Phase action even when the player has no cards to play or buy. Keep the
  // turn open so the clickable action is not skipped by auto-end logic.
  const preppedAction = getPreppedCardActions(g, playerId)[0]
  if (preppedAction) {
    const selectedChoice = preppedAction.kind === 'return_card_to_hand'
      ? preppedAction.choices[0]
      : undefined
    if (selectedChoice?.zone === 'played_this_turn') {
      return {
        targetId: `played-card:${playerId}:${selectedChoice.index}`,
        viewPlayerId: playerId,
        label: `Return ${selectedChoice.cardName} to hand using ${getCard(preppedAction.cardId).name}`,
      }
    }
    return {
      targetId: `prepped-spell:${playerId}:${preppedAction.breachIndex}:${preppedAction.spellIndex}`,
      viewPlayerId: playerId,
      label: `Activate ${getCard(preppedAction.cardId).name}`,
    }
  }

  // A Recall effect in the active player's Discard is also a Main Phase
  // action. Buying a Recall card can create this action after spending the
  // player's last Aether, so it must prevent automatic phase completion.
  const recallAction = getRecallActions(g, playerId)[0]
  if (recallAction) {
    return {
      targetId: `discard-pile:${playerId}`,
      viewPlayerId: playerId,
      label: `Resolve Recall on ${getCard(recallAction.cardId).name} in your Discard`,
    }
  }

  // Mage-specific cards placed into play may expose an explicit Main Phase
  // action (for example, destroying a Treasure for its benefit).
  for (const owner of g.players) {
    const inPlayAction = getPlayerCardInPlayActions(g, owner.id)[0]
    if (inPlayAction) {
      return {
        targetId: `player-card-in-play:${owner.id}:${inPlayAction.cardIndex}`,
        viewPlayerId: owner.id,
        label: `Activate ${getCard(inPlayAction.cardId).name}`,
      }
    }
  }

  // Developing a card is a Main Phase action that can remain available even
  // when the player has no cards left in hand.
  const developAction = getDevelopActions(g, playerId)[0]
  if (developAction) {
    return {
      targetId: developAction.source === 'supply'
        ? `market-pile:${developAction.index}`
        : `develop-zone-card:${developAction.index}`,
      viewPlayerId: playerId,
      label: `Develop ${developAction.cardName}`,
    }
  }

  // Inco can gain the revealed Firethorn using the same typed Aether rules as
  // the action itself. This action must also keep the turn open.
  const firethornId = p.mageType === 'inco' ? p.specificDeck?.[0] : undefined
  if (firethornId) {
    const firethorn = getCard(firethornId)
    const spendType: SpendType = firethorn.type === 'gem' || firethorn.type === 'spell' || firethorn.type === 'relic'
      ? firethorn.type
      : 'gain'
    if (getSpendableAether(p, spendType) >= 5) {
      return {
        targetId: `specific-deck:${playerId}`,
        viewPlayerId: playerId,
        label: `Gain ${firethorn.name} from the Firethorn deck`,
      }
    }
  }

  // Can buy something from market. Conditional Aether is type-restricted
  // (for example Indira's Spell-only Aether), so check the same spend type
  // that buyCard uses instead of only the general Aether pool.
  for (const [pileIndex, pile] of g.market.piles.entries()) {
    if (pile.remaining <= 0) continue
    const card = getCard(pile.cardId)
    const spendType: SpendType = card.type === 'gem' ? 'gem'
      : card.type === 'spell' ? 'spell'
        : card.type === 'relic' ? 'relic' : 'general'
    if (getMarketCardCost(g, pileIndex, p.id) <= getSpendableAether(p, spendType)) {
      return {
        targetId: `market-pile:${pileIndex}`,
        viewPlayerId: playerId,
        label: `Buy ${card.name} from the Market`,
      }
    }
  }

  // Can focus or open a breach
  const breachAether = getSpendableAether(p, 'breach')
  for (const b of p.breaches) {
    if (!isPresentBreach(b)) continue
    const focusCost = Math.max(0, b.focusCost - breachCostReduction(p, 'focus'))
    const openCost = Math.max(0, currentBreachOpenCost(b) - breachCostReduction(p, 'open'))
    if (!b.opened && b.focusCount < b.focusToOpen && focusCost <= breachAether) {
      return {
        targetId: `breach-focus:${playerId}:${b.index}`,
        viewPlayerId: playerId,
        label: `Focus Breach ${toRoman(b.index)}`,
      }
    }
    if (!b.opened && openCost <= breachAether) {
      return {
        targetId: `breach-open:${playerId}:${b.index}`,
        viewPlayerId: playerId,
        label: `Open Breach ${toRoman(b.index)}`,
      }
    }
  }

  // Can gain charge
  if (canGainCharge(g, playerId)) {
    return {
      targetId: `charge-button:${playerId}`,
      viewPlayerId: playerId,
      label: 'Gain a Charge',
    }
  }

  // A charged mage may activate its ability. Some abilities are available
  // during any player's main phase, so they must also prevent auto-ending
  // the current player's turn.
  for (const candidate of g.players) {
    if (candidate.charge < candidate.chargeThreshold || !canActivateAbilityDuringMain(g, candidate.id)) continue
    const def = MAGES[candidate.mageType]
    if (!def || def.abilityEffects.length === 0) continue
    if (def.abilityEffects.some(effect => effect.kind === 'shuffle_turn_order_card') && getPlayerTurnOrderCards(g).length === 0) continue
    if (!def.abilityEffects.some(effect => effect.kind === 'cast_prepped_spell') || getPreppedSpellChoices(g).length > 0) {
      return {
        targetId: `ability-button:${candidate.id}`,
        viewPlayerId: candidate.id,
        label: `Activate ${def.abilityName}`,
      }
    }
  }

  return null
}

export function canPlayerAct(g: GameState, playerId: string): boolean {
  return getMainPhaseActionHint(g, playerId) !== null
}

// ===== Helpers =====

export function toRoman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV'][n] ?? String(n)
}
