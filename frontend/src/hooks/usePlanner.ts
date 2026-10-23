import { useRef, useState } from 'react'
import type { PlannerSettings, PlannerState, Task, TaskDraft } from '../types/planner'
import {
  markTaskIncompleteInPlannerState,
  recordPlannerActivity,
  reopenTaskInPlannerState,
  updateTaskInPlannerState,
} from '../utils/plannerTransitions'
import { getCompletionState, getPartialCompletedMinutes, removeTaskCompletionEvents, shouldRecordCompletion } from '../utils/taskMetrics'
import { defaultPlannerState, loadPlannerState, savePlannerState } from '../utils/storage'

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function usePlanner() {
  const [state, setState] = useState<PlannerState>(() => {
    if (typeof window === 'undefined') return defaultPlannerState
    return loadPlannerState(window.localStorage)
  })
  const stateRef = useRef(state)
  const [storageError, setStorageError] = useState(false)

  const commitState = (updateState: (currentState: PlannerState) => PlannerState) => {
    const nextState = updateState(stateRef.current)
    stateRef.current = nextState
    setState(nextState)
    setStorageError(!savePlannerState(window.localStorage, nextState))
  }

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
    commitState((current) => {
      const withActivity = recordPlannerActivity(current, now)
      return {
        ...withActivity,
        tasks: [...withActivity.tasks, task],
        completionEvents: stateValue === 'completed' && shouldRecordCompletion(task.date, now)
          ? [...withActivity.completionEvents, { id: createId(), taskId: task.id, completedAt: timestamp }]
          : withActivity.completionEvents,
      }
    })
    return task
  }

  const updateTask = (id: string, draft: TaskDraft, now = new Date()) => {
    commitState((current) => updateTaskInPlannerState(current, id, draft, now, createId()))
  }

  const completeTask = (id: string, now = new Date()) => {
    commitState((current) => {
      const task = current.tasks.find((item) => item.id === id)
      if (!task) return current
      return updateTaskInPlannerState(
        current,
        id,
        { ...task, actualCompletedMinutes: task.plannedMinutes },
        now,
        createId(),
      )
    })
  }

  const toggleTaskPartial = (id: string, now = new Date()) => {
    commitState((current) => {
      const task = current.tasks.find((item) => item.id === id)
      if (!task) return current
      const actualCompletedMinutes = task.completionState === 'partial'
        ? 0
        : getPartialCompletedMinutes(task.plannedMinutes)
      return updateTaskInPlannerState(
        current,
        id,
        { ...task, actualCompletedMinutes },
        now,
        createId(),
      )
    })
  }

  const markTaskIncomplete = (id: string, now = new Date()) => {
    commitState((current) => markTaskIncompleteInPlannerState(current, id, now))
  }

  const reopenTask = (id: string, now = new Date()) => {
    commitState((current) => reopenTaskInPlannerState(current, id, now))
  }

  const toggleImportant = (id: string, now = new Date()) => {
    commitState((current) => {
      const task = current.tasks.find((item) => item.id === id)
      if (!task) return current
      return updateTaskInPlannerState(current, id, { ...task, important: !task.important }, now, createId())
    })
  }

  const deleteTask = (id: string) => {
    commitState((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
      completionEvents: removeTaskCompletionEvents(current.completionEvents, id),
    }))
  }

  const reviewPlan = (now = new Date()) => {
    commitState((current) => recordPlannerActivity(current, now))
  }

  const updateSettings = (settings: PlannerSettings) => {
    commitState((current) => ({ ...current, settings }))
  }

  const addCustomCategory = (category: string) => {
    const normalizedCategory = category.trim()
    if (!normalizedCategory) return
    commitState((current) => ({
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
