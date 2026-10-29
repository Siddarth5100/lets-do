import type { PropsWithChildren } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  refreshSession: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
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
      resend: authMocks.resend,
      resetPasswordForEmail: authMocks.resetPasswordForEmail,
      signInWithPassword: authMocks.signInWithPassword,
      signUp: authMocks.signUp,
      signOut: authMocks.signOut,
      updateUser: authMocks.updateUser,
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
      <span data-testid="message">{auth.authenticationMessage?.text ?? 'none'}</span>
      <span data-testid="recovery">{String(auth.passwordRecoveryActive)}</span>
      <button type="button" onClick={() => void auth.signIn('person@example.com', 'secret')}>
        Sign in
      </button>
      <button type="button" onClick={() => void auth.signOut().catch(() => undefined)}>
        Sign out
      </button>
      <button type="button" onClick={() => void auth.signUp('person@example.com', 'password')}>
        Sign up
      </button>
      <button type="button" onClick={() => void auth.resendSignupConfirmation('person@example.com')}>
        Resend
      </button>
      <button type="button" onClick={() => void auth.requestPasswordReset('person@example.com')}>
        Recover
      </button>
      <button type="button" onClick={() => void auth.updatePassword('new-password')}>
        Update password
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
    authMocks.resend.mockResolvedValue({ error: null })
    authMocks.resetPasswordForEmail.mockResolvedValue({ error: null })
    authMocks.updateUser.mockResolvedValue({ error: null })
    window.history.replaceState({}, '', '/')
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

  it('signs up and resends confirmation with origin-based redirects', async () => {
    authMocks.signUp.mockResolvedValue({
      data: { session: null, user: { id: 'new-user' } },
      error: null,
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))

    screen.getByRole('button', { name: 'Sign up' }).click()
    await waitFor(() => expect(authMocks.signUp).toHaveBeenCalled())
    expect(authMocks.signUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'password',
      options: { emailRedirectTo: 'http://localhost:3000/?auth=confirmed' },
    })

    screen.getByRole('button', { name: 'Resend' }).click()
    await waitFor(() => expect(authMocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'person@example.com',
      options: { emailRedirectTo: 'http://localhost:3000/?auth=confirmed' },
    }))
  })

  it('requests recovery and updates the password through Supabase', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))

    screen.getByRole('button', { name: 'Recover' }).click()
    await waitFor(() => expect(authMocks.resetPasswordForEmail).toHaveBeenCalledWith(
      'person@example.com',
      { redirectTo: 'http://localhost:3000/?auth=recovery' },
    ))

    act(() => authMocks.callback?.('PASSWORD_RECOVERY', session('recovery-user')))
    expect(screen.getByTestId('recovery').textContent).toBe('true')
    screen.getByRole('button', { name: 'Update password' }).click()
    await waitFor(() => expect(authMocks.updateUser).toHaveBeenCalledWith({
      password: 'new-password',
    }))
    expect(screen.getByTestId('recovery').textContent).toBe('false')
    expect(screen.getByTestId('message').textContent).toBe('Your password has been updated.')
  })

  it('shows and removes an expired callback error from the URL', async () => {
    window.history.replaceState(
      {},
      '',
      '/?auth=confirmed#error=access_denied&error_code=otp_expired',
    )

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('message').textContent).toBe(
      'This authentication link has expired. Request a new one.',
    ))
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')
  })

  it('shows a successful email confirmation callback', async () => {
    window.history.replaceState({}, '', '/?auth=confirmed')
    authMocks.getSession.mockResolvedValue({
      data: { session: session('confirmed-user') },
      error: null,
    })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('message').textContent).toBe(
      'Your email is confirmed. Welcome to Let’s Do.',
    ))
    expect(screen.getByTestId('user').textContent).toBe('confirmed-user')
    expect(window.location.search).toBe('')
  })

  it('shows a generic invalid-link callback error', async () => {
    window.history.replaceState(
      {},
      '',
      '/?auth=recovery#error=access_denied&error_code=invalid_token',
    )

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('message').textContent).toBe(
      'This authentication link is invalid or has already been used.',
    ))
    expect(screen.getByTestId('recovery').textContent).toBe('false')
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
