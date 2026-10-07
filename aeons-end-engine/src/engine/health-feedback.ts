import type { GameState, HealthChangeEvent } from '../types'

/** Record a resolved health change for presentation layers without tying it to a card or action source. */
export function recordHealthChange(game: GameState, event: HealthChangeEvent): void {
  if (event.amount <= 0) return
  const events = game.healthChangeEvents ?? []
  events.push(event)
  game.healthChangeEvents = events
}
