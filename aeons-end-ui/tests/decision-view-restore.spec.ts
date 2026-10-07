import { expect, test, type Page } from '@playwright/test'

async function startJianBramaGame(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
  await page.getByLabel('Player 1 Mage').selectOption('jian')
  await page.getByLabel('Player 2 Mage').selectOption('brama')
  await page.getByRole('button', { name: 'Start Game' }).click()
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = page.getByRole('button', { name: /^(Continue|Resolve Card|Skip|Confirm|Attack .+|Gravehold)$/ }).first()
    if (!(await next.isVisible().catch(() => false))) return
    await next.click()
  }
}

async function applyDebugState(page: Page, update: (state: any) => void): Promise<void> {
  await page.keyboard.press('Control+d')
  const field = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const current = JSON.parse(await field.inputValue())
  update(current)
  await field.fill(JSON.stringify(current))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
}

test('Visionary Staff returns to the Mage who played it after an ally finishes discarding', async ({ page }) => {
  await startJianBramaGame(page)
  let sourcePlayerId = ''
  let allyPlayerId = ''
  await applyDebugState(page, current => {
    const [source, ally] = current.game.players
    sourcePlayerId = source.id
    allyPlayerId = ally.id
    current.selectedPlayer = source.id
    current.phase = 'main'
    current.game.currentTurn = source.id
    current.game.currentPhase = 'main'
    current.game.pendingDecision = null
    current.game.pendingEffect = null
    source.hand = ['visionary_staff']
    source.deck = ['crystal', 'crystal', 'crystal']
    source.discard = []
    ally.hand = ['crystal', 'spark']
    ally.deck = ['jade', 'crystal', 'spark']
    ally.discard = ['moonstone_shard']
  })

  await page.locator(`.player-area[data-player-area-id="${sourcePlayerId}"] [data-hand-card-id="visionary_staff"]`).click()
  await page.locator('.decision-modal').getByRole('button', { name: 'An ally draws three cards and discards two cards' }).click()

  const allyControls = page.locator(`.char-btn[data-player-control-id="${allyPlayerId}"]`)
  await expect(allyControls).toHaveClass(/sel/)
  const allyArea = page.locator(`.player-area[data-player-area-id="${allyPlayerId}"]`)
  await expect(allyArea.locator('.hand .card')).toHaveCount(5)

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--hand-to-discard-flight-duration', '900ms')
    document.documentElement.style.setProperty('--hand-card-reflow-duration', '500ms')
    const target = window as typeof window & {
      handReflowSamples?: Array<{
        count: number
        key: string | null
        left: number
        active: number
        boxes: Array<{ left: number; right: number }>
      }>
      observeHandReflow?: boolean
    }
    target.handReflowSamples = []
    target.observeHandReflow = true
    const sample = () => {
      if (!target.observeHandReflow) return
      const hand = document.querySelector<HTMLElement>('.player-area[data-player-area-id] .hand')
      const card = hand?.querySelector<HTMLElement>('[data-hand-card-index="2"]')
      if (hand && card) target.handReflowSamples?.push({
        count: hand.querySelectorAll('[data-card-flight-target="hand"]').length,
        key: card.dataset.handCardVisualKey ?? null,
        left: card.getBoundingClientRect().left,
        active: card.closest<HTMLElement>('.hand-card-entry')?.getAnimations().length ?? 0,
        boxes: [...hand.querySelectorAll<HTMLElement>('.hand-card-entry')].map(entry => {
          const rect = entry.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        }),
      })
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await allyArea.locator('.hand .card[data-hand-card-index="0"]').click()
  await allyArea.locator('.hand .card[data-hand-card-index="1"]').click()
  await page.locator('.decision-modal').getByRole('button', { name: 'Confirm', exact: true }).click()

  await expect(page.locator('.card-flight-clone')).toHaveCount(1, { timeout: 2000 })
  await expect(allyArea.locator('.hand .card')).toHaveCount(4)
  await expect(allyArea.locator('.player-discard-pile')).toContainText('1')
  await expect(allyArea.locator('.player-discard-top-card')).toHaveAttribute('data-discard-top-card', 'moonstone_shard')
  await expect(page.locator('.card-flight-clone')).toHaveCount(1, { timeout: 5000 })
  await expect(page.locator('.card-flight-clone')).toHaveCount(0, { timeout: 5000 })
  const handReflowSamples = await page.evaluate(() => {
    const target = window as typeof window & {
      handReflowSamples?: Array<{
        count: number
        key: string | null
        left: number
        active: number
        boxes: Array<{ left: number; right: number }>
      }>
      observeHandReflow?: boolean
    }
    target.observeHandReflow = false
    return target.handReflowSamples ?? []
  })
  const firstDiscardReflowSamples = handReflowSamples.filter(sample => sample.count === 4)
  const lastFullHandSample = handReflowSamples.filter(sample => sample.count === 5).at(-1)
  expect(Math.abs(firstDiscardReflowSamples[0]!.left - lastFullHandSample!.left)).toBeLessThan(2)
  expect(firstDiscardReflowSamples.some(sample => sample.active > 0)).toBe(true)
  expect(new Set(firstDiscardReflowSamples.map(sample => Math.round(sample.left))).size).toBeGreaterThan(2)
  for (const sample of handReflowSamples) {
    for (let index = 1; index < sample.boxes.length; index++) {
      expect(sample.boxes[index]!.left).toBeGreaterThanOrEqual(sample.boxes[index - 1]!.right - 1)
    }
  }
  await expect(page.locator(`.char-btn[data-player-control-id="${sourcePlayerId}"]`)).toHaveClass(/sel/)
  await expect(allyControls.locator('.chand')).toContainText('Hand 3')
  await expect(page.locator('.decision-modal')).toHaveCount(0)

  await page.keyboard.press('Control+d')
  const debugField = page.locator('.debug-panel textarea')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const savedState = JSON.parse(await debugField.inputValue())
  const allyState = savedState.game.players.find((player: { id: string }) => player.id === allyPlayerId)
  expect(allyState.hand).toHaveLength(3)
  expect(allyState.discard.slice(0, 3)).toEqual(['spark', 'crystal', 'moonstone_shard'])
})
