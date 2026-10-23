import { useEffect, useState } from 'react'
import type { CompletionEvent, PlannerSettings, PlannerState, Task, TaskDraft } from '../types/planner'
import { toLocalDateKey } from '../utils/dates'
import { getCompletionState, getPartialCompletedMinutes, removeTaskCompletionEvents, shouldRecordCompletion } from '../utils/taskMetrics'
import { defaultPlannerState, loadPlannerState, savePlannerState } from '../utils/storage'

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createCompletionEvent(taskId: string, completedAt: string): CompletionEvent {
  return { id: createId(), taskId, completedAt }
}

export function usePlanner() {
  const [state, setState] = useState<PlannerState>(() => {
    if (typeof window === 'undefined') return defaultPlannerState
    return loadPlannerState(window.localStorage)
  })
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    setStorageError(!savePlannerState(window.localStorage, state))
  }, [state])

  const recordActivity = (current: PlannerState, now: Date): PlannerState => ({
    ...current,
    activityDates: unique([...current.activityDates, toLocalDateKey(now)]),
  })

  const addTask = (draft: TaskDraft, now = new Date()): Task => {
    const timestamp = now.toISOString()
    const stateValue = getCompletionState(draft.actualCompletedMinutes, draft.plannedMinutes)
    const task: Task = {
      ...draft,
      id: createId(),
      actualCompletedMinutes: Math.max(0, draft.actualCompletedMinutes),
      completionState: stateValue,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: stateValue === 'completed' ? timestamp : null,
    }
    setState((current) => {
      const withActivity = recordActivity(current, now)
      return {
        ...withActivity,
        tasks: [...withActivity.tasks, task],
        completionEvents: stateValue === 'completed' && shouldRecordCompletion(task.date, now)
          ? [...withActivity.completionEvents, createCompletionEvent(task.id, timestamp)]
          : withActivity.completionEvents,
      }
    })
    return task
  }

  const updateTask = (id: string, draft: TaskDraft, now = new Date()) => {
    const timestamp = now.toISOString()
    setState((current) => {
      const previousTask = current.tasks.find((task) => task.id === id)
      const nextCompletionState = previousTask?.completionState === 'incomplete' && draft.actualCompletedMinutes === 0
        ? 'incomplete'
        : getCompletionState(draft.actualCompletedMinutes, draft.plannedMinutes)
      const newlyCompleted = Boolean(previousTask) && previousTask?.completionState !== 'completed' && nextCompletionState === 'completed'
      const reopened = previousTask?.completionState === 'completed' && nextCompletionState !== 'completed'
      const newCompletionTimestamp = newlyCompleted && shouldRecordCompletion(draft.date, now) ? timestamp : null
      const tasks = current.tasks.map((task) => {
        if (task.id !== id) return task
        return {
          ...task,
          ...draft,
          actualCompletedMinutes: Math.max(0, draft.actualCompletedMinutes),
          completionState: nextCompletionState,
          updatedAt: timestamp,
          completedAt: newlyCompleted ? timestamp : nextCompletionState === 'completed' ? task.completedAt : null,
        }
      })
      const withActivity = recordActivity(current, now)
      return {
        ...withActivity,
        tasks,
        completionEvents: newCompletionTimestamp
          ? [...withActivity.completionEvents, createCompletionEvent(id, newCompletionTimestamp)]
          : reopened
            ? removeTaskCompletionEvents(withActivity.completionEvents, id)
            : withActivity.completionEvents,
      }
    })
  }

  const setTaskProgress = (id: string, actualCompletedMinutes: number, now = new Date()) => {
    const task = state.tasks.find((item) => item.id === id)
    if (!task) return
    updateTask(id, { ...task, actualCompletedMinutes }, now)
  }

  const completeTask = (id: string, now = new Date()) => {
    const task = state.tasks.find((item) => item.id === id)
    if (!task) return
    updateTask(id, { ...task, actualCompletedMinutes: task.plannedMinutes }, now)
  }

  const toggleTaskPartial = (id: string, now = new Date()) => {
    const task = state.tasks.find((item) => item.id === id)
    if (!task) return
    const actualCompletedMinutes = task.completionState === 'partial'
      ? 0
      : getPartialCompletedMinutes(task.plannedMinutes)
    updateTask(id, { ...task, actualCompletedMinutes }, now)
  }

  const markTaskIncomplete = (id: string, now = new Date()) => {
    const timestamp = now.toISOString()
    setState((current) => {
      const taskExists = current.tasks.some((task) => task.id === id)
      if (!taskExists) return current
      const withActivity = recordActivity(current, now)
      return {
        ...withActivity,
        tasks: withActivity.tasks.map((task) => task.id === id ? {
          ...task,
          actualCompletedMinutes: 0,
          completionState: 'incomplete',
          completedAt: null,
          updatedAt: timestamp,
        } : task),
        completionEvents: removeTaskCompletionEvents(withActivity.completionEvents, id),
      }
    })
  }

  const reopenTask = (id: string, now = new Date()) => {
    const timestamp = now.toISOString()
    setState((current) => {
      const taskExists = current.tasks.some((task) => task.id === id)
      if (!taskExists) return current
      const withActivity = recordActivity(current, now)
      return {
        ...withActivity,
        tasks: withActivity.tasks.map((task) => task.id === id ? {
          ...task,
          actualCompletedMinutes: 0,
          completionState: 'pending',
          completedAt: null,
          updatedAt: timestamp,
        } : task),
        completionEvents: removeTaskCompletionEvents(withActivity.completionEvents, id),
      }
    })
  }

  const toggleImportant = (id: string, now = new Date()) => {
    const task = state.tasks.find((item) => item.id === id)
    if (!task) return
    updateTask(id, { ...task, important: !task.important }, now)
  }

  const deleteTask = (id: string) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
      completionEvents: removeTaskCompletionEvents(current.completionEvents, id),
    }))
  }

  const reviewPlan = (now = new Date()) => {
    setState((current) => recordActivity(current, now))
  }

  const updateSettings = (settings: PlannerSettings) => {
    setState((current) => ({ ...current, settings }))
  }

  const addCustomCategory = (category: string) => {
    const normalizedCategory = category.trim()
    if (!normalizedCategory) return
    setState((current) => ({
      ...current,
      customCategories: current.customCategories.some((existingCategory) => existingCategory.toLocaleLowerCase() === normalizedCategory.toLocaleLowerCase())
        ? current.customCategories
        : [...current.customCategories, normalizedCategory],
    }))
  }

  return {
    state,
    storageError,
    addTask,
    updateTask,
    setTaskProgress,
    completeTask,
    toggleTaskPartial,
    markTaskIncomplete,
    reopenTask,
    toggleImportant,
    deleteTask,
    reviewPlan,
    updateSettings,
    addCustomCategory,
  }
}
