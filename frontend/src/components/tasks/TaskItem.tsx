import type { FormEvent } from 'react'
import type { Task } from '../../types/planner'
import { getEarnedPoints, getMaxPoints, getTaskProgress } from '../../utils/taskMetrics'
import { Icon } from '../ui/Icon'

interface TaskItemProps {
  task: Task
  onEdit: () => void
  onDelete: () => void
  onToggleImportant: () => void
  onComplete: () => void
  onReopen: () => void
  onSetPartialProgress: (minutes: number) => void
}

export function TaskItem({ task, onEdit, onDelete, onToggleImportant, onComplete, onReopen, onSetPartialProgress }: TaskItemProps) {
  const maximumPoints = getMaxPoints(task.plannedMinutes)
  const earnedPoints = getEarnedPoints(task.actualCompletedMinutes, task.plannedMinutes)
  const progressPercentage = getTaskProgress(task.actualCompletedMinutes, task.plannedMinutes) * 100

  const savePartialProgress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const completedMinutes = Number(formData.get('completedMinutes'))
    if (completedMinutes > 0 && completedMinutes < task.plannedMinutes) onSetPartialProgress(completedMinutes)
  }

  return (
    <article className="task-card">
      <div className="flex min-w-0 flex-1 gap-3">
        <button type="button" className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition ${task.completionState === 'completed' ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-slate-300 text-transparent hover:border-[var(--accent)]'}`} onClick={task.completionState === 'completed' ? onReopen : onComplete} aria-label={task.completionState === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}><Icon name="check" className="size-4" /></button>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start gap-2"><h4 className={`font-bold text-slate-900 ${task.completionState === 'completed' ? 'text-slate-400 line-through' : ''}`}>{task.title}</h4>{task.important && <span className="mt-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Important</span>}</div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500"><span>{task.startTime}</span><span>{formatDuration(task.plannedMinutes)} estimated</span><span className="capitalize">{task.completionState}</span><span>{earnedPoints.toFixed(2)} / {maximumPoints.toFixed(2)} pts</span>{task.reminder.enabled && <span>Reminder {task.reminder.minutesBefore}m before</span>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progressPercentage}%` }} /></div>{task.completionState !== 'completed' && task.plannedMinutes > 1 && <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={savePartialProgress}><label className="text-xs font-semibold text-slate-500" htmlFor={`progress-${task.id}`}>Partial progress</label><input id={`progress-${task.id}`} name="completedMinutes" className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]" type="number" min="1" max={task.plannedMinutes - 1} defaultValue={task.completionState === 'partial' ? task.actualCompletedMinutes : ''} placeholder="min" required /><button type="submit" className="rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-strong)]">Save progress</button></form>}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1"><button type="button" className={`icon-button ${task.important ? 'text-amber-500' : ''}`} onClick={onToggleImportant} aria-label={task.important ? `Remove important from ${task.title}` : `Mark ${task.title} important`}><Icon name="star" className={`size-4 ${task.important ? 'fill-current' : ''}`} /></button><button type="button" className="icon-button" onClick={onEdit} aria-label={`Edit ${task.title}`}><Icon name="edit" className="size-4" /></button><button type="button" className="icon-button hover:text-red-600" onClick={onDelete} aria-label={`Delete ${task.title}`}><Icon name="trash" className="size-4" /></button></div>
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
