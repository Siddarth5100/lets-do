import type { CompletionEvent, PlannerState, Task, ViewName } from '../types/planner'
import { fromLocalDateKey } from './dates'
import { getCompletionState } from './taskMetrics'

export const STORAGE_KEY = 'lets-do.planner.v1'
export const NAVIGATION_STORAGE_KEY = 'lets-do.navigation.v1'

export interface NavigationState {
  activeView: ViewName
  selectedDate: string
}

export const defaultPlannerState: PlannerState = {
  version: 2,
  tasks: [],
  activityDates: [],
  completionEvents: [],
  customCategories: [],
  settings: {
    manualThemeId: null,
    sidebarCollapsed: false,
  },
}

function isCompletionEvent(value: unknown): value is CompletionEvent {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    (typeof value.taskId === 'string' || value.taskId === null) &&
    typeof value.completedAt === 'string'
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeSettings(value: unknown): PlannerState['settings'] {
  const settings = isRecord(value) ? value : {}
  return {
    manualThemeId: typeof settings.manualThemeId === 'string' ? settings.manualThemeId : null,
    sidebarCollapsed: typeof settings.sidebarCollapsed === 'boolean' ? settings.sidebarCollapsed : false,
  }
}

function normalizeTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => {
    const actualCompletedMinutes = Math.max(0, task.actualCompletedMinutes)
    const completionState = task.completionState === 'incomplete' && actualCompletedMinutes === 0
      ? 'incomplete'
      : getCompletionState(actualCompletedMinutes, task.plannedMinutes)
    return { ...task, actualCompletedMinutes, completionState }
  })
}

function migrateCompletionEvents(tasks: Task[], timestamps: string[]): CompletionEvent[] {
  return timestamps.map((completedAt, index) => {
    const matchingTask = tasks.find((task) => task.completedAt === completedAt)
    return {
      id: `migrated-${index}-${completedAt}`,
      taskId: matchingTask?.id ?? null,
      completedAt,
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTask(value: unknown): value is Task {
  if (!isRecord(value) || !isRecord(value.reminder)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.category === 'string' &&
    typeof value.date === 'string' &&
    typeof value.startTime === 'string' &&
    typeof value.plannedMinutes === 'number' && value.plannedMinutes > 0 &&
    typeof value.actualCompletedMinutes === 'number' &&
    typeof value.important === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (typeof value.completedAt === 'string' || value.completedAt === null) &&
    typeof value.reminder.enabled === 'boolean' &&
    typeof value.reminder.minutesBefore === 'number'
  )
}

export function parsePlannerState(serializedState: string | null): PlannerState {
  if (!serializedState) return defaultPlannerState
  try {
    const parsed: unknown = JSON.parse(serializedState)
    if (!isRecord(parsed) || !Array.isArray(parsed.tasks)) return defaultPlannerState
    if (!parsed.tasks.every(isTask)) return defaultPlannerState
    const tasks = normalizeTasks(parsed.tasks)
    if (parsed.version === 1) {
      // Version 1 stored bare timestamps; associate them with tasks when the timestamp still matches.
      return {
        version: 2,
        tasks,
        activityDates: stringArray(parsed.activityDates),
        completionEvents: migrateCompletionEvents(tasks, stringArray(parsed.completionTimestamps)),
        customCategories: [],
        settings: normalizeSettings(parsed.settings),
      }
    }
    if (parsed.version !== 2 || !Array.isArray(parsed.completionEvents) || !parsed.completionEvents.every(isCompletionEvent)) {
      return defaultPlannerState
    }
    return {
      version: 2,
      tasks,
      activityDates: stringArray(parsed.activityDates),
      completionEvents: parsed.completionEvents,
      customCategories: stringArray(parsed.customCategories),
      settings: normalizeSettings(parsed.settings),
    }
  } catch {
    return defaultPlannerState
  }
}

export function loadPlannerState(storage: Pick<Storage, 'getItem'>): PlannerState {
  try {
    return parsePlannerState(storage.getItem(STORAGE_KEY))
  } catch {
    return defaultPlannerState
  }
}

export function savePlannerState(storage: Pick<Storage, 'setItem'>, state: PlannerState): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function parseNavigationState(serializedState: string | null, currentDateKey: string): NavigationState {
  const defaultNavigationState: NavigationState = { activeView: 'today', selectedDate: currentDateKey }
  if (!serializedState) return defaultNavigationState

  try {
    const parsed: unknown = JSON.parse(serializedState)
    if (!isRecord(parsed)) return defaultNavigationState
    return {
      activeView: isViewName(parsed.activeView) ? parsed.activeView : 'today',
      selectedDate: typeof parsed.selectedDate === 'string' && fromLocalDateKey(parsed.selectedDate)
        ? parsed.selectedDate
        : currentDateKey,
    }
  } catch {
    return defaultNavigationState
  }
}

export function loadNavigationState(storage: Pick<Storage, 'getItem'>, currentDateKey: string): NavigationState {
  try {
    return parseNavigationState(storage.getItem(NAVIGATION_STORAGE_KEY), currentDateKey)
  } catch {
    return { activeView: 'today', selectedDate: currentDateKey }
  }
}

export function saveNavigationState(storage: Pick<Storage, 'setItem'>, state: NavigationState): boolean {
  try {
    storage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function isViewName(value: unknown): value is ViewName {
  return value === 'today' || value === 'calendar' || value === 'review' || value === 'settings'
}
