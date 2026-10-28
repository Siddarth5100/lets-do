import type {
  CompletionEvent,
  CompletionState,
  PlannerSettings,
  Task,
  TaskCategory,
  TaskDraft,
} from '../types/planner'
import { requireIanaTimeZone } from '../utils/timeZones'
import type { ApiClient } from './client'

export type TaskCompletionAction = 'complete' | 'toggle_partial' | 'mark_incomplete' | 'reopen'

export interface TaskCreateInput {
  draft: TaskDraft
  categoryId: string
  scheduleTimeZone: string
  confirmWarnings?: boolean
}

export interface TaskUpdateInput {
  version: number
  categoryId?: string
  title?: string
  date?: string
  startTime?: string
  scheduleTimeZone?: string
  plannedMinutes?: number
  reminderEnabled?: boolean
  reminderMinutesBefore?: number
  important?: boolean
  confirmWarnings?: boolean
}

export interface TaskCompletionInput {
  version: number
  action: TaskCompletionAction
  confirmWarnings?: boolean
}

export interface ActivityHistory {
  activityDates: string[]
  completionEvents: CompletionEvent[]
}

export interface ReviewConfirmation {
  activityDate: string
}

interface TaskResponseBody {
  id: unknown
  category_id: unknown
  category_name: unknown
  title: unknown
  scheduled_date: unknown
  start_time: unknown
  schedule_time_zone: unknown
  planned_minutes: unknown
  reminder_enabled: unknown
  reminder_minutes_before: unknown
  actual_completed_minutes: unknown
  completion_state: unknown
  important: unknown
  completed_at: unknown
  version: unknown
  created_at: unknown
  updated_at: unknown
}

interface CategoryResponseBody {
  id: unknown
  name: unknown
}

interface SettingsResponseBody {
  manual_theme_id: unknown
  sidebar_collapsed: unknown
  time_zone: unknown
}

interface CompletionEventResponseBody {
  id: unknown
  task_id: unknown
  completed_at: unknown
}

interface ActivityResponseBody {
  activity_dates: unknown
  completion_events: unknown
}

interface ReviewResponseBody {
  activity_date: unknown
}

export class PlannerApiMappingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlannerApiMappingError'
  }
}

export class PlannerApi {
  private readonly client: ApiClient

  constructor(client: ApiClient) {
    this.client = client
  }

  async getTasks(): Promise<Task[]> {
    const response = await this.client.request<unknown>('/v1/tasks')
    return requireArray(response, 'tasks').map(mapTaskResponse)
  }

  async getTask(taskId: string): Promise<Task> {
    return mapTaskResponse(await this.client.request<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}`))
  }

  async createTask(input: TaskCreateInput): Promise<Task> {
    const timeZone = requireIanaTimeZone(input.scheduleTimeZone, 'scheduleTimeZone')
    const body = {
      category_id: input.categoryId,
      title: input.draft.title,
      scheduled_date: input.draft.date,
      start_time: input.draft.startTime,
      schedule_time_zone: timeZone,
      planned_minutes: input.draft.plannedMinutes,
      reminder_enabled: input.draft.reminder.enabled,
      reminder_minutes_before: input.draft.reminder.minutesBefore,
      important: input.draft.important,
      confirm_warnings: input.confirmWarnings ?? false,
    }
    return mapTaskResponse(await this.requestJson('/v1/tasks', 'POST', body))
  }

  async updateTask(taskId: string, input: TaskUpdateInput): Promise<Task> {
    if (!hasTaskUpdate(input)) {
      throw new Error('At least one task field must be provided.')
    }
    const body: Record<string, unknown> = {
      version: requireVersion(input.version),
      confirm_warnings: input.confirmWarnings ?? false,
    }
    assignDefined(body, 'category_id', input.categoryId)
    assignDefined(body, 'title', input.title)
    assignDefined(body, 'scheduled_date', input.date)
    assignDefined(body, 'start_time', input.startTime)
    assignDefined(
      body,
      'schedule_time_zone',
      input.scheduleTimeZone === undefined
        ? undefined
        : requireIanaTimeZone(input.scheduleTimeZone, 'scheduleTimeZone'),
    )
    assignDefined(body, 'planned_minutes', input.plannedMinutes)
    assignDefined(body, 'reminder_enabled', input.reminderEnabled)
    assignDefined(body, 'reminder_minutes_before', input.reminderMinutesBefore)
    assignDefined(body, 'important', input.important)
    return mapTaskResponse(await this.requestJson(
      `/v1/tasks/${encodeURIComponent(taskId)}`,
      'PATCH',
      body,
    ))
  }

  async updateTaskCompletion(taskId: string, input: TaskCompletionInput): Promise<Task> {
    return mapTaskResponse(await this.requestJson(
      `/v1/tasks/${encodeURIComponent(taskId)}/completion`,
      'PATCH',
      {
        version: requireVersion(input.version),
        action: input.action,
        confirm_warnings: input.confirmWarnings ?? false,
      },
    ))
  }

  async deleteTask(taskId: string, version: number): Promise<void> {
    await this.client.request<void>(
      `/v1/tasks/${encodeURIComponent(taskId)}?version=${requireVersion(version)}`,
      { method: 'DELETE' },
    )
  }

  async getCategories(): Promise<TaskCategory[]> {
    const response = await this.client.request<unknown>('/v1/categories')
    return requireArray(response, 'categories').map(mapCategoryResponse)
  }

  async createCategory(name: string): Promise<TaskCategory> {
    return mapCategoryResponse(await this.requestJson('/v1/categories', 'POST', { name }))
  }

  async updateCategory(categoryId: string, name: string): Promise<TaskCategory> {
    return mapCategoryResponse(await this.requestJson(
      `/v1/categories/${encodeURIComponent(categoryId)}`,
      'PATCH',
      { name },
    ))
  }

  async deleteCategory(categoryId: string): Promise<void> {
    await this.client.request<void>(`/v1/categories/${encodeURIComponent(categoryId)}`, {
      method: 'DELETE',
    })
  }

  async getSettings(): Promise<PlannerSettings> {
    return mapSettingsResponse(await this.client.request<unknown>('/v1/settings'))
  }

  async updateSettings(settings: Required<PlannerSettings>): Promise<PlannerSettings> {
    const body = {
      manual_theme_id: settings.manualThemeId,
      sidebar_collapsed: settings.sidebarCollapsed,
      time_zone: requireIanaTimeZone(settings.timeZone, 'timeZone'),
    }
    return mapSettingsResponse(await this.requestJson('/v1/settings', 'PUT', body))
  }

  async getActivity(): Promise<ActivityHistory> {
    return mapActivityResponse(await this.client.request<unknown>('/v1/activity'))
  }

  async confirmReview(timeZone: string): Promise<ReviewConfirmation> {
    return mapReviewResponse(await this.requestJson('/v1/activity/review', 'POST', {
      time_zone: requireIanaTimeZone(timeZone, 'timeZone'),
    }))
  }

  private requestJson(path: string, method: string, body: unknown): Promise<unknown> {
    return this.client.request<unknown>(path, {
      method,
      body: JSON.stringify(body),
    })
  }
}

export function mapTaskResponse(value: unknown): Task {
  const task = requireRecord(value, 'task') as unknown as TaskResponseBody
  const completionState = requireCompletionState(task.completion_state)
  return {
    id: requireString(task.id, 'task.id'),
    categoryId: requireString(task.category_id, 'task.category_id'),
    category: requireString(task.category_name, 'task.category_name'),
    title: requireString(task.title, 'task.title'),
    date: requireDateKey(task.scheduled_date, 'task.scheduled_date'),
    startTime: requireTime(task.start_time, 'task.start_time'),
    scheduleTimeZone: requireMappedTimeZone(task.schedule_time_zone, 'task.schedule_time_zone'),
    plannedMinutes: requirePositiveNumber(task.planned_minutes, 'task.planned_minutes'),
    reminder: {
      enabled: requireBoolean(task.reminder_enabled, 'task.reminder_enabled'),
      minutesBefore: requireNonNegativeNumber(
        task.reminder_minutes_before,
        'task.reminder_minutes_before',
      ),
    },
    actualCompletedMinutes: requireNonNegativeNumber(
      task.actual_completed_minutes,
      'task.actual_completed_minutes',
    ),
    completionState,
    important: requireBoolean(task.important, 'task.important'),
    completedAt: requireNullableTimestamp(task.completed_at, 'task.completed_at'),
    version: requireVersion(task.version, 'task.version'),
    createdAt: requireTimestamp(task.created_at, 'task.created_at'),
    updatedAt: requireTimestamp(task.updated_at, 'task.updated_at'),
  }
}

export function mapCategoryResponse(value: unknown): TaskCategory {
  const category = requireRecord(value, 'category') as unknown as CategoryResponseBody
  return {
    id: requireString(category.id, 'category.id'),
    name: requireString(category.name, 'category.name'),
  }
}

export function mapSettingsResponse(value: unknown): PlannerSettings & { timeZone: string } {
  const settings = requireRecord(value, 'settings') as unknown as SettingsResponseBody
  const manualThemeId = settings.manual_theme_id
  if (manualThemeId !== null && typeof manualThemeId !== 'string') {
    throw mappingError('settings.manual_theme_id must be a string or null')
  }
  return {
    manualThemeId,
    sidebarCollapsed: requireBoolean(settings.sidebar_collapsed, 'settings.sidebar_collapsed'),
    timeZone: requireMappedTimeZone(settings.time_zone, 'settings.time_zone'),
  }
}

export function mapActivityResponse(value: unknown): ActivityHistory {
  const activity = requireRecord(value, 'activity') as unknown as ActivityResponseBody
  return {
    activityDates: requireArray(activity.activity_dates, 'activity.activity_dates').map(
      (dateValue) => requireDateKey(dateValue, 'activity.activity_dates[]'),
    ),
    completionEvents: requireArray(
      activity.completion_events,
      'activity.completion_events',
    ).map(mapCompletionEventResponse),
  }
}

export function mapReviewResponse(value: unknown): ReviewConfirmation {
  const review = requireRecord(value, 'review') as unknown as ReviewResponseBody
  return { activityDate: requireDateKey(review.activity_date, 'review.activity_date') }
}

function mapCompletionEventResponse(value: unknown): CompletionEvent {
  const event = requireRecord(value, 'completion event') as unknown as CompletionEventResponseBody
  return {
    id: requireString(event.id, 'completion_event.id'),
    taskId: event.task_id === null
      ? null
      : requireString(event.task_id, 'completion_event.task_id'),
    completedAt: requireTimestamp(event.completed_at, 'completion_event.completed_at'),
  }
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw mappingError(`${fieldName} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) throw mappingError(`${fieldName} must be an array`)
  return value
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw mappingError(`${fieldName} must be a non-empty string`)
  }
  return value
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') throw mappingError(`${fieldName} must be a boolean`)
  return value
}

function requirePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw mappingError(`${fieldName} must be a positive number`)
  }
  return value
}

function requireNonNegativeNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw mappingError(`${fieldName} must be a non-negative number`)
  }
  return value
}

function requireVersion(value: unknown, fieldName = 'version'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw mappingError(`${fieldName} must be a positive integer`)
  }
  return value
}

function requireCompletionState(value: unknown): CompletionState {
  if (value === 'pending' || value === 'partial' || value === 'completed' || value === 'incomplete') {
    return value
  }
  throw mappingError('task.completion_state is invalid')
}

function requireDateKey(value: unknown, fieldName: string): string {
  const dateKey = requireString(value, fieldName)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) {
    throw mappingError(`${fieldName} must be an ISO calendar date`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsedDate = new Date(Date.UTC(year, month - 1, day))
  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw mappingError(`${fieldName} must be an ISO calendar date`)
  }
  return dateKey
}

function requireTime(value: unknown, fieldName: string): string {
  const time = requireString(value, fieldName)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw mappingError(`${fieldName} must use HH:MM format`)
  }
  return time
}

function requireTimestamp(value: unknown, fieldName: string): string {
  const timestamp = requireString(value, fieldName)
  if (Number.isNaN(Date.parse(timestamp))) throw mappingError(`${fieldName} must be a timestamp`)
  return timestamp
}

function requireNullableTimestamp(value: unknown, fieldName: string): string | null {
  return value === null ? null : requireTimestamp(value, fieldName)
}

function requireMappedTimeZone(value: unknown, fieldName: string): string {
  try {
    return requireIanaTimeZone(value, fieldName)
  } catch {
    throw mappingError(`${fieldName} must be a valid IANA time zone`)
  }
}

function assignDefined(
  target: Record<string, unknown>,
  fieldName: string,
  value: unknown,
): void {
  if (value !== undefined) target[fieldName] = value
}

function hasTaskUpdate(input: TaskUpdateInput): boolean {
  return input.categoryId !== undefined ||
    input.title !== undefined ||
    input.date !== undefined ||
    input.startTime !== undefined ||
    input.scheduleTimeZone !== undefined ||
    input.plannedMinutes !== undefined ||
    input.reminderEnabled !== undefined ||
    input.reminderMinutesBefore !== undefined ||
    input.important !== undefined
}

function mappingError(message: string): PlannerApiMappingError {
  return new PlannerApiMappingError(`Invalid planner API response: ${message}.`)
}
