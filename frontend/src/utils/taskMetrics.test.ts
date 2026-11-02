import { describe, expect, it } from 'vitest'
import {
  capCompletedMinutes,
  completionDatesFromEvents,
  getCompletionState,
  getCurrentStreak,
  getEarnedPoints,
  getMaxPoints,
  getPartialCompletedMinutes,
  getTaskProgress,
  shouldRecordCompletion,
  removeTaskCompletionEvents,
} from './taskMetrics'

describe('duration-weighted points', () => {
  it.each([
    [30, 1],
    [60, 1],
    [90, 1.5],
    [180, 3],
  ])('awards %i planned minutes a maximum of %f points', (minutes, points) => {
    expect(getMaxPoints(minutes)).toBe(points)
  })

  it('rejects a non-positive planned duration', () => {
    expect(() => getMaxPoints(0)).toThrow('greater than zero')
    expect(() => getMaxPoints(-10)).toThrow('greater than zero')
  })
})

describe('partial completion', () => {
  it('records exactly half of the planned duration', () => {
    expect(getPartialCompletedMinutes(60)).toBe(30)
    expect(getPartialCompletedMinutes(45)).toBe(22.5)
    expect(getTaskProgress(getPartialCompletedMinutes(45), 45)).toBe(0.5)
    expect(getEarnedPoints(getPartialCompletedMinutes(90), 90)).toBe(0.75)
  })

  it('calculates the agreed partial score', () => {
    expect(getEarnedPoints(150, 180)).toBe(2.5)
    expect(getTaskProgress(150, 180)).toBeCloseTo(5 / 6)
    expect(getCompletionState(150, 180)).toBe('partial')
  })

  it('keeps zero minutes pending with no points', () => {
    expect(getCompletionState(0, 30)).toBe('pending')
    expect(getEarnedPoints(0, 30)).toBe(0)
  })

  it('caps completed minutes at the planned duration for scoring', () => {
    expect(capCompletedMinutes(120, 60)).toBe(60)
    expect(getEarnedPoints(120, 60)).toBe(1)
    expect(getCompletionState(120, 60)).toBe('completed')
  })

  it('does not award points based on time passing', () => {
    expect(getEarnedPoints(0, 180)).toBe(0)
  })
})

describe('calendar-day streaks', () => {
  const today = new Date('2026-10-21T10:00:00Z')

  it('does not break an active streak while today is in progress', () => {
    expect(getCurrentStreak(['2026-10-19', '2026-10-20'], today)).toBe(2)
  })

  it('includes today when today qualifies', () => {
    expect(getCurrentStreak(['2026-10-19', '2026-10-20', '2026-10-21'], today)).toBe(3)
  })

  it('breaks at the first missing prior day', () => {
    expect(getCurrentStreak(['2026-10-18', '2026-10-20'], today)).toBe(1)
    expect(getCurrentStreak(['2026-10-19'], today)).toBe(0)
  })

  it('ignores duplicates, malformed dates, and future dates', () => {
    expect(getCurrentStreak(['2026-10-20', '2026-10-20', 'not-a-date', '2026-10-22'], today)).toBe(1)
  })

  it('derives completion dates from timestamps independently of activity dates', () => {
    expect(completionDatesFromEvents([
      { id: 'before-midnight', taskId: 'task-1', completedAt: '2026-10-20T18:29:59Z' },
      { id: 'after-midnight', taskId: 'task-2', completedAt: '2026-10-20T18:30:00Z' },
      { id: 'invalid', taskId: null, completedAt: 'invalid' },
    ])).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('does not record a future planned task as a completion-streak event', () => {
    expect(shouldRecordCompletion('2026-10-22', today)).toBe(false)
    expect(shouldRecordCompletion('2026-10-21', today)).toBe(true)
    expect(shouldRecordCompletion('2026-10-20', today)).toBe(true)
  })

  it('removes only completion events owned by a deleted or reopened task', () => {
    const events = [
      { id: 'one', taskId: 'task-1', completedAt: '2026-10-20T10:00:00.000Z' },
      { id: 'two', taskId: 'task-2', completedAt: '2026-10-20T11:00:00.000Z' },
      { id: 'legacy', taskId: null, completedAt: '2026-10-19T11:00:00.000Z' },
    ]
    expect(removeTaskCompletionEvents(events, 'task-1')).toEqual([events[1], events[2]])
  })
})
