import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ApiProvider } from './api/ApiProvider.tsx'
import { AuthGate } from './auth/AuthGate.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ApiProvider>
        <AuthGate />
      </ApiProvider>
    </AuthProvider>
  </StrictMode>,
)
