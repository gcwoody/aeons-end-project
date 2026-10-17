import type {
  CardDef, CardEffect, CardEffectBlock, NemesisCardDef, NemesisDef, NemesisEffectBlock,
} from '../../../types'
import { buildTieredNemesisDeck } from '../../wave1/nemeses/cards'

type Tier = NemesisCardDef['tier']
const noEffects: CardEffectBlock[] = []
const immediate = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'immediately', effects }]
const persistent = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'persistent', effects }]
const powerResolved = (...effects: CardEffect[]): NemesisEffectBlock[] => [{ trigger: 'power_resolved', effects }]
const unleash = (amount = 1): CardEffect => ({ kind: 'unleash', amount })
const playerDamage = (
  amount: number,
  selection?: 'lowest_hp',
  preferTargetWithCardNamesInHand?: string[],
): CardEffect => ({
  kind: 'deal_player_damage', amount, target: 'any_player',
  ...(selection ? { selection } : {}),
  ...(preferTargetWithCardNamesInHand ? { preferTargetWithCardNamesInHand } : {}),
})

function makeNemesisCard(
  id: string,
  name: string,
  type: NemesisCardDef['type'],
  tier: Tier,
  extra: Pick<NemesisCardDef, 'life' | 'power'> = {},
): NemesisCardDef {
  return { id, name, type, tier, cost: 0, set: 'wave9_oracle_of_filth', effects: noEffects, ...extra }
}

export const ORACLE_OF_FILTH_NEMESIS_CARDS: Record<string, NemesisCardDef> = {
  blind_gazer: {
    ...makeNemesisCard('blind_gazer', 'Blind Gazer', 'minion', 1, { life: 4 }),
    nemesisEffects: persistent(
      { kind: 'gain_minion_life', minionCardId: 'pupil_of_oblivion', amount: 2 },
      playerDamage(1),
    ),
  },
  perplex: {
    ...makeNemesisCard('perplex', 'Perplex', 'attack', 1),
    nemesisEffects: immediate(
      unleash(), playerDamage(2, undefined, ['Crystal']),
      { kind: 'move_cards_to_nemesis_specific_deck', source: 'hand', minAmount: 1, maxAmount: 1, cardNames: ['Crystal'] },
    ),
  },
  possess: {
    ...makeNemesisCard('possess', 'Possess', 'attack', 1),
    nemesisEffects: immediate(
      unleash(), playerDamage(2, undefined, ['Spark']),
      { kind: 'move_cards_to_nemesis_specific_deck', source: 'hand', minAmount: 1, maxAmount: 1, cardNames: ['Spark'] },
    ),
  },
  foretold_terrors: {
    ...makeNemesisCard('foretold_terrors', 'Foretold Terrors', 'power', 2, { power: 3 }),
    nemesisEffects: powerResolved({ kind: 'expunge_nemesis_specific_deck', amount: 6, fallbackGraveholdDamage: 4 }),
  },
  the_doomed: {
    ...makeNemesisCard('the_doomed', 'The Doomed', 'minion', 2, { life: 10 }),
    gainCardsUnderneathOnDefeat: true,
    nemesisEffects: [
      { trigger: 'immediately', effects: [{ kind: 'place_specific_deck_cards_under_source_minion', amount: 2 }] },
      { trigger: 'persistent', effects: [playerDamage(3)] },
    ],
  },
  torment: {
    ...makeNemesisCard('torment', 'Torment', 'attack', 2),
    nemesisEffects: immediate({
      kind: 'choose_one',
      prompt: 'Choose one effect',
      options: [
        {
          id: 'unleash_and_discard',
          label: 'Unleash twice, then any player discards an Abyssal Vial or Vortex Blast',
          condition: {
            kind: 'has_eligible_card_in_zone', zone: 'hand', cardTypes: ['relic', 'spell'],
            cardIds: ['abyssal_vial', 'vortex_blast'], target: 'any_player',
          },
          fallbackPriority: 2,
          effects: [
            unleash(2),
            {
              kind: 'discard_cards', target: 'any_player', targetAvailability: 'full_or_max',
              source: 'hand', amount: 1, minAmount: 1, maxAmount: 1,
              cardIds: ['abyssal_vial', 'vortex_blast'],
            },
          ],
        },
        {
          id: 'gain_vortex_cards',
          label: 'Any player gains two cards from the Vortex and suffers 3 damage',
          condition: { kind: 'specific_deck_card_count', comparison: 'at_least', count: 1 },
          fallbackPriority: 1,
          effects: [{
            kind: 'gain_nemesis_specific_deck_cards', amount: 2, selection: 'top',
            recipient: 'choose', destination: 'discard',
          }, { kind: 'deal_player_damage', amount: 3, target: 'self' }],
        },
      ],
    }),
  },
  frighten: {
    ...makeNemesisCard('frighten', 'Frighten', 'power', 3, { power: 1 }),
    nemesisEffects: powerResolved(
      { kind: 'destroy_nemesis_specific_deck_cards', maxCost: 0 }, unleash(2),
    ),
  },
  ocularum: {
    ...makeNemesisCard('ocularum', 'Ocularum', 'minion', 3, { life: 12 }),
    blocksPlacementIntoSpecificDeck: true,
    nemesisEffects: persistent(playerDamage(3, 'lowest_hp')),
  },
  unrelenting_fear: {
    ...makeNemesisCard('unrelenting_fear', 'Unrelenting Fear', 'power', 3, { power: 1 }),
    nemesisEffects: powerResolved(
      unleash(2),
      {
        kind: 'distribute_nemesis_specific_deck_cards', amount: 4,
        selection: 'most_expensive', destination: 'discard',
      },
    ),
  },
  pupil_of_oblivion: {
    ...makeNemesisCard('pupil_of_oblivion', 'Pupil of Oblivion', 'minion', 0, { life: 2 }),
    minimumLife: 1,
    displayRow: 'top',
    onSpellDamage: [{ kind: 'move_cast_spell_to_nemesis_specific_deck' }],
    nemesisEffects: [
      {
        trigger: 'persistent',
        condition: { kind: 'source_minion_life', comparison: 'at_least', amount: 13 },
        effects: [
          { kind: 'deal_damage', amount: 8, target: 'source_minion' },
          { kind: 'expunge_nemesis_specific_deck', amount: 6, fallbackGraveholdDamage: 4 },
        ],
      },
      {
        trigger: 'persistent',
        condition: { kind: 'source_minion_life', comparison: 'at_most', amount: 12 },
        effects: [{ kind: 'gain_minion_life', minionCardId: 'pupil_of_oblivion', amount: 2 }],
      },
    ],
  },
}

export const ORACLE_OF_FILTH_MARKET_CARDS: Record<string, CardDef> = {
  abyssal_vial: {
    id: 'abyssal_vial', name: 'Abyssal Vial', type: 'relic', cost: 4, set: 'wave9_oracle_of_filth',
    setupOnlyNemesisSupplyFor: 'oracle_of_filth',
    effects: [{ trigger: { kind: 'on_play' }, effects: [{
      kind: 'choose_one', prompt: 'Choose one effect',
      options: [
        { id: 'gain_charge', label: 'Gain 1 Charge', effects: [{ kind: 'gain_charge', amount: 1, target: 'self' }] },
        {
          id: 'place_cards_in_vortex', label: 'Place up to two Gems or Relics you played this turn into the Vortex',
          condition: { kind: 'nemesis_specific_deck_accepts_cards' },
          effects: [{
            kind: 'move_cards_to_nemesis_specific_deck', source: 'played_this_turn',
            minAmount: 0, maxAmount: 2, cardTypes: ['gem', 'relic'],
          }],
        },
      ],
    }] }],
  },
  vortex_blast: {
    id: 'vortex_blast', name: 'Vortex Blast', type: 'spell', cost: 7, set: 'wave9_oracle_of_filth',
    setupOnlyNemesisSupplyFor: 'oracle_of_filth',
    effects: [{ trigger: { kind: 'on_cast' }, effects: [{
      kind: 'deal_damage', amount: { kind: 'per_specific_deck_card_cost', base: 1 }, target: 'nemesis_or_minion',
    }] }],
  },
}

export const oracleOfFilth: NemesisDef = {
  type: 'oracle_of_filth',
  name: 'Oracle of Filth',
  wave: 9,
  hp: 80,
  difficultyLevel: 6,
  uniqueCardIdsByTier: {
    1: ['blind_gazer', 'perplex', 'possess'],
    2: ['foretold_terrors', 'the_doomed', 'torment'],
    3: ['frighten', 'ocularum', 'unrelenting_fear'],
  },
  basicCardsPerTier: { 1: 3, 2: 5, 3: 7 },
  strikeCardIds: [],
  startingCounters: {},
  standardRules: {},
  increasedDifficultyRules: {},
  damageOnlyFromCardIds: ['vortex_blast'],
  specificDeckVisibility: 'revealed',
  specificDeckName: 'Vortex deck',
  rulesModuleId: 'oracle_of_filth',
  deckBuilder: () => buildTieredNemesisDeck(oracleOfFilth),
  specificDeckBuilder: () => Array.from({ length: 5 }, () => 'wave9_crystal'),
}
