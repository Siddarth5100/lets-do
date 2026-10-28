import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import type { ApiSession } from './client'

const firstSession: ApiSession = { accessToken: 'first-token', userId: 'user-one' }
const refreshedSession: ApiSession = { accessToken: 'refreshed-token', userId: 'user-one' }

function createClient(overrides: {
  fetchImplementation?: typeof fetch
  getSession?: () => Promise<ApiSession | null>
  refreshSession?: () => Promise<ApiSession | null>
  onAuthenticationFailure?: () => Promise<void> | void
} = {}) {
  const fetchImplementation = overrides.fetchImplementation ?? vi.fn(async () => (
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch
  const client = new ApiClient({
    baseUrl: '/api/',
    fetchImplementation,
    getSession: overrides.getSession ?? vi.fn(async () => firstSession),
    refreshSession: overrides.refreshSession ?? vi.fn(async () => refreshedSession),
    onAuthenticationFailure: overrides.onAuthenticationFailure ?? vi.fn(),
  })
  client.setActiveUser('user-one')
  return { client, fetchImplementation }
}

describe('ApiClient', () => {
  it('sends the bearer token and returns JSON', async () => {
    const { client, fetchImplementation } = createClient()

    await expect(client.request<{ ok: boolean }>('/v1/auth/me')).resolves.toEqual({ ok: true })

    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, request] = vi.mocked(fetchImplementation).mock.calls[0]
    expect(url).toBe('/api/v1/auth/me')
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer first-token')
  })

  it('preserves structured backend errors and details', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'task_version_conflict',
        message: 'Refresh the task.',
        details: { task_id: 'task-one' },
      },
    }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
    const { client } = createClient({ fetchImplementation })

    const request = client.request('/v1/tasks/task-one', { method: 'PATCH', body: '{}' })

    await expect(request).rejects.toMatchObject({
      status: 409,
      code: 'task_version_conflict',
      details: { task_id: 'task-one' },
    })
  })

  it('refreshes once after a 401 and retries with the new token', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'token_expired' } }), {
        status: 401,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user_id: 'user-one' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch
    const refreshSession = vi.fn(async () => refreshedSession)
    const { client } = createClient({ fetchImplementation, refreshSession })

    await expect(client.request('/v1/auth/me')).resolves.toEqual({ user_id: 'user-one' })

    expect(refreshSession).toHaveBeenCalledOnce()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    const secondRequest = vi.mocked(fetchImplementation).mock.calls[1][1]
    expect(new Headers(secondRequest?.headers).get('Authorization')).toBe('Bearer refreshed-token')
  })

  it('expires authentication when refresh fails or the retry remains unauthorized', async () => {
    const authenticationFailure = vi.fn()
    const firstFetch = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch
    const firstClient = createClient({
      fetchImplementation: firstFetch,
      refreshSession: vi.fn(async () => null),
      onAuthenticationFailure: authenticationFailure,
    }).client

    await expect(firstClient.request('/v1/auth/me')).rejects.toMatchObject({
      code: 'session_expired',
    })

    const secondFetch = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch
    const secondClient = createClient({
      fetchImplementation: secondFetch,
      onAuthenticationFailure: authenticationFailure,
    }).client
    await expect(secondClient.request('/v1/auth/me')).rejects.toMatchObject({
      code: 'session_expired',
    })
    expect(authenticationFailure).toHaveBeenCalledTimes(2)
  })

  it('supports empty successful responses', async () => {
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch
    const { client } = createClient({ fetchImplementation })

    await expect(client.request('/v1/tasks/task-one', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('cancels active and stale requests when the user changes', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    let currentSession: ApiSession | null = firstSession
    const fetchImplementation = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })) as typeof fetch
    const { client } = createClient({
      fetchImplementation,
      getSession: vi.fn(async () => currentSession),
    })
    const request = client.request('/v1/activity')

    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledOnce())
    currentSession = { accessToken: 'other-token', userId: 'user-two' }
    client.setActiveUser('user-two')
    resolveResponse?.(new Response(JSON.stringify({ activity_dates: [] }), { status: 200 }))

    await expect(request).rejects.toMatchObject({ code: 'request_cancelled' })
  })

  it('requires a session before sending a request', async () => {
    const { client, fetchImplementation } = createClient({
      getSession: vi.fn(async () => null),
    })

    await expect(client.request('/v1/activity')).rejects.toEqual(
      expect.objectContaining({ code: 'authentication_required', status: 401 }),
    )
    expect(fetchImplementation).not.toHaveBeenCalled()
  })
})
