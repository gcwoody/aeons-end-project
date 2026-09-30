import { test, expect } from '@playwright/test'

test('Debug number controls reveal on hover or focus and update their values', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')

  const field = page.locator('.debug-number-field').filter({ has: page.getByRole('spinbutton', { name: /Aether for/ }) }).first()
  const input = field.getByRole('spinbutton')
  const steps = field.locator('.debug-number-steps')
  await expect(input).toHaveCSS('width', '58px')
  await expect(steps).toHaveCSS('opacity', '0')

  await field.hover()
  await expect(steps).toHaveCSS('opacity', '1')
  const colors = await field.locator('.debug-number-step.up').evaluate(button => ({
    actual: getComputedStyle(button).color,
    expected: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
  }))
  expect(colors.actual).toBe('rgb(139, 147, 167)')
  expect(colors.expected).toBe('#8b93a7')

  const before = Number(await input.inputValue())
  await field.getByRole('button', { name: /Increase Aether for/ }).click()
  await expect(input).toHaveValue(String(before + 1))

  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(steps).toHaveCSS('opacity', '0')
  await input.focus()
  await expect(steps).toHaveCSS('opacity', '1')
})

test('Debug Pulse token control enforces the five-token limit', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')

  const input = page.getByRole('spinbutton', { name: /Pulse tokens for/ }).first()
  await expect(input).toHaveAttribute('min', '0')
  await expect(input).toHaveAttribute('max', '5')
  const statRow = input.locator('xpath=../../..')
  const statFieldTops = await statRow.locator('.debug-stat-field').evaluateAll(fields =>
    fields.map(field => field.getBoundingClientRect().top),
  )
  expect(Math.max(...statFieldTops) - Math.min(...statFieldTops)).toBeLessThan(1)

  await input.fill('8')
  await input.press('Tab')
  await expect(input).toHaveValue('5')

  await input.locator('..').getByRole('button', { name: /Increase Pulse tokens for/ }).click()
  await expect(input).toHaveValue('5')
})

test('Debug deck order editor moves cards within a selected player deck', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.keyboard.press('Control+d')

  const stateField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.game.players[0].deck = ['crystal', 'spark', 'jade']
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()

  const toggle = page.getByRole('checkbox', { name: 'Enable deck order editing' })
  await toggle.check()
  await expect(page.locator('.debug-deck-order-modal')).toHaveCount(0)
  const deckPlayer = page.getByLabel('Deck order player')
  const editButton = page.getByRole('button', { name: 'Edit Deck Order', exact: true })
  await deckPlayer.selectOption(debugState.game.players[0].id)
  const selectBox = await deckPlayer.boundingBox()
  const buttonBox = await editButton.boundingBox()
  expect(selectBox).not.toBeNull()
  expect(buttonBox).not.toBeNull()
  expect(Math.abs(selectBox!.height - buttonBox!.height)).toBeLessThan(1)
  expect(buttonBox!.x - (selectBox!.x + selectBox!.width)).toBeGreaterThanOrEqual(5)
  expect(buttonBox!.x - (selectBox!.x + selectBox!.width)).toBeLessThan(10)
  await editButton.click()
  const modal = page.locator('.debug-deck-order-modal')
  await expect(modal).toBeVisible()
  const cards = modal.locator('.debug-deck-order-card')
  await expect(cards).toHaveCount(3)
  await expect(modal.getByRole('button', { name: /Move .* (up|down)/ })).toHaveCount(0)
  const firstCard = cards.first()
  const secondCard = cards.nth(1)
  const firstName = await firstCard.locator('img').getAttribute('alt')
  const secondName = await secondCard.locator('img').getAttribute('alt')
  expect(firstName).not.toBe(secondName)

  await secondCard.dragTo(firstCard)
  await expect(cards.first().locator('img')).toHaveAttribute('alt', secondName ?? '')
  await expect(cards.nth(1).locator('img')).toHaveAttribute('alt', firstName ?? '')
})
