import type { CardEffect, CardEffectBlock, NemesisCardDef, NemesisDef, NemesisEffectBlock } from '../../../types'
import { buildTieredNemesisDeck } from '../../wave1/nemeses/cards'

type Tier = NemesisCardDef['tier']
const noCardEffects: CardEffectBlock[] = []
const immediate = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'immediately', effects }]
const persistent = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'persistent', effects }]
const powerResolved = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'power_resolved', effects }]
const unleash = (amount = 1): CardEffect => ({ kind: 'unleash', amount })

function makeCard(
  id: string,
  name: string,
  type: NemesisCardDef['type'],
  tier: Tier,
  extra: Pick<NemesisCardDef, 'life' | 'power'> = {},
): NemesisCardDef {
  return { id, name, type, tier, cost: 0, set: 'wave9_the_terror_in_brass', effects: noCardEffects, ...extra }
}

const armorTokenPresent = {
  kind: 'sub_board_token_count' as const,
  tokenId: 'nemesis',
  comparison: 'at_least' as const,
  count: 1,
  regionIds: ['a1', 'a2', 'a3', 'a4', 'a5'],
}

const anyPlayerHasGem = {
  kind: 'collective_hand_card_count' as const,
  comparison: 'at_least' as const,
  count: 1,
  cardTypes: ['gem' as const],
}

export const THE_TERROR_IN_BRASS_NEMESIS_CARDS: Record<string, NemesisCardDef> = {
  besieging_blade: {
    ...makeCard('besieging_blade', 'Besieging Blade', 'minion', 1, { life: 5 }),
    subBoardDamageBonus: { subBoardId: 'the_terror_in_brass', target: 'gravehold', amount: 1 },
    nemesisEffects: persistent({ kind: 'discard_cards', source: 'hand', amount: 2, target: 'any_player', targetAvailability: 'full_or_max' }),
  },
  cruel_majesty: {
    ...makeCard('cruel_majesty', 'Cruel Majesty', 'power', 1, { power: 3 }),
    setAsideWhenResolved: true,
    toDiscard: { costs: [{ kind: 'discard_cards', source: 'hand', amount: 4 }] },
    nemesisEffects: immediate(unleash()),
  },
  servant_of_brass: {
    ...makeCard('servant_of_brass', 'Servant of Brass', 'minion', 1, { life: 5 }),
    nemesisEffects: persistent({
      kind: 'choose_one',
      prompt: 'Choose a Servant of Brass effect',
      options: [
        {
          id: 'remove_armor_token',
          label: 'Remove a Nemesis token from the Armor Chart',
          condition: armorTokenPresent,
          autoSelectIfSoleAvailable: true,
          effects: [{ kind: 'remove_sub_board_tokens', tokenId: 'nemesis', amount: 1, regionIds: armorTokenPresent.regionIds, selectByRegion: true }],
        },
        {
          id: 'damage_and_discard_gem',
          label: 'Any player suffers 1 damage and discards a Gem',
          condition: anyPlayerHasGem,
          autoSelectIfSoleAvailable: true,
          effects: [
            { kind: 'deal_player_damage', amount: 1, target: 'any_player', preferTargetWithCardTypesInHand: ['gem'] },
            { kind: 'discard_cards', source: 'hand', amount: 1, cardType: 'gem', target: 'self' },
          ],
        },
      ],
    }),
  },
  forge_fiend: {
    ...makeCard('forge_fiend', 'Forge Fiend', 'minion', 2, { life: 8 }),
    nemesisEffects: persistent({
      kind: 'choose_one',
      prompt: 'Choose a Forge Fiend effect',
      options: [
        {
          id: 'remove_armor_token',
          label: 'Remove a Nemesis token from the Armor Chart',
          condition: armorTokenPresent,
          autoSelectIfSoleAvailable: true,
          effects: [{ kind: 'remove_sub_board_tokens', tokenId: 'nemesis', amount: 1, regionIds: armorTokenPresent.regionIds, selectByRegion: true }],
        },
        {
          id: 'damage_lowest_life_player',
          label: 'The player with the lowest life suffers 2 damage',
          autoSelectIfSoleAvailable: true,
          effects: [{ kind: 'deal_player_damage', amount: 2, target: 'any_player', selection: 'lowest_hp' }],
        },
      ],
    }),
  },
  havoc_smith: {
    ...makeCard('havoc_smith', 'Havoc Smith', 'minion', 2, { life: 10 }),
    suppressesNemesisSubBoardEffects: 'the_terror_in_brass',
    nemesisEffects: persistent({ kind: 'deal_player_damage', amount: 2, target: 'any_player' }),
  },
  unbroken_reign: {
    ...makeCard('unbroken_reign', 'Unbroken Reign', 'power', 2, { power: 3 }),
    setAsideWhenResolved: true,
    subBoardDamageBonus: { subBoardId: 'the_terror_in_brass', target: 'gravehold', amount: 1 },
    nemesisEffects: immediate(unleash(2)),
  },
  adjudicate: {
    ...makeCard('adjudicate', 'Adjudicate', 'attack', 3),
    nemesisEffects: immediate(
      {
        kind: 'conditional',
        condition: { kind: 'nemesis_life', comparison: 'at_most', amount: 40 },
        effects: [{ kind: 'gain_life', amount: 25, target: 'nemesis' }],
      },
      {
        kind: 'conditional',
        condition: { kind: 'nemesis_life', comparison: 'greater_than', amount: 40 },
        effects: [unleash(3)],
      },
    ),
  },
  fang_of_the_first: {
    ...makeCard('fang_of_the_first', 'Fang of the First', 'minion', 3, { life: 12 }),
    blocksNemesisSubBoardPlacement: 'the_terror_in_brass',
    nemesisEffects: persistent({ kind: 'gain_life', amount: 5, target: 'nemesis' }, unleash(2)),
  },
  feral_authority: {
    ...makeCard('feral_authority', 'Feral Authority', 'power', 3, { power: 1 }),
    nemesisEffects: powerResolved(
      unleash(2),
      { kind: 'remove_sub_board_tokens', tokenId: 'nemesis', amount: 2, regionIds: armorTokenPresent.regionIds, selectByRegion: true },
    ),
  },
  regeneration: {
    ...makeCard('regeneration', 'Regeneration', 'power', 0, { power: 3 }),
    displayRow: 'top',
    returnToSpecificDeckOnResolve: true,
    nemesisEffects: [
      { trigger: 'immediately', effects: [{ kind: 'move_sub_board_token', tokenId: 'terror', regionId: 'w1' }] },
      { trigger: 'power_resolved', effects: [{ kind: 'remove_sub_board_tokens', tokenId: 'nemesis', amount: 'all', regionIds: armorTokenPresent.regionIds }] },
    ],
  },
}

export const THE_TERROR_IN_BRASS_UNIQUE_CARDS_BY_TIER: Record<1 | 2 | 3, string[]> = {
  1: ['besieging_blade', 'cruel_majesty', 'servant_of_brass'],
  2: ['forge_fiend', 'havoc_smith', 'unbroken_reign'],
  3: ['adjudicate', 'fang_of_the_first', 'feral_authority'],
}

export const theTerrorInBrass: NemesisDef = {
  type: 'the_terror_in_brass',
  name: 'The Terror in Brass',
  wave: 9,
  hp: 99,
  difficultyLevel: 5,
  uniqueCardIdsByTier: THE_TERROR_IN_BRASS_UNIQUE_CARDS_BY_TIER,
  basicCardsPerTier: { 1: 3, 2: 5, 3: 7 },
  strikeCardIds: [],
  startingCounters: {},
  standardRules: {},
  increasedDifficultyRules: {},
  specificDeckVisibility: 'revealed',
  specificDeckName: 'Regeneration deck',
  rulesModuleId: 'the_terror_in_brass',
  deckBuilder: () => buildTieredNemesisDeck(theTerrorInBrass),
  specificDeckBuilder: () => ['regeneration'],
}

