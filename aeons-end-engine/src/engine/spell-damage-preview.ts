import type {
  CardEffect, CardEffectBlock, CardEffectCondition, CardEffectTrigger, EffectAmount,
  GameState, PendingEffectResolution, PlayerState, AdditionalDamage,
} from '../types'
import { getCard } from '../data'
import { isPresentBreach } from './breaches'
import { isFaceDownPreppedSpell } from './player-state'
import { getPlayer } from './zones'

interface SpellDamagePreviewBounds {
  minAmount: number
  maxAmount: number
  minInstances: number
  maxInstances: number
}

/** Damage range shown by the UI when a spell's final amount is not yet known. */
export interface SpellDamagePreviewRange {
  min: number
  max: number
}

type PreviewConditionState = 'true' | 'false' | 'unknown'

interface SpellDamagePreviewOptions {
  /** A turn-order card is known only after its reveal decision has opened it. */
  knownTurnOrderCard?: string
}

/** Rule queries needed by previewing, injected to keep this module acyclic. */
export interface SpellDamagePreviewServices {
  turnSpellDamageBonus(game: GameState, playerId: string, spellCost: number): number
  amountValue(
    game: GameState,
    playerId: string,
    amount: EffectAmount,
    sourceCardId?: string,
    resolution?: PendingEffectResolution,
  ): number
  conditionMatches(
    game: GameState,
    playerId: string | undefined,
    condition?: CardEffectCondition,
    resolution?: PendingEffectResolution,
  ): boolean
  matchingBlocks(
    cardId: string,
    playerId: string,
    game: GameState,
    trigger: CardEffectTrigger,
  ): CardEffectBlock[]
}

function exactPreview(amount: number, instances = 1): SpellDamagePreviewBounds {
  return {
    minAmount: amount,
    maxAmount: amount,
    minInstances: instances,
    maxInstances: instances,
  }
}

function addPreview(total: SpellDamagePreviewBounds, next: SpellDamagePreviewBounds): SpellDamagePreviewBounds {
  return {
    minAmount: total.minAmount + next.minAmount,
    maxAmount: total.maxAmount + next.maxAmount,
    minInstances: total.minInstances + next.minInstances,
    maxInstances: total.maxInstances + next.maxInstances,
  }
}

function unionPreviews(options: Array<SpellDamagePreviewBounds | null>): SpellDamagePreviewBounds | null {
  // An unevaluable branch must not be omitted, or the displayed range could
  // exclude a real outcome.
  if (options.some(option => option === null)) return null
  const available = options.filter((option): option is SpellDamagePreviewBounds => option !== null)
  if (available.length === 0) return null
  return {
    minAmount: Math.min(...available.map(option => option.minAmount)),
    maxAmount: Math.max(...available.map(option => option.maxAmount)),
    minInstances: Math.min(...available.map(option => option.minInstances)),
    maxInstances: Math.max(...available.map(option => option.maxInstances)),
  }
}

function amountRange(
  game: GameState,
  playerId: string,
  amount: EffectAmount,
  sourceCardId: string | undefined,
  resolution: PendingEffectResolution | undefined,
  services: SpellDamagePreviewServices,
): { min: number; max: number } {
  if (typeof amount === 'number') return { min: Math.max(0, amount), max: Math.max(0, amount) }
  // Selection-dependent amounts are unknown until the corresponding choice.
  if (amount.kind === 'last_selection_cost' && resolution?.lastSelectedCardCost === undefined) {
    return { min: 0, max: 0 }
  }
  if (amount.kind === 'last_chosen_token_amount' && resolution?.lastChosenTokenAmount === undefined) {
    const max = getPlayer(game, playerId).pulseTokens ?? 0
    return { min: 0, max: Math.max(0, max) }
  }
  const value = services.amountValue(game, playerId, amount, sourceCardId, resolution)
  return { min: value, max: value }
}

function conditionState(
  game: GameState,
  playerId: string,
  condition: CardEffectCondition | undefined,
  resolution: PendingEffectResolution | undefined,
  services: SpellDamagePreviewServices,
): PreviewConditionState {
  if (!condition) return 'true'
  if (condition.kind === 'last_selection_nonempty') {
    if (resolution?.lastSelectedCardCount === undefined) return 'unknown'
    return resolution.lastSelectedCardCount > 0 ? 'true' : 'false'
  }
  if (condition.kind === 'last_optional_accepted') {
    if (resolution?.lastOptionalAccepted === undefined) return 'unknown'
    return resolution.lastOptionalAccepted ? 'true' : 'false'
  }
  return services.conditionMatches(game, playerId, condition, resolution) ? 'true' : 'false'
}

function previewDamageEffect(
  game: GameState,
  playerId: string,
  effect: { amount: EffectAmount; additionalDamage?: AdditionalDamage[] },
  sourceCardId: string | undefined,
  resolution: PendingEffectResolution | undefined,
  services: SpellDamagePreviewServices,
): SpellDamagePreviewBounds {
  const amount = amountRange(game, playerId, effect.amount, sourceCardId, resolution, services)
  let minAmount = amount.min
  let maxAmount = amount.max
  for (const bonus of effect.additionalDamage ?? []) {
    const state = conditionState(game, playerId, bonus.condition, resolution, services)
    const bonusAmount = amountRange(game, playerId, bonus.amount, sourceCardId, resolution, services)
    if (state === 'true') {
      minAmount += bonusAmount.min
      maxAmount += bonusAmount.max
    } else if (state === 'unknown') {
      // Base damage is guaranteed; a conditional bonus remains a possibility.
      maxAmount += bonusAmount.max
    }
  }
  return { minAmount, maxAmount, minInstances: 1, maxInstances: 1 }
}

function previewEffects(
  game: GameState,
  playerId: string,
  effects: CardEffect[],
  sourceCardId: string | undefined,
  resolution: PendingEffectResolution | undefined,
  services: SpellDamagePreviewServices,
  options: SpellDamagePreviewOptions,
): SpellDamagePreviewBounds | null {
  let preview = exactPreview(0, 0)
  for (const effect of effects) {
    if (effect.kind === 'deal_damage_divided' || effect.kind === 'deal_damage') {
      preview = addPreview(preview, previewDamageEffect(game, playerId, effect, sourceCardId, resolution, services))
      continue
    }
    if (effect.kind === 'choose_token_amount') {
      const selected = previewEffects(game, playerId, effect.effects, sourceCardId, resolution, services, options)
      if (!selected) return null
      preview = addPreview(preview, selected)
      continue
    }
    if (effect.kind === 'conditional') {
      const state = conditionState(game, playerId, effect.condition, resolution, services)
      if (state === 'false') continue
      const conditional = previewEffects(game, playerId, effect.effects, sourceCardId, resolution, services, options)
      if (!conditional) return null
      if (state === 'true') {
        preview = addPreview(preview, conditional)
      } else {
        preview = addPreview(preview, unionPreviews([exactPreview(0, 0), conditional])!)
      }
      continue
    }
    if (effect.kind === 'reveal_turn_order_card') {
      const top = game.turnOrderDeck[0]
      if (!top) return null
      const known = options.knownTurnOrderCard === top
      const branches = known
        ? [top === 'nemesis' ? effect.nemesisEffects : effect.playerEffects]
        : [effect.nemesisEffects, effect.playerEffects]
      const branchPreviews = branches.map(branch =>
        previewEffects(game, playerId, branch, sourceCardId, resolution, services, options))
      const branch = known ? branchPreviews[0] : unionPreviews(branchPreviews)
      if (!branch) return null
      preview = addPreview(preview, branch)
      continue
    }
    if (effect.kind === 'choose_one') {
      const possible = effect.options.filter(option =>
        conditionState(game, playerId, option.condition, resolution, services) !== 'false')
      const branches = possible.map(option =>
        previewEffects(game, playerId, option.effects, sourceCardId, resolution, services, options))
      const chosen = unionPreviews(branches)
      if (!chosen) return null
      preview = addPreview(preview, chosen)
    }
    // Optional effects do not contribute to guaranteed preview damage.
  }
  return preview
}

function getSpellDamagePreviewBounds(
  game: GameState,
  casterPlayerId: string,
  spellOwnerPlayerId: string,
  breachIndex: number,
  spellIndex: number,
  services: SpellDamagePreviewServices,
  options: SpellDamagePreviewOptions = {},
): SpellDamagePreviewBounds | null {
  const owner = getPlayer(game, spellOwnerPlayerId)
  const breach = owner.breaches.find(item => item.index === breachIndex)
  if (!breach || !isPresentBreach(breach)) return null
  const cardId = breach.prepSpells[spellIndex]
  if (!cardId) return null
  const faceDown = isFaceDownPreppedSpell(breach, spellIndex)
  const spellCost = faceDown ? 2 : getCard(cardId).cost
  const preview = faceDown
    ? exactPreview(2)
    : getCard(cardId).type !== 'spell' ? null
      : previewEffects(game, casterPlayerId,
        services.matchingBlocks(cardId, casterPlayerId, game, { kind: 'on_cast' })
          .flatMap(block => block.effects),
        cardId, undefined, services, options)
  if (!preview) return null
  const pendingCastBonus = pendingPreppedSpellCastBonus(
    game, spellOwnerPlayerId, breachIndex, spellIndex, cardId,
  )
  const breachBonus = isPresentBreach(breach) && breach.opened ? Math.max(0, breach.damageBonus) : 0
  const turnBonus = services.turnSpellDamageBonus(game, casterPlayerId, spellCost)
  const damageBonus = breachBonus + turnBonus
  return {
    minAmount: preview.minAmount + preview.minInstances * damageBonus + pendingCastBonus,
    maxAmount: preview.maxAmount + preview.maxInstances * damageBonus + pendingCastBonus,
    minInstances: preview.minInstances,
    maxInstances: preview.maxInstances,
  }
}

function pendingPreppedSpellCastBonus(
  game: GameState,
  spellOwnerPlayerId: string,
  breachIndex: number,
  spellIndex: number,
  cardId: string,
): number {
  const effect = game.pendingEffect?.awaiting
  const decision = game.pendingDecision
  if (effect?.kind !== 'cast_prepped_spell' || effect.bonusDamage === undefined || !decision) return 0
  const candidates = decision.kind === 'select_prepped_spell' || decision.kind === 'select_prepped_spells'
    ? decision.candidates
    : []
  const isCandidate = candidates.some(choice =>
    choice.playerId === spellOwnerPlayerId
    && choice.breachIndex === breachIndex
    && choice.spellIndex === spellIndex
    && choice.cardId === cardId)
  return isCandidate ? Math.max(0, effect.bonusDamage) : 0
}

/** Return the possible damage range while a prepped spell waits for a target. */
export function getSpellDamagePreviewRange(
  game: GameState,
  casterPlayerId: string,
  spellOwnerPlayerId: string,
  breachIndex: number,
  spellIndex: number,
  services: SpellDamagePreviewServices,
): SpellDamagePreviewRange | null {
  const owner = getPlayer(game, spellOwnerPlayerId)
  const breach = owner.breaches.find(item => item.index === breachIndex)
  const cardId = breach?.prepSpells[spellIndex]
  const decision = game.pendingDecision
  const activePendingSpell = game.pendingEffect?.pendingSpellCast?.cardId === cardId
  const knownTurnOrderCard = cardId && decision?.kind === 'confirm_turn_order_reveal'
    && decision.context?.sourceCardId === cardId
    ? decision.cardId
    : activePendingSpell && decision?.kind !== 'confirm_turn_order_reveal'
      ? game.turnOrderDeck[0]
      : undefined
  const preview = getSpellDamagePreviewBounds(game, casterPlayerId, spellOwnerPlayerId,
    breachIndex, spellIndex, services, { knownTurnOrderCard })
  if (!preview || preview.maxAmount <= 0) return null
  return { min: preview.minAmount, max: preview.maxAmount }
}

/** Return the guaranteed damage value for exact, already-known engine callers. */
export function getSpellDamagePreview(
  game: GameState,
  casterPlayerId: string,
  spellOwnerPlayerId: string,
  breachIndex: number,
  spellIndex: number,
  services: SpellDamagePreviewServices,
): number | null {
  const preview = getSpellDamagePreviewBounds(game, casterPlayerId, spellOwnerPlayerId,
    breachIndex, spellIndex, services, { knownTurnOrderCard: game.turnOrderDeck[0] })
  if (!preview || preview.maxAmount <= 0) return null
  return preview.minAmount
}
