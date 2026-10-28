import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDraft } from '../types/planner'
import type { ApiClient } from './client'
import {
  mapActivityResponse,
  mapCategoryResponse,
  mapReviewResponse,
  mapSettingsResponse,
  mapTaskResponse,
  PlannerApi,
  PlannerApiMappingError,
} from './planner'

const taskResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  category_id: '22222222-2222-4222-8222-222222222222',
  category_name: 'Work',
  title: 'Write release notes',
  scheduled_date: '2026-10-29',
  start_time: '09:30',
  schedule_time_zone: 'Asia/Kolkata',
  planned_minutes: 90,
  reminder_enabled: true,
  reminder_minutes_before: 15,
  actual_completed_minutes: 45,
  completion_state: 'partial',
  important: true,
  completed_at: null,
  max_points: 1.5,
  earned_points: 0.75,
  version: 3,
  created_at: '2026-10-28T08:00:00Z',
  updated_at: '2026-10-28T09:00:00Z',
}

const taskDraft: TaskDraft = {
  title: 'Write release notes',
  category: 'Work',
  date: '2026-10-29',
  startTime: '09:30',
  plannedMinutes: 90,
  reminder: { enabled: true, minutesBefore: 15 },
  actualCompletedMinutes: 0,
  important: true,
}

function createPlannerApi() {
  const request = vi.fn()
  return {
    request,
    plannerApi: new PlannerApi({ request } as unknown as ApiClient),
  }
}

function requestBody(request: ReturnType<typeof vi.fn>, callIndex = 0): Record<string, unknown> {
  const options = request.mock.calls[callIndex][1] as RequestInit
  return JSON.parse(String(options.body)) as Record<string, unknown>
}

describe('planner API response mappings', () => {
  it('maps a backend task to the existing planner task model', () => {
    expect(mapTaskResponse(taskResponse)).toEqual({
      id: taskResponse.id,
      categoryId: taskResponse.category_id,
      category: 'Work',
      title: 'Write release notes',
      date: '2026-10-29',
      startTime: '09:30',
      scheduleTimeZone: 'Asia/Kolkata',
      plannedMinutes: 90,
      reminder: { enabled: true, minutesBefore: 15 },
      actualCompletedMinutes: 45,
      completionState: 'partial',
      important: true,
      completedAt: null,
      version: 3,
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T09:00:00Z',
    })
  })

  it('maps categories, settings, activity, and review responses', () => {
    expect(mapCategoryResponse({ id: 'category-id', name: 'Health' })).toEqual({
      id: 'category-id',
      name: 'Health',
    })
    expect(mapSettingsResponse({
      manual_theme_id: 'monday',
      sidebar_collapsed: true,
      time_zone: 'Europe/London',
    })).toEqual({
      manualThemeId: 'monday',
      sidebarCollapsed: true,
      timeZone: 'Europe/London',
    })
    expect(mapActivityResponse({
      activity_dates: ['2026-10-27', '2026-10-28'],
      completion_events: [{
        id: 'event-id',
        task_id: null,
        completed_at: '2026-10-28T20:30:00Z',
      }],
    })).toEqual({
      activityDates: ['2026-10-27', '2026-10-28'],
      completionEvents: [{
        id: 'event-id',
        taskId: null,
        completedAt: '2026-10-28T20:30:00Z',
      }],
    })
    expect(mapReviewResponse({ activity_date: '2026-10-28' })).toEqual({
      activityDate: '2026-10-28',
    })
  })

  it.each([
    [{ ...taskResponse, scheduled_date: '2026-02-30' }, 'ISO calendar date'],
    [{ ...taskResponse, start_time: '24:00' }, 'HH:MM'],
    [{ ...taskResponse, schedule_time_zone: 'Not/AZone' }, 'IANA time zone'],
    [{ ...taskResponse, completion_state: 'done' }, 'completion_state is invalid'],
    [{ ...taskResponse, version: 0 }, 'positive integer'],
  ])('rejects malformed task responses', (response, expectedMessage) => {
    expect(() => mapTaskResponse(response)).toThrow(PlannerApiMappingError)
    expect(() => mapTaskResponse(response)).toThrow(expectedMessage)
  })

  it('rejects malformed activity and settings responses', () => {
    expect(() => mapActivityResponse({
      activity_dates: ['not-a-date'],
      completion_events: [],
    })).toThrow('ISO calendar date')
    expect(() => mapSettingsResponse({
      manual_theme_id: null,
      sidebar_collapsed: false,
      time_zone: 'invalid',
    })).toThrow('IANA time zone')
  })
})

describe('PlannerApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads and maps all read resources', async () => {
    const { plannerApi, request } = createPlannerApi()
    request
      .mockResolvedValueOnce([taskResponse])
      .mockResolvedValueOnce(taskResponse)
      .mockResolvedValueOnce([{ id: 'category-id', name: 'Work' }])
      .mockResolvedValueOnce({
        manual_theme_id: null,
        sidebar_collapsed: false,
        time_zone: 'UTC',
      })
      .mockResolvedValueOnce({ activity_dates: [], completion_events: [] })

    await expect(plannerApi.getTasks()).resolves.toHaveLength(1)
    await expect(plannerApi.getTask('task/id')).resolves.toMatchObject({ version: 3 })
    await expect(plannerApi.getCategories()).resolves.toEqual([{ id: 'category-id', name: 'Work' }])
    await expect(plannerApi.getSettings()).resolves.toMatchObject({ timeZone: 'UTC' })
    await expect(plannerApi.getActivity()).resolves.toEqual({
      activityDates: [],
      completionEvents: [],
    })
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/v1/tasks',
      '/v1/tasks/task%2Fid',
      '/v1/categories',
      '/v1/settings',
      '/v1/activity',
    ])
  })

  it('creates tasks with the backend field names', async () => {
    const { plannerApi, request } = createPlannerApi()
    request.mockResolvedValue(taskResponse)

    await plannerApi.createTask({
      draft: taskDraft,
      categoryId: taskResponse.category_id,
      scheduleTimeZone: 'Asia/Kolkata',
      confirmWarnings: true,
    })

    expect(request).toHaveBeenCalledWith('/v1/tasks', expect.objectContaining({ method: 'POST' }))
    expect(requestBody(request)).toEqual({
      category_id: taskResponse.category_id,
      title: 'Write release notes',
      scheduled_date: '2026-10-29',
      start_time: '09:30',
      schedule_time_zone: 'Asia/Kolkata',
      planned_minutes: 90,
      reminder_enabled: true,
      reminder_minutes_before: 15,
      important: true,
      confirm_warnings: true,
    })
  })

  it('updates only supplied task fields and includes the optimistic version', async () => {
    const { plannerApi, request } = createPlannerApi()
    request.mockResolvedValue(taskResponse)

    await plannerApi.updateTask('task-id', {
      version: 3,
      title: 'Updated title',
      important: false,
    })

    expect(request).toHaveBeenCalledWith('/v1/tasks/task-id', expect.objectContaining({
      method: 'PATCH',
    }))
    expect(requestBody(request)).toEqual({
      version: 3,
      confirm_warnings: false,
      title: 'Updated title',
      important: false,
    })
  })

  it('maps completion, deletion, category, settings, and review mutations', async () => {
    const { plannerApi, request } = createPlannerApi()
    request
      .mockResolvedValueOnce(taskResponse)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'category-id', name: 'Focus' })
      .mockResolvedValueOnce({ id: 'category-id', name: 'Deep Focus' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        manual_theme_id: 'friday',
        sidebar_collapsed: true,
        time_zone: 'America/New_York',
      })
      .mockResolvedValueOnce({ activity_date: '2026-10-28' })

    await plannerApi.updateTaskCompletion('task-id', {
      version: 3,
      action: 'reopen',
      confirmWarnings: true,
    })
    await plannerApi.deleteTask('task/id', 3)
    await plannerApi.createCategory('Focus')
    await plannerApi.updateCategory('category/id', 'Deep Focus')
    await plannerApi.deleteCategory('category/id')
    await plannerApi.updateSettings({
      manualThemeId: 'friday',
      sidebarCollapsed: true,
      timeZone: 'America/New_York',
    })
    await expect(plannerApi.confirmReview('America/New_York')).resolves.toEqual({
      activityDate: '2026-10-28',
    })

    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/v1/tasks/task-id/completion',
      '/v1/tasks/task%2Fid?version=3',
      '/v1/categories',
      '/v1/categories/category%2Fid',
      '/v1/categories/category%2Fid',
      '/v1/settings',
      '/v1/activity/review',
    ])
    expect(requestBody(request, 0)).toEqual({
      version: 3,
      action: 'reopen',
      confirm_warnings: true,
    })
    expect(requestBody(request, 5)).toEqual({
      manual_theme_id: 'friday',
      sidebar_collapsed: true,
      time_zone: 'America/New_York',
    })
    expect(requestBody(request, 6)).toEqual({ time_zone: 'America/New_York' })
  })

  it('validates versions, task updates, and time zones before sending', async () => {
    const { plannerApi, request } = createPlannerApi()

    await expect(plannerApi.updateTask('task-id', { version: 1 })).rejects.toThrow(
      'At least one task field',
    )
    await expect(plannerApi.deleteTask('task-id', 0)).rejects.toThrow('positive integer')
    await expect(plannerApi.confirmReview('Not/AZone')).rejects.toThrow('IANA time zone')
    expect(request).not.toHaveBeenCalled()
  })
})
