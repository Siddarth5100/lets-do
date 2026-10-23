import type { Task } from '../../types/planner'
import { formatLongDate } from '../../utils/dates'
import {
  formatDailyTimeRange,
  formatTaskTiming,
  getDailyScheduleTotals,
  getDailyTaskSchedule,
} from '../../utils/taskValidation'
import { TaskItem } from '../tasks/TaskItem'
import { DatePicker } from '../ui/DatePicker'
import { Icon } from '../ui/Icon'

interface ReviewPlanViewProps {
  selectedDate: string
  today: string
  tasks: Task[]
  onSelectDate: (dateKey: string) => void
  onBackToToday: () => void
  onConfirmReview: () => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onToggleImportant: (task: Task) => void
  onComplete: (task: Task) => void
  onPartial: (task: Task) => void
  onMarkIncomplete: (task: Task) => void
  onReopen: (task: Task) => void
  onReschedule: (task: Task) => void
}

export function ReviewPlanView({
  selectedDate,
  today,
  tasks,
  onSelectDate,
  onBackToToday,
  onConfirmReview,
  onEdit,
  onDelete,
  onToggleImportant,
  onComplete,
  onPartial,
  onMarkIncomplete,
  onReopen,
  onReschedule,
}: ReviewPlanViewProps) {
  const schedule = getDailyTaskSchedule(selectedDate, tasks)
  const totals = getDailyScheduleTotals(schedule)
  const reviewingToday = selectedDate === today

  return (
    <div className="space-y-7">
      <header>
        <button type="button" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent-strong)]" onClick={onBackToToday}>
          <Icon name="chevron-left" className="size-4" />Back to Today
        </button>
        <p className="section-kicker">Reflect and adjust</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">Review Plan</h1>
            <p className="page-subtitle">Check the shape of the day, update progress, and make space where you need it.</p>
          </div>
          {reviewingToday && <button type="button" className="button-primary shrink-0" onClick={onConfirmReview}><Icon name="check" className="size-4" />Confirm Review</button>}
        </div>
      </header>

      <section className="panel relative z-20 p-5 sm:p-6">
        <div className="max-w-sm"><DatePicker label="Review date" value={selectedDate} onChange={onSelectDate} displayMode="popover" closeOnOutsideClick /></div>
        {!reviewingToday && <p className="mt-3 text-sm text-slate-500">Only today’s plan can be confirmed for the activity streak.</p>}
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Selected day schedule summary">
        <ReviewSummaryCard label="Allocated" value={formatHours(totals.allocatedMinutes)} detail="Overlapping time counted once" />
        <ReviewSummaryCard label="Available" value={formatHours(totals.availableMinutes)} detail="Free within this 24-hour day" />
        <ReviewSummaryCard label="Scheduled tasks" value={String(schedule.allocatedTasks.length)} detail="Includes completed tasks" />
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-wider text-[var(--accent-strong)]">Scheduled plan</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{formatLongDate(selectedDate)}</h2>
        </div>
        {schedule.allocatedTasks.length > 0 ? (
          <ol className="space-y-3">
            {schedule.allocatedTasks.map(({ task }) => (
              <li key={task.id}>
                <p className="mb-1.5 px-1 text-xs font-bold text-slate-500">{formatTaskTiming(task)}</p>
                <TaskItem
                  task={task}
                  onEdit={() => onEdit(task)}
                  onDelete={() => onDelete(task)}
                  onToggleImportant={() => onToggleImportant(task)}
                  onComplete={() => onComplete(task)}
                  onPartial={() => onPartial(task)}
                  onMarkIncomplete={() => onMarkIncomplete(task)}
                  onReopen={() => onReopen(task)}
                  onReschedule={() => onReschedule(task)}
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="panel px-6 py-10 text-center">
            <p className="font-bold text-slate-700">No tasks intersect this date</p>
            <p className="mt-1 text-sm text-slate-500">The full 24-hour day is currently available.</p>
          </div>
        )}
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-xl font-black text-slate-900">Available time</h2>
        {schedule.availableRanges.length > 0 ? (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {schedule.availableRanges.map((range) => (
              <li key={`${range.startMinutes}-${range.endMinutes}`} className="rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm font-bold text-[var(--accent-strong)]">
                {formatDailyTimeRange(range)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No free time remains in this 24-hour day.</p>
        )}
      </section>
    </div>
  )
}

function ReviewSummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div>
}

function formatHours(totalMinutes: number): string {
  const hours = totalMinutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(2)}h`
}
