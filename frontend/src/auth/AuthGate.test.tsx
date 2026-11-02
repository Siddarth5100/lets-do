import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  status: 'authenticated',
  userId: 'user-one',
  appMounts: 0,
  appUnmounts: 0,
  signOut: vi.fn(),
  passwordRecoveryActive: false,
  authenticationMessage: null as { kind: 'success' | 'error'; text: string } | null,
  clearAuthenticationMessage: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    status: testState.status,
    user: testState.userId
      ? { id: testState.userId, email: `${testState.userId}@example.com` }
      : null,
    signOut: testState.signOut,
    passwordRecoveryActive: testState.passwordRecoveryActive,
    authenticationMessage: testState.authenticationMessage,
    clearAuthenticationMessage: testState.clearAuthenticationMessage,
  }),
}))

vi.mock('./UpdatePasswordView', () => ({
  UpdatePasswordView: () => <div>Update password securely</div>,
}))

vi.mock('../App', async () => {
  const { useEffect } = await import('react')
  return {
    default: function TestApp() {
      useEffect(() => {
        testState.appMounts += 1
        return () => {
          testState.appUnmounts += 1
        }
      }, [])
      return <div>Database planner</div>
    },
  }
})

import { AuthGate } from './AuthGate'

describe('AuthGate database planner isolation', () => {
  beforeEach(() => {
    testState.status = 'authenticated'
    testState.userId = 'user-one'
    testState.appMounts = 0
    testState.appUnmounts = 0
    testState.passwordRecoveryActive = false
    testState.authenticationMessage = null
    testState.signOut.mockResolvedValue(undefined)
    localStorage.clear()
  })

  it('does not read, replace, or delete legacy planner ownership data', () => {
    localStorage.setItem('lets-do.planner.owner.v1', 'legacy-owner')
    localStorage.setItem('lets-do.planner.v1', '{"legacy":true}')

    render(<AuthGate />)

    expect(screen.getByText('Database planner')).toBeTruthy()
    expect(localStorage.getItem('lets-do.planner.owner.v1')).toBe('legacy-owner')
    expect(localStorage.getItem('lets-do.planner.v1')).toBe('{"legacy":true}')
  })

  it('remounts the planner when the authenticated account changes', () => {
    const view = render(<AuthGate />)
    expect(testState.appMounts).toBe(1)

    testState.userId = 'user-two'
    view.rerender(<AuthGate />)

    expect(testState.appUnmounts).toBe(1)
    expect(testState.appMounts).toBe(2)
    expect(screen.getByText('user-two@example.com')).toBeTruthy()
  })

  it('shows password recovery before mounting the planner', () => {
    testState.passwordRecoveryActive = true

    render(<AuthGate />)

    expect(screen.getByText('Update password securely')).toBeTruthy()
    expect(screen.queryByText('Database planner')).toBeNull()
  })

  it('shows logout failures visibly', async () => {
    testState.signOut.mockRejectedValue(new Error('Unable to reach authentication service.'))
    render(<AuthGate />)

    screen.getByRole('button', { name: 'Sign out' }).click()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Unable to reach authentication service.',
    )
  })
})
