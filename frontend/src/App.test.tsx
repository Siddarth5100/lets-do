import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from './types/planner'

const testState = vi.hoisted(() => ({
  completeTask: vi.fn(),
}))

const plannerTask: Task = {
  id: 'task-one',
  categoryId: 'work-id',
  title: 'Write report',
  category: 'Work',
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

vi.mock('./hooks/usePlanner', () => ({
  usePlanner: () => ({
    state: {
      version: 2,
      tasks: [plannerTask],
      activityDates: [],
      completionEvents: [],
      customCategories: [],
      settings: { manualThemeId: null, sidebarCollapsed: false, timeZone: 'UTC' },
    },
    categories: [{ id: 'work-id', name: 'Work' }],
    status: 'ready',
    error: null,
    refreshing: false,
    refreshError: null,
    pendingTaskIds: new Set<string>(),
    creatingTask: false,
    savingSettings: false,
    retry: vi.fn(),
    addTask: vi.fn(),
    updateTask: vi.fn(),
    completeTask: testState.completeTask,
    toggleTaskPartial: vi.fn(),
    markTaskIncomplete: vi.fn(),
    reopenTask: vi.fn(),
    toggleImportant: vi.fn(),
    deleteTask: vi.fn(),
    addCustomCategory: vi.fn(),
    updateSettings: vi.fn(),
    confirmReview: vi.fn(),
  }),
}))

vi.mock('./hooks/useCurrentDate', () => ({
  useCurrentDate: () => new Date(2026, 9, 28, 8),
}))

vi.mock('./components/dashboard/TodayView', () => ({
  TodayView: (props: { onComplete: (task: Task) => void }) => (
    <button type="button" onClick={() => props.onComplete(plannerTask)}>Complete test task</button>
  ),
}))

vi.mock('./components/layout/Navigation', () => ({
  DesktopNavigation: () => null,
  BottomNavigation: () => null,
}))

import App from './App'

describe('database-backed planner actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    testState.completeTask.mockResolvedValue(plannerTask)
    sessionStorage.clear()
  })

  it('routes task completion to the planner API mutation', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete test task' }))
    await waitFor(() => expect(testState.completeTask).toHaveBeenCalledWith('task-one'))
    expect(screen.queryByText(/changes are temporarily disabled/i)).toBeNull()
  })
})
