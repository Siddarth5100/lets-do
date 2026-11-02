import { getV1DateTimeParts } from './timeZones'

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE

function padTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDigitalClock(date: Date): string {
  const { hours, minutes, seconds } = getV1DateTimeParts(date)
  return [hours, minutes, seconds].map(padTimePart).join(':')
}

export function getSecondsUntilV1Midnight(date: Date): number {
  const { hours, minutes, seconds } = getV1DateTimeParts(date)
  return 24 * SECONDS_PER_HOUR - (
    hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + seconds
  )
}

export function formatRemainingTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((safeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = safeSeconds % SECONDS_PER_MINUTE

  return `${padTimePart(hours)}h ${padTimePart(minutes)}m ${padTimePart(seconds)}s`
}
