import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dependencies = vi.hoisted(() => ({
  userId: 'user-one',
  signOut: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: dependencies.userId },
    signOut: dependencies.signOut,
  }),
}))

vi.mock('../lib/environment', () => ({
  frontendEnvironment: { apiBaseUrl: '/api' },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: dependencies.getSession,
      refreshSession: dependencies.refreshSession,
    },
  },
}))

import { ApiProvider, useApi } from './ApiProvider'

function ApiProbe() {
  const api = useApi()

  return (
    <button
      type="button"
      onClick={() => {
        void api.request<{ value: string }>('/test').then((result) => {
          document.body.dataset.result = result.value
        })
      }}
    >
      Request
    </button>
  )
}

describe('ApiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete document.body.dataset.result
    dependencies.userId = 'user-one'
    dependencies.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          user: { id: 'user-one' },
        },
      },
      error: null,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })

  it('provides a client using the current Supabase access token', async () => {
    render(
      <ApiProvider>
        <ApiProbe />
      </ApiProvider>,
    )

    screen.getByRole('button', { name: 'Request' }).click()

    await waitFor(() => expect(document.body.dataset.result).toBe('ok'))
    expect(fetch).toHaveBeenCalledOnce()
    const [url, request] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/test')
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer access-token')
  })
})
