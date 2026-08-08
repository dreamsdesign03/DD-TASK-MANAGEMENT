import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync } from 'node:fs'

// Writes a fresh timestamp to dist/version.txt on every production build so
// the web app can auto-reload when a new version is deployed.
function versionFilePlugin() {
  return {
    name: 'write-version-file',
    apply: 'build',
    closeBundle() {
      mkdirSync('dist', { recursive: true })
      writeFileSync('dist/version.txt', String(Date.now()))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    versionFilePlugin(),
    {
      name: 'remove-crossorigin',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(=["'][^"']*["'])?/g, '')
      },
    },
  ],
  server: {
    port: 8000,
    strictPort: true,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'unsafe-none',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    }
  }
})
