import { useEffect, useState } from 'react'
import type { CompletionEvent, Task } from '../../types/planner'
import { weekdaySlogans } from '../../data/slogans'
import { formatLongDate, fromLocalDateKey } from '../../utils/dates'
import {
  getTaskScheduleTimestamps,
  getTimingBoundaryDelay,
  hasTaskScheduledEndPassed,
} from '../../utils/taskTime'
import { DashboardStats } from './DashboardStats'
import { TaskItem } from '../tasks/TaskItem'
import type { TaskActionCallbacks } from '../tasks/TaskItem'
import { Icon } from '../ui/Icon'

interface TodayViewProps extends TaskActionCallbacks {
  dateKey: string
  tasks: Task[]
  availableHours: number
  activityDates: string[]
  completionEvents: CompletionEvent[]
  onAdd: () => void
  onOpenCalendar: () => void
  onOpenReview: () => void
}

export function TodayView(props: TodayViewProps) {
  const [completedSectionOpen, setCompletedSectionOpen] = useState(true)
  const [incompleteSectionOpen, setIncompleteSectionOpen] = useState(true)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const selectedDate = fromLocalDateKey(props.dateKey) ?? fromLocalDateKey('2000-01-01')!
  const partialTaskHasEnded = (task: Task) => (
    task.completionState === 'partial' &&
    hasTaskScheduledEndPassed(task.date, task.startTime, task.plannedMinutes, currentTime)
  )

  // Partial tasks retain their 50% outcome but move to the Completed section after their scheduled end.
  const activeTasks = props.tasks.filter((task) => (
    task.completionState === 'pending' ||
    (task.completionState === 'partial' && !partialTaskHasEnded(task))
  ))
  const completedTasks = props.tasks.filter((task) => (
    task.completionState === 'completed' || partialTaskHasEnded(task)
  ))
  const incompleteTasks = props.tasks.filter((task) => task.completionState === 'incomplete')
  const categories = [...new Set(activeTasks.map((task) => task.category))]

  useEffect(() => {
    const currentTimestamp = Date.now()
    const partialTaskEndTimestamps = props.tasks
      .filter((task) => task.completionState === 'partial')
      .flatMap((task) => {
        const timestamps = getTaskScheduleTimestamps(task.date, task.startTime, task.plannedMinutes)
        return timestamps ? [timestamps.scheduledEnd] : []
      })
    const refreshDelay = getTimingBoundaryDelay(partialTaskEndTimestamps, currentTimestamp)
    const refreshTime = () => setCurrentTime(new Date())
    const timeoutId = refreshDelay === null
      ? undefined
      : window.setTimeout(refreshTime, refreshDelay)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshTime()
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [currentTime, props.tasks])

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
              {formatLongDate(props.dateKey)}
            </p>
            <button
              type="button"
              className="icon-button text-[var(--accent-strong)]"
              onClick={props.onOpenCalendar}
              aria-label="Open calendar"
            >
              <Icon name="calendar" className="size-5" />
            </button>
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            Make today count.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-500">
            {weekdaySlogans[selectedDate.getDay()]}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="button-secondary" onClick={props.onOpenReview}>
            Review plan
          </button>
          <button type="button" className="button-primary hidden sm:flex" onClick={props.onAdd}>
            <Icon name="plus" className="size-4" />
            Add task
          </button>
        </div>
      </header>

      <DashboardStats
        tasks={props.tasks}
        availableHours={props.availableHours}
        activityDates={props.activityDates}
        completionEvents={props.completionEvents}
      />

      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Today’s tasks</h2>
          <p className="mt-1 text-sm text-slate-500">{activeTasks.length} left to shape your day</p>
        </div>
        {activeTasks.length === 0 ? (
          <EmptyTasks onAdd={props.onAdd} />
        ) : (
          <div className="space-y-6">
            {categories.map((category) => (
              <section key={category}>
                <h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  {category}
                </h3>
                <div className="space-y-2">
                  {activeTasks
                    .filter((task) => task.category === category)
                    .toSorted(sortTasks)
                    .map((task) => (
                      <TaskItem key={task.id} task={task} actions={props} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <OutcomeSection
        title="Completed"
        tasks={completedTasks}
        open={completedSectionOpen}
        onToggle={() => setCompletedSectionOpen((open) => !open)}
        taskActions={props}
      />
      <OutcomeSection
        title="Incomplete"
        tasks={incompleteTasks}
        open={incompleteSectionOpen}
        onToggle={() => setIncompleteSectionOpen((open) => !open)}
        taskActions={props}
      />
    </div>
  )
}

interface OutcomeSectionProps {
  title: string
  tasks: Task[]
  open: boolean
  onToggle: () => void
  taskActions: TaskActionCallbacks
}

function OutcomeSection({ title, tasks, open, onToggle, taskActions }: OutcomeSectionProps) {
  if (tasks.length === 0) return null

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/55 p-4 sm:p-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>
          <span className="text-lg font-black text-slate-800">{title}</span>
          <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent-strong)]">
            {tasks.length}
          </span>
        </span>
        <span className="text-sm font-semibold text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-2">
          {tasks.toSorted(sortTasks).map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              actions={taskActions}
              showAsOutcome
            />
          ))}
        </div>
      )}
    </section>
  )
}

function sortTasks(firstTask: Task, secondTask: Task) {
  if (firstTask.important !== secondTask.important) return firstTask.important ? -1 : 1
  return firstTask.startTime.localeCompare(secondTask.startTime)
}

function EmptyTasks({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--accent)]/40 bg-white/60 px-6 py-12 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
        <Icon name="check" className="size-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-800">Your day has room to breathe</h3>
      <p className="mt-1 text-sm text-slate-500">Add what matters, and leave space for life.</p>
      <button type="button" className="button-primary mx-auto mt-5" onClick={onAdd}>
        <Icon name="plus" className="size-4" />
        Add your first task
      </button>
    </div>
  )
}
