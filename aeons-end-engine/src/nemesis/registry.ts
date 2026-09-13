import { princeOfGluttonsRules } from './prince-of-gluttons'
import { rageborneRules } from './rageborne'
import type { NemesisRuleModule } from './types'

const NEMESIS_RULE_MODULES: Record<string, NemesisRuleModule> = {
  [rageborneRules.id]: rageborneRules,
  [princeOfGluttonsRules.id]: princeOfGluttonsRules,
}

/** Look up optional Nemesis-specific runtime behavior without putting ID branches in the core loop. */
export function getNemesisRules(id: string): NemesisRuleModule | null {
  return NEMESIS_RULE_MODULES[id] ?? null
}
