/** Select cards without a prompt only when every eligible card is identical. */
export function autoSelectSameCardChoices<T extends { cardId: string }>(
  choices: readonly T[],
  amount: number,
): T[] | null {
  if (!Number.isInteger(amount) || amount <= 0 || amount > choices.length || choices.length === 0) return null
  const cardId = choices[0]!.cardId
  if (!choices.every(choice => choice.cardId === cardId)) return null
  return choices.slice(0, amount)
}
