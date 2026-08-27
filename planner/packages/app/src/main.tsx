import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Toast } from './components'
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
  // The provider wraps `App` rather than sitting inside it, because `App`'s
  // own hooks — the one that restores a wall on arrival, above all — queue
  // toasts while they run, and a component cannot use a context it provides.
  <StrictMode>
    <Toast.Provider>
      <App />
    </Toast.Provider>
  </StrictMode>,
)
