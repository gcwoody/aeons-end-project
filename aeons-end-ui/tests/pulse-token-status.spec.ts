import { test, expect } from '@playwright/test'

test('Pulse token status follows mechanics in the starting market', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')
  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  const player = debugState.game.players.find((candidate: { id: string }) => candidate.id === debugState.selectedPlayer)
  debugState.game.supplyMechanics = []
  player.pulseTokens = 3
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await expect(page.locator('.pulse-token-status')).toHaveCount(0)

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const enabledState = JSON.parse(await stateField.inputValue())
  enabledState.game.supplyMechanics = ['pulse_token']
  await stateField.fill(JSON.stringify(enabledState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const pulseStatus = page.locator('.pulse-token-status')
  await expect(pulseStatus).toHaveCount(1)
  await expect(pulseStatus).toHaveAttribute('aria-label', '3 Pulse Tokens')
  await expect(pulseStatus.locator('img')).toHaveAttribute('alt', 'Pulse Token')
})
