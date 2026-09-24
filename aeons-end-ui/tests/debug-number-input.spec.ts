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
  await input.blur()
  await expect(steps).toHaveCSS('opacity', '0')
  await input.focus()
  await expect(steps).toHaveCSS('opacity', '1')
})
