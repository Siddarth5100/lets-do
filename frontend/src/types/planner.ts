export type CompletionState = 'pending' | 'partial' | 'completed' | 'incomplete'

export interface ReminderSettings {
  enabled: boolean
  minutesBefore: number
}

export interface Task {
  id: string
  title: string
  category: string
  date: string
  startTime: string
  plannedMinutes: number
  reminder: ReminderSettings
  actualCompletedMinutes: number
  completionState: CompletionState
  important: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
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
