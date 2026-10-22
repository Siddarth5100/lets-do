import { describe, expect, it } from 'vitest'
import {
  calculateDurationMinutes,
  deriveEndTime,
  formatMinutesAsTime,
  getEffectiveDurationMinutes,
  getEndDayOffset,
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
