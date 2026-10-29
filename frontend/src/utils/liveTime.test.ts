import { describe, expect, it } from 'vitest'
import { formatDigitalClock, formatRemainingTime, getSecondsUntilV1Midnight } from './liveTime'

describe('live time utilities', () => {
  it('formats IST as a zero-padded 24-hour clock', () => {
    const morning = new Date('2026-01-14T23:37:09Z')
    const evening = new Date('2026-01-15T18:15:06Z')

    expect(formatDigitalClock(morning)).toBe('05:07:09')
    expect(formatDigitalClock(evening)).toBe('23:45:06')
  })

  it('calculates the time remaining until the next IST midnight', () => {
    const midday = new Date('2026-01-15T06:30:00Z')

    expect(getSecondsUntilV1Midnight(midday)).toBe(12 * 60 * 60)
  })

  it('rounds partial seconds up without showing zero before midnight', () => {
    const justBeforeMidnight = new Date('2026-01-15T18:29:59.500Z')

    expect(getSecondsUntilV1Midnight(justBeforeMidnight)).toBe(1)
  })

  it('formats remaining time and prevents negative output', () => {
    expect(formatRemainingTime(45_296)).toBe('12h 34m 56s')
    expect(formatRemainingTime(18_296)).toBe('05h 04m 56s')
    expect(formatRemainingTime(-1)).toBe('00h 00m 00s')
  })
})
