import { useState } from 'react'
import type { CompletionEvent, Task } from '../../types/planner'
import { weekdaySlogans } from '../../data/slogans'
import { formatLongDate, fromLocalDateKey } from '../../utils/dates'
import { DashboardStats } from './DashboardStats'
import { TaskItem } from '../tasks/TaskItem'
import { Icon } from '../ui/Icon'

interface TodayViewProps {
  dateKey: string
  tasks: Task[]
  availableHours: number
  activityDates: string[]
  completionEvents: CompletionEvent[]
  onAdd: () => void
  onOpenCalendar: () => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onToggleImportant: (task: Task) => void
  onComplete: (task: Task) => void
  onReopen: (task: Task) => void
  onSetPartialProgress: (task: Task, minutes: number) => void
  onOpenReview: () => void
}

export function TodayView(props: TodayViewProps) {
  const [completedOpen, setCompletedOpen] = useState(true)
  const selectedDate = fromLocalDateKey(props.dateKey) ?? fromLocalDateKey('2000-01-01')!
  const activeTasks = props.tasks.filter((task) => task.completionState !== 'completed')
  const completedTasks = props.tasks.filter((task) => task.completionState === 'completed')
  const categories = [...new Set(activeTasks.map((task) => task.category))]

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">{formatLongDate(props.dateKey)}</p><button type="button" className="icon-button text-[var(--accent-strong)]" onClick={props.onOpenCalendar} aria-label="Open calendar"><Icon name="calendar" className="size-5" /></button></div><h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Make today count.</h1><p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-500">{weekdaySlogans[selectedDate.getDay()]}</p></div>
        <div className="flex gap-2"><button type="button" className="button-secondary" onClick={props.onOpenReview}>Review plan</button><button type="button" className="button-primary hidden sm:flex" onClick={props.onAdd}><Icon name="plus" className="size-4" />Add task</button></div>
      </header>

      <DashboardStats tasks={props.tasks} availableHours={props.availableHours} activityDates={props.activityDates} completionEvents={props.completionEvents} />

      <section>
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-2xl font-black tracking-tight text-slate-900">Today’s tasks</h2><p className="mt-1 text-sm text-slate-500">{activeTasks.length} left to shape your day</p></div></div>
        {activeTasks.length === 0 ? <EmptyTasks onAdd={props.onAdd} /> : <div className="space-y-6">{categories.map((category) => <section key={category}><h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">{category}</h3><div className="space-y-2">{activeTasks.filter((task) => task.category === category).sort(sortTasks).map((task) => <TaskItem key={task.id} task={task} onEdit={() => props.onEdit(task)} onDelete={() => props.onDelete(task)} onToggleImportant={() => props.onToggleImportant(task)} onComplete={() => props.onComplete(task)} onReopen={() => props.onReopen(task)} onSetPartialProgress={(minutes) => props.onSetPartialProgress(task, minutes)} />)}</div></section>)}</div>}
      </section>

      {completedTasks.length > 0 && <section className="rounded-3xl border border-slate-200/80 bg-white/55 p-4 sm:p-5"><button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setCompletedOpen(!completedOpen)} aria-expanded={completedOpen}><span><span className="text-lg font-black text-slate-800">Completed</span><span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent-strong)]">{completedTasks.length}</span></span><span className="text-sm font-semibold text-slate-500">{completedOpen ? 'Hide' : 'Show'}</span></button>{completedOpen && <div className="mt-4 space-y-2">{completedTasks.sort(sortTasks).map((task) => <TaskItem key={task.id} task={task} onEdit={() => props.onEdit(task)} onDelete={() => props.onDelete(task)} onToggleImportant={() => props.onToggleImportant(task)} onComplete={() => props.onComplete(task)} onReopen={() => props.onReopen(task)} onSetPartialProgress={(minutes) => props.onSetPartialProgress(task, minutes)} />)}</div>}</section>}
    </div>
  )
}

function sortTasks(firstTask: Task, secondTask: Task) {
  if (firstTask.important !== secondTask.important) return firstTask.important ? -1 : 1
  return firstTask.startTime.localeCompare(secondTask.startTime)
}

function EmptyTasks({ onAdd }: { onAdd: () => void }) {
  return <div className="rounded-3xl border border-dashed border-[var(--accent)]/40 bg-white/60 px-6 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Icon name="check" className="size-6" /></div><h3 className="mt-4 text-lg font-bold text-slate-800">Your day has room to breathe</h3><p className="mt-1 text-sm text-slate-500">Add what matters, and leave space for life.</p><button type="button" className="button-primary mx-auto mt-5" onClick={onAdd}><Icon name="plus" className="size-4" />Add your first task</button></div>
}
