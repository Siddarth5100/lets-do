import { describe, expect, it } from 'vitest'
import { isValidIanaTimeZone, requireIanaTimeZone } from './timeZones'

describe('IANA time zone validation', () => {
  it.each(['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London'])(
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
})
