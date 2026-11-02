import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { Task, TaskDraft } from '../../types/planner'
import { getEarnedPoints, getMaxPoints, getPartialCompletedMinutes } from '../../utils/taskMetrics'
import { deriveEndTime, formatDuration, getEffectiveDurationMinutes, getEndDayOffset } from '../../utils/taskTime'
import { findOverlappingTasks } from '../../utils/taskValidation'
import { DatePicker } from '../ui/DatePicker'
import { Icon } from '../ui/Icon'
import { TimeFields } from '../ui/TimeFields'
import { AvailableTimeSection } from './AvailableTimeSection'

interface TaskFormProps {
  task?: Task
  defaultDate: string
  tasks: Task[]
  categories: string[]
  onCreateCategory: (category: string) => Promise<string>
  onSave: (draft: TaskDraft) => Promise<void>
  onCancel: () => void
  schedulingLocked?: boolean
}

function createInitialDraft(task: Task | undefined, defaultDate: string): TaskDraft {
  return task ? {
    title: task.title,
    category: task.category,
    date: task.date,
    startTime: task.startTime,
    plannedMinutes: task.plannedMinutes,
    reminder: task.reminder,
    actualCompletedMinutes: task.actualCompletedMinutes,
    important: task.important,
  } : {
    title: '',
    category: '',
    date: defaultDate,
    startTime: '09:00',
    plannedMinutes: 30,
    reminder: { enabled: false, minutesBefore: 10 },
    actualCompletedMinutes: 0,
    important: false,
  }
}

export function TaskForm({ task, defaultDate, tasks, categories, onCreateCategory, onSave, onCancel, schedulingLocked = false }: TaskFormProps) {
  const [draft, setDraft] = useState(() => createInitialDraft(task, defaultDate))
  const initialEndTime = deriveEndTime(draft.startTime, draft.plannedMinutes)
  const [startTime, setStartTime] = useState(draft.startTime)
  const [endTime, setEndTime] = useState(initialEndTime?.endTime ?? draft.startTime)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryErrorMessage, setCategoryErrorMessage] = useState('')
  const [taskNameErrorMessage, setTaskNameErrorMessage] = useState('')
  const [customCategoryErrorMessage, setCustomCategoryErrorMessage] = useState('')
  const [startTimeInputErrorMessage, setStartTimeInputErrorMessage] = useState('')
  const [endTimeInputErrorMessage, setEndTimeInputErrorMessage] = useState('')
  const [equalTimeErrorMessage, setEqualTimeErrorMessage] = useState('')
  const [durationErrorMessage, setDurationErrorMessage] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveErrorMessage, setSaveErrorMessage] = useState('')
  const categoryErrorId = useId()
  const taskNameErrorId = useId()
  const customCategoryErrorId = useId()
  const durationErrorId = useId()
  const timeValuesChanged = startTime !== draft.startTime || endTime !== initialEndTime?.endTime
  const estimatedMinutes = getEffectiveDurationMinutes(startTime, endTime, draft.startTime, initialEndTime?.endTime ?? draft.startTime, draft.plannedMinutes) ?? 0
  const endDayOffset = timeValuesChanged ? getEndDayOffset(startTime, endTime) : initialEndTime?.dayOffset ?? 0
  const maximumPoints = estimatedMinutes > 0 ? getMaxPoints(estimatedMinutes) : 0
  const previewCompletedMinutes = task?.completionState === 'partial' && !schedulingLocked && estimatedMinutes > 0
    ? getPartialCompletedMinutes(estimatedMinutes)
    : draft.actualCompletedMinutes
  const earnedPoints = estimatedMinutes > 0 ? getEarnedPoints(previewCompletedMinutes, estimatedMinutes) : 0
  const conflictingTasks = estimatedMinutes > 0 && !startTimeInputErrorMessage && !endTimeInputErrorMessage
    ? findOverlappingTasks({ ...draft, startTime, plannedMinutes: estimatedMinutes }, tasks, task?.id)
    : []

  const createCategory = async () => {
    const categoryName = newCategoryName.trim()
    if (!categoryName) {
      setCustomCategoryErrorMessage('Enter a category name before adding it.')
      return
    }
    const existingCategory = categories.find((category) => category.toLocaleLowerCase() === categoryName.toLocaleLowerCase())
    setCategorySaving(true)
    setCustomCategoryErrorMessage('')
    try {
      const selectedCategory = existingCategory ?? await onCreateCategory(categoryName)
      setDraft({ ...draft, category: selectedCategory })
      setNewCategoryName('')
      setCreatingCategory(false)
      setCategoryErrorMessage('')
    } catch (categoryError) {
      setCustomCategoryErrorMessage(categoryError instanceof Error
        ? categoryError.message
        : 'The category could not be created.')
    } finally {
      setCategorySaving(false)
    }
  }

  const submitTask = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.category) {
      setCategoryErrorMessage('Choose or create a category first.')
      return
    }
    if (!draft.title.trim()) {
      setTaskNameErrorMessage('Give this task a short, clear name.')
      return
    }
    if (startTimeInputErrorMessage || endTimeInputErrorMessage) {
      return
    }
    if (estimatedMinutes <= 0) {
      if (startTime === endTime) {
        setEqualTimeErrorMessage('Start and end times must be different.')
      } else {
        setDurationErrorMessage('Estimated duration must be greater than zero.')
      }
      return
    }
    setSubmitting(true)
    setSaveErrorMessage('')
    try {
      await onSave({ ...draft, title: draft.title.trim(), startTime, plannedMinutes: estimatedMinutes })
    } catch (saveError) {
      setSaveErrorMessage(saveError instanceof Error ? saveError.message : 'The task could not be saved.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submitTask} className="space-y-6 p-5 sm:p-7" noValidate>
      <section className="form-section">
        <div className="form-section-heading">
          <span>1</span>
          <div>
            <h3>Organize it</h3>
            <p>Choose where this task belongs before naming it.</p>
          </div>
        </div>

        <label className="field-label">
          Category
          <select
            className="field-input"
            value={draft.category}
            onChange={(event) => {
              setDraft({ ...draft, category: event.target.value })
              if (event.target.value) setCategoryErrorMessage('')
            }}
            required
            aria-invalid={Boolean(categoryErrorMessage)}
            aria-describedby={categoryErrorMessage ? categoryErrorId : undefined}
            disabled={submitting || categorySaving}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          {categoryErrorMessage && (
            <span id={categoryErrorId} className="mt-2 block text-xs font-semibold text-red-700" role="alert">
              {categoryErrorMessage}
            </span>
          )}
        </label>

        {creatingCategory ? (
          <div className="flex items-end gap-2">
            <label className="field-label flex-1">
              New category
              <input
                className="field-input"
                value={newCategoryName}
                onChange={(event) => {
                  setNewCategoryName(event.target.value)
                  if (event.target.value.trim()) setCustomCategoryErrorMessage('')
                }}
                placeholder="e.g. Side project"
                autoFocus
                aria-invalid={Boolean(customCategoryErrorMessage)}
                aria-describedby={customCategoryErrorMessage ? customCategoryErrorId : undefined}
                disabled={categorySaving}
              />
              {customCategoryErrorMessage && (
                <span id={customCategoryErrorId} className="mt-2 block text-xs font-semibold text-red-700" role="alert">
                  {customCategoryErrorMessage}
                </span>
              )}
            </label>
            <button type="button" className="button-primary mb-px" onClick={() => void createCategory()} disabled={categorySaving}>
              {categorySaving ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              className="button-secondary mb-px px-3"
              onClick={() => {
                setCreatingCategory(false)
                setCustomCategoryErrorMessage('')
              }}
              aria-label="Cancel category creation"
              disabled={categorySaving}
            >
              <Icon name="close" className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-left text-sm font-bold text-[var(--accent-strong)]"
            onClick={() => setCreatingCategory(true)}
          >
            + Create a new category
          </button>
        )}

        <label className="field-label">
          Task name
          <input
            className="field-input"
            value={draft.title}
            onChange={(event) => {
              setDraft({ ...draft, title: event.target.value })
              if (event.target.value.trim()) setTaskNameErrorMessage('')
            }}
            placeholder={draft.category ? 'What would feel good to finish?' : 'Select a category first'}
            disabled={!draft.category || submitting}
            required
            aria-invalid={Boolean(taskNameErrorMessage)}
            aria-describedby={taskNameErrorMessage ? taskNameErrorId : undefined}
          />
          {taskNameErrorMessage && (
            <span id={taskNameErrorId} className="mt-2 block text-xs font-semibold text-red-700" role="alert">
              {taskNameErrorMessage}
            </span>
          )}
        </label>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>2</span>
          <div>
            <h3>Schedule it</h3>
            <p>Give the task a clear place in your day.</p>
          </div>
        </div>
        {schedulingLocked ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <ScheduleValue label="Date" value={draft.date} />
              <ScheduleValue label="Start" value={startTime} />
              <ScheduleValue label="End" value={endTime} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Use Reschedule from the task controls to change its date or time.
            </p>
          </div>
        ) : (
          <>
            <DatePicker label="Date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TimeFields
                label="Start time"
                value={startTime}
                onChange={(time) => {
                  setStartTime(time)
                  setDurationErrorMessage('')
                  if (time !== endTime) setEqualTimeErrorMessage('')
                }}
                errorMessage={startTimeInputErrorMessage}
                onValidationChange={setStartTimeInputErrorMessage}
              />
              <div>
                <TimeFields
                  label="End time"
                  value={endTime}
                  onChange={(time) => {
                    setEndTime(time)
                    setDurationErrorMessage('')
                    if (time !== startTime) setEqualTimeErrorMessage('')
                  }}
                  errorMessage={endTimeInputErrorMessage || equalTimeErrorMessage}
                  onValidationChange={setEndTimeInputErrorMessage}
                />
                {endDayOffset > 0 && (
                  <p className="mt-2 text-xs font-semibold text-[var(--accent-strong)]">
                    Ends {endDayOffset === 1 ? 'the next day' : `in ${endDayOffset} days`}
                  </p>
                )}
              </div>
            </div>
            <AvailableTimeSection
              dateKey={draft.date}
              tasks={tasks}
              conflictingTasks={conflictingTasks}
              excludedTaskId={task?.id}
            />
          </>
        )}

        <div>
          <div
            className="rounded-2xl bg-[var(--accent-soft)] p-4 text-sm"
            aria-invalid={Boolean(durationErrorMessage)}
            aria-describedby={durationErrorMessage ? durationErrorId : undefined}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="font-bold text-[var(--accent-strong)]">Estimated duration</span>
              <span className="font-black text-slate-800">
                {estimatedMinutes > 0
                  ? formatDuration(estimatedMinutes, true)
                  : 'Choose different times'}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-[var(--accent)]/10 pt-3">
              <span className="font-bold text-[var(--accent-strong)]">Point potential</span>
              <span className="font-black text-slate-800">
                {earnedPoints.toFixed(2)} / {maximumPoints.toFixed(2)} points
              </span>
            </div>
            {task?.completionState === 'partial' && (
              <p className="mt-2 text-xs text-slate-600">
                Partial progress remains at 50% of the estimated duration.
              </p>
            )}
          </div>
          {durationErrorMessage && (
            <p id={durationErrorId} className="mt-2 text-xs font-semibold text-red-700" role="alert">
              {durationErrorMessage}
            </p>
          )}
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>3</span>
          <div>
            <h3>Fine-tune it</h3>
            <p>Add priority and an optional reminder preference.</p>
          </div>
        </div>
        <label className="toggle-row">
          <span>
            <strong>Important task</strong>
            <small>Keep it at the top of its category.</small>
          </span>
          <input
            type="checkbox"
            checked={draft.important}
            onChange={(event) => setDraft({ ...draft, important: event.target.checked })}
          />
        </label>
        <label className="toggle-row">
          <span>
            <strong>Reminder</strong>
            <small>Saved only—delivery is not enabled yet.</small>
          </span>
          <input
            type="checkbox"
            checked={draft.reminder.enabled}
            onChange={(event) => setDraft({
              ...draft,
              reminder: { ...draft.reminder, enabled: event.target.checked },
            })}
          />
        </label>
        {draft.reminder.enabled && (
          <label className="field-label">
            Remind me before
            <select
              className="field-input"
              value={draft.reminder.minutesBefore}
              onChange={(event) => setDraft({
                ...draft,
                reminder: { ...draft.reminder, minutesBefore: Number(event.target.value) },
              })}
            >
              {[0, 5, 10, 15, 30, 45, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'At start time' : `${minutes} minutes before`}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
        {saveErrorMessage && <p className="mr-auto text-sm font-semibold text-red-700" role="alert">{saveErrorMessage}</p>}
        <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button type="submit" className="button-primary" disabled={submitting || categorySaving}>
          {submitting ? 'Saving…' : task ? 'Save changes' : 'Add task'}
        </button>
      </div>
    </form>
  )
}

function ScheduleValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-800">{value}</p>
    </div>
  )
}
