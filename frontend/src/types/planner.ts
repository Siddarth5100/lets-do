export type CompletionState = 'pending' | 'partial' | 'completed' | 'incomplete'

export type PlannerEntityId = string

export interface ReminderSettings {
  enabled: boolean
  minutesBefore: number
}

export interface Task {
  id: PlannerEntityId
  /** Present for tasks loaded from the API. Legacy local tasks do not have this yet. */
  categoryId?: PlannerEntityId
  title: string
  category: string
  date: string
  startTime: string
  /** Present for tasks loaded from the API. Legacy local tasks use browser-local time. */
  scheduleTimeZone?: string
  plannedMinutes: number
  reminder: ReminderSettings
  actualCompletedMinutes: number
  completionState: CompletionState
  important: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
  /** Present for API-backed tasks and required for optimistic concurrency mutations. */
  version?: number
}

export interface TaskDraft {
  title: string
  category: string
  date: string
  startTime: string
  plannedMinutes: number
  reminder: ReminderSettings
  actualCompletedMinutes: number
  important: boolean
}

export interface PlannerSettings {
  manualThemeId: string | null
  sidebarCollapsed: boolean
  /** Present for settings loaded from the API. */
  timeZone?: string
}

export interface TaskCategory {
  id: PlannerEntityId
  name: string
}

export interface CompletionEvent {
  id: string
  taskId: string | null
  completedAt: string
}

export interface PlannerState {
  version: 2
  tasks: Task[]
  activityDates: string[]
  completionEvents: CompletionEvent[]
  customCategories: string[]
  settings: PlannerSettings
}

export type ViewName = 'today' | 'calendar' | 'review' | 'settings'
