import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg'],
    workbox: {
      // pdfjs is lazy-loaded only when a PDF sales report is uploaded, so keep it out of the precache.
      globIgnores: ['**/pdf-*.js', '**/pdf.worker-*.js'],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    },
    manifest: { name: 'Milk Order', short_name: 'Milk Order', description: 'Dairy count and order helper', theme_color: '#1d4ed8', background_color: '#f8fafc', display: 'standalone', start_url: '/', icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] },
  })],
  server: { host: true },
})
