import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  signOut: vi.fn(),
  updatePassword: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => authState,
}))

import { UpdatePasswordView } from './UpdatePasswordView'

describe('UpdatePasswordView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.updatePassword.mockResolvedValue(undefined)
    authState.signOut.mockResolvedValue(undefined)
  })

  it('validates matching passwords and updates the recovered account', async () => {
    render(<UpdatePasswordView />)
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => expect(authState.updatePassword).toHaveBeenCalledWith('new-password'))
  })

  it('does not submit mismatched passwords', async () => {
    render(<UpdatePasswordView />)
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'different-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    expect((await screen.findByRole('alert')).textContent).toBe('The passwords do not match.')
    expect(authState.updatePassword).not.toHaveBeenCalled()
  })
})
