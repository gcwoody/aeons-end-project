import type { NemesisRuleModule } from './types'

/** Crooked Mask's Unleash inflicts a hidden Corruption and reshuffles that player's discard. */
export const crookedMaskRules: NemesisRuleModule = {
  id: 'crooked_mask',
  unleashEffects: [{ kind: 'gain_corruption_and_shuffle_discard' }],
}
