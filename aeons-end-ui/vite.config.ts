import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Share one rule-engine source between the CLI and UI.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('../aeons-end-engine/src', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
})
