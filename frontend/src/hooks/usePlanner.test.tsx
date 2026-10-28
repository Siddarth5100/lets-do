import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { PlannerSettings, Task, TaskCategory } from '../types/planner'

const testState = vi.hoisted(() => ({
  userId: 'user-one' as string | null,
  getSettings: vi.fn(),
  getTasks: vi.fn(),
  getActivity: vi.fn(),
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  apiClient: { request: vi.fn() },
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: testState.userId ? { id: testState.userId } : null }),
}))

vi.mock('../api/ApiProvider', () => ({
  useApi: () => testState.apiClient,
}))

vi.mock('../api/planner', () => ({
  PlannerApi: class {
    getSettings(signal?: AbortSignal) {
      return testState.getSettings(signal)
    }

    getTasks(signal?: AbortSignal) {
      return testState.getTasks(signal)
    }

    getActivity(signal?: AbortSignal) {
      return testState.getActivity(signal)
    }

    getCategories(signal?: AbortSignal) {
      return testState.getCategories(signal)
    }

    createCategory(name: string, signal?: AbortSignal) {
      return testState.createCategory(name, signal)
    }
  },
}))

import { usePlanner } from './usePlanner'

const defaultCategories: TaskCategory[] = [
  { id: 'work-id', name: 'Work' },
  { id: 'personal-id', name: 'Personal' },
  { id: 'health-id', name: 'Health' },
  { id: 'learning-id', name: 'Learning' },
  { id: 'home-id', name: 'Home' },
]

const settings: PlannerSettings = {
  manualThemeId: 'monday',
  sidebarCollapsed: false,
  timeZone: 'UTC',
}

function task(id: string, title: string): Task {
  return {
    id,
    categoryId: 'work-id',
    category: 'Work',
    title,
    date: '2026-10-28',
    startTime: '09:00',
    scheduleTimeZone: 'UTC',
    plannedMinutes: 30,
    reminder: { enabled: false, minutesBefore: 10 },
    actualCompletedMinutes: 0,
    completionState: 'pending',
    important: false,
    createdAt: '2026-10-28T08:00:00Z',
    updatedAt: '2026-10-28T08:00:00Z',
    completedAt: null,
    version: 1,
  }
}

function setSuccessfulResponses(tasks: Task[] = [task('task-one', 'First task')]) {
  testState.getSettings.mockResolvedValue(settings)
  testState.getTasks.mockResolvedValue(tasks)
  testState.getActivity.mockResolvedValue({
    activityDates: ['2026-10-28'],
    completionEvents: [],
  })
  testState.getCategories.mockResolvedValue(defaultCategories)
  testState.createCategory.mockResolvedValue({ id: 'created-id', name: 'Created' })
}

describe('usePlanner database bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    testState.userId = 'user-one'
    localStorage.clear()
    setSuccessfulResponses()
  })

  it('loads the authenticated account snapshot without touching legacy storage', async () => {
    localStorage.setItem('lets-do.planner.owner.v1', 'legacy-owner')
    localStorage.setItem('lets-do.planner.v1', '{"legacy":true}')
    testState.getCategories.mockResolvedValue([...defaultCategories, { id: 'focus-id', name: 'Focus' }])

    const { result } = renderHook(() => usePlanner())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.state.tasks.map((plannerTask) => plannerTask.title)).toEqual(['First task'])
    expect(result.current.state.activityDates).toEqual(['2026-10-28'])
    expect(result.current.state.settings).toEqual(settings)
    expect(result.current.state.customCategories).toEqual(['Focus'])
    expect(testState.createCategory).not.toHaveBeenCalled()
    expect(localStorage.getItem('lets-do.planner.owner.v1')).toBe('legacy-owner')
    expect(localStorage.getItem('lets-do.planner.v1')).toBe('{"legacy":true}')
  })

  it('creates only missing default categories and tolerates a concurrent conflict', async () => {
    testState.getCategories
      .mockResolvedValueOnce([{ id: 'work-id', name: ' work ' }])
      .mockResolvedValueOnce(defaultCategories)
    testState.createCategory.mockImplementation(async (name: string) => {
      if (name === 'Personal') {
        throw new ApiError(409, 'category_name_conflict', 'Already exists.')
      }
      return { id: `${name}-id`, name }
    })

    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(testState.createCategory.mock.calls.map(([name]) => name)).toEqual([
      'Personal',
      'Health',
      'Learning',
      'Home',
    ])
    expect(testState.getCategories).toHaveBeenCalledTimes(2)
    expect(result.current.categories).toEqual(defaultCategories)
  })

  it('shows an initial error and retries the complete bootstrap', async () => {
    testState.getSettings.mockRejectedValueOnce(new Error('Backend unavailable'))
    const { result } = renderHook(() => usePlanner())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('Backend unavailable')

    await act(async () => {
      await result.current.retry()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.error).toBeNull()
  })

  it('refreshes on focus while retaining the current snapshot', async () => {
    testState.getTasks
      .mockResolvedValueOnce([task('task-one', 'First task')])
      .mockResolvedValueOnce([task('task-two', 'Updated elsewhere')])
    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current.state.tasks[0].title).toBe('First task')
    await waitFor(() => expect(result.current.state.tasks[0].title).toBe('Updated elsewhere'))
    expect(result.current.refreshError).toBeNull()
  })

  it('discards a stale account response after the authenticated user changes', async () => {
    let resolveFirstTasks: ((tasks: Task[]) => void) | undefined
    testState.getTasks
      .mockImplementationOnce(() => new Promise<Task[]>((resolve) => {
        resolveFirstTasks = resolve
      }))
      .mockResolvedValueOnce([task('user-two-task', 'User two task')])
    const { result, rerender } = renderHook(() => usePlanner())
    await waitFor(() => expect(testState.getTasks).toHaveBeenCalledTimes(1))

    testState.userId = 'user-two'
    rerender()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.state.tasks[0].title).toBe('User two task')

    await act(async () => {
      resolveFirstTasks?.([task('stale-task', 'Stale user one task')])
      await Promise.resolve()
    })
    expect(result.current.state.tasks[0].title).toBe('User two task')
  })
})
