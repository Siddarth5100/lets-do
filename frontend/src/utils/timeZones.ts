const MAXIMUM_IANA_TIME_ZONE_LENGTH = 64

export const V1_TIME_ZONE = 'Asia/Kolkata'

export interface V1DateTimeParts {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
}

const v1DateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: V1_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

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

export function requireV1TimeZone(timeZone: unknown, fieldName = 'time zone'): string {
  if (timeZone !== V1_TIME_ZONE) {
    throw new Error(`${fieldName} must be ${V1_TIME_ZONE} for Let's Do V1.`)
  }
  return timeZone
}

export function getV1DateTimeParts(date: Date): V1DateTimeParts {
  const parts = Object.fromEntries(
    v1DateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hours: parts.hour,
    minutes: parts.minute,
    seconds: parts.second,
  }
}

export function getV1DateKey(date: Date): string {
  const { year, month, day } = getV1DateTimeParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function getV1WeekdayIndex(date: Date): number {
  const { year, month, day } = getV1DateTimeParts(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function getV1ScheduledTimestamp(dateKey: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const [, yearText, monthText, dayText] = dateMatch
  const [, hoursText, minutesText] = timeMatch
  const desiredParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hours: Number(hoursText),
    minutes: Number(minutesText),
  }
  if (
    desiredParts.month < 1 || desiredParts.month > 12 ||
    desiredParts.day < 1 || desiredParts.day > 31 ||
    desiredParts.hours > 23 || desiredParts.minutes > 59
  ) return null

  const desiredWallTime = Date.UTC(
    desiredParts.year,
    desiredParts.month - 1,
    desiredParts.day,
    desiredParts.hours,
    desiredParts.minutes,
  )
  const desiredDate = new Date(Date.UTC(
    desiredParts.year,
    desiredParts.month - 1,
    desiredParts.day,
  ))
  if (
    desiredDate.getUTCFullYear() !== desiredParts.year ||
    desiredDate.getUTCMonth() !== desiredParts.month - 1 ||
    desiredDate.getUTCDate() !== desiredParts.day
  ) return null

  // Resolve the named-zone offset through Intl so V2 can replace the fixed V1 zone
  // without embedding an offset or changing scheduling call sites.
  let timestamp = desiredWallTime
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = getV1DateTimeParts(new Date(timestamp))
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hours,
      actual.minutes,
    )
    timestamp += desiredWallTime - actualWallTime
  }

  const resolved = getV1DateTimeParts(new Date(timestamp))
  return (
    resolved.year === desiredParts.year &&
    resolved.month === desiredParts.month &&
    resolved.day === desiredParts.day &&
    resolved.hours === desiredParts.hours &&
    resolved.minutes === desiredParts.minutes
  ) ? timestamp : null
}

export function getBrowserTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isValidIanaTimeZone(timeZone) ? timeZone : 'UTC'
}
