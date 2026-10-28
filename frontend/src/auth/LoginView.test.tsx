import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  signIn: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ signIn: authState.signIn }),
}))

import { LoginView } from './LoginView'

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.signIn.mockResolvedValue(undefined)
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
})
