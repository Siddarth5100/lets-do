import { describe, expect, it } from 'vitest'
import type { Task, TaskDraft } from '../types/planner'
import {
  findOverlappingTasks,
  findSameDayDuplicateTasks,
  formatTaskTiming,
  getDailyScheduleTotals,
  getDailyTaskSchedule,
  normalizeTaskName,
} from './taskValidation'

const baseTask: Task = {
  id: 'existing-task',
  title: 'Morning planning',
  category: 'Work',
  date: '2026-10-21',
  startTime: '09:00',
  plannedMinutes: 60,
  reminder: { enabled: false, minutesBefore: 10 },
  actualCompletedMinutes: 0,
  completionState: 'pending',
  important: false,
  createdAt: '2026-10-21T08:00:00.000Z',
  updatedAt: '2026-10-21T08:00:00.000Z',
  completedAt: null,
}

function createDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: 'Another task',
    category: 'Work',
    date: '2026-10-21',
    startTime: '10:00',
    plannedMinutes: 30,
    reminder: { enabled: false, minutesBefore: 10 },
    actualCompletedMinutes: 0,
    important: false,
    ...overrides,
  }
}

describe('duplicate task names', () => {
  it('normalizes case, surrounding whitespace, and repeated whitespace', () => {
    expect(normalizeTaskName('  MORNING   Planning ')).toBe('morning planning')
  })

  it('finds normalized duplicates only on the same date', () => {
    const duplicate = createDraft({ title: ' morning   PLANNING ' })
    expect(findSameDayDuplicateTasks(duplicate, [baseTask])).toEqual([baseTask])
    expect(findSameDayDuplicateTasks({ ...duplicate, date: '2026-10-22' }, [baseTask])).toEqual([])
  })

  it('excludes the task currently being edited', () => {
    expect(findSameDayDuplicateTasks(createDraft({ title: baseTask.title }), [baseTask], baseTask.id)).toEqual([])
  })
})

describe('task overlap detection', () => {
  it('detects intersecting intervals but allows adjacent tasks', () => {
    expect(findOverlappingTasks(createDraft({ startTime: '09:30' }), [baseTask])).toEqual([baseTask])
    expect(findOverlappingTasks(createDraft({ startTime: '10:00' }), [baseTask])).toEqual([])
  })

  it('detects overlaps that cross midnight', () => {
    const lateTask = {
      ...baseTask,
      startTime: '23:30',
      plannedMinutes: 90,
      scheduleTimeZone: 'UTC',
    }
    const afterMidnight = createDraft({ date: '2026-10-22', startTime: '00:30' })
    expect(findOverlappingTasks(afterMidnight, [lateTask])).toEqual([lateTask])
  })

  it('includes completed tasks and excludes the task currently being edited', () => {
    const overlapping = createDraft({ startTime: '09:15' })
    const completedTask = { ...baseTask, completionState: 'completed' as const }
    expect(findOverlappingTasks(overlapping, [completedTask])).toEqual([completedTask])
    expect(findOverlappingTasks(overlapping, [baseTask], baseTask.id)).toEqual([])
  })
})

describe('daily task schedule', () => {
  it('includes tasks crossing into and out of the selected day in chronological order', () => {
    const previousDayTask = { ...baseTask, id: 'previous', startTime: '23:30', plannedMinutes: 90 }
    const morningTask = { ...baseTask, id: 'morning', date: '2026-10-22', startTime: '00:30', plannedMinutes: 90 }
    const overnightTask = { ...baseTask, id: 'overnight', date: '2026-10-22', startTime: '23:00', plannedMinutes: 120 }

    const schedule = getDailyTaskSchedule('2026-10-22', [overnightTask, morningTask, previousDayTask])

    expect(schedule.allocatedTasks.map(({ task }) => task.id)).toEqual(['previous', 'morning', 'overnight'])
    expect(schedule.allocatedTasks.map(({ startMinutes, endMinutes }) => ({ startMinutes, endMinutes }))).toEqual([
      { startMinutes: 0, endMinutes: 60 },
      { startMinutes: 30, endMinutes: 120 },
      { startMinutes: 1380, endMinutes: 1440 },
    ])
    expect(schedule.availableRanges).toEqual([
      { startMinutes: 120, endMinutes: 1380 },
    ])
  })

  it('merges overlapping allocations and includes completed and incomplete tasks without double-counting time', () => {
    const firstTask = { ...baseTask, id: 'first', date: '2026-10-22', startTime: '09:00', plannedMinutes: 120 }
    const completedTask = { ...baseTask, id: 'completed', date: '2026-10-22', startTime: '10:00', plannedMinutes: 120, completionState: 'completed' as const }
    const incompleteTask = { ...baseTask, id: 'incomplete', date: '2026-10-22', startTime: '11:30', plannedMinutes: 60, completionState: 'incomplete' as const }

    expect(getDailyTaskSchedule('2026-10-22', [firstTask, completedTask, incompleteTask]).availableRanges).toEqual([
      { startMinutes: 0, endMinutes: 540 },
      { startMinutes: 750, endMinutes: 1440 },
    ])
  })

  it('supports legacy multi-day tasks and excludes the task being edited', () => {
    const multiDayTask = { ...baseTask, id: 'multi-day', date: '2026-10-20', startTime: '12:00', plannedMinutes: 3000 }

    expect(getDailyTaskSchedule('2026-10-22', [multiDayTask]).availableRanges).toEqual([
      { startMinutes: 840, endMinutes: 1440 },
    ])
    expect(getDailyTaskSchedule('2026-10-22', [multiDayTask], multiDayTask.id).availableRanges).toEqual([
      { startMinutes: 0, endMinutes: 1440 },
    ])
  })

  it('returns no available ranges when the entire day is allocated', () => {
    const fullDayTask = { ...baseTask, date: '2026-10-22', startTime: '00:00', plannedMinutes: 1440 }
    expect(getDailyTaskSchedule('2026-10-22', [fullDayTask]).availableRanges).toEqual([])
  })

  it('calculates allocated and available totals without double-counting overlaps', () => {
    const firstTask = { ...baseTask, id: 'first', date: '2026-10-22', startTime: '09:00', plannedMinutes: 120 }
    const overlappingTask = { ...baseTask, id: 'overlapping', date: '2026-10-22', startTime: '10:00', plannedMinutes: 120 }
    const schedule = getDailyTaskSchedule('2026-10-22', [firstTask, overlappingTask])

    expect(getDailyScheduleTotals(schedule)).toEqual({ allocatedMinutes: 180, availableMinutes: 1260 })
  })

  it('reports an entirely empty day as available', () => {
    expect(getDailyScheduleTotals(getDailyTaskSchedule('2026-10-22', []))).toEqual({
      allocatedMinutes: 0,
      availableMinutes: 1440,
    })
  })
})

describe('task timing labels', () => {
  it('shows dates for tasks that cross midnight or span multiple days', () => {
    expect(formatTaskTiming({ ...baseTask, startTime: '23:30', plannedMinutes: 90 })).toBe('2026-10-21 23:30–2026-10-22 01:00')
    expect(formatTaskTiming({ ...baseTask, startTime: '09:00', plannedMinutes: 2940 })).toBe('2026-10-21 09:00–2026-10-23 10:00')
  })
})
