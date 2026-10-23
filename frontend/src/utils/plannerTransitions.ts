import type { PlannerState, TaskDraft } from '../types/planner'
import { toLocalDateKey } from './dates'
import { getCompletionState, removeTaskCompletionEvents, shouldRecordCompletion } from './taskMetrics'

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function recordPlannerActivity(state: PlannerState, now: Date): PlannerState {
  return {
    ...state,
    activityDates: unique([...state.activityDates, toLocalDateKey(now)]),
  }
}

export function updateTaskInPlannerState(
  state: PlannerState,
  taskId: string,
  draft: TaskDraft,
  now: Date,
  completionEventId: string,
): PlannerState {
  const previousTask = state.tasks.find((task) => task.id === taskId)
  const nextCompletionState = previousTask?.completionState === 'incomplete' && draft.actualCompletedMinutes === 0
    ? 'incomplete'
    : getCompletionState(draft.actualCompletedMinutes, draft.plannedMinutes)
  const newlyCompleted = Boolean(previousTask) && previousTask?.completionState !== 'completed' && nextCompletionState === 'completed'
  const reopened = previousTask?.completionState === 'completed' && nextCompletionState !== 'completed'
  const timestamp = now.toISOString()
  const newCompletionTimestamp = newlyCompleted && shouldRecordCompletion(draft.date, now) ? timestamp : null
  const tasks = state.tasks.map((task) => {
    if (task.id !== taskId) return task
    return {
      ...task,
      ...draft,
      actualCompletedMinutes: Math.max(0, draft.actualCompletedMinutes),
      completionState: nextCompletionState,
      updatedAt: timestamp,
      completedAt: newlyCompleted ? timestamp : nextCompletionState === 'completed' ? task.completedAt : null,
    }
  })
  const stateWithActivity = recordPlannerActivity(state, now)

  return {
    ...stateWithActivity,
    tasks,
    completionEvents: newCompletionTimestamp
      ? [...stateWithActivity.completionEvents, { id: completionEventId, taskId, completedAt: newCompletionTimestamp }]
      : reopened
        ? removeTaskCompletionEvents(stateWithActivity.completionEvents, taskId)
        : stateWithActivity.completionEvents,
  }
}

export function markTaskIncompleteInPlannerState(
  state: PlannerState,
  taskId: string,
  now: Date,
): PlannerState {
  if (!state.tasks.some((task) => task.id === taskId)) return state
  const timestamp = now.toISOString()
  const stateWithActivity = recordPlannerActivity(state, now)

  return {
    ...stateWithActivity,
    tasks: stateWithActivity.tasks.map((task) => task.id === taskId ? {
      ...task,
      actualCompletedMinutes: 0,
      completionState: 'incomplete',
      completedAt: null,
      updatedAt: timestamp,
    } : task),
    completionEvents: removeTaskCompletionEvents(stateWithActivity.completionEvents, taskId),
  }
}

export function reopenTaskInPlannerState(
  state: PlannerState,
  taskId: string,
  now: Date,
): PlannerState {
  if (!state.tasks.some((task) => task.id === taskId)) return state
  const timestamp = now.toISOString()
  const stateWithActivity = recordPlannerActivity(state, now)

  return {
    ...stateWithActivity,
    tasks: stateWithActivity.tasks.map((task) => task.id === taskId ? {
      ...task,
      actualCompletedMinutes: 0,
      completionState: 'pending',
      completedAt: null,
      updatedAt: timestamp,
    } : task),
    completionEvents: removeTaskCompletionEvents(stateWithActivity.completionEvents, taskId),
  }
}
