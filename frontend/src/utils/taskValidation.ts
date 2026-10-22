import type { Task, TaskDraft } from '../types/planner'
import { fromLocalDateKey } from './dates'
import { getCompletionState } from './taskMetrics'
import { parseTimeToMinutes } from './taskTime'

export function normalizeTaskName(taskName: string): string {
  return taskName.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function findSameDayDuplicateTasks(draft: TaskDraft, tasks: Task[], excludedTaskId?: string): Task[] {
  const normalizedDraftName = normalizeTaskName(draft.title)
  return tasks.filter((task) =>
    task.id !== excludedTaskId &&
    task.date === draft.date &&
    normalizeTaskName(task.title) === normalizedDraftName,
  )
}

export function findOverlappingActiveTasks(draft: TaskDraft, tasks: Task[], excludedTaskId?: string): Task[] {
  if (getCompletionState(draft.actualCompletedMinutes, draft.plannedMinutes) === 'completed') return []
  const draftInterval = getTaskInterval(draft.date, draft.startTime, draft.plannedMinutes)
  if (!draftInterval) return []

  return tasks.filter((task) => {
    if (task.id === excludedTaskId || task.completionState === 'completed') return false
    const taskInterval = getTaskInterval(task.date, task.startTime, task.plannedMinutes)
    return taskInterval !== null && draftInterval.start < taskInterval.end && taskInterval.start < draftInterval.end
  })
}

function getTaskInterval(dateKey: string, startTime: string, plannedMinutes: number): { start: number; end: number } | null {
  const date = fromLocalDateKey(dateKey)
  const startMinutes = parseTimeToMinutes(startTime)
  if (!date || startMinutes === null || plannedMinutes <= 0) return null
  const hours = Math.floor(startMinutes / 60)
  const minutes = startMinutes % 60
  date.setHours(hours, minutes, 0, 0)
  const start = date.getTime()
  return { start, end: start + plannedMinutes * 60_000 }
}
