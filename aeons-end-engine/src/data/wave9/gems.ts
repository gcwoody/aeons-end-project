import type { CardDef, CardEffectBlock, GemCard } from '../../types'

const makeGem = (
  id: string,
  name: string,
  cost: number,
  effects: CardEffectBlock[],
  mechanics: GemCard['mechanics'] = [],
): GemCard => ({ id, name, type: 'gem', cost, set: 'wave9', effects, mechanics })

/** Chromia Sphere introduces the shared Develop-zone rules used by Wave 9. */
export const chromiaSphere: GemCard = {
  id: 'chromia_sphere',
  name: 'Chromia Sphere',
  type: 'gem',
  cost: 5,
  developCost: 3,
  set: 'wave9',
  mechanics: ['develop'],
  effects: [{
    trigger: { kind: 'on_play' },
    effects: [
      { kind: 'gain_aether', amount: 2 },
      {
        kind: 'conditional',
        condition: {
          kind: 'develop_zone_card_count',
          cardId: 'source',
          comparison: 'at_least',
          count: 2,
        },
        effects: [{ kind: 'gain_aether', amount: 2 }],
      },
    ],
  }],
}

export const atomizedAsh = makeGem('atomized_ash', 'Atomized Ash', 3, [
  { trigger: { kind: 'on_gain' }, effects: [{ kind: 'gain_pulse_token', amount: 1 }] },
  { trigger: { kind: 'on_play' }, effects: [{ kind: 'gain_aether', amount: 2 }] },
  {
    trigger: { kind: 'recall' },
    condition: { kind: 'has_pulse_tokens', amount: 1 },
    effects: [
      { kind: 'lose_pulse_token', amount: 1 },
      { kind: 'deal_damage', amount: 1, target: 'nemesis_or_minion' },
    ],
  },
], ['pulse_token', 'recall'])

export const hewnGravitite = makeGem('hewn_gravitite', 'Hewn Gravitite', 3, [
  { trigger: { kind: 'on_play' }, effects: [
    { kind: 'gain_aether', amount: 2 },
    {
      kind: 'conditional',
      condition: { kind: 'all_of', conditions: [
        { kind: 'has_pulse_tokens', amount: 2 },
        { kind: 'has_prepped_spell', ownerScope: 'any_player' },
      ] },
      effects: [{
        kind: 'choose_optional',
        prompt: 'Lose 2 Pulse tokens to cast a prepped spell?',
        effects: [
          { kind: 'lose_pulse_token', amount: 2 },
          { kind: 'cast_prepped_spell', source: 'any_prepped_spell', ownerScope: 'any_player' },
        ],
      }],
    },
  ] },
  { trigger: { kind: 'recall' }, effects: [{ kind: 'gain_pulse_token', amount: 1 }] },
], ['pulse_token', 'recall'])

export const irradiaxLump = makeGem('irradiax_lump', 'Irradiax Lump', 6, [
  { trigger: { kind: 'on_play' }, effects: [
    { kind: 'gain_aether', amount: 3 },
    { kind: 'gain_trinkets', amount: 2, putOneInHand: true },
  ] },
], ['trinket'])

export const luminousFacet = makeGem('luminous_facet', 'Luminous Facet', 4, [
  { trigger: { kind: 'on_play' }, effects: [
    { kind: 'gain_aether', amount: 3 },
    { kind: 'gain_trinkets', amount: 1 },
  ] },
], ['trinket'])

export const phosphorNugget = makeGem('phosphor_nugget', 'Phosphor Nugget', 4, [
  { trigger: { kind: 'on_play' }, effects: [{ kind: 'gain_aether', amount: 2 }] },
  { trigger: { kind: 'recall' }, effects: [{ kind: 'gain_aether_token', amount: 1, target: 'ally' }] },
], ['recall'])

export const nebulaeFragment = makeGem('nebulae_fragment', 'Nebulae Fragment', 3, [
  { trigger: { kind: 'on_play' }, effects: [
    { kind: 'gain_aether', amount: 2 },
    {
      kind: 'choose_optional',
      prompt: 'Any ally may discard a Nebulae Fragment from hand?',
      skipIfUnavailable: true,
      effects: [
        {
          kind: 'discard_cards', source: 'hand', amount: 1,
          target: 'ally', cardIds: ['nebulae_fragment'],
        },
        { kind: 'gain_aether_token', amount: 1, target: 'self' },
        { kind: 'conjure', breachEligibility: 'any_present' },
      ],
    },
  ] },
])

export const coiledTrillium = makeGem('coiled_trillium', 'Coiled Trillium', 3, [
  { trigger: { kind: 'on_play' }, effects: [
    { kind: 'gain_aether', amount: 2 },
    {
      kind: 'choose_optional',
      prompt: 'Any ally may discard a Coiled Trillium from hand?',
      skipIfUnavailable: true,
      effects: [
        {
          kind: 'discard_cards', source: 'hand', amount: 1,
          target: 'ally', cardIds: ['coiled_trillium'],
        },
        { kind: 'gain_aether_token', amount: 2, target: 'self' },
        { kind: 'gain_charge', amount: 1, target: 'self' },
      ],
    },
  ] },
])

export const iceDustedJewel = makeGem('ice_dusted_jewel', 'Ice-Dusted Jewel', 3, [
  { trigger: { kind: 'on_play' }, effects: [{
    kind: 'choose_one',
    prompt: 'Choose one effect for Ice-Dusted Jewel',
    options: [
      {
        id: 'aether_and_pulse',
        label: 'Gain 2 Aether and 1 Pulse token',
        effects: [
          { kind: 'gain_aether', amount: 2 },
          { kind: 'gain_pulse_token', amount: 1 },
        ],
      },
      {
        id: 'cast_prepped_spell',
        label: 'Lose 5 Pulse tokens to cast a prepped spell without discarding it',
        condition: { kind: 'all_of', conditions: [
          { kind: 'has_pulse_tokens', amount: 5 },
          { kind: 'has_prepped_spell', ownerScope: 'any_player' },
        ] },
        effects: [
          { kind: 'lose_pulse_token', amount: 5 },
          { kind: 'cast_prepped_spell', source: 'any_prepped_spell', ownerScope: 'any_player', discard: false },
        ],
      },
    ],
  }] },
], ['pulse_token'])

export const WAVE9_GEM_CARDS: Record<string, CardDef> = {
  [atomizedAsh.id]: atomizedAsh,
  [hewnGravitite.id]: hewnGravitite,
  [irradiaxLump.id]: irradiaxLump,
  [luminousFacet.id]: luminousFacet,
  [phosphorNugget.id]: phosphorNugget,
  [chromiaSphere.id]: chromiaSphere,
  [nebulaeFragment.id]: nebulaeFragment,
  [coiledTrillium.id]: coiledTrillium,
  [iceDustedJewel.id]: iceDustedJewel,
}
