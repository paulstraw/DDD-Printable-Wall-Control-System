import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * On GitHub Pages the site is served from a repository subpath, not the
 * domain root, so every asset URL needs that prefix. The CI workflow sets
 * PLANNER_BASE; locally it stays '/' so `npm run dev` needs no prefix.
 *
 * The app reads the same value back through `import.meta.env.BASE_URL` when
 * it fetches the part index, so there is one source of truth for it.
 */
const base = process.env.PLANNER_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    // The three.js bundle dwarfs the app code; splitting it lets the browser
    // cache the big, stable half across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
