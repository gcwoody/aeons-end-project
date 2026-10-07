import { expect, test } from '@playwright/test'

test('hovering a focus choice turns both its Breach and Focus button blue', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const breach = document.createElement('div')
    breach.className = 'breach'
    breach.style.cssText = 'position:fixed;left:80px;top:80px;width:132px;min-height:180px;'

    const token = document.createElement('div')
    token.id = 'focus-choice-breach'
    token.className = 'breach-token-wrap decision-breach-target game-highlight game-highlight--choice'

    const controls = document.createElement('div')
    controls.className = 'btns'

    const button = document.createElement('button')
    button.id = 'focus-choice-button'
    button.type = 'button'
    button.className = 'btn small breach-focus-button effect-focus-target'
    button.textContent = 'Focus'

    controls.append(button)
    breach.append(token, controls)
    document.body.append(breach)
  })

  const token = page.locator('#focus-choice-breach')
  const button = page.locator('#focus-choice-button')
  const [choiceColor, contextColor] = await page.evaluate(() => {
    const read = (name: string) => {
      const probe = document.createElement('span')
      probe.style.color = `var(${name})`
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }
    return [read('--game-highlight-choice'), read('--game-highlight-context')]
  })
  const tokenLine = () => token.evaluate(el => getComputedStyle(el, '::after').borderTopColor)
  const buttonBorder = () => button.evaluate(el => getComputedStyle(el).borderTopColor)

  await expect.poll(tokenLine).toBe(choiceColor)
  await expect.poll(buttonBorder).toBe(choiceColor)
  await expect.poll(() => button.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none')

  await token.hover()
  await expect.poll(tokenLine).toBe(contextColor)
  await expect.poll(buttonBorder).toBe(contextColor)

  await button.hover()
  await expect.poll(tokenLine).toBe(contextColor)
  await expect.poll(buttonBorder).toBe(contextColor)

  await page.mouse.move(20, 20)
  await expect.poll(tokenLine).toBe(choiceColor)
  await expect.poll(buttonBorder).toBe(choiceColor)
})

test('gameplay controls do not show a browser focus ring after pointer then keyboard input', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const game = document.createElement('div')
    game.className = 'app'
    game.innerHTML = '<button id="focus-ring-probe" type="button">Focus Breach</button>'
    document.body.append(game)
  })

  const button = page.locator('#focus-ring-probe')
  await button.click()
  await expect(button).toBeFocused()
  await page.keyboard.press('Space')
  await expect.poll(() => button.evaluate(element => element.matches(':focus-visible'))).toBe(true)
  await expect(button).toHaveCSS('outline-style', 'none')
})
