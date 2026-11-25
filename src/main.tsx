import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles/index.css'
import { AppRoutes } from './app/routes'
import { bootTheme } from './components/ui/theme'

bootTheme()
// The head tags in this route's static HTML are for readers without JS. React renders the page's own, so drop them.
document.head.querySelectorAll('[data-default]').forEach((el) => el.remove())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
