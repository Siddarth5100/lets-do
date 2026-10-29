import { describe, expect, it } from 'vitest'
import {
  getBrowserTimeZone,
  getV1DateKey,
  getV1ScheduledTimestamp,
  isValidIanaTimeZone,
  requireIanaTimeZone,
  requireV1TimeZone,
  V1_TIME_ZONE,
} from './timeZones'

describe('IANA time zone validation', () => {
  it.each([
    'UTC',
    'Asia/Kolkata',
    'America/New_York',
    'Europe/London',
    'Asia/Calcutta',
    'US/Eastern',
  ])(
    'accepts %s',
    (timeZone) => {
      expect(isValidIanaTimeZone(timeZone)).toBe(true)
      expect(requireIanaTimeZone(timeZone)).toBe(timeZone)
    },
  )

  it.each(['', ' Asia/Kolkata ', 'Not/AZone', 'x'.repeat(65)])(
    'rejects %s',
    (timeZone) => {
      expect(isValidIanaTimeZone(timeZone)).toBe(false)
      expect(() => requireIanaTimeZone(timeZone)).toThrow('must be a valid IANA time zone')
    },
  )

  it('rejects non-string values', () => {
    expect(isValidIanaTimeZone(null)).toBe(false)
    expect(isValidIanaTimeZone(123)).toBe(false)
  })

  it('returns the browser IANA time zone', () => {
    expect(isValidIanaTimeZone(getBrowserTimeZone())).toBe(true)
  })

  it('accepts only the canonical India zone for V1 writes', () => {
    expect(requireV1TimeZone(V1_TIME_ZONE)).toBe('Asia/Kolkata')
    expect(() => requireV1TimeZone('UTC')).toThrow('must be Asia/Kolkata')
    expect(() => requireV1TimeZone('Asia/Calcutta')).toThrow('must be Asia/Kolkata')
  })

  it('changes calendar dates at IST midnight', () => {
    expect(getV1DateKey(new Date('2026-10-23T18:29:59Z'))).toBe('2026-10-23')
    expect(getV1DateKey(new Date('2026-10-23T18:30:00Z'))).toBe('2026-10-24')
  })

  it('resolves an IST wall-clock schedule without embedding an offset', () => {
    expect(getV1ScheduledTimestamp('2026-10-24', '00:00')).toBe(
      Date.parse('2026-10-23T18:30:00Z'),
    )
  })
})
