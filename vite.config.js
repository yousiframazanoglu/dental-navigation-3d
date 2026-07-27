import { defineConfig } from 'vite'

// GitHub Pages serves a project site from /<repo>/, so the build made in CI
// needs that prefix. Local dev and local builds stay at the root.
const base = process.env.GITHUB_ACTIONS ? '/dental-navigation-3d/' : '/'

export default defineConfig({
  base,
  server: { host: true, port: 4180 },
  build: { target: 'es2020', assetsInlineLimit: 0 }
})
