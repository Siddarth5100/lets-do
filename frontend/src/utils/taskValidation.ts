import type { Task, TaskDraft } from '../types/planner'
import { addLocalDays, fromLocalDateKey, toLocalDateKey } from './dates'
import { deriveEndTime, MINUTES_PER_DAY, parseTimeToMinutes } from './taskTime'

export interface DailyTimeRange {
  startMinutes: number
  endMinutes: number
}

export interface DailyAllocatedTask extends DailyTimeRange {
  task: Task
}

export interface DailyTaskSchedule {
  allocatedTasks: DailyAllocatedTask[]
  availableRanges: DailyTimeRange[]
}

export interface DailyScheduleTotals {
  allocatedMinutes: number
  availableMinutes: number
}

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

export function findOverlappingTasks(draft: TaskDraft, tasks: Task[], excludedTaskId?: string): Task[] {
  const draftInterval = getTaskInterval(draft.date, draft.startTime, draft.plannedMinutes)
  if (!draftInterval) return []

  return tasks
    .filter((task) => {
      if (task.id === excludedTaskId) return false
      const taskInterval = getTaskInterval(task.date, task.startTime, task.plannedMinutes)
      return taskInterval !== null && draftInterval.startMinutes < taskInterval.endMinutes && taskInterval.startMinutes < draftInterval.endMinutes
    })
    .sort(compareTasksChronologically)
}

export function getDailyTaskSchedule(dateKey: string, tasks: Task[], excludedTaskId?: string): DailyTaskSchedule {
  const dayStart = getCalendarDayStartMinutes(dateKey)
  if (dayStart === null) return { allocatedTasks: [], availableRanges: [] }
  const dayEnd = dayStart + MINUTES_PER_DAY
  const allocatedTasks = tasks
    .filter((task) => task.id !== excludedTaskId)
    .map((task): DailyAllocatedTask | null => {
      const taskInterval = getTaskInterval(task.date, task.startTime, task.plannedMinutes)
      if (!taskInterval || taskInterval.startMinutes >= dayEnd || taskInterval.endMinutes <= dayStart) return null
      return {
        task,
        startMinutes: Math.max(taskInterval.startMinutes, dayStart) - dayStart,
        endMinutes: Math.min(taskInterval.endMinutes, dayEnd) - dayStart,
      }
    })
    .filter((allocatedTask): allocatedTask is DailyAllocatedTask => allocatedTask !== null)
    .sort((firstTask, secondTask) =>
      firstTask.startMinutes - secondTask.startMinutes ||
      compareTasksChronologically(firstTask.task, secondTask.task),
    )

  // Merge overlaps before calculating availability so allocated minutes are never double-counted.
  const mergedAllocatedRanges = mergeTimeRanges(allocatedTasks)
  const availableRanges: DailyTimeRange[] = []
  let availableStart = 0
  for (const allocatedRange of mergedAllocatedRanges) {
    if (allocatedRange.startMinutes > availableStart) {
      availableRanges.push({ startMinutes: availableStart, endMinutes: allocatedRange.startMinutes })
    }
    availableStart = allocatedRange.endMinutes
  }
  if (availableStart < MINUTES_PER_DAY) {
    availableRanges.push({ startMinutes: availableStart, endMinutes: MINUTES_PER_DAY })
  }

  return { allocatedTasks, availableRanges }
}

export function formatDailyTimeRange(range: DailyTimeRange): string {
  return `${formatDayMinute(range.startMinutes)}–${formatDayMinute(range.endMinutes)}`
}

export function getDailyScheduleTotals(schedule: DailyTaskSchedule): DailyScheduleTotals {
  const availableMinutes = schedule.availableRanges.reduce(
    (totalMinutes, range) => totalMinutes + range.endMinutes - range.startMinutes,
    0,
  )
  return {
    allocatedMinutes: MINUTES_PER_DAY - availableMinutes,
    availableMinutes,
  }
}

export function formatTaskTiming(task: Pick<Task, 'date' | 'startTime' | 'plannedMinutes'>): string {
  const derivedEndTime = deriveEndTime(task.startTime, task.plannedMinutes)
  if (!derivedEndTime) return `${task.date} ${task.startTime}`
  if (derivedEndTime.dayOffset === 0) return `${task.startTime}–${derivedEndTime.endTime}`

  const startDate = fromLocalDateKey(task.date)
  const endDate = startDate ? toLocalDateKey(addLocalDays(startDate, derivedEndTime.dayOffset)) : task.date
  return `${task.date} ${task.startTime}–${endDate} ${derivedEndTime.endTime}`
}

function getTaskInterval(dateKey: string, startTime: string, plannedMinutes: number): DailyTimeRange | null {
  const dayStart = getCalendarDayStartMinutes(dateKey)
  const startMinutes = parseTimeToMinutes(startTime)
  if (dayStart === null || startMinutes === null || !Number.isFinite(plannedMinutes) || plannedMinutes <= 0) return null
  const start = dayStart + startMinutes
  return { startMinutes: start, endMinutes: start + plannedMinutes }
}

function getCalendarDayStartMinutes(dateKey: string): number | null {
  const date = fromLocalDateKey(dateKey)
  // UTC ordinal minutes keep each local calendar day exactly 1,440 minutes, including DST dates.
  return date ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 60_000 : null
}

function mergeTimeRanges(ranges: DailyTimeRange[]): DailyTimeRange[] {
  const mergedRanges: DailyTimeRange[] = []
  for (const range of ranges) {
    const previousRange = mergedRanges.at(-1)
    if (!previousRange || range.startMinutes > previousRange.endMinutes) {
      mergedRanges.push({ startMinutes: range.startMinutes, endMinutes: range.endMinutes })
    } else {
      previousRange.endMinutes = Math.max(previousRange.endMinutes, range.endMinutes)
    }
  }
  return mergedRanges
}

function compareTasksChronologically(firstTask: Pick<Task, 'date' | 'startTime' | 'title'>, secondTask: Pick<Task, 'date' | 'startTime' | 'title'>): number {
  const firstDateTime = `${firstTask.date}T${firstTask.startTime}`
  const secondDateTime = `${secondTask.date}T${secondTask.startTime}`
  return firstDateTime.localeCompare(secondDateTime) || firstTask.title.localeCompare(secondTask.title)
}

export function formatDayMinute(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) return '24:00'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`
}
