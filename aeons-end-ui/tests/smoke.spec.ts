import { test, expect } from '@playwright/test'

test('loads setup and starts a game', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "Aeon's End — Digital Demo" })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Saved Games/ })).toBeVisible()

  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByText('Market', { exact: true })).toBeVisible()
  await expect(page.getByText(/Round \d+/)).toBeVisible()

  await page.getByRole('button', { name: 'Open game help' }).click()
  await expect(page.getByRole('dialog', { name: 'Game Help' })).toBeVisible()
  await expect(page.getByText('Ctrl + Z', { exact: true })).toBeVisible()
  await expect(page.getByText('Toggle Debug Tools.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close game help' }).click()
  await expect(page.getByRole('dialog', { name: 'Game Help' })).toBeHidden()
})

test('Jian ability enters the no-popup prepped-spell flow', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Player 1').selectOption('jian')
  await page.getByLabel('Player 2').selectOption('jian')
  await page.getByRole('button', { name: 'Start Game' }).click()

  // The turn-order deck is shuffled. Resolve any nemesis turn until a player
  // turn is available, then move past casting when there are no spells to cast.
  for (let attempt = 0; attempt < 8; attempt++) {
    const attackButton = page.getByRole('button', { name: 'Attack Gravehold' })
    if (await attackButton.isVisible().catch(() => false)) {
      await attackButton.click()
      continue
    }
    const mainPhaseButton = page.getByRole('button', { name: 'Start Main Phase →' })
    if (await mainPhaseButton.isVisible().catch(() => false)) {
      await mainPhaseButton.click()
    }
    if (await page.getByRole('button', { name: 'Activate Ability' }).isVisible().catch(() => false)) break
    await page.waitForTimeout(50)
  }

  await page.keyboard.press('Control+d')
  await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()

  for (const playerId of ['p1', 'p2']) {
    const section = page.locator('.debug-section').filter({ hasText: `jian (${playerId})` })
    await section.locator('input[type="number"]').nth(1).fill('4')
    await section.locator('select').nth(0).selectOption('spark')
    await section.locator('select').nth(1).selectOption(playerId)
    await section.locator('select').nth(2).selectOption('hand')
    await section.getByRole('button', { name: 'Add', exact: true }).click()
  }

  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  // The current player is the selected player. Put one of the added Sparks on
  // the first open breach, then activate Jian's ability.
  await page.locator('.hand img[alt="Spark"]').last().click()
  await page.locator('.breach[data-breach-index="1"]').click()
  const abilityButton = page.getByRole('button', { name: 'Activate Ability' })
  await expect(abilityButton).toBeEnabled()
  await abilityButton.click()

  const highlightedSpell = page.locator('.breach-spell-card-frame.ability-prepped-spell')
  await expect(highlightedSpell).toHaveCount(1)
  await expect(page.locator('.decision-overlay')).toHaveCount(0)

  await highlightedSpell.click()
  await expect(highlightedSpell).toHaveCount(1)
  await highlightedSpell.click()
  await expect(page.locator('.breach-spell-card-frame.ability-prepped-spell')).toHaveCount(0)
  await expect(abilityButton).toBeDisabled()
})
