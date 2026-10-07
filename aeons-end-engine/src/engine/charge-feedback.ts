import type { GameState, PlayerState } from '../types'

/** Apply a charge gain and record only the amount that actually fits below the Mage's threshold. */
export function gainPlayerCharge(game: GameState, player: PlayerState, requestedAmount: number): number {
  const normalizedAmount = Number.isFinite(requestedAmount) ? Math.max(0, Math.floor(requestedAmount)) : 0
  const amount = Math.min(
    normalizedAmount,
    Math.max(0, player.chargeThreshold - player.charge),
  )
  if (amount <= 0) return 0

  player.charge += amount
  const events = game.chargeGainEvents ?? []
  events.push({ playerId: player.id, amount })
  game.chargeGainEvents = events
  return amount
}
