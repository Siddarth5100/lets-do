import type { CompletionEvent, PlannerState, Task } from '../types/planner'
import { getCompletionState } from './taskMetrics'

export const STORAGE_KEY = 'lets-do.planner.v1'

export const defaultPlannerState: PlannerState = {
  version: 2,
  tasks: [],
  activityDates: [],
  completionEvents: [],
  customCategories: [],
  settings: {
    availableHours: 8,
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
    availableHours: typeof settings.availableHours === 'number' && settings.availableHours > 0 ? settings.availableHours : 8,
    manualThemeId: typeof settings.manualThemeId === 'string' ? settings.manualThemeId : null,
    sidebarCollapsed: typeof settings.sidebarCollapsed === 'boolean' ? settings.sidebarCollapsed : false,
  }
}

function normalizeTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({
    ...task,
    actualCompletedMinutes: Math.max(0, task.actualCompletedMinutes),
    completionState: getCompletionState(task.actualCompletedMinutes, task.plannedMinutes),
  }))
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
