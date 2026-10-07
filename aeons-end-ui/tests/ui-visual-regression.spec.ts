import { test, expect, type Page } from '@playwright/test'

async function waitForImages(page: Page) {
  await page.waitForFunction(() => Array.from(document.images)
    .every(image => image.complete && image.naturalWidth > 0))
}

test.describe('Stage 5 visual acceptance', () => {
  test('Gallery cards keep the shared 2px border and rounded corners', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/?ui-gallery=1')
    await expect(page.locator('[data-ui-gallery]')).toBeVisible()
    await waitForImages(page)
    await expect(page.locator('[data-component="Card.FaceDown"] img[alt="Treasure deck card back"]')).toHaveCount(1)

    const violations = await page.locator('[data-ui-gallery] .card, [data-ui-gallery] .gallery-pile-card').evaluateAll(elements => elements
      .filter(element => {
        const style = getComputedStyle(element)
        return style.borderTopWidth !== '2px' || style.borderRadius === '0px'
      })
      .map(element => ({ className: element.className, border: getComputedStyle(element).borderTopWidth, radius: getComputedStyle(element).borderRadius })))
    expect(violations).toEqual([])
    const emptyPile = await page.locator('[data-component="Pile.Empty"] .ui-gallery-empty-pile').evaluate(element => {
      const box = element.getBoundingClientRect()
      const root = getComputedStyle(document.documentElement)
      return {
        width: box.width,
        height: box.height,
        text: element.textContent?.trim(),
        handWidth: Number.parseFloat(root.getPropertyValue('--hand-card-width')),
        handHeight: Number.parseFloat(root.getPropertyValue('--hand-card-height')),
      }
    })
    expect(emptyPile.text).toBe('Discard 0')
    expect(emptyPile.width).toBeCloseTo(emptyPile.handWidth, 0)
    expect(emptyPile.height).toBeCloseTo(emptyPile.handHeight, 0)

    await page.getByRole('button', { name: 'Open PileViewer' }).click()
    await page.screenshot({ path: '../ui/screenshots/stage5-pile-viewer-1440x900.png' })
    const layers = await page.evaluate(() => {
      const pileViewer = document.querySelector('.ui-gallery-modal-overlay')
      const cardPreview = document.querySelector('.card-hover-preview')
      return {
        pileViewer: pileViewer ? Number(getComputedStyle(pileViewer).zIndex) : 0,
        cardPreview: cardPreview ? Number(getComputedStyle(cardPreview).zIndex || 0) : 0,
      }
    })
    expect(layers.pileViewer).toBeGreaterThan(layers.cardPreview)
  })

  test('Gallery ZoneScroller responds to wheel input and remains vertically scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/?ui-gallery=1')
    await expect(page.locator('[data-ui-gallery]')).toBeVisible()
    await waitForImages(page)

    const galleryMetrics = await page.locator('[data-ui-gallery]').evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    expect(galleryMetrics.scrollHeight).toBeGreaterThan(galleryMetrics.clientHeight)

    const zone = page.locator('[data-component="ZoneScroller"] .ui-gallery-zone-scroll')
    const before = await zone.evaluate(element => element.scrollLeft)
    await zone.hover()
    await page.mouse.wheel(0, 320)
    await expect.poll(() => zone.evaluate(element => element.scrollLeft)).toBeGreaterThan(before)
  })




  test('Played, Swap, and Develop share equal columns when all are present', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
    await page.getByRole('tab', { name: 'Wave 1', exact: true }).last().click()
    await page.getByLabel('Player 1 Mage').selectOption('nook')
    await page.getByLabel('Player 2 Mage').selectOption('brama')
    await page.getByRole('button', { name: 'Start Game' }).click()
    await expect(page.locator('.nemesis-area')).toBeVisible()

    await page.keyboard.press('Control+d')
    await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()
    const stateField = page.locator('.debug-panel textarea')
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const debugState = JSON.parse(await stateField.inputValue())
    const player = debugState.game.players[0]
    debugState.phase = 'main'
    debugState.selectedPlayer = player.id
    debugState.game.currentTurn = player.id
    debugState.game.currentPhase = 'main'
    debugState.game.pendingDecision = null
    debugState.game.pendingEffect = null
    player.playedThisTurn = ['crystal']
    player.developZone = ['spark']
    await stateField.fill(JSON.stringify(debugState))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

    const row = page.locator('.played-zones')
    const center = page.locator('.played-zone-center')
    await expect(row).toHaveClass(/has-swap-zone/)
    await expect(row).toHaveClass(/has-develop-zone/)
    const layout = await page.evaluate(() => {
      const row = document.querySelector('.played-zones')!.getBoundingClientRect()
      const center = document.querySelector('.played-zone-center')!.getBoundingClientRect()
      const swap = document.querySelector('.played-zone-swap')!.getBoundingClientRect()
      const develop = document.querySelector('.played-zone-develop')!.getBoundingClientRect()
      const card = document.querySelector('.played-zone-center .card')!.getBoundingClientRect()
      const swapHeading = document.querySelector('.played-zone-heading-swap')!.getBoundingClientRect()
      const playedHeading = document.querySelector('.played-zone-heading-played')!.getBoundingClientRect()
      const developHeading = document.querySelector('.played-zone-heading-develop')!.getBoundingClientRect()
      return {
        rowCenter: row.left + row.width / 2,
        cardCenter: card.left + card.width / 2,
        widths: [swap.width, center.width, develop.width],
        headingCenters: [
          swapHeading.left + swapHeading.width / 2,
          playedHeading.left + playedHeading.width / 2,
          developHeading.left + developHeading.width / 2,
        ],
        zoneCenters: [
          swap.left + swap.width / 2,
          center.left + center.width / 2,
          develop.left + develop.width / 2,
        ],
      }
    })
    expect(layout.widths[1] / layout.widths[0]).toBeCloseTo(1, 1)
    expect(layout.widths[2] / layout.widths[0]).toBeCloseTo(1, 1)
    expect(Math.abs(layout.cardCenter - layout.rowCenter)).toBeLessThan(2)
    layout.headingCenters.forEach((center, index) => expect(Math.abs(center - layout.zoneCenters[index]!)).toBeLessThan(2))
  })
})
