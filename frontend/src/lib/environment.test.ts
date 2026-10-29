import { describe, expect, it } from 'vitest'
import { readEnvironment } from './environment'

function createEnvironment(overrides: Partial<ImportMetaEnv> = {}): ImportMetaEnv {
  return {
    BASE_URL: '/',
    DEV: true,
    MODE: 'development',
    PROD: false,
    SSR: false,
    VITE_SUPABASE_URL: 'http://localhost:54321',
    VITE_SUPABASE_ANON_KEY: 'public-development-key',
    ...overrides,
  }
}

describe('readEnvironment', () => {
  it('preserves the development API proxy default', () => {
    const environment = readEnvironment(createEnvironment())

    expect(environment.apiBaseUrl).toBe('/api')
  })

  it('accepts HTTPS Supabase and API URLs in production', () => {
    const environment = readEnvironment(
      createEnvironment({
        DEV: false,
        MODE: 'production',
        PROD: true,
        VITE_SUPABASE_URL: 'https://example-project.supabase.co',
        VITE_API_BASE_URL: 'https://api.example.com/api',
      }),
    )

    expect(environment.apiBaseUrl).toBe('https://api.example.com/api')
  })

  it('rejects a relative production API URL', () => {
    expect(() =>
      readEnvironment(
        createEnvironment({
          DEV: false,
          MODE: 'production',
          PROD: true,
          VITE_SUPABASE_URL: 'https://example-project.supabase.co',
          VITE_API_BASE_URL: '/api',
        }),
      ),
    ).toThrow('VITE_API_BASE_URL must be a valid absolute URL.')
  })

  it('rejects a production API URL without the API path', () => {
    expect(() =>
      readEnvironment(
        createEnvironment({
          DEV: false,
          MODE: 'production',
          PROD: true,
          VITE_SUPABASE_URL: 'https://example-project.supabase.co',
          VITE_API_BASE_URL: 'https://api.example.com',
        }),
      ),
    ).toThrow('VITE_API_BASE_URL must use the /api path.')
  })
})
