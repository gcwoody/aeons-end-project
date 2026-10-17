import { getCard } from '../data'
import { createCardInZone, getNemesisCardInstanceZone, getPlayerCardInstanceZone } from '../engine/card-movement'
import type { CardEffect, GameState, MarketPileChoice, NemesisCardDef } from '../types'
import type { NemesisRuleModule } from './types'

function startingExiledChoices(choices: MarketPileChoice[]): MarketPileChoice[] {
  const available = choices.filter(choice => choice.remaining > 0)
  if (available.length === 0) return []
  const maximumCost = Math.max(...available.map(choice => getCard(choice.cardId).cost))
  return available.filter(choice => getCard(choice.cardId).cost === maximumCost)
}

function exileSupplyTopCard(
  game: GameState,
  pileIndex: number,
): void {
  const pile = game.market.piles[pileIndex]
  if (!pile || pile.remaining <= 0) return
  pile.remaining--
  createCardInZone(
    game,
    getNemesisCardInstanceZone(game, 'strike_deck'),
    pile.cardId,
    0,
    'setup',
    true,
    { zoneId: `supply:${pileIndex}`, zone: 'supply', ownerId: null, index: 0 },
  )
}

function finalityPersistentEffects(): CardEffect[] {
  const card = getCard('finality') as NemesisCardDef
  const blocks = card.nemesisEffects?.filter(block => block.trigger === 'persistent') ?? []
  const effects = blocks.flatMap(block => block.condition
    ? [{ kind: 'conditional' as const, condition: block.condition, effects: block.effects }]
    : block.effects)
  return [{
    kind: 'conditional',
    condition: { kind: 'source_minion_life', comparison: 'at_least', amount: 1 },
    effects,
  }]
}

export const theTimelessRules: NemesisRuleModule = {
  id: 'the_timeless',
  unleashEffects: [{ kind: 'gain_nemesis_counter', counter: 'nemesis', amount: 1 }],
  setup: ({ game, marketPileChoices, createDecision }) => {
    for (const player of game.players) {
      // Each Mage begins with one Curse on top of their discard pile.
      createCardInZone(game, getPlayerCardInstanceZone(game, player.id, 'discard'),
        'curse_of_exhaustion', 0, 'setup', true)
    }
    const finalityPile = getNemesisCardInstanceZone(game, 'strike_discard')
    for (let index = 0; index < 8; index++) {
      createCardInZone(game, finalityPile, 'finality', 0, 'setup', true)
    }

    const candidates = startingExiledChoices(marketPileChoices(game))
    if (candidates.length === 1) {
      exileSupplyTopCard(game, candidates[0]!.pileIndex)
    } else if (candidates.length > 1) {
      game.pendingDecision = createDecision(
        'Choose a highest-cost supply pile for the Exiled pile',
        'select_setup_exiled_pile',
        { candidates },
      )
    }
  },
  additionalPersistentEffects: (game, card) => {
    if (card.id !== 'finality' ||
      !game.nemesis.setAsideCards?.some(setAside => setAside.cardId === 'beyond_time_and_space')) return []
    return finalityPersistentEffects()
  },
  endTurn: {
    shouldResolve: game => (game.nemesis.counters.nemesis ?? 0) >= 3,
    effects: [
      { kind: 'summon_finality_from_specific_discard' },
      { kind: 'lose_nemesis_counter', counter: 'nemesis', amount: 3 },
    ],
    message: 'The Timeless summons a Finality for every 3 Nemesis tokens',
    sourceCardId: 'the_timeless',
  },
}

export function moveStartingSupplyCardToExiledPile(
  game: GameState,
  pileIndex: number,
): boolean {
  const pile = game.market.piles[pileIndex]
  if (!pile || pile.remaining <= 0) return false
  const currentChoices = game.market.piles.map((candidate, index) => ({
    pileIndex: index, cardId: candidate.cardId, cardName: getCard(candidate.cardId).name,
    cost: getCard(candidate.cardId).cost, remaining: candidate.remaining,
  }))
  if (!startingExiledChoices(currentChoices).some(choice => choice.pileIndex === pileIndex)) return false
  exileSupplyTopCard(game, pileIndex)
  return true
}
