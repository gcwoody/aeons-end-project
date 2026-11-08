import { createHash } from 'node:crypto'
import { createReadStream, lstatSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(projectRoot, 'local-update-manifest.tsv')
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])
const candidatePaths = [
  'play-local-demo.ps1',
]

function toManifestPath(absolutePath) {
  const value = relative(projectRoot, absolutePath).split(sep).join('/')
  if (!value || value.startsWith('../') || value.includes('\t') || /[\r\n]/.test(value)) {
    throw new Error(`Unsafe path in local update payload: ${absolutePath}`)
  }
  return value
}

function normalizeTextPayload(relativePath) {
  const absolutePath = resolve(projectRoot, relativePath)
  const contents = readFileSync(absolutePath, 'utf8')
  const normalized = contents.replace(/\r\n?/g, '\n')
  if (normalized !== contents) writeFileSync(absolutePath, normalized, 'utf8')
}

function visitPayloadDirectory(relativeDirectory, isImageDirectory = false) {
  const absoluteDirectory = resolve(projectRoot, relativeDirectory)
  const directoryInfo = lstatSync(absoluteDirectory)
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error(`Update payload directory must be a real directory: ${relativeDirectory}`)
  }

  const entries = readdirSync(absoluteDirectory).sort((left, right) => left.localeCompare(right, 'en'))
  const collected = []
  for (const entry of entries) {
    if (isImageDirectory && (entry === '.cache' || entry === '__pycache__')) continue
    const absolutePath = resolve(absoluteDirectory, entry)
    const info = lstatSync(absolutePath)
    if (info.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in update payloads: ${absolutePath}`)
    }
    if (info.isDirectory()) {
      collected.push(...visitPayloadDirectory(`${relativeDirectory}/${entry}`, isImageDirectory))
    } else if (info.isFile()) {
      if (isImageDirectory && !imageExtensions.has(extname(entry).toLowerCase())) continue
      collected.push(absolutePath)
    }
  }
  return collected
}

async function hashFile(absolutePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function main() {
  normalizeTextPayload('local-demo-site/index.html')
  normalizeTextPayload('play-local-demo.ps1')

  const payloadFiles = []
  for (const relativePath of candidatePaths) {
    const absolutePath = resolve(projectRoot, relativePath)
    try {
      const info = lstatSync(absolutePath)
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error(`Update payload must be a regular file: ${absolutePath}`)
      }
      payloadFiles.push(absolutePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  payloadFiles.push(...visitPayloadDirectory('local-demo-site'))
  payloadFiles.push(...visitPayloadDirectory('image-database', true))
  payloadFiles.sort((left, right) => toManifestPath(left).localeCompare(toManifestPath(right), 'en'))

  const rows = []
  for (const absolutePath of payloadFiles) {
    const info = statSync(absolutePath)
    rows.push(`F\t${await hashFile(absolutePath)}\t${info.size}\t${toManifestPath(absolutePath)}`)
  }

  const body = `${rows.join('\n')}\n`
  const version = createHash('sha256').update(body, 'utf8').digest('hex')
  const manifest = `AEONS_END_LOCAL_UPDATE\t1\t${version}\n${body}`
  writeFileSync(outputPath, manifest, 'utf8')
  process.stdout.write(`Wrote ${rows.length} update entries to ${outputPath}\n`)
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
