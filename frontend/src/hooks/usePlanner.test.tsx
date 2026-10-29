import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import type { ReactNode } from 'react'
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
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskCompletion: vi.fn(),
  deleteTask: vi.fn(),
  updateSettings: vi.fn(),
  confirmReview: vi.fn(),
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

    createTask(input: unknown, signal?: AbortSignal) {
      return testState.createTask(input, signal)
    }

    updateTask(taskId: string, input: unknown, signal?: AbortSignal) {
      return testState.updateTask(taskId, input, signal)
    }

    updateTaskCompletion(taskId: string, input: unknown, signal?: AbortSignal) {
      return testState.updateTaskCompletion(taskId, input, signal)
    }

    deleteTask(taskId: string, version: number, signal?: AbortSignal) {
      return testState.deleteTask(taskId, version, signal)
    }

    updateSettings(input: unknown, signal?: AbortSignal) {
      return testState.updateSettings(input, signal)
    }

    confirmReview(timeZone: string, signal?: AbortSignal) {
      return testState.confirmReview(timeZone, signal)
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
  testState.createTask.mockResolvedValue(task('created-task', 'Created task'))
  testState.updateTask.mockResolvedValue({ ...task('task-one', 'Updated task'), version: 2 })
  testState.updateTaskCompletion.mockResolvedValue({
    ...task('task-one', 'First task'),
    completionState: 'completed',
    actualCompletedMinutes: 30,
    version: 2,
  })
  testState.deleteTask.mockResolvedValue(undefined)
  testState.updateSettings.mockResolvedValue(settings)
  testState.confirmReview.mockResolvedValue({ activityDate: '2026-10-28' })
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

  it('creates all missing default categories concurrently', async () => {
    const categoryResolvers = new Map<string, (category: TaskCategory) => void>()
    testState.getCategories.mockResolvedValueOnce([])
    testState.createCategory.mockImplementation((name: string) => (
      new Promise<TaskCategory>((resolve) => categoryResolvers.set(name, resolve))
    ))

    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(testState.createCategory).toHaveBeenCalledTimes(5))

    await act(async () => {
      for (const name of defaultCategories.map((category) => category.name)) {
        categoryResolvers.get(name)?.({ id: `${name}-id`, name })
      }
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('starts only one bootstrap under development Strict Mode', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(() => usePlanner(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(testState.getTasks).toHaveBeenCalledOnce()
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

    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.state.tasks[0].title).toBe('First task')
    await waitFor(() => expect(result.current.state.tasks[0].title).toBe('Updated elsewhere'))
    expect(result.current.refreshError).toBeNull()
    expect(testState.getTasks).toHaveBeenCalledTimes(2)
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

  it('creates tasks through the API and never writes planner localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.addTask({
        title: 'Created task',
        category: 'Work',
        date: '2026-10-28',
        startTime: '10:00',
        plannedMinutes: 30,
        reminder: { enabled: false, minutesBefore: 10 },
        actualCompletedMinutes: 0,
        important: false,
      })
    })

    expect(testState.createTask).toHaveBeenCalledWith(expect.objectContaining({
      categoryId: 'work-id',
      confirmWarnings: false,
    }), expect.any(AbortSignal))
    expect(result.current.state.tasks.at(-1)?.title).toBe('Created task')
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('uses current versions for completion and refreshes activity', async () => {
    testState.getActivity
      .mockResolvedValueOnce({ activityDates: [], completionEvents: [] })
      .mockResolvedValueOnce({
        activityDates: ['2026-10-28'],
        completionEvents: [{ id: 'event', taskId: 'task-one', completedAt: '2026-10-28T09:30:00Z' }],
      })
    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => { await result.current.completeTask('task-one') })

    expect(testState.updateTaskCompletion).toHaveBeenCalledWith('task-one', {
      version: 1,
      action: 'complete',
      confirmWarnings: false,
    }, expect.any(AbortSignal))
    expect(result.current.state.tasks[0].completionState).toBe('completed')
    expect(result.current.state.completionEvents).toHaveLength(1)
  })

  it('releases mutation busy state before a background activity refresh finishes', async () => {
    let resolveActivity: ((activity: {
      activityDates: string[]
      completionEvents: Array<{ id: string; taskId: string | null; completedAt: string }>
    }) => void) | undefined
    testState.getActivity
      .mockResolvedValueOnce({ activityDates: [], completionEvents: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveActivity = resolve }))
    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => { await result.current.completeTask('task-one') })

    expect(result.current.pendingTaskIds.has('task-one')).toBe(false)
    expect(result.current.state.tasks[0].completionState).toBe('completed')
    expect(result.current.state.completionEvents).toEqual([])
    expect(testState.getActivity).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveActivity?.({
        activityDates: ['2026-10-28'],
        completionEvents: [{
          id: 'event', taskId: 'task-one', completedAt: '2026-10-28T09:30:00Z',
        }],
      })
    })
    await waitFor(() => expect(result.current.state.completionEvents).toHaveLength(1))
  })

  it('coalesces concurrent background activity refreshes with one trailing refresh', async () => {
    let resolveFirstRefresh: ((activity: { activityDates: string[]; completionEvents: [] }) => void) | undefined
    testState.getActivity
      .mockResolvedValueOnce({ activityDates: [], completionEvents: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstRefresh = resolve }))
      .mockResolvedValueOnce({ activityDates: ['2026-10-28'], completionEvents: [] })
    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.completeTask('task-one')
      await result.current.toggleImportant('task-one')
    })
    expect(testState.getActivity).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveFirstRefresh?.({ activityDates: [], completionEvents: [] })
    })
    await waitFor(() => expect(testState.getActivity).toHaveBeenCalledTimes(3))
  })

  it('cancels and discards a background activity refresh when the account changes', async () => {
    let refreshSignal: AbortSignal | undefined
    let resolveStaleRefresh: ((activity: { activityDates: string[]; completionEvents: [] }) => void) | undefined
    testState.getActivity
      .mockResolvedValueOnce({ activityDates: [], completionEvents: [] })
      .mockImplementationOnce((signal: AbortSignal) => {
        refreshSignal = signal
        return new Promise((resolve) => { resolveStaleRefresh = resolve })
      })
      .mockResolvedValueOnce({ activityDates: ['2026-10-29'], completionEvents: [] })
    testState.getTasks
      .mockResolvedValueOnce([task('task-one', 'User one task')])
      .mockResolvedValueOnce([task('task-two', 'User two task')])
    const { result, rerender } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => { await result.current.completeTask('task-one') })
    testState.userId = 'user-two'
    rerender()
    await waitFor(() => expect(result.current.state.tasks[0]?.title).toBe('User two task'))
    expect(refreshSignal?.aborted).toBe(true)

    await act(async () => {
      resolveStaleRefresh?.({ activityDates: ['2026-10-01'], completionEvents: [] })
    })
    expect(result.current.state.activityDates).toEqual(['2026-10-29'])
  })

  it('rolls settings back when saving fails', async () => {
    testState.updateSettings.mockRejectedValueOnce(new Error('Save failed'))
    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await expect(act(async () => {
      await result.current.updateSettings({ ...settings, manualThemeId: 'friday' })
    })).rejects.toThrow('Save failed')
    expect(result.current.state.settings).toEqual(settings)
  })

  it('refreshes the task snapshot after a stale version conflict', async () => {
    testState.updateTask.mockRejectedValueOnce(
      new ApiError(409, 'task_version_conflict', 'Stale task.'),
    )
    testState.getTasks
      .mockResolvedValueOnce([task('task-one', 'First task')])
      .mockResolvedValueOnce([{ ...task('task-one', 'Changed elsewhere'), version: 2 }])
    const { result } = renderHook(() => usePlanner())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    let conflict: unknown
    await act(async () => {
      try {
        await result.current.toggleImportant('task-one')
      } catch (error) {
        conflict = error
      }
    })
    expect(conflict).toMatchObject({ code: 'task_version_conflict' })
    expect(testState.getTasks).toHaveBeenCalledTimes(2)
    await expect(testState.getTasks.mock.results[1].value).resolves.toEqual([
      expect.objectContaining({ title: 'Changed elsewhere' }),
    ])
    await waitFor(() => expect(result.current.state.tasks[0].title).toBe('Changed elsewhere'))
    expect(result.current.state.tasks[0].version).toBe(2)
  })
})
