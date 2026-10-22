import type { CompletionEvent, Task } from '../../types/planner'
import { completionDatesFromEvents, getCurrentStreak, getTaskTotals } from '../../utils/taskMetrics'
import { Icon } from '../ui/Icon'

interface DashboardStatsProps {
  tasks: Task[]
  availableHours: number
  activityDates: string[]
  completionEvents: CompletionEvent[]
}

export function DashboardStats({ tasks, availableHours, activityDates, completionEvents }: DashboardStatsProps) {
  const totals = getTaskTotals(tasks)
  const progressPercentage = totals.maxPoints ? Math.round((totals.earnedPoints / totals.maxPoints) * 100) : 0
  const scheduledHours = totals.plannedMinutes / 60
  const activityStreak = getCurrentStreak(activityDates)
  const completionStreak = getCurrentStreak(completionDatesFromEvents(completionEvents))

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Daily overview">
      <StatCard label="Available" value={`${availableHours}h`} detail={`${scheduledHours.toFixed(1)}h estimated`} icon="clock" />
      <StatCard label="Progress" value={`${progressPercentage}%`} detail={`${totals.earnedPoints.toFixed(2)} of ${totals.maxPoints.toFixed(2)} pts`} icon="check" />
      <StatCard label="Activity streak" value={`${activityStreak} ${activityStreak === 1 ? 'day' : 'days'}`} detail="Plan actions" icon="flame" />
      <StatCard label="Completion streak" value={`${completionStreak} ${completionStreak === 1 ? 'day' : 'days'}`} detail="Fully completed tasks" icon="flame" />
    </section>
  )
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: 'clock' | 'check' | 'flame' }) {
  return <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Icon name={icon} className="size-4" /></span>{label}</div><div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</div><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div>
}
