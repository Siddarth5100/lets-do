import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  status: 'authenticated',
  userId: 'user-one',
  appMounts: 0,
  appUnmounts: 0,
  signOut: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    status: testState.status,
    user: testState.userId
      ? { id: testState.userId, email: `${testState.userId}@example.com` }
      : null,
    signOut: testState.signOut,
  }),
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
})
