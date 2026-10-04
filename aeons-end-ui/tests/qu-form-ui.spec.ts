import { expect, test, type Page } from '@playwright/test'

async function startGame(page: Page, mage1: string, mage2 = 'jian') {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — First Player' })
    .getByRole('tab', { name: 'Wave 9' }).click()
  await page.getByLabel('Player 1').selectOption(mage1)
  await page.getByRole('tablist', { name: 'Mage Wave Tabs — Second Player' })
    .getByRole('tab', { name: 'Wave 1' }).click()
  await page.getByLabel('Player 2').selectOption(mage2)
  await page.getByRole('button', { name: 'Start Game' }).click()
  for (let attempt = 0; attempt < 20; attempt++) {
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click()
      continue
    }
    const resolveButton = page.getByRole('button', { name: 'Resolve Card', exact: true })
    if (await resolveButton.isVisible().catch(() => false)) {
      await resolveButton.click()
      continue
    }
    const skipButton = page.getByRole('button', { name: 'Skip', exact: true })
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click()
      continue
    }
    const confirmButton = page.getByRole('button', { name: 'Confirm', exact: true })
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click()
      continue
    }
    const damageTarget = page.getByRole('button', { name: /^(Attack .+|Gravehold)$/ }).first()
    if (await damageTarget.isVisible().catch(() => false)) {
      await damageTarget.click()
      continue
    }
    return
  }
}

test('Qu Form card supports hover preview and opens at large size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await startGame(page, 'qu')
  await page.locator('.char-btn').filter({ hasText: 'Qu' }).click()

  const formCard = page.locator('.player-specific-deck-preview .card-surface')
  await expect(formCard).toBeVisible()
  await formCard.hover({ position: { x: 60, y: 16 } })
  const hoverPreview = page.locator('.card-hover-preview img')
  await expect(hoverPreview).toHaveAttribute('alt', /Qu's Form Card/)

  await formCard.click({ position: { x: 60, y: 16 } })
  const modal = page.locator('.qu-form-pile-modal')
  await expect(modal).toBeVisible()
  const largeForm = modal.locator('.card-surface--large')
  await expect(largeForm).toBeVisible()
  await expect.poll(async () =>
    largeForm.evaluate(element => element.getBoundingClientRect().width),
  ).toBeGreaterThan(248)
  await modal.getByRole('button', { name: 'Close' }).click()

  await page.keyboard.press('Control+d')
  const debugStateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await debugStateField.inputValue())
  const qu = debugState.game.players.find((player: { mageType: string }) => player.mageType === 'qu')
  qu.bonusAether = 10
  qu.regularAetherSpent = 0
  debugState.game.currentTurn = qu.id
  debugState.game.currentPhase = 'main'
  debugState.phase = 'main'
  debugState.selectedPlayer = qu.id
  await debugStateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  await page.locator('.market-grid .pile.can-buy').first().click()
  const decisionCard = page.locator('.decision-form-card')
  // Some randomly selected supply cards have their own on-gain decision. Resolve
  // those first so this assertion reaches Qu's queued Form decision.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await decisionCard.isVisible().catch(() => false)) break
    const noButton = page.getByRole('button', { name: 'No', exact: true })
    if (!await noButton.isVisible().catch(() => false)) break
    await noButton.click()
  }
  await expect(decisionCard).toBeVisible()
  await expect(decisionCard.locator('img')).toHaveAttribute('alt', /Qu's Form Card — Giver Form/)
  await expect.poll(async () =>
    decisionCard.evaluate(element => element.getBoundingClientRect().width),
  ).toBeGreaterThan(248)
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(page.locator('.decision-modal')).toHaveCount(0)
})

test('Yan Magda is displayed as a spaced name during gameplay', async ({ page }) => {
  await startGame(page, 'yan_magda')

  await expect(page.locator('.char-btn').first()).toContainText('Yan Magda')
  await expect(page.locator('body')).not.toContainText('yan_magda')
})
