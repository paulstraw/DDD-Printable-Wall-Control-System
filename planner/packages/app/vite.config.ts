import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `base` is set to the Pages path by the CI build (see the Pages workflow);
// locally it stays at '/' so `npm run dev` works without a prefix.
export default defineConfig({
  plugins: [react()],
})
