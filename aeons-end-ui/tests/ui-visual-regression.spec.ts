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

  test('Short game view keeps the Nemesis mat visible and Debug tools above board controls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole('button', { name: 'Start Game' }).click()
    await expect(page.locator('.nemesis-mat-image')).toBeVisible()

    await page.keyboard.press('Control+d')
    await expect(page.getByText('Debug Tools', { exact: true })).toBeVisible()
    await page.screenshot({ path: '../ui/screenshots/stage5-short-game-debug-1280x720.png' })
    const layers = await page.evaluate(() => ({
      debug: Number(getComputedStyle(document.querySelector('.debug-panel')!).zIndex),
      controls: Number(getComputedStyle(document.querySelector('.controls')!).zIndex),
      preview: Number(getComputedStyle(document.documentElement).getPropertyValue('--z-card-preview').trim() || 0),
    }))
    expect(layers.debug).toBeGreaterThan(layers.controls)
    expect(layers.debug).toBeGreaterThan(layers.preview)
  })

  test('Played cards stay screen-centered when a side zone is absent', async ({ page }) => {
    await page.setViewportSize({ width: 912, height: 600 })
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
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
    await stateField.fill(JSON.stringify(debugState))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()

    const row = page.locator('.played-zones')
    const center = page.locator('.played-zone-center')
    const swapScroll = page.locator('.played-zone-center .played-card-scroll')
    await expect(row).toHaveClass(/has-swap-zone/)
    await expect(row).not.toHaveClass(/has-develop-zone/)
    await expect(center.locator('.card')).toBeVisible()
    const layout = await page.evaluate(() => {
      const row = document.querySelector('.played-zones')!.getBoundingClientRect()
      const center = document.querySelector('.played-zone-center')!
      const swap = document.querySelector('.played-zone-swap')!.getBoundingClientRect()
      const card = document.querySelector('.played-zone-center .card')!.getBoundingClientRect()
      return {
        column: getComputedStyle(center).gridColumnStart,
        rowCenter: row.left + row.width / 2,
        cardCenter: card.left + card.width / 2,
        centerWidth: center.getBoundingClientRect().width,
        sideWidth: swap.width,
      }
    })
    expect(layout.column).toBe('2')
    expect(layout.centerWidth / layout.sideWidth).toBeCloseTo(2, 1)
    expect(Math.abs(layout.cardCenter - layout.rowCenter)).toBeLessThan(2)

    await page.keyboard.press('Control+d')
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const boundaryState = JSON.parse(await stateField.inputValue())
    boundaryState.game.players[0].playedThisTurn = Array.from({ length: 6 }, () => 'crystal')
    await stateField.fill(JSON.stringify(boundaryState))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
    await expect(swapScroll).toHaveClass(/is-boundary-constrained/)
    await expect(swapScroll).not.toHaveClass(/is-overflowing/)
    const swapBoundary = await page.evaluate(() => {
      const scrollElement = document.querySelector('.played-zone-center .played-card-scroll') as HTMLElement
      const scroll = scrollElement.getBoundingClientRect()
      const track = document.querySelector('.played-zone-center .zone-card-track')!.getBoundingClientRect()
      const firstCard = document.querySelector('.played-zone-center .zone-card-track .card')!.getBoundingClientRect()
      return { scrollLeft: scroll.left, trackLeft: track.left, firstLeft: firstCard.left, scrollWidth: scrollElement.scrollWidth, clientWidth: scrollElement.clientWidth }
    })
    expect(swapBoundary.trackLeft).toBeGreaterThanOrEqual(swapBoundary.scrollLeft - 1)
    expect(swapBoundary.firstLeft).toBeGreaterThanOrEqual(swapBoundary.scrollLeft - 1)
    expect(swapBoundary.scrollWidth).toBeLessThanOrEqual(swapBoundary.clientWidth + 1)

    await page.keyboard.press('Control+d')
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const overflowState = JSON.parse(await stateField.inputValue())
    overflowState.game.players[0].playedThisTurn = Array.from({ length: 16 }, () => 'crystal')
    await stateField.fill(JSON.stringify(overflowState))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
    await expect(swapScroll).toHaveClass(/is-overflowing/)
    const swapOverflow = await page.evaluate(() => {
      const scrollElement = document.querySelector('.played-zone-center .played-card-scroll') as HTMLElement
      const scroll = scrollElement.getBoundingClientRect()
      const track = document.querySelector('.played-zone-center .zone-card-track')!.getBoundingClientRect()
      const firstCard = document.querySelector('.played-zone-center .zone-card-track .card')!.getBoundingClientRect()
      return { scrollLeft: scroll.left, actualScrollLeft: scrollElement.scrollLeft, maxScrollLeft: scrollElement.scrollWidth - scrollElement.clientWidth, trackLeft: track.left, scrollRight: scroll.right, trackRight: track.right, firstLeft: firstCard.left, firstRight: firstCard.right, firstWidth: firstCard.width, scrollWidth: scrollElement.scrollWidth, clientWidth: scrollElement.clientWidth }
    })
    expect(swapOverflow.trackLeft).toBeGreaterThanOrEqual(swapOverflow.scrollLeft - 1)
    expect(swapOverflow.trackRight).toBeGreaterThan(swapOverflow.scrollRight)
    expect(swapOverflow.firstLeft).toBeGreaterThanOrEqual(swapOverflow.scrollLeft - 1)
    expect(swapOverflow.firstRight).toBeLessThanOrEqual(swapOverflow.scrollRight + 1)
    expect(swapOverflow.scrollWidth).toBeGreaterThan(swapOverflow.clientWidth)
    await swapScroll.hover()
    await page.mouse.wheel(0, 320)
    await expect.poll(() => swapScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  })

  test('Played shifts left when only Develop is present and remains centered', async ({ page }) => {
    await page.setViewportSize({ width: 912, height: 600 })
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByLabel('Player 1 Mage').selectOption('brama')
    await page.getByLabel('Player 2 Mage').selectOption('jian')
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
    const developScroll = page.locator('.played-zone-center .played-card-scroll')
    await expect(row).not.toHaveClass(/has-swap-zone/)
    await expect(row).toHaveClass(/has-develop-zone/)
    await expect(center.locator('.card')).toBeVisible()
    const layout = await page.evaluate(() => {
      const row = document.querySelector('.played-zones')!.getBoundingClientRect()
      const center = document.querySelector('.played-zone-center')!
      const develop = document.querySelector('.played-zone-develop')!.getBoundingClientRect()
      const card = document.querySelector('.played-zone-center .card')!.getBoundingClientRect()
      return {
        column: getComputedStyle(center).gridColumnStart,
        rowCenter: row.left + row.width / 2,
        cardCenter: card.left + card.width / 2,
        centerWidth: center.getBoundingClientRect().width,
        sideWidth: develop.width,
      }
    })
    expect(layout.column).toBe('1')
    expect(layout.centerWidth / layout.sideWidth).toBeCloseTo(2, 1)
    expect(Math.abs(layout.cardCenter - layout.rowCenter)).toBeLessThan(2)

    await page.keyboard.press('Control+d')
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const boundaryState = JSON.parse(await stateField.inputValue())
    boundaryState.game.players[0].playedThisTurn = Array.from({ length: 6 }, () => 'crystal')
    await stateField.fill(JSON.stringify(boundaryState))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
    await expect(developScroll).toHaveClass(/is-boundary-constrained/)
    await expect(developScroll).not.toHaveClass(/is-overflowing/)
    const developBoundary = await page.evaluate(() => {
      const scrollElement = document.querySelector('.played-zone-center .played-card-scroll') as HTMLElement
      const scroll = scrollElement.getBoundingClientRect()
      const track = document.querySelector('.played-zone-center .zone-card-track')!.getBoundingClientRect()
      const lastCard = [...document.querySelectorAll('.played-zone-center .zone-card-track .card')].at(-1)!.getBoundingClientRect()
      return { scrollRight: scroll.right, trackRight: track.right, lastRight: lastCard.right, scrollWidth: scrollElement.scrollWidth, clientWidth: scrollElement.clientWidth }
    })
    expect(developBoundary.trackRight).toBeLessThanOrEqual(developBoundary.scrollRight + 1)
    expect(developBoundary.lastRight).toBeLessThanOrEqual(developBoundary.scrollRight + 1)
    expect(developBoundary.scrollWidth).toBeLessThanOrEqual(developBoundary.clientWidth + 1)

    await page.keyboard.press('Control+d')
    await page.getByRole('button', { name: 'Load Current', exact: true }).click()
    const overflowState = JSON.parse(await stateField.inputValue())
    overflowState.game.players[0].playedThisTurn = Array.from({ length: 16 }, () => 'crystal')
    await stateField.fill(JSON.stringify(overflowState))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Close (Ctrl+D)' }).click()
    await expect(developScroll).toHaveClass(/is-overflowing/)
    const developOverflow = await page.evaluate(() => {
      const scrollElement = document.querySelector('.played-zone-center .played-card-scroll') as HTMLElement
      const scroll = scrollElement.getBoundingClientRect()
      const track = document.querySelector('.played-zone-center .zone-card-track')!.getBoundingClientRect()
      const visibleCards = [...document.querySelectorAll('.played-zone-center .zone-card-track .card')]
        .map(card => card.getBoundingClientRect())
        .filter(card => card.right > scroll.left + 1 && card.left < scroll.right - 1)
      return {
        scrollLeft: scroll.left,
        actualScrollLeft: scrollElement.scrollLeft,
        maxScrollLeft: scrollElement.scrollWidth - scrollElement.clientWidth,
        trackLeft: track.left,
        scrollRight: scroll.right,
        trackRight: track.right,
        firstVisibleLeft: visibleCards[0]?.left ?? null,
        lastVisibleRight: visibleCards.at(-1)?.right ?? null,
        scrollWidth: scrollElement.scrollWidth,
        clientWidth: scrollElement.clientWidth,
      }
    })
    expect(developOverflow.trackLeft).toBeLessThan(developOverflow.scrollLeft)
    expect(developOverflow.firstVisibleLeft).toBeGreaterThanOrEqual(developOverflow.scrollLeft - 1)
    expect(developOverflow.scrollWidth).toBeGreaterThan(developOverflow.clientWidth)
    await developScroll.hover()
    await page.mouse.wheel(0, 320)
    await expect.poll(() => developScroll.evaluate(element => element.scrollLeft)).toBeLessThan(0)
  })

  test('Played, Swap, and Develop share equal columns when all are present', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole('tab', { name: 'Wave 9', exact: true }).first().click()
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
      return {
        rowCenter: row.left + row.width / 2,
        cardCenter: card.left + card.width / 2,
        widths: [swap.width, center.width, develop.width],
      }
    })
    expect(layout.widths[1] / layout.widths[0]).toBeCloseTo(1, 1)
    expect(layout.widths[2] / layout.widths[0]).toBeCloseTo(1, 1)
    expect(Math.abs(layout.cardCenter - layout.rowCenter)).toBeLessThan(2)
  })
})
