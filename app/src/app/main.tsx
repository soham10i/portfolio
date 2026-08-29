import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { lenis } from '@/shared/lib/lenis'
import { applyPalette, readStoredPalette } from '@/shared/lib/palettes'
import './index.css'
import App from './App.tsx'

// Sync Lenis with anchor clicks (only for anchors that target a real element)
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  const anchor = target.closest('a[href^="#"]')
  if (anchor) {
    const id = anchor.getAttribute('href')?.slice(1)
    if (id && document.getElementById(id)) {
      e.preventDefault()
      lenis.scrollTo(`#${id}`, { offset: -80 })
    }
  }
})

/* Paint the stored palette before React mounts, so the first frame is already
   the right colour instead of flashing the default and correcting itself.
   (The old ThemeProvider set a data-theme attribute that the palette system
   then overrode with inline custom properties — two theming mechanisms
   fighting over the same tokens. Only the palette system remains.) */
applyPalette(readStoredPalette())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
