import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Share one rule-engine source with the UI.
export default defineConfig({
  plugins: [vue()],
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
})
