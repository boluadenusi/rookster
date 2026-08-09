import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { attributesApiPlugin } from './server/viteAttributesPlugin.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), attributesApiPlugin(env)],
  }
})
