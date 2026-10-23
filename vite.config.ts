import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()]

  // Only load the local SQLite & scraper dev server middleware during local development (`vite`)
  // Production builds (e.g. Netlify) build the static frontend bundle without needing node:sqlite
  if (command === 'serve') {
    try {
      const { apiPlugin } = await import('./vite-plugin-api.ts')
      plugins.push(apiPlugin())
    } catch (e) {
      console.warn('Local dev API plugin skipped:', e)
    }
  }

  return {
    plugins,
  }
})
