const MAXIMUM_IANA_TIME_ZONE_LENGTH = 64

export function isValidIanaTimeZone(timeZone: unknown): timeZone is string {
  if (
    typeof timeZone !== 'string' ||
    timeZone.length === 0 ||
    timeZone.length > MAXIMUM_IANA_TIME_ZONE_LENGTH ||
    timeZone.trim() !== timeZone
  ) {
    return false
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

export function requireIanaTimeZone(timeZone: unknown, fieldName = 'time zone'): string {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new Error(`${fieldName} must be a valid IANA time zone.`)
  }
  return timeZone
}

export function getBrowserTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isValidIanaTimeZone(timeZone) ? timeZone : 'UTC'
}
