const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE

function padTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDigitalClock(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(padTimePart).join(':')
}

export function getSecondsUntilLocalMidnight(date: Date): number {
  const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return Math.max(0, Math.ceil((nextMidnight.getTime() - date.getTime()) / 1000))
}

export function formatRemainingTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((safeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = safeSeconds % SECONDS_PER_MINUTE

  return `${padTimePart(hours)}h ${padTimePart(minutes)}m ${padTimePart(seconds)}s`
}
