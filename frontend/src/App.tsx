import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { CalendarView } from './components/calendar/CalendarView'
import { TodayView } from './components/dashboard/TodayView'
import { BottomNavigation, DesktopNavigation } from './components/layout/Navigation'
import { ReviewPlanView } from './components/review/ReviewPlanView'
import { SettingsView } from './components/settings/SettingsView'
import { TaskForm } from './components/tasks/TaskForm'
import { Modal } from './components/ui/Modal'
import { getTheme, weekdayThemes } from './data/themes'
import { defaultTaskCategories } from './data/categories'
import { usePlanner } from './hooks/usePlanner'
import type { Task, TaskDraft, ViewName } from './types/planner'
import { getCurrentDate, toLocalDateKey } from './utils/dates'
import { loadNavigationState, saveNavigationState } from './utils/storage'
import { getPartialCompletedMinutes } from './utils/taskMetrics'
import { canRescheduleTask } from './utils/taskTime'
import { findOverlappingTasks, findSameDayDuplicateTasks, formatTaskTiming } from './utils/taskValidation'

interface PendingTaskSave {
  draft: TaskDraft
  taskId: string | null
  duplicateNames: string[]
  overlappingTasks: Task[]
}

type TaskFormMode = 'add' | 'edit' | 'reschedule'

export default function App() {
  const planner = usePlanner()
  const [currentDate] = useState(getCurrentDate)
  const today = toLocalDateKey(currentDate)
  const [navigationState, setNavigationState] = useState(() => {
    if (typeof window === 'undefined') return { activeView: 'today' as ViewName, selectedDate: today }
    return loadNavigationState(window.sessionStorage, today)
  })
  const { activeView, selectedDate } = navigationState
  const [formDate, setFormDate] = useState(today)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskFormMode, setTaskFormMode] = useState<TaskFormMode>('add')
  const [formOpen, setFormOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [pendingIncompleteTask, setPendingIncompleteTask] = useState<Task | null>(null)
  const [rescheduleUnavailableTask, setRescheduleUnavailableTask] = useState<Task | null>(null)
  const [pendingTaskSave, setPendingTaskSave] = useState<PendingTaskSave | null>(null)
  const [pendingReopenTask, setPendingReopenTask] = useState<Task | null>(null)
  const [reviewMessage, setReviewMessage] = useState(false)
  const automaticTheme = weekdayThemes[currentDate.getDay()]
  const theme = getTheme(planner.state.settings.manualThemeId, currentDate.getDay())
  const themeStyle = {
    '--accent': theme.accent,
    '--accent-strong': theme.accentStrong,
    '--accent-soft': theme.accentSoft,
    '--page': theme.page,
    '--glow': theme.glow,
  } as CSSProperties

  useEffect(() => {
    saveNavigationState(window.sessionStorage, navigationState)
  }, [navigationState])

  const setActiveView = (activeView: ViewName) => {
    setNavigationState((current) => ({ ...current, activeView }))
  }

  const setSelectedDate = (selectedDate: string) => {
    setNavigationState((current) => ({ ...current, selectedDate }))
  }

  const openAdd = (date = today) => {
    setFormDate(date)
    setEditingTask(null)
    setTaskFormMode('add')
    setFormOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setFormDate(task.date)
    setTaskFormMode('edit')
    setFormOpen(true)
  }

  const closeTaskForm = () => {
    setFormOpen(false)
    setEditingTask(null)
    setTaskFormMode('add')
  }

  const requestTaskReschedule = (task: Task) => {
    if (!canRescheduleTask(task.date, task.startTime)) {
      setRescheduleUnavailableTask(task)
      return
    }
    setEditingTask(task)
    setFormDate(task.date)
    setTaskFormMode('reschedule')
    setFormOpen(true)
  }

  const rescheduleStillAllowed = (taskId: string | null): boolean => {
    if (taskFormMode !== 'reschedule' || !taskId) return true
    const originalTask = planner.state.tasks.find((task) => task.id === taskId)
    if (originalTask && canRescheduleTask(originalTask.date, originalTask.startTime)) return true
    if (originalTask) setRescheduleUnavailableTask(originalTask)
    closeTaskForm()
    return false
  }

  const persistTask = (draft: TaskDraft, taskId: string | null) => {
    if (!rescheduleStillAllowed(taskId)) {
      setPendingTaskSave(null)
      return
    }
    if (taskId) planner.updateTask(taskId, draft)
    else planner.addTask(draft)
    setPendingTaskSave(null)
    closeTaskForm()
  }

  const saveTask = (draft: TaskDraft) => {
    const taskId = editingTask?.id ?? null
    if (!rescheduleStillAllowed(taskId)) return
    const draftToSave = taskFormMode === 'reschedule' && editingTask?.completionState === 'partial'
      ? { ...draft, actualCompletedMinutes: getPartialCompletedMinutes(draft.plannedMinutes) }
      : draft
    const duplicateNames = findSameDayDuplicateTasks(draftToSave, planner.state.tasks, taskId ?? undefined).map((task) => task.title)
    const overlappingTasks = findOverlappingTasks(draftToSave, planner.state.tasks, taskId ?? undefined)
    if (duplicateNames.length || overlappingTasks.length) {
      setPendingTaskSave({ draft: draftToSave, taskId, duplicateNames, overlappingTasks })
      return
    }
    persistTask(draftToSave, taskId)
  }

  const confirmReview = () => {
    if (selectedDate !== toLocalDateKey(getCurrentDate())) return
    planner.reviewPlan()
    setReviewMessage(true)
    window.setTimeout(() => setReviewMessage(false), 2500)
  }

  const requestTaskReopen = (task: Task) => {
    const overlappingTasks = findOverlappingTasks({ ...task, actualCompletedMinutes: 0 }, planner.state.tasks, task.id)
    if (overlappingTasks.length > 0) {
      setPendingReopenTask(task)
      return
    }
    planner.reopenTask(task.id)
  }

  const todayTasks = planner.state.tasks.filter((task) => task.date === today)
  const availableCategories = [...defaultTaskCategories, ...planner.state.customCategories, ...planner.state.tasks.map((task) => task.category)].filter((category, index, categories) => categories.findIndex((existingCategory) => existingCategory.toLocaleLowerCase() === category.toLocaleLowerCase()) === index)
  const taskCallbacks = {
    onEdit: openEdit,
    onDelete: setDeletingTask,
    onToggleImportant: (task: Task) => planner.toggleImportant(task.id),
    onComplete: (task: Task) => planner.completeTask(task.id),
    onPartial: (task: Task) => planner.toggleTaskPartial(task.id),
    onMarkIncomplete: setPendingIncompleteTask,
    onReopen: requestTaskReopen,
    onReschedule: requestTaskReschedule,
  }

  return (
    <div className="min-h-screen bg-[var(--page)] text-slate-900 transition-colors duration-500" style={themeStyle}>
      <div className="pointer-events-none fixed -right-24 -top-32 size-96 rounded-full bg-[var(--glow)] opacity-55 blur-3xl" />
      <div className="relative flex min-h-screen">
        <DesktopNavigation activeView={activeView} sidebarCollapsed={planner.state.settings.sidebarCollapsed} onNavigate={setActiveView} onToggleSidebar={() => planner.updateSettings({ ...planner.state.settings, sidebarCollapsed: !planner.state.settings.sidebarCollapsed })} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-7 sm:px-7 lg:px-10 lg:pb-12 lg:pt-10 xl:px-14">
          <div className="mx-auto max-w-7xl">
            {planner.storageError && <p className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">Changes could not be saved to this browser. Check your storage settings or available space.</p>}
            {activeView === 'today' && <TodayView dateKey={today} tasks={todayTasks} availableHours={planner.state.settings.availableHours} activityDates={planner.state.activityDates} completionEvents={planner.state.completionEvents} onAdd={() => openAdd()} onOpenCalendar={() => setActiveView('calendar')} onOpenReview={() => setActiveView('review')} {...taskCallbacks} />}
            {activeView === 'calendar' && <CalendarView initialDate={today} tasks={planner.state.tasks} onAdd={openAdd} onBackToToday={() => setActiveView('today')} {...taskCallbacks} />}
            {activeView === 'review' && <ReviewPlanView selectedDate={selectedDate} today={today} tasks={planner.state.tasks} onSelectDate={setSelectedDate} onBackToToday={() => setActiveView('today')} onConfirmReview={confirmReview} {...taskCallbacks} />}
            {activeView === 'settings' && <SettingsView settings={planner.state.settings} automaticThemeId={automaticTheme.id} onSave={planner.updateSettings} onOpenReview={() => setActiveView('review')} />}
          </div>
        </main>
        <BottomNavigation activeView={activeView} onNavigate={setActiveView} onAdd={() => openAdd()} />
      </div>

      {formOpen && <Modal title={taskFormMode === 'reschedule' ? 'Reschedule task' : editingTask ? 'Edit task' : 'Add a task'} onClose={closeTaskForm}><TaskForm task={editingTask ?? undefined} defaultDate={formDate} tasks={planner.state.tasks} categories={availableCategories} onCreateCategory={planner.addCustomCategory} onSave={saveTask} onCancel={closeTaskForm} schedulingLocked={taskFormMode === 'edit'} /></Modal>}
      {pendingTaskSave && <Modal title="Review scheduling warnings" onClose={() => setPendingTaskSave(null)}><div className="space-y-5 p-6 sm:p-7"><p className="text-slate-600">You can still save this task, but please review the following first.</p>{pendingTaskSave.duplicateNames.length > 0 && <WarningList title="Duplicate task name" description="A task with the same normalized name already exists on this date." items={pendingTaskSave.duplicateNames} />}{pendingTaskSave.overlappingTasks.length > 0 && <WarningList title="Schedule overlap" description="This time overlaps with scheduled tasks." items={pendingTaskSave.overlappingTasks.map((task) => `${task.title} — ${formatTaskTiming(task)}`)} />}<div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className="button-secondary" onClick={() => setPendingTaskSave(null)}>Go back</button><button type="button" className="button-primary" onClick={() => persistTask(pendingTaskSave.draft, pendingTaskSave.taskId)}>Save anyway</button></div></div></Modal>}
      {pendingReopenTask && <Modal title="Review schedule overlap" onClose={() => setPendingReopenTask(null)}><div className="space-y-5 p-6 sm:p-7"><p className="text-slate-600">Reopening this task overlaps with the following scheduled tasks.</p><WarningList title="Schedule overlap" description="You can reopen it anyway or keep its current outcome." items={findOverlappingTasks({ ...pendingReopenTask, actualCompletedMinutes: 0 }, planner.state.tasks, pendingReopenTask.id).map((task) => `${task.title} — ${formatTaskTiming(task)}`)} /><div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className="button-secondary" onClick={() => setPendingReopenTask(null)}>Keep outcome</button><button type="button" className="button-primary" onClick={() => { planner.reopenTask(pendingReopenTask.id); setPendingReopenTask(null) }}>Reopen anyway</button></div></div></Modal>}
      {pendingIncompleteTask && <Modal title="Mark task incomplete?" onClose={() => setPendingIncompleteTask(null)}><div className="p-6 sm:p-7"><p className="text-slate-600">“{pendingIncompleteTask.title}” will move to Incomplete with zero progress and zero points.</p><div className="mt-6 flex justify-end gap-3"><button type="button" className="button-secondary" onClick={() => setPendingIncompleteTask(null)}>Go back</button><button type="button" className="rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:bg-red-700" onClick={() => { planner.markTaskIncomplete(pendingIncompleteTask.id); setPendingIncompleteTask(null) }}>Mark incomplete</button></div></div></Modal>}
      {rescheduleUnavailableTask && <Modal title="Rescheduling unavailable" onClose={() => setRescheduleUnavailableTask(null)}><div className="p-6 sm:p-7"><p className="text-slate-600">“{rescheduleUnavailableTask.title}” can no longer be rescheduled. Changes must be saved before the one-hour cutoff preceding its original start time.</p><div className="mt-6 flex justify-end"><button type="button" className="button-primary" onClick={() => setRescheduleUnavailableTask(null)}>Understood</button></div></div></Modal>}
      {deletingTask && <Modal title="Delete task?" onClose={() => setDeletingTask(null)}><div className="p-6 sm:p-7"><p className="text-slate-600">“{deletingTask.title}” will be removed from this browser. Its completion event will be removed and the completion streak recalculated. Genuine planning activity history will remain.</p><div className="mt-6 flex justify-end gap-3"><button type="button" className="button-secondary" onClick={() => setDeletingTask(null)}>Keep task</button><button type="button" className="rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:bg-red-700" onClick={() => { planner.deleteTask(deletingTask.id); setDeletingTask(null) }}>Delete</button></div></div></Modal>}
      {reviewMessage && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-xl lg:bottom-8" role="status">Plan reviewed — activity recorded.</div>}
    </div>
  )
}

function WarningList({ title, description, items }: { title: string; description: string; items: string[] }) {
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-black text-amber-900">{title}</h3><p className="mt-1 text-sm text-amber-800">{description}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-amber-950">{[...new Set(items)].map((item) => <li key={item}>{item}</li>)}</ul></section>
}
