import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = dirname(fileURLToPath(import.meta.url))
const electronBuilderCli = resolve(desktopRoot, 'node_modules', 'electron-builder', 'cli.js')
const npmRegistry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY || ''

if (!process.env.ELECTRON_GET_USE_PROXY && (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)) {
  process.env.ELECTRON_GET_USE_PROXY = 'true'
}

if (!process.env.ELECTRON_MIRROR && npmRegistry.includes('npmmirror.com')) {
  process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
  process.stdout.write('Using the Electron mirror because npm is configured to use npmmirror.\n')
}

const buildProcess = spawn(process.execPath, [electronBuilderCli, '--win', 'dir', '--x64'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
})

buildProcess.on('error', error => {
  process.stderr.write(`Could not start electron-builder: ${error.message}\n`)
  process.exitCode = 1
})

buildProcess.on('exit', code => {
  process.exitCode = code ?? 1
})
