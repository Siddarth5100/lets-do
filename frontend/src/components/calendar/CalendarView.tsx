import { useMemo, useState } from 'react'
import type { Task } from '../../types/planner'
import { formatLongDate, formatMonth, fromLocalDateKey, toLocalDateKey } from '../../utils/dates'
import { TaskItem } from '../tasks/TaskItem'
import type { TaskActionCallbacks } from '../tasks/TaskItem'
import { Icon } from '../ui/Icon'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface CalendarViewProps extends TaskActionCallbacks {
  initialDate: string
  tasks: Task[]
  onAdd: (date: string) => void
  onBackToToday: () => void
}

export function CalendarView({
  initialDate,
  tasks,
  onAdd,
  onBackToToday,
  ...taskActions
}: CalendarViewProps) {
  const initialSelectedDate = fromLocalDateKey(initialDate) ?? fromLocalDateKey('2000-01-01')!
  const [displayedMonth, setDisplayedMonth] = useState(() => (
    new Date(initialSelectedDate.getFullYear(), initialSelectedDate.getMonth(), 1)
  ))
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const calendarDates = useMemo(() => createCalendarDates(displayedMonth), [displayedMonth])
  const selectedTasks = tasks
    .filter((task) => task.date === selectedDate)
    .sort((firstTask, secondTask) => firstTask.startTime.localeCompare(secondTask.startTime))

  const moveMonth = (amount: number) => {
    const nextMonth = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() + amount,
      1,
    )
    setDisplayedMonth(nextMonth)
    setSelectedDate(toLocalDateKey(nextMonth))
  }

  return (
    <div className="space-y-7">
      <header>
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent-strong)]"
          onClick={onBackToToday}
        >
          <Icon name="chevron-left" className="size-4" />
          Back to Today
        </button>
        <p className="section-kicker">Look ahead</p>
        <h1 className="page-title">Calendar</h1>
        <p className="page-subtitle">See the shape of your days without losing sight of today.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.8fr)]">
        <section className="panel p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              className="icon-button"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              <Icon name="chevron-left" className="size-5" />
            </button>
            <h2 className="text-xl font-black text-slate-900">{formatMonth(displayedMonth)}</h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
            >
              <Icon name="chevron-right" className="size-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-black uppercase tracking-wider text-slate-400">
            {WEEKDAY_LABELS.map((weekdayLabel) => (
              <div key={weekdayLabel} className="py-2">{weekdayLabel}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDates.map((date) => {
              const dateKey = toLocalDateKey(date)
              const dateTasks = tasks.filter((task) => task.date === dateKey)
              const isDisplayedMonth = date.getMonth() === displayedMonth.getMonth()
              const isSelected = dateKey === selectedDate
              const isToday = dateKey === initialDate
              const dateButtonClasses = isSelected
                ? 'bg-[var(--accent)] text-white shadow-md'
                : isDisplayedMonth
                  ? 'bg-slate-50 text-slate-800 hover:bg-[var(--accent-soft)]'
                  : 'text-slate-300 hover:bg-slate-50'

              return (
                <button
                  type="button"
                  key={dateKey}
                  className={`relative min-h-16 rounded-xl p-1.5 text-left transition sm:min-h-24 sm:p-2.5 ${dateButtonClasses} ${isToday && !isSelected ? 'ring-2 ring-[var(--accent)] ring-inset' : ''}`}
                  onClick={() => setSelectedDate(dateKey)}
                  aria-label={`${formatLongDate(dateKey)}, ${dateTasks.length} tasks`}
                >
                  <span className="text-xs font-bold sm:text-sm">{date.getDate()}</span>
                  {dateTasks.length > 0 && (
                    <div className="mt-2 hidden space-y-1 sm:block">
                      {dateTasks.slice(0, 2).map((task) => (
                        <div
                          key={task.id}
                          className={`truncate rounded px-1.5 py-1 text-[10px] font-semibold ${isSelected ? 'bg-white/20' : task.completionState === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600'}`}
                        >
                          {task.title}
                        </div>
                      ))}
                    </div>
                  )}
                  {dateTasks.length > 0 && (
                    <span className={`absolute bottom-1.5 right-1.5 size-1.5 rounded-full sm:hidden ${isSelected ? 'bg-white' : 'bg-[var(--accent)]'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[var(--accent-strong)]">
                Selected day
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-900">
                {formatLongDate(selectedDate)}
              </h2>
            </div>
            <button type="button" className="button-primary" onClick={() => onAdd(selectedDate)}>
              <Icon name="plus" className="size-4" />
              Add
            </button>
          </div>

          {selectedTasks.length > 0 ? (
            <div className="space-y-2">
              {selectedTasks.map((task) => (
                <TaskItem key={task.id} task={task} actions={taskActions} />
              ))}
            </div>
          ) : (
            <div className="panel px-6 py-12 text-center">
              <p className="font-bold text-slate-700">No plans for this date</p>
              <p className="mt-1 text-sm text-slate-500">
                An empty day is not automatically a rest day.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
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
