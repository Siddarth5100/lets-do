import { fromLocalDateKey } from './dates'

export const MINUTES_PER_DAY = 24 * 60
const RESCHEDULE_CUTOFF_MINUTES = 60
const TIMING_BOUNDARY_BUFFER_MILLISECONDS = 50
const MAXIMUM_TIMEOUT_DELAY_MILLISECONDS = 2_147_000_000

export interface TaskScheduleTimestamps {
  scheduledStart: number
  scheduledEnd: number
  rescheduleCutoff: number
}

export interface DerivedEndTime {
  endTime: string
  dayOffset: number
}

export function parseTimeToMinutes(time: string): number | null {
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!timeMatch) return null

  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const normalizedMinutes = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatDuration(totalMinutes: number, useLongUnits = false): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return useLongUnits ? `${minutes} minutes` : `${minutes}m`
  if (minutes === 0) {
    return useLongUnits
      ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
      : `${hours}h`
  }
  return `${hours}h ${minutes}m`
}

export function deriveEndTime(startTime: string, durationMinutes: number): DerivedEndTime | null {
  const startMinutes = parseTimeToMinutes(startTime)
  if (startMinutes === null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null

  const absoluteEndMinutes = startMinutes + durationMinutes
  return {
    endTime: formatMinutesAsTime(absoluteEndMinutes),
    dayOffset: Math.floor(absoluteEndMinutes / MINUTES_PER_DAY),
  }
}

export function calculateDurationMinutes(startTime: string, endTime: string): number | null {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (startMinutes === null || endMinutes === null) return null
  if (startMinutes === endMinutes) return 0
  // An earlier end time represents a valid interval that crosses local midnight.
  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : MINUTES_PER_DAY - startMinutes + endMinutes
}

export function getEffectiveDurationMinutes(
  startTime: string,
  endTime: string,
  initialStartTime: string,
  initialEndTime: string,
  storedDurationMinutes: number,
): number | null {
  const timeValuesUnchanged = startTime === initialStartTime && endTime === initialEndTime
  return timeValuesUnchanged
    ? storedDurationMinutes
    : calculateDurationMinutes(startTime, endTime)
}

export function getEndDayOffset(startTime: string, endTime: string): number {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  return startMinutes !== null && endMinutes !== null && endMinutes < startMinutes ? 1 : 0
}

export function canRescheduleTask(taskDate: string, startTime: string, currentTime = new Date()): boolean {
  const scheduledStart = getTaskScheduledStartTimestamp(taskDate, startTime)
  if (scheduledStart === null || Number.isNaN(currentTime.getTime())) return false
  // The cutoff is exclusive: saving at exactly one hour before the start is too late.
  return currentTime.getTime() < scheduledStart - RESCHEDULE_CUTOFF_MINUTES * 60_000
}

export function hasTaskScheduledEndPassed(taskDate: string, startTime: string, plannedMinutes: number, currentTime = new Date()): boolean {
  const scheduleTimestamps = getTaskScheduleTimestamps(taskDate, startTime, plannedMinutes)
  if (!scheduleTimestamps || Number.isNaN(currentTime.getTime())) return false
  return currentTime.getTime() >= scheduleTimestamps.scheduledEnd
}

export function getTaskScheduleTimestamps(taskDate: string, startTime: string, plannedMinutes: number): TaskScheduleTimestamps | null {
  const scheduledStartTimestamp = getTaskScheduledStartTimestamp(taskDate, startTime)
  if (scheduledStartTimestamp === null || !Number.isFinite(plannedMinutes) || plannedMinutes <= 0) return null

  return {
    scheduledStart: scheduledStartTimestamp,
    scheduledEnd: scheduledStartTimestamp + plannedMinutes * 60_000,
    rescheduleCutoff: scheduledStartTimestamp - RESCHEDULE_CUTOFF_MINUTES * 60_000,
  }
}

export function getTimingBoundaryDelay(
  boundaryTimestamps: number[],
  currentTimestamp = Date.now(),
): number | null {
  const nextBoundary = boundaryTimestamps
    .filter((timestamp) => timestamp > currentTimestamp)
    .sort((firstTimestamp, secondTimestamp) => firstTimestamp - secondTimestamp)[0]

  return nextBoundary === undefined
    ? null
    : Math.min(
        nextBoundary - currentTimestamp + TIMING_BOUNDARY_BUFFER_MILLISECONDS,
        MAXIMUM_TIMEOUT_DELAY_MILLISECONDS,
      )
}

function getTaskScheduledStartTimestamp(taskDate: string, startTime: string): number | null {
  const taskDateValue = fromLocalDateKey(taskDate)
  const startMinutes = parseTimeToMinutes(startTime)
  if (!taskDateValue || startMinutes === null) return null

  return new Date(
    taskDateValue.getFullYear(),
    taskDateValue.getMonth(),
    taskDateValue.getDate(),
    Math.floor(startMinutes / 60),
    startMinutes % 60,
  ).getTime()
}
