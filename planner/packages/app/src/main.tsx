import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store'
import './index.css'

// A handle on the store for the dev console. Placement and selection are
// gestures, so they get verified by driving the real app in a browser, and
// reading the state beats inferring it from pixels.
if (import.meta.env.DEV) {
  ;(window as unknown as { store?: unknown }).store = useStore
}

const container = document.getElementById('root')
if (!container) throw new Error('#root missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
