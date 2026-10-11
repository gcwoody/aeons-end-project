import { expect, test } from '@playwright/test'

test('captured card flights contain only card artwork, without market badges or highlights', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { captureCardFlight } = await import('/src/game/card-flight.ts')
    const source = document.createElement('button')
    source.className = 'pile can-buy develop-action-available'
    source.innerHTML = '<img src="/player-card%20back.jpg" alt="Card"><span class="remaining">4</span><span class="develop-cost-badge">D 3</span>'
    source.style.cssText = 'position:fixed;left:24px;top:24px;width:100px;height:140px'
    document.body.append(source)

    const flight = captureCardFlight(source)
    const result = flight && {
      className: flight.clone.className,
      childTags: [...flight.clone.children].map(child => child.tagName),
      imageAlt: flight.clone.querySelector('img')?.alt,
      text: flight.clone.textContent,
    }
    flight?.clone.remove()
    source.remove()
    return result
  })

  expect(result).toEqual({
    className: 'card-flight-clone',
    childTags: ['IMG'],
    imageAlt: '',
    text: '',
  })
})

test('board card flight follows the recorded physical card identity', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { captureCardZoneMotion, discardCardZoneMotion, resolveCardZoneMotionFromEvents } = await import('/src/game/card-flight.ts')
    const source = document.createElement('div')
    source.style.cssText = 'position:fixed;left:24px;top:24px;width:100px;height:140px'
    source.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
    source.dataset.cardMotionZone = 'specific_deck'
    source.dataset.cardMotionCardId = 'contagion'
    source.dataset.cardMotionOwnerId = 'player-1'
    source.dataset.cardMotionKey = 'specific-deck:contagion:0'
    source.dataset.cardInstanceId = 'contagion-copy-2'
    document.body.append(source)

    const snapshot = captureCardZoneMotion(document)
    source.remove()
    const destination = document.createElement('div')
    destination.dataset.cardMotionZone = 'hand'
    destination.dataset.cardMotionCardId = 'contagion'
    destination.dataset.cardMotionOwnerId = 'player-1'
    destination.dataset.cardMotionKey = 'player-1:hand:contagion-copy-2'
    destination.dataset.cardInstanceId = 'contagion-copy-2'
    document.body.append(destination)
    const events = [{
      kind: 'move', transactionId: 'transaction-1', eventId: 'event-1', moveId: 'move-1',
      sequence: 1, instanceId: 'contagion-copy-2', cardId: 'contagion', reason: 'gain',
      source: { zoneId: 'player-1:specific-deck', zone: 'specific_deck', ownerId: 'player-1', index: 0 },
      destination: { zoneId: 'player-1:hand', zone: 'hand', ownerId: 'player-1', index: 1 },
    }]
    const transfers = resolveCardZoneMotionFromEvents(snapshot, events, document).transfers
    const summary = transfers.map(transfer => ({
      cardId: transfer.cardId,
      ownerId: transfer.ownerId,
      sourceZone: transfer.sourceZone,
      destinationZone: transfer.destinationZone,
      sourceInstanceId: transfer.sourceInstanceId,
      destinationInstanceId: transfer.destinationInstanceId,
      moveId: transfer.moveId,
      hasFlight: !!transfer.flight,
    }))
    discardCardZoneMotion(snapshot)
    destination.remove()
    source.remove()
    return summary
  })

  expect(result).toEqual([
    {
      cardId: 'contagion', ownerId: 'player-1', sourceZone: 'specific_deck',
      destinationZone: 'hand', sourceInstanceId: 'contagion-copy-2',
      destinationInstanceId: 'contagion-copy-2', moveId: 'move-1', hasFlight: true,
    },
  ])
})

test('cards shown in a decision window do not fly from the modal to a destination zone', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { captureCardFlight, captureCardZoneMotion, discardCardZoneMotion, resolveCardZoneMotionFromEvents } =
      await import('/src/game/card-flight.ts')
    const source = document.createElement('div')
    source.style.cssText = 'position:fixed;left:24px;top:24px;width:100px;height:140px'
    source.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
    source.dataset.cardMotionZone = 'discard'
    source.dataset.cardMotionCardId = 'crystal'
    source.dataset.cardMotionOwnerId = 'player-1'
    source.dataset.cardMotionKey = 'discard:crystal-copy-1'
    source.dataset.cardInstanceId = 'crystal-copy-1'

    const decisionCard = source.cloneNode(true) as HTMLElement
    decisionCard.dataset.cardMotionKey = 'decision-discard:0:crystal'
    decisionCard.dataset.cardMotionSuppressFlight = 'true'
    decisionCard.dataset.cardSelectionKey = 'discard:0:crystal'
    document.body.append(source, decisionCard)

    const snapshot = captureCardZoneMotion(document)
    const originsHaveFlights = snapshot.cards.map(card => !!card.flight)
    const directSourceFlight = captureCardFlight(source)
    const events = [{
      kind: 'move', transactionId: 'transaction-1', eventId: 'event-1', moveId: 'move-1',
      sequence: 1, instanceId: 'crystal-copy-1', cardId: 'crystal', reason: 'effect',
      source: { zoneId: 'player-1:discard', zone: 'discard', ownerId: 'player-1', index: 0 },
      destination: { zoneId: 'player-1:swap_zone', zone: 'swap_zone', ownerId: 'player-1', index: 0 },
    }]
    const transfers = resolveCardZoneMotionFromEvents(snapshot, events, document).transfers
    discardCardZoneMotion(snapshot)
    source.remove()
    decisionCard.remove()
    directSourceFlight?.clone.remove()
    return { originsHaveFlights, directSourceHasFlight: !!directSourceFlight, transferCount: transfers.length }
  })

  expect(result).toEqual({ originsHaveFlights: [false, false], directSourceHasFlight: false, transferCount: 0 })
})

test('a card arriving on a player deck keeps the existing deck surface visible', async ({ page }) => {
  await page.goto('/')
  const destinationVisibleDuringFlight = await page.evaluate(async () => {
    const { animateCardFlight, captureCardFlight, cardZoneFlightDestinationMode } = await import('/src/game/card-flight.ts')
    document.documentElement.style.setProperty('--card-flight-duration', '500ms')
    const source = document.createElement('div')
    const destination = document.createElement('div')
    source.style.cssText = 'position:fixed;left:24px;top:24px;width:100px;height:140px'
    destination.style.cssText = 'position:fixed;left:400px;top:200px;width:100px;height:140px'
    source.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
    destination.innerHTML = '<img src="/player-card%20back.jpg" alt="">'
    document.body.append(source, destination)

    const flight = captureCardFlight(source)
    const animation = animateCardFlight(flight, destination, {
      destinationMode: cardZoneFlightDestinationMode('deck', false),
    })
    await new Promise(resolve => window.setTimeout(resolve, 60))
    const visibleDuringFlight = getComputedStyle(destination).visibility !== 'hidden'
    await animation
    source.remove()
    destination.remove()
    return visibleDuringFlight
  })

  expect(destinationVisibleDuringFlight).toBe(true)
})
