import { test, expect } from '@playwright/test'

test('switching Mage views replaces the hand without reflowing cards from the previous Mage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('mist')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const saved = JSON.parse(await stateField.inputValue())
  const first = saved.game.players[0]
  const second = saved.game.players[1]
  first.hand = ['crystal', 'spark']
  second.hand = ['crystal', 'spark', 'crystal', 'spark', 'crystal']
  saved.game.currentTurn = first.id
  saved.game.currentPhase = 'main'
  saved.game.pendingDecision = null
  saved.game.pendingEffect = null
  saved.phase = 'main'
  saved.selectedPlayer = first.id
  await stateField.fill(JSON.stringify(saved))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  const handCards = page.locator('.hand [data-card-flight-target="hand"]')
  await expect(handCards).toHaveCount(2)

  await page.evaluate(() => {
    const target = window as typeof window & {
      handCardCountSamples?: number[]
      handCardPositionSamples?: Array<Array<{ left: number; right: number }>>
      sampleHandCards?: boolean
    }
    target.handCardCountSamples = []
    target.handCardPositionSamples = []
    target.sampleHandCards = true
    const sample = () => {
      if (!target.sampleHandCards) return
      const hand = document.querySelector<HTMLElement>('.hand')
      target.handCardCountSamples?.push(hand?.querySelectorAll('[data-card-flight-target="hand"]').length ?? 0)
      target.handCardPositionSamples?.push([...hand?.querySelectorAll<HTMLElement>('.hand-card-entry') ?? []]
        .map(entry => {
          const rect = entry.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        }))
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })

  await page.locator('.char-btn').nth(1).click()
  await expect(handCards).toHaveCount(5)
  await page.waitForTimeout(400)
  const maximumVisibleHandCards = await page.evaluate(() => {
    const target = window as typeof window & {
      handCardCountSamples?: number[]
      handCardPositionSamples?: Array<Array<{ left: number; right: number }>>
      sampleHandCards?: boolean
    }
    target.sampleHandCards = false
    return {
      maximumVisibleHandCards: Math.max(0, ...(target.handCardCountSamples ?? [])),
      positionSamples: target.handCardPositionSamples ?? [],
    }
  })

  expect(maximumVisibleHandCards.maximumVisibleHandCards).toBe(5)
  expect(maximumVisibleHandCards.positionSamples.length).toBeGreaterThan(0)
  for (const sample of maximumVisibleHandCards.positionSamples) {
    for (let index = 1; index < sample.length; index++) {
      expect(sample[index]!.left).toBeGreaterThanOrEqual(sample[index - 1]!.right - 1)
    }
  }
  await expect(handCards).toHaveCount(5)
})
