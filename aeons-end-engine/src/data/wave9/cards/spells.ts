import type { AdditionalDamage, CardDef, CardEffect, SpellCard } from '../../../types'

const damage = (amount: number): CardEffect => ({
  kind: 'deal_damage', amount, target: 'nemesis_or_minion',
})

const dividedDamage = (amount: number, additionalDamage?: AdditionalDamage[]): CardEffect => ({
  kind: 'deal_damage_divided', amount, target: 'nemesis_or_minion',
  ...(additionalDamage?.length ? { additionalDamage } : {}),
})

const makeSpell = (
  id: string,
  name: string,
  cost: number,
  effects: SpellCard['effects'],
  mechanics: NonNullable<SpellCard['mechanics']> = [],
  developCost?: number,
): SpellCard => ({
  id, name, type: 'spell', cost, set: 'wave9', effects, mechanics,
  ...(developCost === undefined ? {} : { developCost }),
})

export const deadlyAccord = makeSpell('deadly_accord', 'Deadly Accord', 3, [
  {
    trigger: { kind: 'on_cast' },
    effects: [
      {
        kind: 'choose_optional',
        prompt: 'Any ally may discard a Deadly Accord from hand and draw a card?',
        skipIfUnavailable: true,
        effects: [
          {
            kind: 'discard_cards', source: 'hand', amount: 1,
            target: 'ally', cardIds: ['deadly_accord'], restoreToSourceAfterSelection: true,
          },
          { kind: 'draw_cards', amount: 1, target: 'ally', relativeToSource: true },
        ],
      },
      {
        kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion',
        additionalDamage: [{ amount: 1, condition: { kind: 'last_optional_accepted' } }],
      },
      {
        kind: 'conditional',
        condition: { kind: 'last_optional_accepted' },
        effects: [{
          kind: 'choose_optional',
          prompt: 'Destroy a card in hand?',
          skipIfUnavailable: true,
          effects: [{ kind: 'destroy_cards', source: 'hand', minAmount: 0, maxAmount: 1 }],
        }],
      },
    ],
  },
], [], 2)

export const descentOfDestruction = makeSpell('descent_of_destruction', 'Descent of Destruction', 8, [
  {
    trigger: { kind: 'while_prepped', phase: 'main_phase' },
    oncePerTurn: true,
    manualActivation: true,
    // Descent can Conjure onto any of its owner's present Breaches, including
    // a closed Breach.  The ordinary Conjure rule only permits an opened or
    // this-turn-focused Breach, so this card opts into the broader target set.
    effects: [{ kind: 'conjure', breachEligibility: 'any_present' }],
  },
  {
    trigger: { kind: 'on_cast' },
    effects: [
      damage(4),
      { kind: 'grant_spell_damage_bonus', amount: 2, maxCost: 2 },
    ],
  },
])

export const emberGale = makeSpell('ember_gale', 'Ember Gale', 5, [{
  trigger: { kind: 'on_cast' },
  effects: [
    damage(4),
    {
      kind: 'focus_breach_all_players',
      target: 'allies',
      condition: {
        kind: 'zone_card_count', zone: 'discard', comparison: 'at_least', count: 6,
      },
    },
  ],
}])

export const eternitysEcho = makeSpell('eternitys_echo', "Eternity's Echo", 7, [
  { trigger: { kind: 'on_cast' }, effects: [damage(3)] },
  {
    trigger: { kind: 'recall' },
    effects: [
      {
        kind: 'cast_prepped_spell', source: 'any_prepped_spell',
        ownerScope: 'self', allowSkip: true,
      },
      { kind: 'conjure' },
    ],
  },
], ['recall'])

export const frostfireMaelstrom = makeSpell('frostfire_maelstrom', 'Frostfire Maelstrom', 4, [
  {
    trigger: { kind: 'while_prepped', phase: 'main_phase' },
    oncePerTurn: true,
    manualActivation: true,
    effects: [{ kind: 'gain_pulse_token', amount: 1 }],
    condition: { kind: 'has_pulse_token_capacity' },
  },
  {
    trigger: { kind: 'on_cast' },
    effects: [{
      kind: 'choose_token_amount',
      token: 'pulse',
      prompt: 'Choose how many Pulse tokens to lose',
      minAmount: 0,
      maxAmount: 5,
      summary: {
        template: 'Deal {amount} damage divided however you choose among enemies.',
        baseAmount: 2,
      },
      effects: [
        { kind: 'lose_pulse_token', amount: { kind: 'last_chosen_token_amount' } },
        dividedDamage(2, [{ amount: { kind: 'last_chosen_token_amount' } }]),
      ],
    }],
  },
], ['pulse_token'])

export const inundate = makeSpell('inundate', 'Inundate', 8, [{
  trigger: { kind: 'on_cast' },
  effects: [
    damage(6),
    {
      kind: 'choose_optional',
      prompt: 'Any ally may discard a card costing 4 Aether or more from hand and draw a card?',
      skipIfUnavailable: true,
      effects: [
        {
          kind: 'discard_cards', source: 'hand', amount: 1, minAmount: 1, maxAmount: 1,
          minCost: 4, target: 'ally', restoreToSourceAfterSelection: true,
        },
        { kind: 'draw_cards', amount: 1, target: 'ally', relativeToSource: true },
      ],
    },
    {
      kind: 'conditional',
      condition: { kind: 'last_optional_accepted' },
      effects: [damage(4)],
    },
  ],
}])

export const jeweledShrapnel = makeSpell('jeweled_shrapnel', 'Jeweled Shrapnel', 4, [{
  trigger: { kind: 'on_cast' },
  effects: [
    damage(4),
    { kind: 'gain_trinkets', amount: 2, destination: 'deck_top' },
    {
      kind: 'choose_optional',
      prompt: 'Destroy a card in hand?',
      skipIfUnavailable: true,
      effects: [{ kind: 'destroy_cards', source: 'hand', minAmount: 0, maxAmount: 1 }],
    },
  ],
}], ['trinket'])

export const megafluxSlice = makeSpell('megaflux_slice', 'Megaflux Slice', 4, [{
  trigger: { kind: 'on_cast' },
  effects: [{
    kind: 'choose_one',
    prompt: 'Choose one effect for Megaflux Slice',
    layout: 'two-button-choice',
    options: [
      {
        id: 'gain_pulse',
        label: 'Deal 2 damage and gain 1 Pulse token',
        effects: [damage(2), { kind: 'gain_pulse_token', amount: 1 }],
      },
      {
        id: 'spend_pulse',
        label: 'Lose 3 Pulse tokens to deal 7 damage',
        condition: { kind: 'has_pulse_tokens', amount: 3 },
        effects: [{ kind: 'lose_pulse_token', amount: 3 }, damage(7)],
      },
    ],
  }],
}], ['pulse_token'])

export const stonefuryEruption = makeSpell('stonefury_eruption', 'Stonefury Eruption', 5, [{
  trigger: { kind: 'on_cast' },
  effects: [
    damage(4),
    {
      kind: 'gain_charge', amount: 1, target: 'each_ally',
      condition: {
        kind: 'zone_card_count', zone: 'discard', cardId: 'stonefury_eruption',
        comparison: 'at_least', count: 1,
      },
    },
  ],
}])

export const vitrification = makeSpell('vitrification', 'Vitrification', 6, [{
  trigger: { kind: 'on_cast' },
  effects: [damage(8), { kind: 'gain_trinkets', amount: 3, destination: 'deck_top' }],
}], ['trinket'])

export const worldshift = makeSpell('worldshift', 'Worldshift', 6, [
  {
    trigger: { kind: 'while_prepped', phase: 'main_phase' },
    oncePerTurn: true,
    manualActivation: true,
    effects: [{ kind: 'gain_pulse_token', amount: 1 }],
    condition: { kind: 'has_pulse_token_capacity' },
  },
  {
    trigger: { kind: 'on_cast' },
    effects: [
      damage(5),
      {
        kind: 'choose_optional',
        prompt: "Lose 2 Pulse tokens to focus an ally's Breach?",
        acceptCondition: { kind: 'all_of', conditions: [
          { kind: 'has_pulse_tokens', amount: 2 },
          { kind: 'has_focusable_breach', target: 'ally' },
        ] },
        effects: [
          { kind: 'lose_pulse_token', amount: 2 },
          { kind: 'focus_breach', target: 'ally' },
        ],
      },
    ],
  },
], ['pulse_token'])

export const boundlessFire = makeSpell('boundless_fire', 'Boundless Fire', 3, [
  { trigger: { kind: 'on_cast' }, effects: [damage(2)] },
  {
    trigger: { kind: 'recall' },
    condition: { kind: 'has_charge', amount: 1 },
    effects: [
      { kind: 'lose_charge', amount: 1 },
      { kind: 'move_source_card_to_hand' },
    ],
  },
], ['recall'])

export const cosmicPulse = makeSpell('cosmic_pulse', 'Cosmic Pulse', 6, [
  {
    trigger: { kind: 'while_prepped', phase: 'main_phase' },
    oncePerTurn: true,
    manualActivation: true,
    effects: [{ kind: 'conjure' }],
  },
  { trigger: { kind: 'on_cast' }, effects: [damage(3)] },
], ['unlimited_conjure'])

export const obliteratingArc = makeSpell('obliterating_arc', 'Obliterating Arc', 7, [{
  trigger: { kind: 'on_cast' },
  effects: [
    damage(7),
    {
      kind: 'conditional',
      condition: { kind: 'supply_pile_empty', cardId: 'obliterating_arc' },
      effects: [{ kind: 'deal_player_damage', amount: 2, target: 'self' }],
    },
    { kind: 'destroy_market_card', cardId: 'obliterating_arc' },
  ],
}])

export const infernalCascade = makeSpell('infernal_cascade', 'Infernal Cascade', 5, [{
  trigger: { kind: 'on_cast' },
  effects: [
    damage(2),
    {
      kind: 'cast_prepped_spell', source: 'any_prepped_spell',
      maxCost: 2, times: 2, discard: false, allowSkip: true, repeatConfirmation: true,
    },
  ],
}])

export const torrentialSpike = makeSpell('torrential_spike', 'Torrential Spike', 4, [{
  trigger: { kind: 'on_cast' },
  effects: [
    damage(3),
    {
      kind: 'choose_optional',
      prompt: 'Any ally may reveal the top card of their deck?',
      effects: [{ kind: 'reveal_top_card_to_hand_if_spell', target: 'ally' }],
    },
  ],
}])

export const WAVE9_SPELL_CARDS: Record<string, CardDef> = {
  [deadlyAccord.id]: deadlyAccord,
  [descentOfDestruction.id]: descentOfDestruction,
  [emberGale.id]: emberGale,
  [eternitysEcho.id]: eternitysEcho,
  [frostfireMaelstrom.id]: frostfireMaelstrom,
  [inundate.id]: inundate,
  [jeweledShrapnel.id]: jeweledShrapnel,
  [megafluxSlice.id]: megafluxSlice,
  [stonefuryEruption.id]: stonefuryEruption,
  [vitrification.id]: vitrification,
  [worldshift.id]: worldshift,
  [boundlessFire.id]: boundlessFire,
  [cosmicPulse.id]: cosmicPulse,
  [obliteratingArc.id]: obliteratingArc,
  [infernalCascade.id]: infernalCascade,
  [torrentialSpike.id]: torrentialSpike,
}
