import { test, expect } from '@playwright/test'

test('Nemesis board proportions, five asset regions, HP space and pile interactions', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Start Game' }).click()
  await expect(page.locator('.nemesis-area')).toBeVisible()
  // Isolate layout from random turn-order interrupts without touching real saves.
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const stateField = page.locator('.debug-panel textarea')
  const debugState = JSON.parse(await stateField.inputValue())
  debugState.phase = 'main'
  debugState.game.pendingDecision = null
  debugState.game.pendingEffect = null
  debugState.game.currentTurn = 'p1'
  debugState.game.currentPhase = 'main'
  debugState.game.nemesis.discard = ['slaughter']
  debugState.game.nemesis.playArea = Array.from({ length: 12 }, (_, i) => ({
    instanceId: `layout-${i}`, cardId: 'haze_spewer', cardType: 'minion', placedAt: i, lifeTokens: 5,
  }))
  await stateField.fill(JSON.stringify(debugState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.nemesis-mat-image')).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const area = document.querySelector('.nemesis-area')!
      const areaBox = box('.nemesis-area')
      const padding = getComputedStyle(area)
      const mat = box('.nemesis-mat-image')
      const img = document.querySelector<HTMLImageElement>('.nemesis-mat-image')!
      const assets = [...document.querySelectorAll('.nemesis-assets-row > *')].map(el => el.getBoundingClientRect())
      const slots = box('.slots')
      const left = box('.turn-side-left')
      const right = box('.turn-side-right')
      const round = box('.turn-round')
      return {
        loaded: img.naturalWidth > 0,
        fullHeight: Math.abs(mat.height - (areaBox.height - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom))) < 3,
        correctRatio: Math.abs(mat.width / mat.height - img.naturalWidth / img.naturalHeight) < .01,
        fiveTiles: assets.length === 5 && assets.every(b => Math.abs(b.width - assets[0].width) < 1 && b.y === assets[0].y),
        noOverflow: assets[4].right <= areaBox.right && box('.nemesis-play').right <= areaBox.right,
        globalCenter: Math.abs(slots.x + slots.width / 2 - window.innerWidth / 2) < 2,
        hpGap: slots.left - left.right >= 23 && right.left - slots.right >= 23,
        fillsLeft: Math.abs(left.left - (box('.turn-order-bar').left + 14)) < 2,
        fillsRight: Math.abs(round.left - right.right - 16) < 2,
        flexibleBars: box('.turn-side-left .hpbar').width > 100 && box('.turn-side-right .hpbar').width > 20,
      }
    })).toEqual({ loaded: true, fullHeight: true, correctRatio: true, fiveTiles: true, noOverflow: true, globalCenter: true, hpGap: true, fillsLeft: true, fillsRight: true, flexibleBars: true })
    await page.screenshot({ path: `test-results/nemesis-layout-${viewport.width}.png` })
  }

  await expect(page.getByRole('region', { name: 'Nemesis Sub Board' })).toHaveCount(0)
  await expect(page.getByLabel('Nemesis Specific Discard', { exact: true })).toContainText('Not used')
  await page.getByRole('button', { name: 'Open Rageborne mat' }).click()
  await expect(page.locator('.nemesis-mat-modal-frame img')).toBeVisible()
  await page.getByRole('button', { name: 'Flip to Back' }).click()
  await expect(page.locator('.nemesis-mat-modal-frame img')).toHaveAttribute('alt', 'Rageborne mat back')
  await page.locator('.mage-overlay').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Open Nemesis Discard' }).click()
  await expect(page.locator('.pile-modal .pile-card')).toHaveCount(1)
  await expect.poll(async () => (await page.locator('.pile-modal').boundingBox())?.width ?? 999).toBeLessThan(260)
  await page.locator('.pile-modal').getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.nemesis-card-scroll').hover({ position: { x: 5, y: 5 } })
  await page.mouse.wheel(0, 700)
  await expect.poll(() => page.locator('.nemesis-card-scroll').evaluate(el => el.scrollLeft)).toBeGreaterThan(50)

  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Load Current', exact: true }).click()
  const damageStateField = page.locator('.debug-panel textarea')
  const damageState = JSON.parse(await damageStateField.inputValue())
  damageState.phase = 'main'
  damageState.game.currentTurn = 'p1'
  damageState.game.currentPhase = 'main'
  damageState.game.nemesis.hp = damageState.game.nemesis.maxHp
  damageState.game.nemesis.playArea = [{ instanceId: 'damage-minion:1', cardId: 'haze_spewer', cardType: 'minion', placedAt: 1, lifeTokens: 5 }]
  damageState.game.pendingDecision = {
    id: 'damage-1', playerId: 'p1', prompt: 'Choose a damage target', kind: 'select_damage_target',
    targets: [
      { kind: 'nemesis', id: 'nemesis', label: 'Nemesis' },
      { kind: 'minion', id: 'minion:1', placedAt: 1, cardId: 'haze_spewer', label: 'Haze Spewer' },
    ],
  }
  damageState.game.pendingEffect = {
    playerId: 'p1', remainingEffects: [],
    awaiting: { kind: 'deal_damage', amount: 2, target: 'nemesis_or_minion' },
  }
  await damageStateField.fill(JSON.stringify(damageState))
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
  await expect(page.locator('.nemesis-mat-wrap.damage-target')).toBeVisible()
  await expect(page.locator('.nemesis-play-card.damage-target')).toBeVisible()
  await page.locator('.nemesis-mat-wrap.damage-target').click()
  await expect(page.locator('.mage-overlay')).toHaveCount(0)
  await expect(page.locator('.nemesis-mat-wrap.damage-target')).toHaveCount(0)
})
