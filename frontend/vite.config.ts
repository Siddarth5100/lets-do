import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

function requireProductionUrl(name: string, value: string | undefined, requiredPath?: string): void {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    throw new Error(`${name} must be configured for a production build.`)
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(normalizedValue)
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`)
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new Error(`${name} must be a credential-free HTTPS URL.`)
  }
  if (requiredPath && parsedUrl.pathname.replace(/\/$/, '') !== requiredPath) {
    throw new Error(`${name} must use the ${requiredPath} path.`)
  }
  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error(`${name} must not include a query string or fragment.`)
  }
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  if (mode === 'production') {
    requireProductionUrl('VITE_SUPABASE_URL', environment.VITE_SUPABASE_URL)
    requireProductionUrl('VITE_API_BASE_URL', environment.VITE_API_BASE_URL, '/api')
    if (!environment.VITE_SUPABASE_ANON_KEY?.trim()) {
      throw new Error('VITE_SUPABASE_ANON_KEY must be configured for a production build.')
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: environment.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
