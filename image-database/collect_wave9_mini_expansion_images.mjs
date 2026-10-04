/**
 * Collect original Wiki images for The Surface and The Returned.
 *
 * Run with `node image-database/collect_wave9_mini_expansion_images.mjs`.
 * The child process uses the same local proxy port as download_wiki_images.py.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDirectory = dirname(scriptPath)
const repositoryRoot = resolve(scriptDirectory, '..')
const imageRoot = resolve(scriptDirectory, 'cards', 'wave9')
const cacheRoot = resolve(scriptDirectory, '.cache', 'wave9-mini-expansions')
const apiUrl = 'https://aeonsend.wiki.gg/api.php'
const proxyUrl = 'http://127.0.0.1:7897'
const userAgent = 'AeonsEndImageDatabase/1.0 (local project)'
const boxTitles = ['The Surface', 'The Returned']
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const sharedImageNames = new Set(['Aether.png', 'Crystal.jpg', 'Spark.jpg', 'Disambig.svg', 'No Breach.jpg'])
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
let lastApiRequestAt = 0

// Node reads the proxy environment when --use-env-proxy initializes its HTTP agent.
if (process.env.AEONS_END_WIKI_PROXY_CHILD !== '1') {
  const child = spawnSync(process.execPath, ['--use-env-proxy', scriptPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AEONS_END_WIKI_PROXY_CHILD: '1',
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
    },
  })
  if (child.error) throw child.error
  process.exit(child.status ?? 1)
}

function safeFilename(name) {
  return basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
}

function localPath(path) {
  return relative(repositoryRoot, path).replaceAll('\\', '/')
}

function displayName(title) {
  return title.replace(/\s*\((?:The Surface|The Returned)\)$/, '')
}

function normalizedImageNames(images) {
  return [...new Set(images.map((name) => name.replaceAll('_', ' ')).filter((name) => imageExtensions.has(extname(name).toLowerCase())))]
}

function isSharedOrGenericImage(name) {
  return sharedImageNames.has(name)
    || /^Breach (?:Opened|Down|Left|Right) Icon\.jpg$/i.test(name)
    || /^Breach (?:I|II|III|IV) (?:Open|Down|Left|Right)\.jpg$/i.test(name)
}

async function requestJson(parameters, label) {
  const url = `${apiUrl}?${new URLSearchParams({ ...parameters, format: 'json' })}`
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const delay = Math.max(0, 2_500 - (Date.now() - lastApiRequestAt))
      if (delay) await sleep(delay)
      lastApiRequestAt = Date.now()
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(45_000),
      })
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`)
        error.retryAfterMs = response.status === 429
          ? Math.max(30_000, Number(response.headers.get('retry-after') || 0) * 1_000)
          : attempt * 2_000
        throw error
      }
      const data = await response.json()
      if (data.error) throw new Error(`${data.error.code}: ${data.error.info}`)
      return data
    } catch (error) {
      lastError = error
      console.warn(`${label}: attempt ${attempt}/5 failed (${error.message})`)
      if (attempt < 5) await sleep(error.retryAfterMs ?? attempt * 2_000)
    }
  }
  throw new Error(`${label}: ${lastError.message}`)
}

async function parsePage(title, properties) {
  const digest = createHash('sha256').update(`${title}\0${properties}`).digest('hex')
  const cachePath = resolve(cacheRoot, `${digest}.json`)
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'))
  } catch {
    const data = await requestJson({ action: 'parse', page: title, redirects: '1', prop: properties }, `Fetch ${title}`)
    if (!data.parse) throw new Error(`No Wiki page found for ${title}`)
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(cachePath, `${JSON.stringify(data)}\n`, 'utf8')
    return data
  }
}

function overviewTitles(wikitext, label) {
  const declaration = new RegExp(`^\\*\\s*'''${label}\\s*\\((\\d+)\\):`, 'i')
  const line = wikitext.split('\n').find((text) => declaration.test(text))
  if (!line) throw new Error(`Missing ${label} in box overview`)
  const titles = [...line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1])
  const declaredCount = Number(declaration.exec(line)[1])
  if (titles.length !== declaredCount) throw new Error(`${label}: expected ${declaredCount} Wiki links, found ${titles.length}`)
  return titles
}

function galleryTitles(wikitext, galleryHeading) {
  const groups = new Map()
  let inGallery = false
  let currentGroup = null
  for (const line of wikitext.split('\n')) {
    const section = /^==(?![=])\s*(.*?)\s*==(?!=)\s*$/.exec(line)
    if (section) {
      inGallery = section[1] === galleryHeading
      currentGroup = null
      continue
    }
    if (!inGallery) continue
    const subsection = /^===\s*(.*?)\s*===\s*$/.exec(line)
    if (subsection) {
      currentGroup = subsection[1].replace(/\s*\(\d+\)$/, '')
      groups.set(currentGroup, [])
    }
    if (!currentGroup) continue
    for (const match of line.matchAll(/\{\{CardImage\|([^}|]+)(?:\|[^}]*)?\}\}/gi)) {
      groups.get(currentGroup).push(match[1].trim())
    }
  }
  return groups
}

function imageForCard(title, boxImages) {
  const expected = `${title}.jpg`.toLowerCase()
  const found = boxImages.find((name) => name.toLowerCase() === expected)
  if (!found) throw new Error(`No box-gallery image for ${title}`)
  return found
}

async function collectBox(title) {
  const box = (await parsePage(title, 'wikitext|images')).parse
  const wikitext = box.wikitext?.['*'] || ''
  const boxImages = normalizedImageNames(box.images || [])
  const parentGroups = [
    ['Mages', 'mages'],
    ['Nemesis', 'nemesis'],
    ['Friend', 'friends-and-foes/friends'],
    ['Foe', 'friends-and-foes/foes'],
  ]
  const entries = []
  for (const [label, folder] of parentGroups) {
    const titles = overviewTitles(wikitext, label)
    for (const parentTitle of titles) {
      const page = (await parsePage(parentTitle, 'images')).parse
      const parentFolder = label === 'Mages'
        ? `${folder}/${displayName(parentTitle).toLowerCase()}`
        : label === 'Nemesis' ? `${folder}/${displayName(parentTitle)}` : folder
      for (const imageName of normalizedImageNames(page.images || [])) {
        if (isSharedOrGenericImage(imageName)) continue
        entries.push({ expansion: title, group: label, page: parentTitle, imageName, folder: parentFolder })
      }
    }
  }
  const galleries = [
    ['Supply Card Gallery', { Gems: 'gems', Spells: 'spells', Relics: 'relics' }],
    ['Treasure Gallery', { 'Level 1': 'treasures/Level 1', 'Level 2': 'treasures/Level 2', 'Level 3': 'treasures/Level 3', 'Level 4': 'treasures/Level 4' }],
  ]
  for (const [heading, folders] of galleries) {
    const groups = galleryTitles(wikitext, heading)
    const galleryCount = [...groups.values()].reduce((sum, titles) => sum + titles.length, 0)
    const expectedCount = heading === 'Supply Card Gallery' ? 7 : 10
    if (galleryCount !== expectedCount) throw new Error(`${title} ${heading}: expected ${expectedCount} cards, found ${galleryCount}`)
    for (const [group, folder] of Object.entries(folders)) {
      const titles = groups.get(group)
      if (!titles?.length) throw new Error(`Missing ${heading} / ${group} on ${title}`)
      for (const cardTitle of titles) {
        entries.push({ expansion: title, group, page: cardTitle, imageName: imageForCard(cardTitle, boxImages), folder })
      }
    }
  }
  return entries
}

async function imageUrls(imageNames) {
  const urls = new Map()
  for (let start = 0; start < imageNames.length; start += 50) {
    const batch = imageNames.slice(start, start + 50)
    const data = await requestJson({
      action: 'query',
      titles: batch.map((name) => `File:${name}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
    }, `Resolve image URLs ${start + 1}-${start + batch.length}`)
    for (const page of Object.values(data.query?.pages || {})) {
      const name = page.title?.replace(/^File:/, '')
      const url = page.imageinfo?.[0]?.url
      if (name && url) urls.set(name, url)
    }
  }
  return urls
}

async function existsWithContent(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

function hasImageSignature(bytes, filename) {
  const extension = extname(filename).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (extension === '.gif') return bytes.toString('ascii', 0, 3) === 'GIF'
  if (extension === '.webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  return false
}

async function downloadImage(url, destination) {
  if (await existsWithContent(destination)) return 'existing'
  await mkdir(dirname(destination), { recursive: true })
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(90_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      if (!(response.headers.get('content-type') || '').startsWith('image/')) throw new Error('Response is not an image')
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length < 128 || !hasImageSignature(bytes, destination)) throw new Error('Image signature or size is invalid')
      const temporaryPath = `${destination}.download`
      await writeFile(temporaryPath, bytes)
      await rename(temporaryPath, destination)
      return 'downloaded'
    } catch (error) {
      lastError = error
      console.warn(`Download ${basename(destination)}: attempt ${attempt}/5 failed (${error.message})`)
      if (attempt < 5) await sleep(attempt * 2_000)
    }
  }
  throw new Error(`Download ${basename(destination)}: ${lastError.message}`)
}

async function main() {
  console.log(`Collecting ${boxTitles.join(' and ')} through ${proxyUrl}`)
  const entries = []
  for (const title of boxTitles) entries.push(...await collectBox(title))
  const destinations = new Map()
  for (const entry of entries) {
    entry.destination = resolve(imageRoot, entry.folder, safeFilename(entry.imageName))
    const previous = destinations.get(entry.destination)
    if (previous && previous.imageName !== entry.imageName) throw new Error(`Destination collision: ${entry.destination}`)
    destinations.set(entry.destination, entry)
  }
  const urls = await imageUrls([...new Set(entries.map((entry) => entry.imageName))])
  const missing = [...new Set(entries.filter((entry) => !urls.has(entry.imageName)).map((entry) => entry.imageName))]
  if (missing.length) throw new Error(`Unresolved Wiki images: ${missing.join(', ')}`)
  let downloaded = 0
  let existing = 0
  for (const [index, entry] of [...destinations.values()].entries()) {
    entry.url = urls.get(entry.imageName)
    const result = await downloadImage(entry.url, entry.destination)
    if (result === 'downloaded') downloaded += 1
    else existing += 1
    if ((index + 1) % 20 === 0) console.log(`Images ${index + 1}/${destinations.size} (${downloaded} new, ${existing} existing)`)
    if (result === 'downloaded') await sleep(250)
  }
  const manifest = {
    source: boxTitles.map((title) => `https://aeonsend.wiki.gg/wiki/${title.replaceAll(' ', '_')}`),
    proxy: proxyUrl,
    generatedAt: new Date().toISOString(),
    images: [...destinations.values()].map((entry) => ({
      expansion: entry.expansion,
      group: entry.group,
      page: entry.page,
      imageName: entry.imageName,
      source: entry.url,
      localPath: localPath(entry.destination),
    })),
  }
  const manifestPath = resolve(imageRoot, 'mini-expansion-image-manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Completed: ${destinations.size} images (${downloaded} new, ${existing} existing).`)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
