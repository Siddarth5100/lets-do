import type { Task } from '../../types/planner'
import { addLocalDays, fromLocalDateKey, toLocalDateKey } from '../../utils/dates'
import { deriveEndTime, MINUTES_PER_DAY } from '../../utils/taskTime'
import type { DailyTimeRange } from '../../utils/taskValidation'
import { formatDayMinute, formatTaskTiming, getDailyTaskSchedule } from '../../utils/taskValidation'

interface AvailableTimeSectionProps {
  dateKey: string
  tasks: Task[]
  conflictingTasks: Task[]
  excludedTaskId?: string
}

export function AvailableTimeSection({ dateKey, tasks, conflictingTasks, excludedTaskId }: AvailableTimeSectionProps) {
  const schedule = getDailyTaskSchedule(dateKey, tasks, excludedTaskId)

  return (
    <section className="space-y-3">
      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--accent-strong)]">
          View Allocated Tasks
        </summary>
        <div className="border-t border-slate-100 px-4 py-4">
          {schedule.allocatedTasks.length > 0 ? (
            <ol className="space-y-3">
              {schedule.allocatedTasks.map(({ task }) => {
                const scheduledRange = getTaskDateTimeRange(task)
                return (
                  <li key={task.id} className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-bold text-slate-800">{task.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${getCompletionStatusClassName(task)}`}>
                        {task.completionState}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">From</span>
                        <p className="mt-1 text-xs font-bold text-slate-700">{formatDisplayDate(scheduledRange.from.date)}</p>
                        <p className="text-sm font-black text-slate-900">{scheduledRange.from.time}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">To</span>
                        <p className="mt-1 text-xs font-bold text-slate-700">{formatDisplayDate(scheduledRange.to.date)}</p>
                        <p className="text-sm font-black text-slate-900">{scheduledRange.to.time}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">No tasks are allocated on this date.</p>
          )}
        </div>
      </details>
      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--accent-strong)]">
          View Available Time
        </summary>
        <div className="border-t border-slate-100 px-4 py-4">
          {schedule.availableRanges.length > 0 ? (
            <ul className="space-y-3">
              {schedule.availableRanges.map((range) => {
                const availableRange = getDailyRangeDateTime(dateKey, range)
                return (
                  <li key={`${range.startMinutes}-${range.endMinutes}`} className="rounded-xl bg-[var(--accent-soft)] px-3 py-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent-strong)]">From</span>
                        <p className="mt-1 text-xs font-bold text-slate-700">{formatDisplayDate(availableRange.from.date)}</p>
                        <p className="text-sm font-black text-slate-900">{availableRange.from.time}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent-strong)]">To</span>
                        <p className="mt-1 text-xs font-bold text-slate-700">{formatDisplayDate(availableRange.to.date)}</p>
                        <p className="text-sm font-black text-slate-900">{availableRange.to.time}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No free time remains in this 24-hour day.</p>
          )}
          <p className="mt-3 text-xs text-slate-500">Enter any start and end time within a free range above.</p>
        </div>
      </details>
      {conflictingTasks.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
          <p className="text-sm font-black text-amber-900">This time overlaps with:</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {conflictingTasks.map((conflictingTask) => (
              <li key={conflictingTask.id}><span className="font-bold">{conflictingTask.title}</span> — {formatTaskTiming(conflictingTask)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">You can continue, but saving will require confirmation.</p>
        </div>
      )}
    </section>
  )
}

interface DateTimeValue {
  date: string
  time: string
}

interface DateTimeRange {
  from: DateTimeValue
  to: DateTimeValue
}

function getTaskDateTimeRange(task: Task): DateTimeRange {
  const derivedEndTime = deriveEndTime(task.startTime, task.plannedMinutes)
  const taskDate = fromLocalDateKey(task.date)
  const endDate = derivedEndTime && taskDate
    ? toLocalDateKey(addLocalDays(taskDate, derivedEndTime.dayOffset))
    : task.date

  return {
    from: { date: task.date, time: task.startTime },
    to: { date: endDate, time: derivedEndTime?.endTime ?? task.startTime },
  }
}

function getDailyRangeDateTime(dateKey: string, range: DailyTimeRange): DateTimeRange {
  const selectedDate = fromLocalDateKey(dateKey)
  const endsOnNextDay = range.endMinutes === MINUTES_PER_DAY
  const endDate = selectedDate && endsOnNextDay
    ? toLocalDateKey(addLocalDays(selectedDate, 1))
    : dateKey

  return {
    from: { date: dateKey, time: formatDayMinute(range.startMinutes) },
    to: { date: endDate, time: endsOnNextDay ? '00:00' : formatDayMinute(range.endMinutes) },
  }
}

function formatDisplayDate(dateKey: string): string {
  const date = fromLocalDateKey(dateKey)
  return date
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : dateKey
}

function getCompletionStatusClassName(task: Task): string {
  if (task.completionState === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (task.completionState === 'partial') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-200 text-slate-600'
}
