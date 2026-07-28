import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// GitHub Pages serves a project site from /<repo>/, so the build made in CI
// needs that prefix. Local dev and local builds stay at the root.
const base = process.env.GITHUB_ACTIONS ? '/dental-navigation-3d/' : '/'

export default defineConfig({
  base,
  server: { host: true, port: 4180 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        sunum: fileURLToPath(new URL('./sunum.html', import.meta.url)),
        en: fileURLToPath(new URL('./en.html', import.meta.url)),
        ar: fileURLToPath(new URL('./ar.html', import.meta.url)),
      },
    },
  },
})
