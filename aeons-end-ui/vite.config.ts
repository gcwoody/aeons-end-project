import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

function localImageDatabasePlugin(repositoryRoot: string, buildId: string): Plugin {
  const virtualPrefix = '\0aeons-end-local-image:'
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])

  return {
    name: 'local-image-database',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || source.startsWith(virtualPrefix)) return null
      const cleanImporter = importer.split('?')[0]!
      const cleanSource = source.split('?')[0]!
      const targetPath = isAbsolute(cleanSource)
        ? cleanSource
        : resolve(dirname(cleanImporter), cleanSource)
      const repositoryPath = relative(repositoryRoot, targetPath).split(sep).join('/')
      if (!repositoryPath.startsWith('image-database/')) return null
      if (!imageExtensions.has(extname(targetPath).toLowerCase())) return null

      return `${virtualPrefix}${repositoryPath.slice('image-database/'.length)}`
    },
    load(id) {
      if (!id.startsWith(virtualPrefix)) return null
      const imagePath = id.slice(virtualPrefix.length)
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/')
      return `export default ${JSON.stringify(`/image-database/${imagePath}?v=${buildId}`)}`
    },
  }
}

// Share one rule-engine source with the UI.
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    ...(mode === 'local-demo'
      ? [localImageDatabasePlugin(
        fileURLToPath(new URL('..', import.meta.url)), Date.now().toString(36),
      )]
      : []),
  ],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('../aeons-end-engine/src', import.meta.url)),
    },
  },
  server: {
    // Keep the development server local; do not expose it to the LAN by default.
    host: '127.0.0.1',
    // Keep one predictable development URL. Do not silently move to another
    // port when a stale Vite process is still running.
    port: 5173,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
}))
