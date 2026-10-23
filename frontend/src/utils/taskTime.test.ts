import { describe, expect, it } from 'vitest'
import {
  calculateDurationMinutes,
  canRescheduleTask,
  deriveEndTime,
  formatDuration,
  formatMinutesAsTime,
  getEffectiveDurationMinutes,
  getEndDayOffset,
  getTaskScheduleTimestamps,
  getTimingBoundaryDelay,
  hasTaskScheduledEndPassed,
  parseTimeToMinutes,
} from './taskTime'

describe('task time parsing and formatting', () => {
  it('parses valid 24-hour times and rejects invalid values', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0)
    expect(parseTimeToMinutes('23:59')).toBe(1439)
    expect(parseTimeToMinutes('24:00')).toBeNull()
    expect(parseTimeToMinutes('9:30')).toBeNull()
  })

  it('formats minutes as a normalized two-digit time', () => {
    expect(formatMinutesAsTime(0)).toBe('00:00')
    expect(formatMinutesAsTime(1500)).toBe('01:00')
  })

  it('formats compact and readable durations consistently', () => {
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(60, true)).toBe('1 hour')
    expect(formatDuration(90, true)).toBe('1h 30m')
  })
})

describe('rescheduling cutoff', () => {
  it('allows rescheduling only before one hour prior to the original start', () => {
    expect(canRescheduleTask('2026-10-23', '14:00', new Date(2026, 9, 23, 12, 59, 59))).toBe(true)
    expect(canRescheduleTask('2026-10-23', '14:00', new Date(2026, 9, 23, 13, 0, 0))).toBe(false)
    expect(canRescheduleTask('2026-10-23', '14:00', new Date(2026, 9, 23, 13, 30, 0))).toBe(false)
  })

  it('handles midnight starts and rejects invalid scheduling values', () => {
    expect(canRescheduleTask('2026-10-24', '00:30', new Date(2026, 9, 23, 23, 0, 0))).toBe(true)
    expect(canRescheduleTask('2026-10-24', '00:30', new Date(2026, 9, 23, 23, 30, 0))).toBe(false)
    expect(canRescheduleTask('invalid', '09:00')).toBe(false)
    expect(canRescheduleTask('2026-10-24', '25:00')).toBe(false)
  })

  it('detects when an overnight task has passed its scheduled end', () => {
    expect(hasTaskScheduledEndPassed('2026-10-23', '23:30', 90, new Date(2026, 9, 24, 0, 59, 59))).toBe(false)
    expect(hasTaskScheduledEndPassed('2026-10-23', '23:30', 90, new Date(2026, 9, 24, 1, 0, 0))).toBe(true)
  })

  it('returns timing boundaries for valid tasks and rejects invalid durations', () => {
    const timestamps = getTaskScheduleTimestamps('2026-10-23', '14:00', 90)
    expect(timestamps?.scheduledEnd).toBe(new Date(2026, 9, 23, 15, 30).getTime())
    expect(timestamps?.rescheduleCutoff).toBe(new Date(2026, 9, 23, 13, 0).getTime())
    expect(getTaskScheduleTimestamps('2026-10-23', '14:00', 0)).toBeNull()
  })

  it('returns a buffered, capped delay for the next timing boundary', () => {
    expect(getTimingBoundaryDelay([5_000, 2_000], 1_000)).toBe(1_050)
    expect(getTimingBoundaryDelay([1_000], 1_000)).toBeNull()
    expect(getTimingBoundaryDelay([3_000_000_000], 0)).toBe(2_147_000_000)
  })
})

describe('automatic task duration', () => {
  it('calculates a same-day duration', () => {
    expect(calculateDurationMinutes('09:15', '10:45')).toBe(90)
    expect(getEndDayOffset('09:15', '10:45')).toBe(0)
  })

  it('calculates a duration that crosses midnight', () => {
    expect(calculateDurationMinutes('23:30', '00:15')).toBe(45)
    expect(getEndDayOffset('23:30', '00:15')).toBe(1)
  })

  it('returns zero for equal start and end times', () => {
    expect(calculateDurationMinutes('08:00', '08:00')).toBe(0)
  })

  it('derives end time and day offset from stored duration', () => {
    expect(deriveEndTime('23:30', 90)).toEqual({ endTime: '01:00', dayOffset: 1 })
    expect(deriveEndTime('09:00', 2940)).toEqual({ endTime: '10:00', dayOffset: 2 })
  })

  it('preserves a stored multi-day duration while its time values remain unchanged', () => {
    expect(getEffectiveDurationMinutes('09:00', '10:00', '09:00', '10:00', 2940)).toBe(2940)
    expect(getEffectiveDurationMinutes('09:00', '11:00', '09:00', '10:00', 2940)).toBe(120)
  })
})
