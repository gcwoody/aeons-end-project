const MAX_DECODED_IMAGES = 48

interface DecodedImageEntry {
  image: HTMLImageElement
  ready: Promise<void>
}

const decodedImages = new Map<string, DecodedImageEntry>()

function decodeImage(url: string): DecodedImageEntry | null {
  if (typeof Image === 'undefined') return null

  const image = new Image()
  image.decoding = 'async'
  image.src = url

  const ready = typeof image.decode === 'function'
    ? image.decode().catch(() => {
      if (decodedImages.get(url)?.image === image) decodedImages.delete(url)
    })
    : new Promise<void>((resolve) => {
      if (image.complete) {
        resolve()
        return
      }
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => resolve(), { once: true })
    })

  return { image, ready }
}

/** Load and decode an image before a UI state needs to display it. */
export function preloadImage(url: string): Promise<void> {
  const cached = decodedImages.get(url)
  if (cached) {
    decodedImages.delete(url)
    decodedImages.set(url, cached)
    return cached.ready
  }

  const entry = decodeImage(url)
  if (!entry) return Promise.resolve()
  decodedImages.set(url, entry)

  while (decodedImages.size > MAX_DECODED_IMAGES) {
    const oldestUrl = decodedImages.keys().next().value
    if (oldestUrl === undefined) break
    decodedImages.delete(oldestUrl)
  }

  return entry.ready
}

export function preloadImages(urls: Iterable<string>): Promise<void> {
  return Promise.all([...new Set(urls)].map(preloadImage)).then(() => undefined)
}
