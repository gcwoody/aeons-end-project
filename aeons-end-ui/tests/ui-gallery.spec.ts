import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const screenshotRoot = resolve(process.cwd(), '..', 'ui', 'screenshots')

test.describe('UI Gallery', () => {
  test.beforeAll(async () => {
    await mkdir(screenshotRoot, { recursive: true })
  })

  test('renders the component catalogue and captures reference states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/?ui-gallery=1')
    await expect(page.locator('[data-ui-gallery]')).toBeVisible()
    await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0))
    const scrollMetrics = await page.locator('[data-ui-gallery]').evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)
    await page.locator('[data-ui-gallery]').evaluate(element => element.scrollTo(0, element.scrollHeight))
    await expect(page.locator('[data-gallery-section="naming"]')).toBeInViewport()
    await page.locator('[data-ui-gallery]').evaluate(element => element.scrollTo(0, 0))
    await expect(page.locator('[data-component="Card.Pile"] .gallery-pile-card-back img')).toHaveCSS('object-fit', 'fill')
    await expect(page.locator('[data-component="Card.Mini"] .gallery-mini-card').first()).toHaveCSS('width', '78px')
    await expect(page.locator('[data-component="Card.Mini"] .gallery-mini-card').first()).toHaveCSS('height', '118px')
    await expect(page.locator('[data-component="Damage.DividedAllocation"] .damage-allocation-badge')).toHaveText(['−1', '−2'])
    const emptyPile = page.locator('[data-component="Pile.Empty"] .ui-gallery-empty-pile')
    await expect(emptyPile).toHaveCSS('width', '122px')
    await expect(emptyPile).toHaveCSS('height', '178px')

    const zoneScroller = page.locator('[data-component="ZoneScroller"] .ui-gallery-zone-scroll')
    const zoneOverflow = await zoneScroller.evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(zoneOverflow.scrollWidth).toBeGreaterThan(zoneOverflow.clientWidth)
    await zoneScroller.evaluate(element => {
      element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 320 }))
    })
    await expect.poll(() => zoneScroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)

    await page.screenshot({
      path: resolve(screenshotRoot, 'ui-gallery-overview-1440x900.png'),
      fullPage: true,
    })

    const dividedDamage = page.locator('[data-component="Damage.DividedAllocation"]')
    await dividedDamage.scrollIntoViewIfNeeded()
    await dividedDamage.screenshot({
      path: resolve(screenshotRoot, 'damage-divided-allocation-1440x900.png'),
    })
    await page.locator('[data-ui-gallery]').evaluate(element => element.scrollTo(0, 0))

    for (const sectionName of ['card-surfaces', 'piles-and-zones', 'modals', 'naming']) {
      await page.evaluate((name) => {
        document.querySelectorAll('[data-gallery-section]').forEach(section => {
          const element = section as HTMLElement
          element.style.display = section.getAttribute('data-gallery-section') === name ? '' : 'none'
        })
        document.querySelector('[data-ui-gallery]')?.scrollTo(0, 0)
      }, sectionName)
      await page.screenshot({
        path: resolve(screenshotRoot, `${sectionName}-1440x900.png`),
        fullPage: true,
      })
      await page.evaluate(() => {
        document.querySelectorAll('[data-gallery-section]').forEach(section => {
          const element = section as HTMLElement
          element.style.display = ''
        })
      })
    }

    await page.getByRole('button', { name: 'Open PileViewer' }).click()
    await expect(page.locator('[data-gallery-modal]')).toBeVisible()
    await page.locator('[data-gallery-modal]').screenshot({
      path: resolve(screenshotRoot, 'pile-viewer-modal-1440x900.png'),
    })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-gallery-modal]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open PileViewer' })).not.toBeFocused()

    await page.getByRole('button', { name: 'Open CardSelectionModal' }).click()
    await expect(page.locator('[data-gallery-modal]')).toBeVisible()
    const cardChoices = page.locator('[data-gallery-modal] .decision-card-choice')
    await expect(cardChoices).toHaveCount(2)
    await expect(cardChoices.first()).toHaveCSS('width', '252px')
    await page.locator('[data-gallery-modal]').screenshot({
      path: resolve(screenshotRoot, 'card-selection-modal-1440x900.png'),
    })
    await cardChoices.first().click()
    await cardChoices.nth(1).click()
    const galleryConfirm = page.locator('[data-gallery-modal]').getByRole('button', { name: 'Confirm', exact: true })
    await expect(galleryConfirm).toBeEnabled()
    await galleryConfirm.click()
    await expect(page.getByRole('status')).toContainText('Confirmed: Clouded Trinket, Golden Trinket')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-gallery-modal]')).toBeVisible()
    await page.getByRole('button', { name: 'Close gallery modal' }).click()

    await page.getByRole('button', { name: 'Open Reveal Card' }).click()
    const revealModal = page.locator('[data-gallery-modal]')
    await expect(revealModal.getByRole('heading', { name: 'Reveal a Card' })).toBeVisible()
    await expect(revealModal.locator('.gallery-modal-reveal-card img')).toBeVisible()
    await revealModal.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.locator('[data-gallery-modal]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Open Instant Card Choice' }).click()
    await expect(page.locator('[data-gallery-modal]')).toBeVisible()
    const instantChoices = page.locator('[data-gallery-modal] .large-card-choice')
    await expect(instantChoices).toHaveCount(2)
    await expect(instantChoices.first()).toHaveCSS('width', '252px')
    await page.locator('[data-gallery-modal]').screenshot({
      path: resolve(screenshotRoot, 'instant-card-choice-modal-1440x900.png'),
    })
    await instantChoices.filter({ has: page.locator('img[alt="Golden Trinket"]') }).click()
    await expect(page.locator('[data-gallery-modal]')).toHaveCount(0)
    await expect(page.getByText('Instant choice confirmed: Golden Trinket', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Open Two Button Choice' }).click()
    const twoButtonModal = page.locator('[data-gallery-modal]')
    const twoButtonChoices = twoButtonModal.locator('[data-ui-component="Decision.TwoButtonChoice"] .decision-option')
    await expect(twoButtonChoices).toHaveCount(2)
    await expect(twoButtonChoices.first()).toHaveClass(/btn primary/)
    const twoButtonBoxes = await twoButtonChoices.evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }))
    expect(twoButtonBoxes[0]!.x).toBe(twoButtonBoxes[1]!.x)
    expect(twoButtonBoxes[0]!.width).toBe(twoButtonBoxes[1]!.width)
    expect(twoButtonBoxes[1]!.y).toBeGreaterThan(twoButtonBoxes[0]!.y)
    await expect(twoButtonChoices.first()).toHaveCSS('text-align', 'center')
    await expect(twoButtonChoices.first()).toHaveCSS('min-height', '56px')
    await twoButtonModal.screenshot({ path: resolve(screenshotRoot, 'decision-two-button-modal-1440x900.png') })
    await twoButtonChoices.first().click()
    await expect(page.getByText('Two-button choice confirmed: Deal 2 damage and gain 1 Pulse token', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Open Token Amount Choice' }).click()
    const tokenAmountModal = page.locator('[data-gallery-modal]')
    await expect(tokenAmountModal.getByRole('heading', { name: 'Choose how many Pulse tokens to lose' })).toBeVisible()
    await expect(tokenAmountModal.locator('[data-ui-component="Decision.TokenAmountChoice"] img[alt="Pulse token"]')).toBeVisible()
    const tokenAmountControl = tokenAmountModal.locator('.token-amount-choice-control')
    await expect(tokenAmountControl.locator(':scope > *')).toHaveCount(2)
    const tokenAmountInput = tokenAmountModal.getByRole('spinbutton', { name: 'Pulse token amount' })
    await expect(tokenAmountModal.locator('.token-amount-choice-summary')).toHaveText('Deal 2 damage divided however you choose among enemies.')
    await expect(tokenAmountInput).toHaveCSS('text-align', 'center')
    await expect(tokenAmountInput).toHaveCSS('width', '92px')
    await expect(tokenAmountInput).toHaveCSS('height', '44px')
    await expect(tokenAmountInput).toHaveCSS('font-size', '20px')
    await expect(tokenAmountInput).toHaveCSS('font-weight', '700')
    await expect(tokenAmountInput).toHaveCSS('border-radius', '6px')
    await tokenAmountInput.hover()
    await expect(tokenAmountModal.locator('.debug-number-steps')).toHaveCSS('opacity', '1')
    await tokenAmountInput.click()
    await expect(tokenAmountInput).toBeFocused()
    const increaseTokenAmount = tokenAmountModal.getByRole('button', { name: 'Increase Pulse token amount' })
    await increaseTokenAmount.click()
    await expect(tokenAmountInput).toHaveValue('1')
    await expect(tokenAmountInput).not.toBeFocused()
    await expect(tokenAmountModal.locator('.token-amount-choice-summary')).toHaveText('Deal 3 damage divided however you choose among enemies.')
    await tokenAmountInput.fill('3')
    await expect(tokenAmountInput).toBeFocused()
    await expect(tokenAmountModal.locator('.token-amount-choice-summary')).toHaveText('Deal 5 damage divided however you choose among enemies.')
    await tokenAmountInput.blur()
    await tokenAmountModal.screenshot({ path: resolve(screenshotRoot, 'decision-token-amount-modal-1440x900.png') })
    await tokenAmountModal.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByText('Pulse amount confirmed: 3', { exact: true })).toBeVisible()
  })

  test('keeps the catalogue usable at a compact viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/?ui-gallery=1')
    await expect(page.locator('[data-ui-gallery]')).toBeVisible()
    await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0))
    const scrollMetrics = await page.locator('[data-ui-gallery]').evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)
    await page.screenshot({
      path: resolve(screenshotRoot, 'ui-gallery-overview-1024x768.png'),
      fullPage: true,
    })
  })
})
