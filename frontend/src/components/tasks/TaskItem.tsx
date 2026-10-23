import { useEffect, useId, useState } from 'react'
import type { Task } from '../../types/planner'
import { getEarnedPoints, getMaxPoints, getTaskProgress } from '../../utils/taskMetrics'
import { canRescheduleTask, getTaskScheduleTimestamps, hasTaskScheduledEndPassed } from '../../utils/taskTime'
import { Icon } from '../ui/Icon'

interface TaskItemProps {
  task: Task
  onEdit: () => void
  onDelete: () => void
  onToggleImportant: () => void
  onComplete: () => void
  onPartial: () => void
  onMarkIncomplete: () => void
  onReopen: () => void
  onReschedule: () => void
  showAsOutcome?: boolean
}

export function TaskItem({
  task,
  onEdit,
  onDelete,
  onToggleImportant,
  onComplete,
  onPartial,
  onMarkIncomplete,
  onReopen,
  onReschedule,
  showAsOutcome = false,
}: TaskItemProps) {
  const partialRuleDescriptionId = useId()
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [partialTooltipVisible, setPartialTooltipVisible] = useState(false)
  const maximumPoints = getMaxPoints(task.plannedMinutes)
  const earnedPoints = getEarnedPoints(task.actualCompletedMinutes, task.plannedMinutes)
  const progressPercentage = getTaskProgress(task.actualCompletedMinutes, task.plannedMinutes) * 100
  const isOutcome = task.completionState === 'completed' || task.completionState === 'incomplete'
  const displayAsOutcome = isOutcome || showAsOutcome
  const reschedulingAllowed = canRescheduleTask(task.date, task.startTime, currentTime)
  const scheduledEndPassed = !isOutcome && hasTaskScheduledEndPassed(task.date, task.startTime, task.plannedMinutes, currentTime)

  useEffect(() => {
    const scheduleTimestamps = getTaskScheduleTimestamps(task.date, task.startTime, task.plannedMinutes)
    if (!scheduleTimestamps) return

    const currentTimestamp = Date.now()
    const nextTransition = [scheduleTimestamps.rescheduleCutoff, scheduleTimestamps.scheduledEnd]
      .filter((timestamp) => timestamp > currentTimestamp)
      .sort((firstTimestamp, secondTimestamp) => firstTimestamp - secondTimestamp)[0]
    const refreshTiming = () => setCurrentTime(new Date())
    const timeoutId = nextTransition === undefined
      ? undefined
      : window.setTimeout(refreshTiming, Math.min(nextTransition - currentTimestamp + 50, 2_147_000_000))
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshTiming()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [currentTime, task.date, task.plannedMinutes, task.startTime])

  if (displayAsOutcome) {
    return (
      <article className="task-card items-center justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`font-bold text-slate-900 ${task.completionState === 'completed' ? 'text-slate-400 line-through' : ''}`}>{task.title}</h4>
            {task.completionState === 'partial' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">Partially Completed</span>}
          </div>
          <p className="mt-1 text-xs font-semibold capitalize text-slate-500">{task.completionState} · {earnedPoints.toFixed(2)} / {maximumPoints.toFixed(2)} pts</p>
        </div>
        <button type="button" className="shrink-0 rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-strong)]" onClick={onReopen}>Correct status</button>
      </article>
    )
  }

  return (
    <article className={`task-card ${scheduledEndPassed ? 'border-amber-400! ring-1 ring-amber-300/70 hover:border-amber-400!' : ''}`} style={scheduledEndPassed ? { backgroundColor: '#ffedd5' } : undefined} data-time-passed={scheduledEndPassed ? 'true' : 'false'}>
      <button type="button" className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 bg-white text-transparent transition focus-visible:text-transparent ${scheduledEndPassed ? 'border-amber-600 hover:border-amber-700' : 'border-slate-300 hover:border-[var(--accent)]'}`} onClick={onComplete} aria-label={`Complete ${task.title}`}><Icon name="check" className="size-4" /></button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-2">
          <h4 className="font-bold text-slate-900">{task.title}</h4>
          {task.important && <span className="mt-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Important</span>}
          {scheduledEndPassed && <span className="mt-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Time passed</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
          <span className="font-bold text-slate-600">Start: {task.startTime}</span>
          <span>{formatDuration(task.plannedMinutes)} estimated</span>
          <span className="capitalize">{task.completionState}</span>
          <span>{earnedPoints.toFixed(2)} / {maximumPoints.toFixed(2)} pts</span>
          {task.reminder.enabled && <span>Reminder {task.reminder.minutesBefore}m before</span>}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progressPercentage}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="relative inline-flex" onMouseEnter={() => setPartialTooltipVisible(true)} onMouseLeave={() => setPartialTooltipVisible(false)}>
            <button type="button" className={`rounded-lg px-3 py-1.5 text-xs font-bold ${task.completionState === 'partial' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'}`} onClick={() => {
              setPartialTooltipVisible(false)
              onPartial()
            }} aria-describedby={partialRuleDescriptionId}>Partial</button>
            <span id={partialRuleDescriptionId} role="tooltip" className={`${partialTooltipVisible ? 'visible opacity-100' : 'invisible opacity-0'} absolute bottom-full left-0 z-20 mb-2 w-48 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg transition`}>Partial means half of the planned work (50%).</span>
          </span>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-red-200 hover:text-red-700" onClick={onMarkIncomplete}>Incomplete</button>
          {reschedulingAllowed && <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[var(--accent)] hover:text-[var(--accent-strong)]" onClick={onReschedule}>Reschedule</button>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" className={`icon-button ${task.important ? 'text-amber-500' : ''}`} onClick={onToggleImportant} aria-label={task.important ? `Remove important from ${task.title}` : `Mark ${task.title} important`}><Icon name="star" className={`size-4 ${task.important ? 'fill-current' : ''}`} /></button>
        <button type="button" className="icon-button" onClick={onEdit} aria-label={`Edit ${task.title}`}><Icon name="edit" className="size-4" /></button>
        <button type="button" className="icon-button hover:text-red-600" onClick={onDelete} aria-label={`Delete ${task.title}`}><Icon name="trash" className="size-4" /></button>
      </div>
    </article>
  )
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
