import type {
  CompletionEvent,
  CompletionState,
  PlannerSettings,
  Task,
  TaskCategory,
  TaskDraft,
} from '../types/planner'
import { requireIanaTimeZone, requireV1TimeZone } from '../utils/timeZones'
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

export interface TaskWarningReference {
  id: string
  title: string
}

export interface TaskSchedulingWarnings {
  duplicateTasks: TaskWarningReference[]
  overlappingTasks: TaskWarningReference[]
}

export interface ImportEntitySummary {
  valid: number
  invalid: number
  created: number
  existing: number
}

export interface BrowserDataImportIssue {
  entity: string
  sourceId: string | null
  reason: string
}

export interface BrowserDataImportResult {
  sourceVersion: number | null
  previewDigest: string
  tasks: ImportEntitySummary
  categories: ImportEntitySummary
  activityDates: ImportEntitySummary
  completionEvents: ImportEntitySummary
  settingsStatus: string
  issues: BrowserDataImportIssue[]
  warnings: string[]
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

interface BrowserDataImportResponseBody {
  source_version: unknown
  preview_digest: unknown
  tasks: unknown
  categories: unknown
  activity_dates: unknown
  completion_events: unknown
  settings_status: unknown
  issues: unknown
  warnings: unknown
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

  async getTasks(signal?: AbortSignal): Promise<Task[]> {
    const response = await this.client.request<unknown>('/v1/tasks', { signal })
    return requireArray(response, 'tasks').map(mapTaskResponse)
  }

  async getTask(taskId: string): Promise<Task> {
    return mapTaskResponse(await this.client.request<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}`))
  }

  async createTask(input: TaskCreateInput, signal?: AbortSignal): Promise<Task> {
    const timeZone = requireV1TimeZone(input.scheduleTimeZone, 'scheduleTimeZone')
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
    return mapTaskResponse(await this.requestJson('/v1/tasks', 'POST', body, signal))
  }

  async updateTask(taskId: string, input: TaskUpdateInput, signal?: AbortSignal): Promise<Task> {
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
        : requireV1TimeZone(input.scheduleTimeZone, 'scheduleTimeZone'),
    )
    assignDefined(body, 'planned_minutes', input.plannedMinutes)
    assignDefined(body, 'reminder_enabled', input.reminderEnabled)
    assignDefined(body, 'reminder_minutes_before', input.reminderMinutesBefore)
    assignDefined(body, 'important', input.important)
    return mapTaskResponse(await this.requestJson(
      `/v1/tasks/${encodeURIComponent(taskId)}`,
      'PATCH',
      body,
      signal,
    ))
  }

  async updateTaskCompletion(
    taskId: string,
    input: TaskCompletionInput,
    signal?: AbortSignal,
  ): Promise<Task> {
    return mapTaskResponse(await this.requestJson(
      `/v1/tasks/${encodeURIComponent(taskId)}/completion`,
      'PATCH',
      {
        version: requireVersion(input.version),
        action: input.action,
        confirm_warnings: input.confirmWarnings ?? false,
      },
      signal,
    ))
  }

  async deleteTask(taskId: string, version: number, signal?: AbortSignal): Promise<void> {
    await this.client.request<void>(
      `/v1/tasks/${encodeURIComponent(taskId)}?version=${requireVersion(version)}`,
      { method: 'DELETE', signal },
    )
  }

  async getCategories(signal?: AbortSignal): Promise<TaskCategory[]> {
    const response = await this.client.request<unknown>('/v1/categories', { signal })
    return requireArray(response, 'categories').map(mapCategoryResponse)
  }

  async createCategory(name: string, signal?: AbortSignal): Promise<TaskCategory> {
    return mapCategoryResponse(await this.requestJson('/v1/categories', 'POST', { name }, signal))
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

  async getSettings(signal?: AbortSignal): Promise<PlannerSettings> {
    return mapSettingsResponse(await this.client.request<unknown>('/v1/settings', { signal }))
  }

  async updateSettings(
    settings: Required<PlannerSettings>,
    signal?: AbortSignal,
  ): Promise<PlannerSettings> {
    const body = {
      manual_theme_id: settings.manualThemeId,
      sidebar_collapsed: settings.sidebarCollapsed,
      time_zone: requireV1TimeZone(settings.timeZone, 'timeZone'),
    }
    return mapSettingsResponse(await this.requestJson('/v1/settings', 'PUT', body, signal))
  }

  async getActivity(signal?: AbortSignal): Promise<ActivityHistory> {
    return mapActivityResponse(await this.client.request<unknown>('/v1/activity', { signal }))
  }

  async confirmReview(timeZone: string, signal?: AbortSignal): Promise<ReviewConfirmation> {
    return mapReviewResponse(await this.requestJson('/v1/activity/review', 'POST', {
      time_zone: requireV1TimeZone(timeZone, 'timeZone'),
    }, signal))
  }

  async previewBrowserDataImport(
    serializedState: string,
    includeSettings: boolean,
    signal?: AbortSignal,
  ): Promise<BrowserDataImportResult> {
    return mapBrowserDataImportResponse(await this.requestJson(
      '/v1/imports/local-storage/preview',
      'POST',
      { serialized_state: serializedState, include_settings: includeSettings },
      signal,
    ))
  }

  async commitBrowserDataImport(
    serializedState: string,
    includeSettings: boolean,
    previewDigest: string,
    signal?: AbortSignal,
  ): Promise<BrowserDataImportResult> {
    return mapBrowserDataImportResponse(await this.requestJson(
      '/v1/imports/local-storage',
      'POST',
      {
        serialized_state: serializedState,
        include_settings: includeSettings,
        preview_digest: previewDigest,
      },
      signal,
    ))
  }

  private requestJson(
    path: string,
    method: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.client.request<unknown>(path, {
      method,
      body: JSON.stringify(body),
      signal,
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

export function mapBrowserDataImportResponse(value: unknown): BrowserDataImportResult {
  const response = requireRecord(value, 'browser data import') as unknown as BrowserDataImportResponseBody
  const sourceVersion = response.source_version
  if (sourceVersion !== null && sourceVersion !== 1 && sourceVersion !== 2) {
    throw mappingError('browser data import source_version must be 1, 2, or null')
  }
  return {
    sourceVersion,
    previewDigest: requireString(response.preview_digest, 'browser data import.preview_digest'),
    tasks: mapImportEntitySummary(response.tasks, 'tasks'),
    categories: mapImportEntitySummary(response.categories, 'categories'),
    activityDates: mapImportEntitySummary(response.activity_dates, 'activity_dates'),
    completionEvents: mapImportEntitySummary(response.completion_events, 'completion_events'),
    settingsStatus: requireString(response.settings_status, 'browser data import.settings_status'),
    issues: requireArray(response.issues, 'browser data import.issues').map((value, index) => {
      const issue = requireRecord(value, `browser data import.issues[${index}]`)
      return {
        entity: requireString(issue.entity, `browser data import.issues[${index}].entity`),
        sourceId: issue.source_id === null
          ? null
          : requireString(issue.source_id, `browser data import.issues[${index}].source_id`),
        reason: requireString(issue.reason, `browser data import.issues[${index}].reason`),
      }
    }),
    warnings: requireArray(response.warnings, 'browser data import.warnings').map(
      (warning, index) => requireString(warning, `browser data import.warnings[${index}]`),
    ),
  }
}

function mapImportEntitySummary(value: unknown, fieldName: string): ImportEntitySummary {
  const summary = requireRecord(value, `browser data import.${fieldName}`)
  return {
    valid: requireNonNegativeNumber(summary.valid, `${fieldName}.valid`),
    invalid: requireNonNegativeNumber(summary.invalid, `${fieldName}.invalid`),
    created: requireNonNegativeNumber(summary.created, `${fieldName}.created`),
    existing: requireNonNegativeNumber(summary.existing, `${fieldName}.existing`),
  }
}

export function parseTaskSchedulingWarnings(details: unknown): TaskSchedulingWarnings | null {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return null
  const warningDetails = details as Record<string, unknown>
  const duplicateTasks = parseWarningReferences(warningDetails.duplicate_tasks)
  const overlappingTasks = parseWarningReferences(warningDetails.overlapping_tasks)
  if (duplicateTasks.length === 0 && overlappingTasks.length === 0) return null
  return { duplicateTasks, overlappingTasks }
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

function parseWarningReferences(value: unknown): TaskWarningReference[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((warning): TaskWarningReference[] => {
    if (typeof warning !== 'object' || warning === null || Array.isArray(warning)) return []
    const reference = warning as Record<string, unknown>
    return typeof reference.id === 'string' && typeof reference.title === 'string'
      ? [{ id: reference.id, title: reference.title }]
      : []
  })
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
