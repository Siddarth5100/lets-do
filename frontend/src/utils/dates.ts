import { getV1DateKey } from './timeZones'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function getCurrentDate(): Date {
  return new Date()
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromLocalDateKey(dateKey: string): Date | null {
  if (!DATE_PATTERN.test(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return toLocalDateKey(date) === dateKey ? date : null
}

export function addLocalDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

export function addDateKeyDays(dateKey: string, amount: number): string | null {
  if (!DATE_PATTERN.test(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  if (Number.isNaN(date.getTime())) return null
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
    .join('-')
}

export function formatLongDate(dateKey: string): string {
  const date = fromLocalDateKey(dateKey)
  if (!date) return dateKey
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

export function localDateFromTimestamp(timestamp: string): string | null {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : getV1DateKey(date)
}
