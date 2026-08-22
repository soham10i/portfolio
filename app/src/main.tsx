import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { lenis } from '@/lib/lenis'
import { ThemeProvider } from '@/components/ThemeProvider'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
