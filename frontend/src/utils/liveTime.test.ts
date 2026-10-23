import { describe, expect, it } from 'vitest'
import { formatDigitalClock, formatRemainingTime, getSecondsUntilLocalMidnight } from './liveTime'

describe('live time utilities', () => {
  it('formats local time as a zero-padded 24-hour clock', () => {
    const morning = new Date(2026, 0, 15, 5, 7, 9)
    const evening = new Date(2026, 0, 15, 23, 45, 6)

    expect(formatDigitalClock(morning)).toBe('05:07:09')
    expect(formatDigitalClock(evening)).toBe('23:45:06')
  })

  it('calculates the time remaining until the next local midnight', () => {
    const midday = new Date(2026, 0, 15, 12, 0, 0)

    expect(getSecondsUntilLocalMidnight(midday)).toBe(12 * 60 * 60)
  })

  it('rounds partial seconds up without showing zero before midnight', () => {
    const justBeforeMidnight = new Date(2026, 0, 15, 23, 59, 59, 500)

    expect(getSecondsUntilLocalMidnight(justBeforeMidnight)).toBe(1)
  })

  it('formats remaining time and prevents negative output', () => {
    expect(formatRemainingTime(45_296)).toBe('12h 34m 56s')
    expect(formatRemainingTime(18_296)).toBe('05h 04m 56s')
    expect(formatRemainingTime(-1)).toBe('00h 00m 00s')
  })
})
