import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // base must be absolute for BrowserRouter: with './', assets 404 on hard
  // loads of nested routes like /project/:id (blank page).
  base: '/',
  // inspectAttr stamps source-path attributes on every DOM element — dev only
  plugins: [...(command === 'serve' ? [inspectAttr()] : []), react()],
  build: {
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
