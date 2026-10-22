import { describe, expect, it, vi } from 'vitest'
import type { PlannerState, Task } from '../types/planner'
import { defaultPlannerState, loadPlannerState, parsePlannerState, savePlannerState, STORAGE_KEY } from './storage'

const task: Task = {
  id: 'task-1',
  title: 'Write the plan',
  category: 'Work',
  date: '2026-10-21',
  startTime: '09:00',
  plannedMinutes: 90,
  reminder: { enabled: true, minutesBefore: 10 },
  actualCompletedMinutes: 45,
  completionState: 'pending',
  important: true,
  createdAt: '2026-10-21T09:00:00.000Z',
  updatedAt: '2026-10-21T09:00:00.000Z',
  completedAt: null,
}

const state: PlannerState = {
  version: 2,
  tasks: [task],
  activityDates: ['2026-10-21'],
  completionEvents: [],
  customCategories: ['Deep work'],
  settings: { availableHours: 6, manualThemeId: 'wednesday', sidebarCollapsed: true },
}

describe('planner localStorage', () => {
  it('round-trips valid state and derives completion state from minutes', () => {
    const parsed = parsePlannerState(JSON.stringify(state))
    expect(parsed.tasks[0].completionState).toBe('partial')
    expect(parsed.settings).toEqual(state.settings)
  })

  it('falls back safely for missing, corrupt, or unsupported data', () => {
    expect(parsePlannerState(null)).toEqual(defaultPlannerState)
    expect(parsePlannerState('{oops')).toEqual(defaultPlannerState)
    expect(parsePlannerState(JSON.stringify({ ...state, version: 3 }))).toEqual(defaultPlannerState)
  })

  it('migrates version 1 data without discarding activity or completion history', () => {
    const completedAt = '2026-10-21T09:30:00.000Z'
    const legacyState = {
      version: 1,
      tasks: [{ ...task, actualCompletedMinutes: 90, completionState: 'completed', completedAt }],
      activityDates: ['2026-10-20'],
      completionTimestamps: [completedAt, '2026-10-19T12:00:00.000Z'],
      settings: { availableHours: 7, manualThemeId: null },
    }
    const migrated = parsePlannerState(JSON.stringify(legacyState))
    expect(migrated.version).toBe(2)
    expect(migrated.activityDates).toEqual(['2026-10-20'])
    expect(migrated.completionEvents).toHaveLength(2)
    expect(migrated.completionEvents[0].taskId).toBe(task.id)
    expect(migrated.completionEvents[1].taskId).toBeNull()
    expect(migrated.settings.sidebarCollapsed).toBe(false)
  })

  it('falls back when reading storage is blocked', () => {
    const storage = { getItem: vi.fn(() => { throw new Error('blocked') }) }
    expect(loadPlannerState(storage)).toEqual(defaultPlannerState)
  })

  it('writes the versioned payload to the expected key', () => {
    const storage = { setItem: vi.fn() }
    expect(savePlannerState(storage, state)).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(state))
  })

  it('reports quota or privacy-mode write failures', () => {
    const storage = { setItem: vi.fn(() => { throw new Error('quota') }) }
    expect(savePlannerState(storage, state)).toBe(false)
  })
})
