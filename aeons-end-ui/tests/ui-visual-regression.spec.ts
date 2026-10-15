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




})
