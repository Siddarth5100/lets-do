import { describe, expect, it } from 'vitest'
import type { Task, TaskDraft } from '../types/planner'
import { findOverlappingActiveTasks, findSameDayDuplicateTasks, normalizeTaskName } from './taskValidation'

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

describe('active task overlap detection', () => {
  it('detects intersecting intervals but allows adjacent tasks', () => {
    expect(findOverlappingActiveTasks(createDraft({ startTime: '09:30' }), [baseTask])).toEqual([baseTask])
    expect(findOverlappingActiveTasks(createDraft({ startTime: '10:00' }), [baseTask])).toEqual([])
  })

  it('detects overlaps that cross midnight', () => {
    const lateTask = { ...baseTask, startTime: '23:30', plannedMinutes: 90 }
    const afterMidnight = createDraft({ date: '2026-10-22', startTime: '00:30' })
    expect(findOverlappingActiveTasks(afterMidnight, [lateTask])).toEqual([lateTask])
  })

  it('ignores completed tasks and the task currently being edited', () => {
    const overlapping = createDraft({ startTime: '09:15' })
    expect(findOverlappingActiveTasks(overlapping, [{ ...baseTask, completionState: 'completed' }])).toEqual([])
    expect(findOverlappingActiveTasks(overlapping, [baseTask], baseTask.id)).toEqual([])
  })
})
