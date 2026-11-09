import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/ws': {
        target: process.env.RELAY_URL || 'http://localhost:8080',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
