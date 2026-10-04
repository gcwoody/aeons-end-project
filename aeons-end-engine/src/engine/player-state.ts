import type { BreachState, CardZone, PlayerState, PlayerTurnEffects } from '../types'
import { MAGES } from '../data'

export const MAX_PULSE_TOKENS = 5

export function getZoneCards(player: PlayerState, zone: CardZone): string[] {
  if (zone === 'deck') return player.deck
  if (zone === 'hand') return player.hand
  if (zone === 'discard') return player.discard
  if (zone === 'swap_zone') return player.swapZone ?? (player.swapZone = [])
  if (zone === 'specific_deck') return player.specificDeck ?? (player.specificDeck = [])
  if (zone === 'player_cards_in_play') return player.playerCardsInPlay ?? (player.playerCardsInPlay = [])
  return player.playedThisTurn
}

export function createPreppedSpellInstanceId(player: PlayerState): string {
  player.preppedSpellInstanceCounter = (player.preppedSpellInstanceCounter ?? 0) + 1
  return `${player.id}:prepped-spell:${player.preppedSpellInstanceCounter}`
}

function ensureHandPreppedSpellInstanceIds(player: PlayerState): Array<string | null> {
  player.handPreppedSpellInstanceIds ??= player.hand.map(() => null)
  while (player.handPreppedSpellInstanceIds.length < player.hand.length) player.handPreppedSpellInstanceIds.push(null)
  if (player.handPreppedSpellInstanceIds.length > player.hand.length) {
    player.handPreppedSpellInstanceIds.splice(player.hand.length)
  }
  return player.handPreppedSpellInstanceIds
}

export function addCardToHand(player: PlayerState, cardId: string, preppedSpellInstanceId: string | null = null): void {
  const instanceIds = ensureHandPreppedSpellInstanceIds(player)
  player.hand.push(cardId)
  instanceIds.push(preppedSpellInstanceId)
}

export function addCardsToHand(player: PlayerState, cardIds: string[]): void {
  if (cardIds.length === 0) return
  const instanceIds = ensureHandPreppedSpellInstanceIds(player)
  player.hand.push(...cardIds)
  instanceIds.push(...cardIds.map(() => null))
}

export function removeCardFromHand(player: PlayerState, index: number): { cardId: string | null; preppedSpellInstanceId: string | null } {
  const instanceIds = ensureHandPreppedSpellInstanceIds(player)
  if (index < 0 || index >= player.hand.length) return { cardId: null, preppedSpellInstanceId: null }
  return {
    cardId: player.hand.splice(index, 1)[0] ?? null,
    preppedSpellInstanceId: instanceIds.splice(index, 1)[0] ?? null,
  }
}

export function preppedSpellEffectMarker(instanceId: string, phase: string, blockIndex: number): string {
  return `prepped-spell:${instanceId}:${phase}:${blockIndex}`
}

export function hasUsedPreppedSpellEffect(
  player: PlayerState, marker: string, cardId: string, phase: string, blockIndex: number,
): boolean {
  const usedMarkers = getPlayerTurnEffects(player).usedPreppedEffects
  if (usedMarkers.includes(marker)) return true

  // Migrate a once-per-turn marker from older saves. The former key was tied
  // to the Breach and slot, so match the card/effect suffix if it has moved.
  const legacyPrefix = `${cardId}:`
  const legacySuffix = `:${phase}:${blockIndex}`
  if (!usedMarkers.some(used => used.startsWith(legacyPrefix) && used.endsWith(legacySuffix))) return false
  usedMarkers.push(marker)
  return true
}

export function removePreppedSpellAt(breach: BreachState, spellIndex: number): string | null {
  const cardId = breach.prepSpells[spellIndex]
  if (!cardId) return null
  breach.prepSpells.splice(spellIndex, 1)
  breach.preppedThisTurn?.splice(spellIndex, 1)
  breach.preppedSpellFaceDown?.splice(spellIndex, 1)
  breach.preppedSpellInstanceIds?.splice(spellIndex, 1)
  return cardId
}

export function ensurePlayerCollections(player: PlayerState): void {
  player.bonusAether ??= 0
  player.regularAetherSpent ??= 0
  player.condAetherSpent ??= {}
  if (!player.destroyedCards) player.destroyedCards = []
  if (!player.swapZone) player.swapZone = []
  if (!player.specificDeck) player.specificDeck = []
  if (!player.knownSpecificDeckCards) player.knownSpecificDeckCards = []
  if (!player.playerCardsInPlay) player.playerCardsInPlay = []
  ensureHandPreppedSpellInstanceIds(player)
  if (!player.playerCardSupplyTargets) player.playerCardSupplyTargets = []
  if (!player.playerCardPowerTokens) player.playerCardPowerTokens = []
  player.aetherTokens ??= 0
  player.pulseTokens = Math.min(MAX_PULSE_TOKENS, Math.max(0, player.pulseTokens ?? 0))
  player.knowledge ??= 0
  if (MAGES[player.mageType]?.tracksDoom) player.doomTokens ??= 0
  while (player.playerCardSupplyTargets.length < player.playerCardsInPlay.length) player.playerCardSupplyTargets.push(null)
  while (player.playerCardPowerTokens.length < player.playerCardsInPlay.length) player.playerCardPowerTokens.push(0)
  if (!player.cardPlayCountsThisTurn) {
    player.cardPlayCountsThisTurn = {}
    for (const cardId of player.playedThisTurn) {
      player.cardPlayCountsThisTurn[cardId] = (player.cardPlayCountsThisTurn[cardId] ?? 0) + 1
    }
  }
  player.conditionalAetherEarned ??= {}
  if (!player.turnEffects) {
    player.turnEffects = {
      nextBreachCostReductions: [],
      usedPreppedEffects: [],
      usedPlayerCardEffects: [],
      usedRecallEffects: {},
      usedBreachUpgradeEffects: [],
      prepSpellLimit: 1,
      prepSpellLimitByBreach: {},
      spellDamageBonuses: [],
    }
  }
  player.turnEffects.usedPlayerCardEffects ??= []
  player.turnEffects.usedPreppedEffects ??= []
  player.turnEffects.usedRecallEffects ??= {}
  player.turnEffects.usedBreachUpgradeEffects ??= []
  player.turnEffects.prepSpellLimitByBreach ??= {}
  player.turnEffects.spellDamageBonuses ??= []
  for (const breach of player.breaches) {
    if (!breach.preppedThisTurn || breach.preppedThisTurn.length !== breach.prepSpells.length) {
      breach.preppedThisTurn = breach.prepSpells.map(() => false)
    }
    if (!breach.preppedSpellFaceDown || breach.preppedSpellFaceDown.length !== breach.prepSpells.length) {
      breach.preppedSpellFaceDown = breach.prepSpells.map(() => false)
    }
    breach.preppedSpellInstanceIds ??= []
    while (breach.preppedSpellInstanceIds.length < breach.prepSpells.length) {
      breach.preppedSpellInstanceIds.push(createPreppedSpellInstanceId(player))
    }
    if (breach.preppedSpellInstanceIds.length > breach.prepSpells.length) {
      breach.preppedSpellInstanceIds.splice(breach.prepSpells.length)
    }
  }
  player.turnEffects.prepSpellLimit ??= 1
}

export function getPlayerTurnEffects(player: PlayerState): PlayerTurnEffects {
  ensurePlayerCollections(player)
  return player.turnEffects
}

export function getPrepSpellLimit(player: PlayerState, breachIndex: number): number {
  const turnEffects = getPlayerTurnEffects(player)
  const breach = player.breaches.find(item => item.index === breachIndex)
  const permanentLimit = 1 + Math.max(0, breach?.prepSpellLimitBonus ?? 0)
  const turnLimit = turnEffects.prepSpellLimitByBreach?.[breachIndex] ?? turnEffects.prepSpellLimit
  return turnLimit === 'unlimited' ? Number.POSITIVE_INFINITY : Math.max(permanentLimit, turnLimit)
}

/** Whether a prepped spell at this Breach slot is a face-down Conjured spell. */
export function isFaceDownPreppedSpell(
  breach: PlayerState['breaches'][number], spellIndex: number,
): boolean {
  return breach.preppedSpellFaceDown?.[spellIndex] === true
}
