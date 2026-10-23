import { describe, expect, it } from 'vitest'
import type { PlannerState, Task, TaskDraft } from '../types/planner'
import {
  markTaskIncompleteInPlannerState,
  reopenTaskInPlannerState,
  updateTaskInPlannerState,
} from './plannerTransitions'

const initialTask: Task = {
  id: 'task-1',
  title: 'Prepare release notes',
  category: 'Work',
  date: '2026-10-23',
  startTime: '09:00',
  plannedMinutes: 90,
  reminder: { enabled: false, minutesBefore: 10 },
  actualCompletedMinutes: 0,
  completionState: 'pending',
  important: false,
  createdAt: '2026-10-23T08:00:00.000Z',
  updatedAt: '2026-10-23T08:00:00.000Z',
  completedAt: null,
}

function createState(task: Task = initialTask): PlannerState {
  return {
    version: 2,
    tasks: [task],
    activityDates: [],
    completionEvents: [],
    customCategories: [],
    settings: { availableHours: 8, manualThemeId: null, sidebarCollapsed: false },
  }
}

function createDraft(task: Task, overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: task.title,
    category: task.category,
    date: task.date,
    startTime: task.startTime,
    plannedMinutes: task.plannedMinutes,
    reminder: task.reminder,
    actualCompletedMinutes: task.actualCompletedMinutes,
    important: task.important,
    ...overrides,
  }
}

describe('planner task transitions', () => {
  const transitionTime = new Date(2026, 9, 23, 12, 0)

  it('moves a pending task to partial and records unique activity without a completion event', () => {
    const state = { ...createState(), activityDates: ['2026-10-23'] }
    const updated = updateTaskInPlannerState(
      state,
      initialTask.id,
      createDraft(initialTask, { actualCompletedMinutes: 45 }),
      transitionTime,
      'event-unused',
    )

    expect(updated.tasks[0]).toMatchObject({ completionState: 'partial', actualCompletedMinutes: 45, completedAt: null })
    expect(updated.completionEvents).toEqual([])
    expect(updated.activityDates).toEqual(['2026-10-23'])
  })

  it('creates one completion event when a task is fully completed', () => {
    const partialTask = { ...initialTask, actualCompletedMinutes: 45, completionState: 'partial' as const }
    const updated = updateTaskInPlannerState(
      createState(partialTask),
      partialTask.id,
      createDraft(partialTask, { actualCompletedMinutes: 90 }),
      transitionTime,
      'completion-1',
    )

    expect(updated.tasks[0]).toMatchObject({ completionState: 'completed', actualCompletedMinutes: 90 })
    expect(updated.tasks[0].completedAt).toBe(transitionTime.toISOString())
    expect(updated.completionEvents).toEqual([{
      id: 'completion-1',
      taskId: partialTask.id,
      completedAt: transitionTime.toISOString(),
    }])
  })

  it('does not create a completion event for a future planned task', () => {
    const futureTask = { ...initialTask, date: '2026-10-24' }
    const updated = updateTaskInPlannerState(
      createState(futureTask),
      futureTask.id,
      createDraft(futureTask, { actualCompletedMinutes: 90 }),
      transitionTime,
      'completion-unused',
    )

    expect(updated.tasks[0].completionState).toBe('completed')
    expect(updated.completionEvents).toEqual([])
  })

  it('marks a task incomplete with no event while preserving genuine activity history', () => {
    const completedTask = {
      ...initialTask,
      actualCompletedMinutes: 90,
      completionState: 'completed' as const,
      completedAt: '2026-10-22T10:00:00.000Z',
    }
    const state = {
      ...createState(completedTask),
      activityDates: ['2026-10-22'],
      completionEvents: [{ id: 'completion-1', taskId: completedTask.id, completedAt: completedTask.completedAt }],
    }
    const updated = markTaskIncompleteInPlannerState(state, completedTask.id, transitionTime)

    expect(updated.tasks[0]).toMatchObject({ completionState: 'incomplete', actualCompletedMinutes: 0, completedAt: null })
    expect(updated.completionEvents).toEqual([])
    expect(updated.activityDates).toEqual(['2026-10-22', '2026-10-23'])
  })

  it('reopens an outcome and removes its completion event without removing activity history', () => {
    const completedTask = {
      ...initialTask,
      actualCompletedMinutes: 90,
      completionState: 'completed' as const,
      completedAt: '2026-10-23T10:00:00.000Z',
    }
    const state = {
      ...createState(completedTask),
      activityDates: ['2026-10-22'],
      completionEvents: [{ id: 'completion-1', taskId: completedTask.id, completedAt: completedTask.completedAt }],
    }
    const updated = reopenTaskInPlannerState(state, completedTask.id, transitionTime)

    expect(updated.tasks[0]).toMatchObject({ completionState: 'pending', actualCompletedMinutes: 0, completedAt: null })
    expect(updated.completionEvents).toEqual([])
    expect(updated.activityDates).toEqual(['2026-10-22', '2026-10-23'])
  })

  it('keeps a partial task at exactly half progress when its duration is rescheduled', () => {
    const partialTask = { ...initialTask, actualCompletedMinutes: 45, completionState: 'partial' as const }
    const updated = updateTaskInPlannerState(
      createState(partialTask),
      partialTask.id,
      createDraft(partialTask, {
        date: '2026-10-24',
        startTime: '13:30',
        plannedMinutes: 120,
        actualCompletedMinutes: 60,
      }),
      transitionTime,
      'completion-unused',
    )

    expect(updated.tasks[0]).toMatchObject({
      date: '2026-10-24',
      startTime: '13:30',
      plannedMinutes: 120,
      actualCompletedMinutes: 60,
      completionState: 'partial',
    })
    expect(updated.completionEvents).toEqual([])
  })
})
