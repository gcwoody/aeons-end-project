import { getCard } from '../data'
import { addSubBoardToken, getSubBoardTokenAt, hasSubBoardToken } from '../engine/sub-board'
import type { CardEffect, GameState, NemesisCardDef } from '../types'
import type { NemesisRuleModule } from './types'

const ARMOR_REGIONS = ['a1', 'a2', 'a3', 'a4', 'a5'] as const
const WORLD_SPLITTER_ROUTE = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const
const SUB_BOARD_ID = 'the_terror_in_brass'

function armorIsCovered(game: GameState): boolean {
  return ARMOR_REGIONS.every(regionId => hasSubBoardToken(game, 'nemesis', regionId))
}

function isVulnerable(game: GameState): boolean {
  return armorIsCovered(game)
}

function armorChartEffectsSuppressed(game: GameState): boolean {
  return game.nemesis.playArea.some(card =>
    (getCard(card.cardId) as NemesisCardDef).suppressesNemesisSubBoardEffects === SUB_BOARD_ID,
  )
}

function worldsplitterDamage(game: GameState, baseAmount: number): number {
  const cards = [...game.nemesis.playArea, ...(game.nemesis.setAsideCards ?? [])]
  const bonus = cards.reduce((total, card) => {
    const amount = (getCard(card.cardId) as NemesisCardDef).subBoardDamageBonus
    return total + (amount?.subBoardId === SUB_BOARD_ID && amount.target === 'gravehold'
      ? Math.max(0, amount.amount)
      : 0)
  }, 0)
  return baseAmount + bonus
}

function worldsplitterEffects(game: GameState, regionId: string): CardEffect[] {
  if (regionId === 'w2') return []
  if (regionId === 'w3') {
    return [
      {
        kind: 'conditional',
        condition: { kind: 'nemesis_life', comparison: 'at_most', amount: 89 },
        effects: [{ kind: 'gain_life', amount: 10, target: 'nemesis' }],
      },
      {
        kind: 'conditional',
        condition: { kind: 'nemesis_life', comparison: 'greater_than', amount: 89 },
        effects: [{ kind: 'deal_player_damage', amount: 2, target: 'any_player' }],
      },
    ]
  }

  const baseDamage = game.nemesis.difficulty === 'increased'
    ? regionId === 'w4' ? 3 : regionId === 'w5' ? 4 : regionId === 'w6' ? 5 : 0
    : regionId === 'w4' ? 2 : regionId === 'w5' ? 3 : regionId === 'w6' ? 5 : 0
  return baseDamage > 0
    ? [{ kind: 'deal_damage', amount: worldsplitterDamage(game, baseDamage), target: 'gravehold' }]
    : []
}

function armorChartEffects(game: GameState, regionId: string): CardEffect[] {
  if (armorChartEffectsSuppressed(game)) return []
  if (regionId === 'a5') {
    return game.nemesis.difficulty === 'increased'
      ? [{ kind: 'gain_life', amount: 1, target: 'nemesis' }]
      : [{ kind: 'gain_charge', amount: 1, target: 'self' }]
  }
  if (regionId === 'a4') {
    return game.nemesis.difficulty === 'increased'
      ? [{ kind: 'gain_life', amount: 1, target: 'gravehold' }]
      : [{ kind: 'gain_aether', amount: 1 }]
  }
  if (regionId === 'a3') {
    return game.nemesis.difficulty === 'increased'
      ? [{ kind: 'destroy_cards', source: 'hand', minAmount: 0, maxAmount: 1 }]
      : [{ kind: 'draw_and_discard_cards', drawAmount: 1, discardAmount: 1, target: 'ally' }]
  }
  if (regionId === 'a2') {
    return game.nemesis.difficulty === 'increased'
      ? [{
          kind: 'choose_optional',
          prompt: 'Any ally may Conjure. Would you like to let an ally Conjure?',
          effects: [{ kind: 'conjure', target: 'ally' }],
        }]
      : [{ kind: 'gain_aether_token', target: 'ally' }]
  }
  if (regionId === 'a1') {
    return [{ kind: 'cast_prepped_spell', source: 'any_prepped_spell', ownerScope: 'any_player' }]
  }
  return []
}

export const theTerrorInBrassRules: NemesisRuleModule = {
  id: SUB_BOARD_ID,
  unleashEffects: [],
  unleashEffectsFor: game => game.nemesis.playArea.some(card => card.cardId === 'regeneration')
    ? [{ kind: 'gain_life', amount: 5, target: 'nemesis' }]
    : [{ kind: 'advance_sub_board_token', tokenId: 'terror' }],
  setup: ({ game }) => {
    addSubBoardToken(game, 'nemesis', 'a1', `${SUB_BOARD_ID}:armor:initial`)
    addSubBoardToken(game, 'terror', 'w1', `${SUB_BOARD_ID}:track`)
  },
  modifyDamageTaken: (game, amount) => {
    if (amount <= 0) return 0
    return isVulnerable(game) ? amount * 2 : 1
  },
  isVulnerable,
  subBoard: {
    id: SUB_BOARD_ID,
    placement: { tokenId: 'nemesis', cost: 3, regionIds: ARMOR_REGIONS },
    tokenRoute: tokenId => tokenId === 'terror' ? WORLD_SPLITTER_ROUTE : undefined,
    returnToStartAtRouteEnd: true,
    canPlaceToken: (game, _playerId, tokenId, regionId) =>
      tokenId === 'nemesis' && ARMOR_REGIONS.includes(regionId as typeof ARMOR_REGIONS[number]) &&
      !getSubBoardTokenAt(game, tokenId, regionId) &&
      !game.nemesis.playArea.some(card =>
        (getCard(card.cardId) as NemesisCardDef).blocksNemesisSubBoardPlacement === SUB_BOARD_ID,
      ),
    effectsForRegion: (game, tokenId, regionId) => {
      if (tokenId === 'nemesis' && ARMOR_REGIONS.includes(regionId as typeof ARMOR_REGIONS[number])) {
        return armorChartEffects(game, regionId)
      }
      if (tokenId === 'terror' && WORLD_SPLITTER_ROUTE.includes(regionId as typeof WORLD_SPLITTER_ROUTE[number])) {
        return worldsplitterEffects(game, regionId)
      }
      return []
    },
    afterTokenPlaced: game => {
      if (!armorIsCovered(game) || game.nemesis.playArea.some(card => card.cardId === 'regeneration')) return []
      if (game.nemesis.strikeDeck.includes('regeneration')) {
        return [{ kind: 'play_top_nemesis_specific_deck_card' }]
      }
      if (game.nemesis.setAsideCards?.some(card => card.cardId === 'regeneration')) {
        return [{ kind: 'play_set_aside_nemesis_card', cardId: 'regeneration' }]
      }
      return []
    },
  },
  afterPowerTokenRemoved: (game, card) =>
    card.cardId === 'regeneration' && game.nemesis.setAsideCards?.some(candidate => candidate.cardId === 'cruel_majesty')
      ? [{ kind: 'advance_sub_board_token', tokenId: 'terror' }]
      : [],
}

