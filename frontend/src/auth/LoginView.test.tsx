import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  clearAuthenticationMessage: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendSignupConfirmation: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    authenticationMessage: null,
    clearAuthenticationMessage: authState.clearAuthenticationMessage,
    requestPasswordReset: authState.requestPasswordReset,
    resendSignupConfirmation: authState.resendSignupConfirmation,
    restorationError: null,
    signIn: authState.signIn,
    signUp: authState.signUp,
  }),
}))

import { LoginView } from './LoginView'

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.signIn.mockResolvedValue(undefined)
    authState.signUp.mockResolvedValue({ confirmationRequired: true })
    authState.requestPasswordReset.mockResolvedValue(undefined)
    authState.resendSignupConfirmation.mockResolvedValue(undefined)
  })

  it('submits normalized credentials', async () => {
    render(<LoginView />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: '  Person@Example.com  ' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(authState.signIn).toHaveBeenCalledWith('Person@Example.com', 'secret')
    })
  })

  it('shows authentication errors without exposing details outside the form', async () => {
    authState.signIn.mockRejectedValue(new Error('Invalid login credentials'))
    render(<LoginView />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid login credentials')
  })

  it('creates an account and supports resending confirmation', async () => {
    render(<LoginView />)
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secure-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'secure-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Check your email')).toBeTruthy()
    expect(authState.signUp).toHaveBeenCalledWith('new@example.com', 'secure-password')
    fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation email' }))
    await waitFor(() => expect(authState.resendSignupConfirmation).toHaveBeenCalledWith(
      'new@example.com',
    ))
    expect((await screen.findByRole('status')).textContent).toContain(
      'If confirmation is still required',
    )
  })

  it('uses a generic response for password recovery', async () => {
    render(<LoginView />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'unknown@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }))

    expect((await screen.findByRole('status')).textContent).toContain(
      'If an account exists for that email',
    )
    expect(authState.requestPasswordReset).toHaveBeenCalledWith('unknown@example.com')
  })
})
