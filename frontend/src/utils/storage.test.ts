import { describe, expect, it, vi } from 'vitest'
import type { PlannerState, Task } from '../types/planner'
import {
  defaultPlannerState,
  loadNavigationState,
  loadPlannerState,
  NAVIGATION_STORAGE_KEY,
  parseNavigationState,
  parsePlannerState,
  saveNavigationState,
  savePlannerState,
  STORAGE_KEY,
} from './storage'

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
  settings: { manualThemeId: 'wednesday', sidebarCollapsed: true },
}

describe('planner localStorage', () => {
  it('round-trips valid state and derives completion state from minutes', () => {
    const parsed = parsePlannerState(JSON.stringify(state))
    expect(parsed.tasks[0].completionState).toBe('partial')
    expect(parsed.settings).toEqual(state.settings)
  })

  it('preserves an explicit incomplete outcome with zero progress', () => {
    const incompleteState = {
      ...state,
      tasks: [{ ...task, actualCompletedMinutes: 0, completionState: 'incomplete' as const }],
    }

    const parsed = parsePlannerState(JSON.stringify(incompleteState))
    expect(parsed.tasks[0].completionState).toBe('incomplete')
    expect(parsed.tasks[0].actualCompletedMinutes).toBe(0)
  })

  it('ignores the removed daily capacity without discarding stored planner data', () => {
    const previousState = {
      ...state,
      settings: { ...state.settings, availableHours: 6 },
    }

    const parsed = parsePlannerState(JSON.stringify(previousState))

    expect(parsed.tasks).toEqual([{ ...task, completionState: 'partial' }])
    expect(parsed.settings).toEqual(state.settings)
    expect('availableHours' in parsed.settings).toBe(false)
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
    expect(migrated.settings.manualThemeId).toBeNull()
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

describe('navigation sessionStorage', () => {
  const currentDateKey = '2026-10-22'

  it('round-trips the active view and selected date using a separate key', () => {
    const navigationState = { activeView: 'review' as const, selectedDate: '2026-10-20' }
    const storage = { setItem: vi.fn() }

    expect(saveNavigationState(storage, navigationState)).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(NAVIGATION_STORAGE_KEY, JSON.stringify(navigationState))
    expect(parseNavigationState(JSON.stringify(navigationState), currentDateKey)).toEqual(navigationState)
  })

  it('falls back independently for invalid views and dates', () => {
    expect(parseNavigationState(JSON.stringify({ activeView: 'outdated', selectedDate: '2026-10-20' }), currentDateKey)).toEqual({
      activeView: 'today',
      selectedDate: '2026-10-20',
    })
    expect(parseNavigationState(JSON.stringify({ activeView: 'settings', selectedDate: 'invalid' }), currentDateKey)).toEqual({
      activeView: 'settings',
      selectedDate: currentDateKey,
    })
  })

  it('falls back safely for missing, malformed, or blocked navigation data', () => {
    expect(parseNavigationState(null, currentDateKey)).toEqual({ activeView: 'today', selectedDate: currentDateKey })
    expect(parseNavigationState('{oops', currentDateKey)).toEqual({ activeView: 'today', selectedDate: currentDateKey })
    const blockedStorage = { getItem: vi.fn(() => { throw new Error('blocked') }) }
    expect(loadNavigationState(blockedStorage, currentDateKey)).toEqual({ activeView: 'today', selectedDate: currentDateKey })
  })

  it('reports navigation write failures without throwing', () => {
    const blockedStorage = { setItem: vi.fn(() => { throw new Error('quota') }) }
    expect(saveNavigationState(blockedStorage, { activeView: 'calendar', selectedDate: currentDateKey })).toBe(false)
  })
})
