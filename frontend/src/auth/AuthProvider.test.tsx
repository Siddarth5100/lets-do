import type { PropsWithChildren } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  refreshSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  callback: undefined as
    | ((event: string, session: TestSession | null) => void)
    | undefined,
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
      refreshSession: authMocks.refreshSession,
      signInWithPassword: authMocks.signInWithPassword,
      signOut: authMocks.signOut,
    },
  },
}))

import { AuthProvider, useAuth } from './AuthProvider'

interface TestSession {
  access_token: string
  user: {
    id: string
    email: string
  }
}

function session(userId: string): TestSession {
  return {
    access_token: `token-${userId}`,
    user: { id: userId, email: `${userId}@example.com` },
  }
}

function AuthProbe() {
  const auth = useAuth()

  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="user">{auth.user?.id ?? 'none'}</span>
      <span data-testid="error">{auth.restorationError ?? 'none'}</span>
      <button type="button" onClick={() => void auth.signIn('person@example.com', 'secret')}>
        Sign in
      </button>
      <button type="button" onClick={() => void auth.signOut().catch(() => undefined)}>
        Sign out
      </button>
    </div>
  )
}

function renderProvider(children: PropsWithChildren['children'] = <AuthProbe />) {
  return render(<AuthProvider>{children}</AuthProvider>)
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.callback = undefined
    authMocks.onAuthStateChange.mockImplementation((callback) => {
      authMocks.callback = callback
      return { data: { subscription: { unsubscribe: authMocks.unsubscribe } } }
    })
    authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    authMocks.signOut.mockResolvedValue({ error: null })
  })

  it('restores an existing session before rendering authenticated content', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: session('user-one') },
      error: null,
    })

    renderProvider()

    expect(screen.getByTestId('status').textContent).toBe('loading')
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('user').textContent).toBe('user-one')
  })

  it('signs in with email and password', async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      data: { session: session('user-two') },
      error: null,
    })

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    screen.getByRole('button', { name: 'Sign in' }).click()

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('user-two'))
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'secret',
    })
  })

  it('tracks token refresh and logout auth events', async () => {
    renderProvider()
    await waitFor(() => expect(authMocks.callback).toBeDefined())

    act(() => authMocks.callback?.('TOKEN_REFRESHED', session('refreshed-user')))
    expect(screen.getByTestId('user').textContent).toBe('refreshed-user')

    act(() => authMocks.callback?.('SIGNED_OUT', null))
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  it('clears local auth state even when Supabase logout fails', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: session('user-three') },
      error: null,
    })
    authMocks.signOut.mockResolvedValue({ error: new Error('offline') })

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('user-three'))
    screen.getByRole('button', { name: 'Sign out' }).click()

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
