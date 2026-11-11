import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import http from 'node:http'

const require = createRequire(import.meta.url)
const desktopRoot = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(desktopRoot, '..')
const uiRoot = resolve(projectRoot, 'aeons-end-ui')
const viteEntry = resolve(uiRoot, 'node_modules/vite/bin/vite.js')
const viteUrl = 'http://127.0.0.1:5173'

if (!existsSync(viteEntry)) {
  process.stderr.write('Install the aeons-end-ui dependencies before starting the desktop development app.\n')
  process.exit(1)
}

const viteProcess = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  cwd: uiRoot,
  stdio: 'inherit',
  windowsHide: true,
})

let electronProcess = null
let stopping = false

function canReachVite() {
  return new Promise(resolveResult => {
    const request = http.get(viteUrl, response => {
      response.resume()
      resolveResult(response.statusCode >= 200 && response.statusCode < 500)
    })
    request.setTimeout(1000, () => {
      request.destroy()
      resolveResult(false)
    })
    request.on('error', () => resolveResult(false))
  })
}

async function waitForVite() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (viteProcess.exitCode !== null) throw new Error('Vite stopped before its development server became available.')
    if (await canReachVite()) return
    await delay(250)
  }
  throw new Error('Vite did not become available at http://127.0.0.1:5173 within 30 seconds.')
}

function stopChild(child) {
  if (child && child.exitCode === null && !child.killed) child.kill()
}

function shutdown() {
  if (stopping) return
  stopping = true
  stopChild(electronProcess)
  stopChild(viteProcess)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

try {
  await waitForVite()
  // Electron's binary downloader does not automatically use HTTP_PROXY or
  // HTTPS_PROXY. Opt in when the developer has already configured a proxy.
  if (!process.env.ELECTRON_GET_USE_PROXY && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)) {
    process.env.ELECTRON_GET_USE_PROXY = 'true'
  }
  const electronExecutable = require('electron')
  electronProcess = spawn(electronExecutable, ['.'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      AEONS_END_PROJECT_ROOT: projectRoot,
      AEONS_END_DEV_URL: viteUrl,
    },
  })

  electronProcess.on('error', error => {
    process.stderr.write(`Could not start Electron: ${error.message}\n`)
    shutdown()
  })
  electronProcess.on('exit', code => {
    process.exitCode = code ?? 0
    stopChild(viteProcess)
  })
  viteProcess.on('exit', code => {
    if (!stopping && code !== 0 && code !== null) {
      process.stderr.write('Vite stopped unexpectedly. Closing the desktop app.\n')
      stopChild(electronProcess)
    }
  })
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
  shutdown()
}
