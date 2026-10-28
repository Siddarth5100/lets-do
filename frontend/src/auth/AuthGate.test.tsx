import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/environment', () => ({
  frontendEnvironment: {
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-key',
    apiBaseUrl: '/api',
  },
}))

import { claimPlannerForUser } from './AuthGate'

describe('planner account ownership', () => {
  it('allows the first account to claim legacy planner storage', () => {
    const storage = new Map<string, string>()
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }

    expect(claimPlannerForUser(localStorage, 'user-one')).toBe(true)
    expect(claimPlannerForUser(localStorage, 'user-one')).toBe(true)
  })

  it('blocks a different account from mounting the legacy planner', () => {
    const storage = new Map([['lets-do.planner.owner.v1', 'user-one']])
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }

    expect(claimPlannerForUser(localStorage, 'user-two')).toBe(false)
  })

  it('fails closed if browser storage is unavailable', () => {
    const localStorage = {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => undefined,
    }

    expect(claimPlannerForUser(localStorage, 'user-one')).toBe(false)
  })
})
