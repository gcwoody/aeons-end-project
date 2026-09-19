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
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
})
