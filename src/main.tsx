import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles/index.css'
import { AppRoutes } from './app/routes'
import { bootTheme } from './components/ui/theme'

bootTheme()
// index.html's description is for crawlers without JS; React hoists the page's own, so drop the default.
document.querySelector('meta[name="description"][data-default]')?.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
