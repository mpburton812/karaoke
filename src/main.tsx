import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { waitForApi } from './db'

const root = document.getElementById('root')!

waitForApi()
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((err) => {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Failed to connect to API.'
    root.innerHTML = [
      '<div style="padding:2rem;font-family:system-ui;color:#f44336">',
      '<h1>Karaoke Companion</h1>',
      `<p>${message}</p>`,
      '<p style="color:#888;font-size:0.9rem">Start the dev stack with <code>npm run dev</code> and configure <code>.env</code>.</p>',
      '</div>',
    ].join('')
  })
