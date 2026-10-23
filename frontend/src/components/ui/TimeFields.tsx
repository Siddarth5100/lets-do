import { useId, useState } from 'react'
import type { ChangeEvent, FocusEvent, KeyboardEvent, WheelEvent } from 'react'
import { parseTimeToMinutes } from '../../utils/taskTime'

interface TimeFieldsProps {
  label: string
  value: string
  onChange: (time: string) => void
  errorMessage: string
  onValidationChange: (errorMessage: string) => void
}

type TimeSegment = 'hours' | 'minutes'

export function TimeFields({ label, value, onChange, errorMessage, onValidationChange }: TimeFieldsProps) {
  const [initialHours, initialMinutes] = getTimeSegments(value)
  const [hoursText, setHoursText] = useState(initialHours)
  const [minutesText, setMinutesText] = useState(initialMinutes)
  const errorMessageId = useId()

  const updateTimeSegment = (segment: TimeSegment, nextText: string) => {
    const digitsOnly = nextText.replace(/\D/g, '').slice(-2)
    if (segment === 'hours') setHoursText(digitsOnly)
    else setMinutesText(digitsOnly)

    const nextHours = segment === 'hours' ? parseSegment(digitsOnly, 23) : parseSegment(hoursText, 23)
    const nextMinutes = segment === 'minutes' ? parseSegment(digitsOnly, 59) : parseSegment(minutesText, 59)
    const validationMessage = getTimeValidationMessage(label, segment === 'hours' ? digitsOnly : hoursText, segment === 'minutes' ? digitsOnly : minutesText)
    onValidationChange(validationMessage)
    if (nextHours !== null && nextMinutes !== null) onChange(formatTime(nextHours, nextMinutes))
  }

  const normalizeTimeSegment = (event: FocusEvent<HTMLInputElement>, segment: TimeSegment) => {
    const maximum = segment === 'hours' ? 23 : 59
    const fallback = segment === 'hours' ? getTimeSegments(value)[0] : getTimeSegments(value)[1]
    const parsedValue = parseSegment(event.currentTarget.value, maximum)
    const normalizedValue = parsedValue === null ? fallback : String(parsedValue).padStart(2, '0')
    updateTimeSegment(segment, normalizedValue)
  }

  const adjustTimeSegment = (segment: TimeSegment, direction: number) => {
    const limit = segment === 'hours' ? 24 : 60
    const currentText = segment === 'hours' ? hoursText : minutesText
    const fallbackText = segment === 'hours' ? getTimeSegments(value)[0] : getTimeSegments(value)[1]
    const currentValue = parseSegment(currentText, limit - 1) ?? Number(fallbackText)
    const adjustedValue = (currentValue + direction + limit) % limit
    updateTimeSegment(segment, String(adjustedValue).padStart(2, '0'))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, segment: TimeSegment) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    adjustTimeSegment(segment, event.key === 'ArrowUp' ? 1 : -1)
  }

  const handleWheel = (event: WheelEvent<HTMLInputElement>, segment: TimeSegment) => {
    if (document.activeElement !== event.currentTarget || event.deltaY === 0) return
    event.preventDefault()
    adjustTimeSegment(segment, event.deltaY < 0 ? 1 : -1)
  }

  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TimeSegmentInput label={`${label} hours`} value={hoursText} onChange={(event) => updateTimeSegment('hours', event.target.value)} onBlur={(event) => normalizeTimeSegment(event, 'hours')} onKeyDown={(event) => handleKeyDown(event, 'hours')} onWheel={(event) => handleWheel(event, 'hours')} errorMessage={errorMessage} errorMessageId={errorMessageId} />
        <span className="font-black text-slate-400" aria-hidden="true">:</span>
        <TimeSegmentInput label={`${label} minutes`} value={minutesText} onChange={(event) => updateTimeSegment('minutes', event.target.value)} onBlur={(event) => normalizeTimeSegment(event, 'minutes')} onKeyDown={(event) => handleKeyDown(event, 'minutes')} onWheel={(event) => handleWheel(event, 'minutes')} errorMessage={errorMessage} errorMessageId={errorMessageId} />
      </div>
      {errorMessage && <p id={errorMessageId} className="mt-2 text-xs font-semibold text-red-700" role="alert">{errorMessage}</p>}
    </fieldset>
  )
}

interface TimeSegmentInputProps {
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur: (event: FocusEvent<HTMLInputElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onWheel: (event: WheelEvent<HTMLInputElement>) => void
  errorMessage: string
  errorMessageId: string
}

function TimeSegmentInput({ label, value, onChange, onBlur, onKeyDown, onWheel, errorMessage, errorMessageId }: TimeSegmentInputProps) {
  return <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} className="time-segment-input" value={value} onChange={onChange} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} onBlur={onBlur} onKeyDown={onKeyDown} onWheel={onWheel} aria-label={label} aria-invalid={Boolean(errorMessage)} aria-describedby={errorMessage ? errorMessageId : undefined} />
}

function getTimeSegments(time: string): [string, string] {
  if (parseTimeToMinutes(time) === null) return ['00', '00']
  const [hours, minutes] = time.split(':')
  return [hours, minutes]
}

function parseSegment(value: string, maximum: number): number | null {
  if (!/^\d{1,2}$/.test(value)) return null
  const parsedValue = Number(value)
  return parsedValue <= maximum ? parsedValue : null
}

function getTimeValidationMessage(label: string, hours: string, minutes: string): string {
  if (parseSegment(hours, 23) === null) return `${label} hours must be between 00 and 23.`
  if (parseSegment(minutes, 59) === null) return `${label} minutes must be between 00 and 59.`
  return ''
}

function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
