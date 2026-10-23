import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { apiPlugin } from './vite-plugin-api.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiPlugin()],
})

