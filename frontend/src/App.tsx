import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CalendarView } from './components/calendar/CalendarView'
import { TodayView } from './components/dashboard/TodayView'
import { BottomNavigation, DesktopNavigation } from './components/layout/Navigation'
import { SettingsView } from './components/settings/SettingsView'
import { TaskForm } from './components/tasks/TaskForm'
import { Modal } from './components/ui/Modal'
import { getTheme, weekdayThemes } from './data/themes'
import { defaultTaskCategories } from './data/categories'
import { usePlanner } from './hooks/usePlanner'
import type { Task, TaskDraft, ViewName } from './types/planner'
import { getCurrentDate, toLocalDateKey } from './utils/dates'
import { findOverlappingActiveTasks, findSameDayDuplicateTasks } from './utils/taskValidation'

interface PendingTaskSave {
  draft: TaskDraft
  taskId: string | null
  duplicateNames: string[]
  overlappingNames: string[]
}

export default function App() {
  const planner = usePlanner()
  const [currentDate] = useState(getCurrentDate)
  const today = toLocalDateKey(currentDate)
  const [activeView, setActiveView] = useState<ViewName>('today')
  const [formDate, setFormDate] = useState(today)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
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

  const openAdd = (date = today) => {
    setFormDate(date)
    setEditingTask(null)
    setFormOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setFormDate(task.date)
    setFormOpen(true)
  }

  const persistTask = (draft: TaskDraft, taskId: string | null) => {
    if (taskId) planner.updateTask(taskId, draft)
    else planner.addTask(draft)
    setFormOpen(false)
    setEditingTask(null)
    setPendingTaskSave(null)
  }

  const saveTask = (draft: TaskDraft) => {
    const taskId = editingTask?.id ?? null
    const duplicateNames = findSameDayDuplicateTasks(draft, planner.state.tasks, taskId ?? undefined).map((task) => task.title)
    const overlappingNames = findOverlappingActiveTasks(draft, planner.state.tasks, taskId ?? undefined).map((task) => task.title)
    if (duplicateNames.length || overlappingNames.length) {
      setPendingTaskSave({ draft, taskId, duplicateNames, overlappingNames })
      return
    }
    persistTask(draft, taskId)
  }

  const reviewPlan = () => {
    planner.reviewPlan()
    setReviewMessage(true)
    window.setTimeout(() => setReviewMessage(false), 2500)
  }

  const requestTaskReopen = (task: Task) => {
    const overlappingTasks = findOverlappingActiveTasks({ ...task, actualCompletedMinutes: 0 }, planner.state.tasks, task.id)
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
    onReopen: requestTaskReopen,
    onSetPartialProgress: (task: Task, minutes: number) => planner.setTaskProgress(task.id, minutes),
  }

  return (
    <div className="min-h-screen bg-[var(--page)] text-slate-900 transition-colors duration-500" style={themeStyle}>
      <div className="pointer-events-none fixed -right-24 -top-32 size-96 rounded-full bg-[var(--glow)] opacity-55 blur-3xl" />
      <div className="relative flex min-h-screen">
        <DesktopNavigation activeView={activeView} sidebarCollapsed={planner.state.settings.sidebarCollapsed} onNavigate={setActiveView} onToggleSidebar={() => planner.updateSettings({ ...planner.state.settings, sidebarCollapsed: !planner.state.settings.sidebarCollapsed })} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-7 sm:px-7 lg:px-10 lg:pb-12 lg:pt-10 xl:px-14">
          <div className="mx-auto max-w-7xl">
            {planner.storageError && <p className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">Changes could not be saved to this browser. Check your storage settings or available space.</p>}
            {activeView === 'today' && <TodayView dateKey={today} tasks={todayTasks} availableHours={planner.state.settings.availableHours} activityDates={planner.state.activityDates} completionEvents={planner.state.completionEvents} onAdd={() => openAdd()} onOpenCalendar={() => setActiveView('calendar')} onReview={reviewPlan} {...taskCallbacks} />}
            {activeView === 'calendar' && <CalendarView initialDate={today} tasks={planner.state.tasks} onAdd={openAdd} onBackToToday={() => setActiveView('today')} {...taskCallbacks} />}
            {activeView === 'settings' && <SettingsView settings={planner.state.settings} automaticThemeId={automaticTheme.id} onSave={planner.updateSettings} onReview={reviewPlan} />}
          </div>
        </main>
        <BottomNavigation activeView={activeView} onNavigate={setActiveView} onAdd={() => openAdd()} />
      </div>

      {formOpen && <Modal title={editingTask ? 'Edit task' : 'Add a task'} onClose={() => setFormOpen(false)}><TaskForm task={editingTask ?? undefined} defaultDate={formDate} categories={availableCategories} onCreateCategory={planner.addCustomCategory} onSave={saveTask} onCancel={() => setFormOpen(false)} /></Modal>}
      {pendingTaskSave && <Modal title="Review scheduling warnings" onClose={() => setPendingTaskSave(null)}><div className="space-y-5 p-6 sm:p-7"><p className="text-slate-600">You can still save this task, but please review the following first.</p>{pendingTaskSave.duplicateNames.length > 0 && <WarningList title="Duplicate task name" description="A task with the same normalized name already exists on this date." names={pendingTaskSave.duplicateNames} />}{pendingTaskSave.overlappingNames.length > 0 && <WarningList title="Schedule overlap" description="This time overlaps with active tasks." names={pendingTaskSave.overlappingNames} />}<div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className="button-secondary" onClick={() => setPendingTaskSave(null)}>Go back</button><button type="button" className="button-primary" onClick={() => persistTask(pendingTaskSave.draft, pendingTaskSave.taskId)}>Save anyway</button></div></div></Modal>}
      {pendingReopenTask && <Modal title="Review schedule overlap" onClose={() => setPendingReopenTask(null)}><div className="space-y-5 p-6 sm:p-7"><p className="text-slate-600">Reopening this task makes it active again and overlaps with the following active tasks.</p><WarningList title="Schedule overlap" description="You can reopen it anyway or leave it completed." names={findOverlappingActiveTasks({ ...pendingReopenTask, actualCompletedMinutes: 0 }, planner.state.tasks, pendingReopenTask.id).map((task) => task.title)} /><div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className="button-secondary" onClick={() => setPendingReopenTask(null)}>Keep completed</button><button type="button" className="button-primary" onClick={() => { planner.reopenTask(pendingReopenTask.id); setPendingReopenTask(null) }}>Reopen anyway</button></div></div></Modal>}
      {deletingTask && <Modal title="Delete task?" onClose={() => setDeletingTask(null)}><div className="p-6 sm:p-7"><p className="text-slate-600">“{deletingTask.title}” will be removed from this browser. Its completion event will be removed and the completion streak recalculated. Genuine planning activity history will remain.</p><div className="mt-6 flex justify-end gap-3"><button type="button" className="button-secondary" onClick={() => setDeletingTask(null)}>Keep task</button><button type="button" className="rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:bg-red-700" onClick={() => { planner.deleteTask(deletingTask.id); setDeletingTask(null) }}>Delete</button></div></div></Modal>}
      {reviewMessage && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-xl lg:bottom-8" role="status">Plan reviewed — activity recorded.</div>}
    </div>
  )
}

function WarningList({ title, description, names }: { title: string; description: string; names: string[] }) {
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-black text-amber-900">{title}</h3><p className="mt-1 text-sm text-amber-800">{description}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-amber-950">{[...new Set(names)].map((name) => <li key={name}>{name}</li>)}</ul></section>
}
