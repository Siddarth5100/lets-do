import { useEffect, useState } from 'react'
import type { CompletionEvent, Task } from '../../types/planner'
import { formatDigitalClock, formatRemainingTime, getSecondsUntilLocalMidnight } from '../../utils/liveTime'
import { completionDatesFromEvents, getCurrentStreak, getTaskTotals } from '../../utils/taskMetrics'
import { Icon } from '../ui/Icon'

interface DashboardStatsProps {
  tasks: Task[]
  availableHours: number
  activityDates: string[]
  completionEvents: CompletionEvent[]
}

export function DashboardStats({ tasks, availableHours, activityDates, completionEvents }: DashboardStatsProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const totals = getTaskTotals(tasks)
  const progressPercentage = totals.maxPoints ? Math.round((totals.earnedPoints / totals.maxPoints) * 100) : 0
  const scheduledHours = totals.plannedMinutes / 60
  const activityStreak = getCurrentStreak(activityDates)
  const completionStreak = getCurrentStreak(completionDatesFromEvents(completionEvents))
  const timeRemaining = formatRemainingTime(getSecondsUntilLocalMidnight(currentTime))

  useEffect(() => {
    const clockInterval = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(clockInterval)
  }, [])

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Daily overview">
      <TimeRemainingCard
        timeRemaining={timeRemaining}
        currentTime={currentTime}
        detail={`${availableHours}h daily capacity · ${scheduledHours.toFixed(1)}h estimated`}
      />
      <StatCard label="Progress" value={`${progressPercentage}%`} detail={`${totals.earnedPoints.toFixed(2)} of ${totals.maxPoints.toFixed(2)} pts`} icon="check" />
      <StatCard label="Activity streak" value={`${activityStreak} ${activityStreak === 1 ? 'day' : 'days'}`} detail="Plan actions" icon="flame" />
      <StatCard label="Completion streak" value={`${completionStreak} ${completionStreak === 1 ? 'day' : 'days'}`} detail="Fully completed tasks" icon="flame" />
    </section>
  )
}

function TimeRemainingCard({ timeRemaining, currentTime, detail }: { timeRemaining: string; currentTime: Date; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <Icon name="clock" className="size-4" />
        </span>
        Time
      </div>
      <div className="mt-2 grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3">
        <AnalogClock currentTime={currentTime} />
        <div className="min-w-0 text-right">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Pending time</p>
          <p className="mt-1 whitespace-nowrap text-xl font-black tracking-tight text-slate-900 tabular-nums">{timeRemaining}</p>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function AnalogClock({ currentTime }: { currentTime: Date }) {
  const seconds = currentTime.getSeconds()
  const minutes = currentTime.getMinutes()
  const hours = currentTime.getHours() % 12
  const secondHandAngle = seconds * 6
  const minuteHandAngle = minutes * 6 + seconds * 0.1
  const hourHandAngle = hours * 30 + minutes * 0.5 + seconds / 120
  const accessibleTime = formatDigitalClock(currentTime)

  return (
    <svg
      viewBox="0 0 64 64"
      className="size-16 shrink-0"
      role="img"
      aria-label={`Current local time: ${accessibleTime}`}
    >
      <circle cx="32" cy="32" r="29" className="fill-white/80 stroke-slate-200" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, hourMarker) => (
        <line
          key={hourMarker}
          x1="32"
          y1="6"
          x2="32"
          y2={hourMarker % 3 === 0 ? 11 : 9}
          className="stroke-slate-400"
          strokeWidth={hourMarker % 3 === 0 ? 2 : 1.25}
          strokeLinecap="round"
          transform={`rotate(${hourMarker * 30} 32 32)`}
        />
      ))}
      <line x1="32" y1="34" x2="32" y2="19" className="stroke-slate-800" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${hourHandAngle} 32 32)`} />
      <line x1="32" y1="35" x2="32" y2="13" className="stroke-slate-600" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${minuteHandAngle} 32 32)`} />
      <line x1="32" y1="37" x2="32" y2="10" className="stroke-[var(--accent-strong)]" strokeWidth="1.25" strokeLinecap="round" transform={`rotate(${secondHandAngle} 32 32)`} />
      <circle cx="32" cy="32" r="2.5" className="fill-[var(--accent-strong)]" />
    </svg>
  )
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: 'clock' | 'check' | 'flame' }) {
  return <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Icon name={icon} className="size-4" /></span>{label}</div><div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{value}</div><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div>
}
