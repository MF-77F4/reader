import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: 'src/renderer',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1'
  },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  plugins: [vue()],
  build: {
    outDir: resolve('out/tauri-renderer'),
    emptyOutDir: true
  }
})
