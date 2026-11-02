import type { CompletionEvent, CompletionState, Task } from '../types/planner'
import { addDateKeyDays, fromLocalDateKey, localDateFromTimestamp } from './dates'
import { getV1DateKey } from './timeZones'

export function validatePlannedMinutes(plannedMinutes: number): void {
  if (!Number.isFinite(plannedMinutes) || plannedMinutes <= 0) {
    throw new Error('Planned minutes must be greater than zero.')
  }
}

export function getMaxPoints(plannedMinutes: number): number {
  validatePlannedMinutes(plannedMinutes)
  // Every task is worth at least one point; longer tasks scale by planned hours.
  return Math.max(1, plannedMinutes / 60)
}

export function capCompletedMinutes(actualMinutes: number, plannedMinutes: number): number {
  validatePlannedMinutes(plannedMinutes)
  if (!Number.isFinite(actualMinutes)) return 0
  return Math.min(plannedMinutes, Math.max(0, actualMinutes))
}

export function getCompletionState(actualMinutes: number, plannedMinutes: number): CompletionState {
  const completedMinutes = capCompletedMinutes(actualMinutes, plannedMinutes)
  if (completedMinutes === 0) return 'pending'
  if (completedMinutes < plannedMinutes) return 'partial'
  return 'completed'
}

export function getEarnedPoints(actualMinutes: number, plannedMinutes: number): number {
  const completedMinutes = capCompletedMinutes(actualMinutes, plannedMinutes)
  // Points follow the completed share of planned work and never exceed the task maximum.
  return getMaxPoints(plannedMinutes) * (completedMinutes / plannedMinutes)
}

export function getPartialCompletedMinutes(plannedMinutes: number): number {
  validatePlannedMinutes(plannedMinutes)
  return plannedMinutes / 2
}

export function getTaskProgress(actualMinutes: number, plannedMinutes: number): number {
  const maximumPoints = getMaxPoints(plannedMinutes)
  return getEarnedPoints(actualMinutes, plannedMinutes) / maximumPoints
}

export function getTaskTotals(tasks: Task[]) {
  return tasks.reduce(
    (totals, task) => ({
      maxPoints: totals.maxPoints + getMaxPoints(task.plannedMinutes),
      earnedPoints: totals.earnedPoints + getEarnedPoints(task.actualCompletedMinutes, task.plannedMinutes),
      plannedMinutes: totals.plannedMinutes + task.plannedMinutes,
      completedMinutes: totals.completedMinutes + capCompletedMinutes(task.actualCompletedMinutes, task.plannedMinutes),
    }),
    { maxPoints: 0, earnedPoints: 0, plannedMinutes: 0, completedMinutes: 0 },
  )
}

export function getCurrentStreak(qualifyingDates: string[], today = new Date()): number {
  const todayKey = getV1DateKey(today)
  const validDates = new Set(
    qualifyingDates.filter((dateKey) => fromLocalDateKey(dateKey) && dateKey <= todayKey),
  )
  let cursor = validDates.has(todayKey) ? todayKey : addDateKeyDays(todayKey, -1)
  let streak = 0

  while (cursor && validDates.has(cursor)) {
    streak += 1
    cursor = addDateKeyDays(cursor, -1)
  }

  return streak
}

export function completionDatesFromEvents(events: CompletionEvent[]): string[] {
  return events.flatMap((event) => {
    const dateKey = localDateFromTimestamp(event.completedAt)
    return dateKey ? [dateKey] : []
  })
}

export function shouldRecordCompletion(taskDate: string, completedAt: Date): boolean {
  return Boolean(fromLocalDateKey(taskDate)) && taskDate <= getV1DateKey(completedAt)
}

export function removeTaskCompletionEvents(events: CompletionEvent[], taskId: string): CompletionEvent[] {
  return events.filter((event) => event.taskId !== taskId)
}
