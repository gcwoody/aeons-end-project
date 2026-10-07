import type { CardEffect, NemesisCardDef } from '../../../types'

type Tier = 1 | 2 | 3
const noEffects: NemesisCardDef['effects'] = []
const immediate = (...effects: CardEffect[]) => [{ trigger: 'immediately' as const, effects }]
const persistent = (...effects: CardEffect[]) => [{ trigger: 'persistent' as const, effects }]
const powerResolved = (...effects: CardEffect[]) => [{ trigger: 'power_resolved' as const, effects }]
const unleash = (amount = 1): CardEffect => ({ kind: 'unleash', amount })
const playerDamage = (amount: number): CardEffect => ({ kind: 'deal_player_damage', amount, target: 'any_player' })

function makeCard(id: string, name: string, type: NemesisCardDef['type'], tier: Tier, extra: Pick<NemesisCardDef, 'life' | 'power' | 'nemesisTokens'> = {}): NemesisCardDef {
  return { id, name, type, tier, cost: 0, set: 'basic_nemesis', effects: noEffects, ...extra }
}

export const WAVE9_BASIC_NEMESIS_CARDS: Record<string, NemesisCardDef> = {
  dark_conclusion: { ...makeCard('dark_conclusion', 'Dark Conclusion', 'power', 1, { power: 3 }), nemesisEffects: powerResolved(unleash(2), { kind: 'arm_turn_order_deck_reset' }), toDiscard: { costs: [{ kind: 'spend_aether', amount: 6 }] } },
  dismal_outcome: { ...makeCard('dismal_outcome', 'Dismal Outcome', 'power', 1, { power: 2 }), nemesisEffects: powerResolved(unleash(), { kind: 'choose_one', prompt: 'Choose who suffers 5 damage', options: [{ id: 'player', label: 'Any player suffers 5 damage', effects: [playerDamage(5)] }, { id: 'gravehold', label: 'Gravehold suffers 5 damage', effects: [{ kind: 'deal_damage', amount: 5, target: 'gravehold' }] }] }), toDiscard: { costs: [{ kind: 'spend_aether', amount: 5 }] } },
  escalate: { ...makeCard('escalate', 'Escalate', 'attack', 1), nemesisEffects: immediate(unleash(2), { kind: 'gain_charge', amount: 1, target: 'any_player' }) },
  ferrous_brute: { ...makeCard('ferrous_brute', 'Ferrous Brute', 'minion', 1, { life: 4 }), damageReductionPerInstance: 1, nemesisEffects: persistent(playerDamage(2)) },
  glinting_stinger: { ...makeCard('glinting_stinger', 'Glinting Stinger', 'minion', 1, { life: 6, nemesisTokens: 0 }), nemesisEffects: persistent({ kind: 'resolve_glinting_stinger' }) },
  rising_twilight: { ...makeCard('rising_twilight', 'Rising Twilight', 'power', 1, { power: 3 }), nemesisEffects: powerResolved(unleash(), { kind: 'gain_trinkets', amount: 2, target: 'any_player' }, { kind: 'deal_player_damage', amount: 2, target: 'self' }) },
  tear_apart: { ...makeCard('tear_apart', 'Tear Apart', 'attack', 1), nemesisEffects: immediate({ kind: 'choose_one', prompt: 'Choose an effect', options: [{ id: 'gravehold', label: 'Gravehold suffers 5 damage', effects: [{ kind: 'deal_damage', amount: 5, target: 'gravehold' }] }, { id: 'discard', label: 'The players collectively discard five cards', effects: [{ kind: 'discard_cards_collectively', amount: 5, source: 'hand' }] }] }) },
  vapor_wraith: { ...makeCard('vapor_wraith', 'Vapor Wraith', 'minion', 1, { life: 4 }), onDamage: [{ kind: 'place_card_on_top_of_own_deck' }], nemesisEffects: persistent(unleash()) },
  desperate_hour: { ...makeCard('desperate_hour', 'Desperate Hour', 'attack', 2), nemesisEffects: immediate(unleash(2), { kind: 'discard_cards', source: 'hand', amount: 1, target: 'any_player' }, { kind: 'conditional', condition: { kind: 'has_last_selected_card_cost', comparison: 'equals', amount: 0 }, effects: [{ kind: 'deal_player_damage', amount: 2, target: 'self' }] }) },
  flailer: { ...makeCard('flailer', 'Flailer', 'minion', 2, { life: 10 }), nemesisEffects: persistent(unleash(), { kind: 'place_hand_card_on_ally_deck' }) },
  fragment_btb: { ...makeCard('fragment_btb', 'Fragment (Beyond the Breach)', 'attack', 2), nemesisEffects: immediate({ kind: 'gain_trinkets', amount: 1, target: 'any_player' }, { kind: 'deal_player_damage', amount: 1, target: 'self' }, { kind: 'gain_trinkets', amount: 1, target: 'any_player' }, { kind: 'deal_player_damage', amount: 1, target: 'self' }) },
  persist: { ...makeCard('persist', 'Persist', 'power', 2, { power: 2 }), nemesisEffects: powerResolved({ kind: 'choose_one', prompt: 'Choose an effect', options: [{ id: 'turn_order', label: 'Put a Nemesis turn order card from the discard pile on top of the deck', effects: [{ kind: 'return_nemesis_turn_order_card' }] }, { id: 'punish', label: 'Unleash twice. Any player loses 3 charges', effects: [unleash(2), { kind: 'lose_charge', amount: 3, target: 'any_player' }] }] }), toDiscard: { costs: [{ kind: 'spend_aether', amount: 7 }] } },
  portal_fright: { ...makeCard('portal_fright', 'Portal Fright', 'minion', 2, { life: 10 }), nemesisEffects: persistent({ kind: 'deal_player_damage', amount: 2, target: 'any_player' }, { kind: 'gain_trinkets', amount: 1, target: 'self' }) },
  suffering: { ...makeCard('suffering', 'Suffering', 'attack', 2), nemesisEffects: immediate(unleash(), { kind: 'deal_damage', amount: 3, target: 'gravehold' }, { kind: 'gain_trinkets', amount: 2, target: 'any_player', destination: 'deck_top' }) },
  violent_detonation: { ...makeCard('violent_detonation', 'Violent Detonation', 'power', 2, { power: 2 }), nemesisEffects: powerResolved(unleash(2), { kind: 'deal_damage', amount: 3, target: 'gravehold' }), toDiscard: { costs: [{ kind: 'destroy_prepped_spells', amount: 1, minCost: 6 }] } },
  bury: { ...makeCard('bury', 'Bury', 'attack', 3), nemesisEffects: immediate(playerDamage(4), { kind: 'gain_trinkets', amount: 5, target: 'self', destination: 'deck_top' }) },
  cosmodium: { ...makeCard('cosmodium', 'Cosmodium', 'minion', 3, { life: 14 }), nemesisEffects: persistent(playerDamage(2), { kind: 'discard_cards', source: 'hand', amount: 2, target: 'self' }, { kind: 'gain_trinkets', amount: 2, target: 'self', destination: 'deck_top' }) },
  devouring_wave: { ...makeCard('devouring_wave', 'Devouring Wave', 'power', 3, { power: 1 }), nemesisEffects: powerResolved(unleash(3), { kind: 'devouring_wave_discard_and_gain' }) },
  elsewhere_invocation: { ...makeCard('elsewhere_invocation', 'Elsewhere Invocation', 'power', 3, { power: 1 }), nemesisEffects: powerResolved({ kind: 'conditional', condition: { kind: 'nemesis_discard_minion_count', comparison: 'at_most', amount: 2 }, effects: [unleash(3)] }, { kind: 'conditional', condition: { kind: 'nemesis_discard_minion_count', comparison: 'greater_than', amount: 2 }, effects: [{ kind: 'return_three_minions_from_nemesis_discard' }] }) },
  masticate: { ...makeCard('masticate', 'Masticate', 'attack', 3), nemesisEffects: immediate({ kind: 'shuffle_hand_into_deck_and_draw', amount: 5 }, { kind: 'destroy_top_cards', amount: 3, target: 'self' }, unleash(2), { kind: 'deal_damage', amount: 3, target: 'gravehold' }) },
  obliterate_btb: { ...makeCard('obliterate_btb', 'Obliterate (Beyond the Breach)', 'attack', 3), nemesisEffects: immediate(unleash(2), { kind: 'obliterate_most_open_breach_player' }) },
  punish: { ...makeCard('punish', 'Punish', 'attack', 3), nemesisEffects: immediate({ kind: 'choose_one', prompt: 'Choose an effect', options: [{ id: 'unleash', label: 'Unleash four times', effects: [unleash(4)] }, { id: 'attack', label: 'Resolve the bottommost Attack in the Nemesis discard pile twice', effects: [{ kind: 'resolve_bottom_nemesis_attack_twice' }] }] }) },
}

export const WAVE9_BASIC_NEMESIS_CARDS_BY_TIER: Record<Tier, string[]> = {
  1: ['dark_conclusion', 'dismal_outcome', 'escalate', 'ferrous_brute', 'glinting_stinger', 'rising_twilight', 'tear_apart', 'vapor_wraith'],
  2: ['desperate_hour', 'flailer', 'fragment_btb', 'persist', 'portal_fright', 'suffering', 'violent_detonation'],
  3: ['bury', 'cosmodium', 'devouring_wave', 'elsewhere_invocation', 'masticate', 'obliterate_btb', 'punish'],
}
