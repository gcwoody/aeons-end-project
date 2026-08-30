import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 直接复用上一级 aeons-end-engine 的引擎源码（CLI 与 UI 共享同一份规则逻辑）
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
