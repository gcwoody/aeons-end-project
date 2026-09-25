import { test, expect } from '@playwright/test'

test('backdrop closes informational dialogs but preserves a pending game decision', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  saved.phase = 'main'
  saved.game.currentTurn = saved.game.players[0].id
  saved.game.currentPhase = 'main'
  saved.game.pendingEffect = null
  saved.game.pendingDecision = { id: 'backdrop-decision', kind: 'confirm_nemesis_draw', prompt: 'Confirm Nemesis draw', cardId: 'provoker' }
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const decision = page.locator('.nemesis-reveal-overlay')
  await expect(decision).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(decision).toBeVisible()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  saved.game.pendingDecision = null
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.getByRole('button', { name: 'Open game help' }).click()
  const help = page.locator('.help-overlay')
  await expect(help).toBeVisible()
  await help.click({ position: { x: 5, y: 5 } })
  await expect(help).toHaveCount(0)

  await page.getByRole('button', { name: 'Open Rageborne mat' }).click()
  const mat = page.locator('.mage-overlay')
  await expect(mat).toBeVisible()
  await mat.click({ position: { x: 5, y: 5 } })
  await expect(mat).toHaveCount(0)

  await page.keyboard.press('Escape')
  const exit = page.locator('.exit-overlay')
  await expect(exit).toBeVisible()
  await exit.click({ position: { x: 5, y: 5 } })
  await expect(exit).toHaveCount(0)
})
