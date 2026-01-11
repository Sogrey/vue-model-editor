import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  base: '/vue-model-editor',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // 提高警告阈值到 1000KB
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 Three.js 相关模块单独打包
          'vendor-three': ['three'],
        },
      },
    },
  },
})
