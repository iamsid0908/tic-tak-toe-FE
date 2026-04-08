import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { NakamaProvider } from './context/NakamaContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NakamaProvider>
      <App />
    </NakamaProvider>
  </StrictMode>,
)
