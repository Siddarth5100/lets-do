import { useEffect, useId, useRef, useState } from 'react'
import { formatLongDate, formatMonth, fromLocalDateKey, toLocalDateKey } from '../../utils/dates'
import { Icon } from './Icon'

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface DatePickerProps {
  value: string
  onChange: (dateKey: string) => void
  label: string
  closeOnOutsideClick?: boolean
}

export function DatePicker({
  value,
  onChange,
  label,
  closeOnOutsideClick = false,
}: DatePickerProps) {
  const labelId = useId()
  const datePickerRef = useRef<HTMLDivElement>(null)
  const selectedDate = fromLocalDateKey(value)
  const [calendarMonth, setCalendarMonth] = useState(() => selectedDate ?? new Date(2000, 0, 1))
  const [open, setOpen] = useState(false)
  const calendarDates = createCalendarDates(calendarMonth)

  useEffect(() => {
    if (!open || !closeOnOutsideClick) return

    const closeCalendarFromOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !datePickerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeCalendarFromOutsideClick)
    return () => document.removeEventListener('pointerdown', closeCalendarFromOutsideClick)
  }, [closeOnOutsideClick, open])

  const selectDate = (date: Date) => {
    onChange(toLocalDateKey(date))
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    setOpen(false)
  }

  return (
    <div
      ref={datePickerRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <span id={labelId} className="field-label">{label}</span>
      <button
        type="button"
        className="field-input flex items-center justify-between text-left"
        aria-labelledby={labelId}
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span>{selectedDate ? formatLongDate(value) : 'Choose a date'}</span>
        <Icon name="calendar" className="size-4 text-[var(--accent-strong)]" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"
          role="dialog"
          aria-label="Choose a date"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="icon-button"
              onClick={() => setCalendarMonth(changeMonth(calendarMonth, -1))}
              aria-label="Previous month"
            >
              <Icon name="chevron-left" className="size-4" />
            </button>
            <strong className="text-sm text-slate-800">{formatMonth(calendarMonth)}</strong>
            <button
              type="button"
              className="icon-button"
              onClick={() => setCalendarMonth(changeMonth(calendarMonth, 1))}
              aria-label="Next month"
            >
              <Icon name="chevron-right" className="size-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            {WEEKDAY_INITIALS.map((weekday, index) => (
              <span key={`${weekday}-${index}`} className="py-1">{weekday}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDates.map((date) => {
              const dateKey = toLocalDateKey(date)
              const isSelected = dateKey === value
              const isCurrentMonth = date.getMonth() === calendarMonth.getMonth()
              const dateClasses = isSelected
                ? 'bg-[var(--accent)] text-white'
                : isCurrentMonth
                  ? 'text-slate-700 hover:bg-[var(--accent-soft)]'
                  : 'text-slate-300 hover:bg-slate-50'

              return (
                <button
                  type="button"
                  key={dateKey}
                  className={`grid aspect-square place-items-center rounded-lg text-xs font-bold transition ${dateClasses}`}
                  onClick={() => selectDate(date)}
                  aria-label={formatLongDate(dateKey)}
                  aria-pressed={isSelected}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function changeMonth(month: Date, amount: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1)
}

function createCalendarDates(month: Date): Date[] {
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  const calendarStartDate = new Date(
    firstDayOfMonth.getFullYear(),
    firstDayOfMonth.getMonth(),
    1 - firstDayOfMonth.getDay(),
  )
  return Array.from(
    { length: 42 },
    (_, index) => new Date(
      calendarStartDate.getFullYear(),
      calendarStartDate.getMonth(),
      calendarStartDate.getDate() + index,
    ),
  )
}
