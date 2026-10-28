import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { CalendarView } from './components/calendar/CalendarView'
import { TodayView } from './components/dashboard/TodayView'
import { BottomNavigation, DesktopNavigation } from './components/layout/Navigation'
import { ReviewPlanView } from './components/review/ReviewPlanView'
import { SettingsView } from './components/settings/SettingsView'
import { TaskForm } from './components/tasks/TaskForm'
import type { TaskActionCallbacks } from './components/tasks/TaskItem'
import { Modal } from './components/ui/Modal'
import { defaultTaskCategories } from './data/categories'
import { getTheme, weekdayThemes } from './data/themes'
import { useCurrentDate } from './hooks/useCurrentDate'
import { usePlanner } from './hooks/usePlanner'
import type { Task, TaskDraft, ViewName } from './types/planner'
import { getCurrentDate, toLocalDateKey } from './utils/dates'
import { loadNavigationState, saveNavigationState } from './utils/storage'
import { getPartialCompletedMinutes } from './utils/taskMetrics'
import { canRescheduleTask } from './utils/taskTime'
import {
  findOverlappingTasks,
  findSameDayDuplicateTasks,
  formatTaskTiming,
} from './utils/taskValidation'

interface PendingTaskSave {
  draft: TaskDraft
  taskId: string | null
  duplicateNames: string[]
  overlappingTasks: Task[]
}

type TaskFormMode = 'add' | 'edit' | 'reschedule'
type ActiveModalName =
  | 'task-form'
  | 'task-save-warning'
  | 'task-reopen-warning'
  | 'task-incomplete-confirmation'
  | 'reschedule-unavailable'
  | 'task-delete-confirmation'
  | null

export default function App() {
  const planner = usePlanner()
  const currentDate = useCurrentDate()
  const today = toLocalDateKey(currentDate)
  const [navigationState, setNavigationState] = useState(() => {
    if (typeof window === 'undefined') {
      return { activeView: 'today' as ViewName, selectedDate: today }
    }
    return loadNavigationState(window.sessionStorage, today)
  })
  const { activeView, selectedDate } = navigationState
  const [formDate] = useState(today)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskFormMode, setTaskFormMode] = useState<TaskFormMode>('add')
  const [formOpen, setFormOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [pendingIncompleteTask, setPendingIncompleteTask] = useState<Task | null>(null)
  const [rescheduleUnavailableTask, setRescheduleUnavailableTask] = useState<Task | null>(null)
  const [pendingTaskSave, setPendingTaskSave] = useState<PendingTaskSave | null>(null)
  const [pendingReopenTask, setPendingReopenTask] = useState<Task | null>(null)
  const [mutationNoticeVisible, setMutationNoticeVisible] = useState(false)
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

  const navigateTo = (nextView: ViewName) => {
    setNavigationState((current) => ({ ...current, activeView: nextView }))
  }

  const selectReviewDate = (nextDate: string) => {
    setNavigationState((current) => ({ ...current, selectedDate: nextDate }))
  }

  const openNewTaskForm = (date = today) => {
    void date
    setMutationNoticeVisible(true)
  }

  const openTaskEditor = (_task: Task) => {
    setMutationNoticeVisible(true)
  }

  const closeTaskForm = () => {
    setFormOpen(false)
    setEditingTask(null)
    setTaskFormMode('add')
  }

  const requestTaskReschedule = (_task: Task) => {
    setMutationNoticeVisible(true)
  }

  const ensureRescheduleStillAllowed = (taskId: string | null): boolean => {
    if (taskFormMode !== 'reschedule' || !taskId) return true
    const originalTask = planner.state.tasks.find((task) => task.id === taskId)
    if (originalTask && canRescheduleTask(originalTask.date, originalTask.startTime)) return true

    // Eligibility is checked again at save time because the cutoff may pass while the form is open.
    if (originalTask) setRescheduleUnavailableTask(originalTask)
    closeTaskForm()
    return false
  }

  const persistTaskDraft = (draft: TaskDraft, taskId: string | null) => {
    if (!ensureRescheduleStillAllowed(taskId)) {
      setPendingTaskSave(null)
      return
    }
    void draft
    setMutationNoticeVisible(true)
    setPendingTaskSave(null)
    closeTaskForm()
  }

  const requestTaskSave = (draft: TaskDraft) => {
    const taskId = editingTask?.id ?? null
    if (!ensureRescheduleStillAllowed(taskId)) return

    // Rescheduling changes the plan, so an existing Partial outcome stays exactly 50% of the new duration.
    const draftToSave = taskFormMode === 'reschedule' && editingTask?.completionState === 'partial'
      ? { ...draft, actualCompletedMinutes: getPartialCompletedMinutes(draft.plannedMinutes) }
      : draft
    const duplicateNames = findSameDayDuplicateTasks(
      draftToSave,
      planner.state.tasks,
      taskId ?? undefined,
    ).map((task) => task.title)
    const overlappingTasks = findOverlappingTasks(
      draftToSave,
      planner.state.tasks,
      taskId ?? undefined,
    )

    if (duplicateNames.length > 0 || overlappingTasks.length > 0) {
      setPendingTaskSave({ draft: draftToSave, taskId, duplicateNames, overlappingTasks })
      return
    }
    persistTaskDraft(draftToSave, taskId)
  }

  const confirmReview = () => {
    if (selectedDate !== toLocalDateKey(getCurrentDate())) return
    setMutationNoticeVisible(true)
  }

  const requestTaskReopen = (_task: Task) => {
    setMutationNoticeVisible(true)
  }

  const todayTasks = planner.state.tasks.filter((task) => task.date === today)
  const availableCategories = [
    ...defaultTaskCategories,
    ...planner.categories.map((category) => category.name),
    ...planner.state.tasks.map((task) => task.category),
  ].filter((category, index, categories) => (
    categories.findIndex((existingCategory) => (
      existingCategory.toLocaleLowerCase() === category.toLocaleLowerCase()
    )) === index
  ))
  const taskActions: TaskActionCallbacks = {
    onEdit: openTaskEditor,
    onDelete: () => setMutationNoticeVisible(true),
    onToggleImportant: () => setMutationNoticeVisible(true),
    onComplete: () => setMutationNoticeVisible(true),
    onPartial: () => setMutationNoticeVisible(true),
    onMarkIncomplete: () => setMutationNoticeVisible(true),
    onReopen: requestTaskReopen,
    onReschedule: requestTaskReschedule,
  }

  let activeModal: ActiveModalName = formOpen ? 'task-form' : null
  if (deletingTask) activeModal = 'task-delete-confirmation'
  if (rescheduleUnavailableTask) activeModal = 'reschedule-unavailable'
  if (pendingIncompleteTask) activeModal = 'task-incomplete-confirmation'
  if (pendingReopenTask) activeModal = 'task-reopen-warning'
  if (pendingTaskSave) activeModal = 'task-save-warning'

  if (planner.status === 'loading') {
    return <PlannerLoadingState />
  }

  if (planner.status === 'error') {
    return <PlannerErrorState message={planner.error} onRetry={() => void planner.retry()} />
  }

  return (
    <div
      className="min-h-screen bg-[var(--page)] text-slate-900 transition-colors duration-500"
      style={themeStyle}
    >
      <div className="pointer-events-none fixed -right-24 -top-32 size-96 rounded-full bg-[var(--glow)] opacity-55 blur-3xl" />
      <div className="relative flex min-h-screen">
        <DesktopNavigation
          activeView={activeView}
          sidebarCollapsed={planner.state.settings.sidebarCollapsed}
          onNavigate={navigateTo}
          onToggleSidebar={() => setMutationNoticeVisible(true)}
        />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-7 sm:px-7 lg:px-10 lg:pb-12 lg:pt-10 xl:px-14">
          <div className="mx-auto max-w-7xl">
            <p className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800" role="status">
              Planner data is loaded from your account. Changes are temporarily disabled until
              database saving is connected in Part 3.
            </p>
            {planner.refreshing && (
              <p className="mb-5 text-sm font-semibold text-slate-500" role="status">
                Refreshing planner data…
              </p>
            )}
            {planner.refreshError && (
              <p
                className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                role="alert"
              >
                {planner.refreshError} Existing planner data is still shown.
              </p>
            )}
            {activeView === 'today' && (
              <TodayView
                dateKey={today}
                tasks={todayTasks}
                activityDates={planner.state.activityDates}
                completionEvents={planner.state.completionEvents}
                onAdd={() => openNewTaskForm()}
                onOpenCalendar={() => navigateTo('calendar')}
                onOpenReview={() => navigateTo('review')}
                {...taskActions}
              />
            )}
            {activeView === 'calendar' && (
              <CalendarView
                initialDate={today}
                tasks={planner.state.tasks}
                onAdd={openNewTaskForm}
                onBackToToday={() => navigateTo('today')}
                {...taskActions}
              />
            )}
            {activeView === 'review' && (
              <ReviewPlanView
                selectedDate={selectedDate}
                today={today}
                tasks={planner.state.tasks}
                onSelectDate={selectReviewDate}
                onBackToToday={() => navigateTo('today')}
                onConfirmReview={confirmReview}
                {...taskActions}
              />
            )}
            {activeView === 'settings' && (
              <SettingsView
                settings={planner.state.settings}
                automaticThemeId={automaticTheme.id}
                onSave={() => setMutationNoticeVisible(true)}
                onOpenReview={() => navigateTo('review')}
              />
            )}
          </div>
        </main>
        <BottomNavigation
          activeView={activeView}
          onNavigate={navigateTo}
          onAdd={() => openNewTaskForm()}
        />
      </div>

      {formOpen && (
        <Modal
          active={activeModal === 'task-form'}
          title={taskFormMode === 'reschedule' ? 'Reschedule task' : editingTask ? 'Edit task' : 'Add a task'}
          onClose={closeTaskForm}
        >
          <TaskForm
            task={editingTask ?? undefined}
            defaultDate={formDate}
            tasks={planner.state.tasks}
            categories={availableCategories}
            onCreateCategory={() => setMutationNoticeVisible(true)}
            onSave={requestTaskSave}
            onCancel={closeTaskForm}
            schedulingLocked={taskFormMode === 'edit'}
          />
        </Modal>
      )}

      {pendingTaskSave && (
        <Modal
          active={activeModal === 'task-save-warning'}
          title="Review scheduling warnings"
          onClose={() => setPendingTaskSave(null)}
        >
          <div className="space-y-5 p-6 sm:p-7">
            <p className="text-slate-600">
              You can still save this task, but please review the following first.
            </p>
            {pendingTaskSave.duplicateNames.length > 0 && (
              <WarningList
                title="Duplicate task name"
                description="A task with the same normalized name already exists on this date."
                items={pendingTaskSave.duplicateNames}
              />
            )}
            {pendingTaskSave.overlappingTasks.length > 0 && (
              <WarningList
                title="Schedule overlap"
                description="This time overlaps with scheduled tasks."
                items={pendingTaskSave.overlappingTasks.map((task) => (
                  `${task.title} — ${formatTaskTiming(task)}`
                ))}
              />
            )}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setPendingTaskSave(null)}
              >
                Go back
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => persistTaskDraft(pendingTaskSave.draft, pendingTaskSave.taskId)}
              >
                Save anyway
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingReopenTask && (
        <Modal
          active={activeModal === 'task-reopen-warning'}
          title="Review schedule overlap"
          onClose={() => setPendingReopenTask(null)}
        >
          <div className="space-y-5 p-6 sm:p-7">
            <p className="text-slate-600">
              Reopening this task overlaps with the following scheduled tasks.
            </p>
            <WarningList
              title="Schedule overlap"
              description="You can reopen it anyway or keep its current outcome."
              items={findOverlappingTasks(
                { ...pendingReopenTask, actualCompletedMinutes: 0 },
                planner.state.tasks,
                pendingReopenTask.id,
              ).map((task) => `${task.title} — ${formatTaskTiming(task)}`)}
            />
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setPendingReopenTask(null)}
              >
                Keep outcome
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  setMutationNoticeVisible(true)
                  setPendingReopenTask(null)
                }}
              >
                Reopen anyway
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingIncompleteTask && (
        <Modal
          active={activeModal === 'task-incomplete-confirmation'}
          title="Mark task incomplete?"
          onClose={() => setPendingIncompleteTask(null)}
        >
          <div className="p-6 sm:p-7">
            <p className="text-slate-600">
              “{pendingIncompleteTask.title}” will move to Incomplete with zero progress and zero points.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setPendingIncompleteTask(null)}
              >
                Go back
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:bg-red-700"
                onClick={() => {
                  setMutationNoticeVisible(true)
                  setPendingIncompleteTask(null)
                }}
              >
                Mark incomplete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {rescheduleUnavailableTask && (
        <Modal
          active={activeModal === 'reschedule-unavailable'}
          title="Rescheduling unavailable"
          onClose={() => setRescheduleUnavailableTask(null)}
        >
          <div className="p-6 sm:p-7">
            <p className="text-slate-600">
              “{rescheduleUnavailableTask.title}” can no longer be rescheduled. Changes must be
              saved before the one-hour cutoff preceding its original start time.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="button-primary"
                onClick={() => setRescheduleUnavailableTask(null)}
              >
                Understood
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deletingTask && (
        <Modal
          active={activeModal === 'task-delete-confirmation'}
          title="Delete task?"
          onClose={() => setDeletingTask(null)}
        >
          <div className="p-6 sm:p-7">
            <p className="text-slate-600">
              “{deletingTask.title}” will be removed from this browser. Its completion event will
              be removed and the completion streak recalculated. Genuine planning activity
              history will remain.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setDeletingTask(null)}
              >
                Keep task
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:bg-red-700"
                onClick={() => {
                  setMutationNoticeVisible(true)
                  setDeletingTask(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {mutationNoticeVisible && (
        <div
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-xl lg:bottom-8"
          role="status"
        >
          Changes are temporarily disabled until database saving is available in Part 3.
        </div>
      )}
    </div>
  )
}

function PlannerLoadingState() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4" aria-busy="true">
      <div className="text-center" role="status">
        <div className="mx-auto size-9 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        <p className="mt-4 text-sm font-bold text-slate-600">Loading your planner…</p>
      </div>
    </main>
  )
}

function PlannerErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        <h1 className="text-2xl font-black text-slate-950">Your planner could not be loaded</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600" role="alert">
          {message ?? 'Please check your connection and try again.'}
        </p>
        <button type="button" className="button-primary mx-auto mt-6" onClick={onRetry}>
          Try again
        </button>
      </section>
    </main>
  )
}

interface WarningListProps {
  title: string
  description: string
  items: string[]
}

function WarningList({ title, description, items }: WarningListProps) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-black text-amber-900">{title}</h3>
      <p className="mt-1 text-sm text-amber-800">{description}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-amber-950">
        {[...new Set(items)].map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  )
}
