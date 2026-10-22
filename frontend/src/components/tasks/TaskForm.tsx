import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { Task, TaskDraft } from '../../types/planner'
import { getEarnedPoints, getMaxPoints } from '../../utils/taskMetrics'
import { deriveEndTime, getEffectiveDurationMinutes, getEndDayOffset } from '../../utils/taskTime'
import { DatePicker } from '../ui/DatePicker'
import { Icon } from '../ui/Icon'
import { TimeFields } from '../ui/TimeFields'

interface TaskFormProps {
  task?: Task
  defaultDate: string
  categories: string[]
  onCreateCategory: (category: string) => void
  onSave: (draft: TaskDraft) => void
  onCancel: () => void
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

export function TaskForm({ task, defaultDate, categories, onCreateCategory, onSave, onCancel }: TaskFormProps) {
  const [draft, setDraft] = useState(() => createInitialDraft(task, defaultDate))
  const initialEndTime = deriveEndTime(draft.startTime, draft.plannedMinutes)
  const [startTime, setStartTime] = useState(draft.startTime)
  const [endTime, setEndTime] = useState(initialEndTime?.endTime ?? draft.startTime)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [generalErrorMessage, setGeneralErrorMessage] = useState('')
  const [categoryErrorMessage, setCategoryErrorMessage] = useState('')
  const [taskNameErrorMessage, setTaskNameErrorMessage] = useState('')
  const [customCategoryErrorMessage, setCustomCategoryErrorMessage] = useState('')
  const [startTimeInputErrorMessage, setStartTimeInputErrorMessage] = useState('')
  const [endTimeInputErrorMessage, setEndTimeInputErrorMessage] = useState('')
  const [equalTimeErrorMessage, setEqualTimeErrorMessage] = useState('')
  const [durationErrorMessage, setDurationErrorMessage] = useState('')
  const categoryErrorId = useId()
  const taskNameErrorId = useId()
  const customCategoryErrorId = useId()
  const durationErrorId = useId()
  const timeValuesChanged = startTime !== draft.startTime || endTime !== initialEndTime?.endTime
  const estimatedMinutes = getEffectiveDurationMinutes(startTime, endTime, draft.startTime, initialEndTime?.endTime ?? draft.startTime, draft.plannedMinutes) ?? 0
  const endDayOffset = timeValuesChanged ? getEndDayOffset(startTime, endTime) : initialEndTime?.dayOffset ?? 0
  const maximumPoints = estimatedMinutes > 0 ? getMaxPoints(estimatedMinutes) : 0
  const earnedPoints = estimatedMinutes > 0 ? getEarnedPoints(draft.actualCompletedMinutes, estimatedMinutes) : 0

  const createCategory = () => {
    const categoryName = newCategoryName.trim()
    if (!categoryName) {
      setCustomCategoryErrorMessage('Enter a category name before adding it.')
      return
    }
    const existingCategory = categories.find((category) => category.toLocaleLowerCase() === categoryName.toLocaleLowerCase())
    const selectedCategory = existingCategory ?? categoryName
    if (!existingCategory) onCreateCategory(selectedCategory)
    setDraft({ ...draft, category: selectedCategory })
    setNewCategoryName('')
    setCreatingCategory(false)
    setCategoryErrorMessage('')
    setCustomCategoryErrorMessage('')
  }

  const submitTask = (event: FormEvent) => {
    event.preventDefault()
    setGeneralErrorMessage('')
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
    onSave({ ...draft, title: draft.title.trim(), startTime, plannedMinutes: estimatedMinutes })
  }

  return (
    <form onSubmit={submitTask} className="space-y-6 p-5 sm:p-7" noValidate>
      {generalErrorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{generalErrorMessage}</p>}
      <section className="form-section">
        <div className="form-section-heading"><span>1</span><div><h3>Organize it</h3><p>Choose where this task belongs before naming it.</p></div></div>
        <label className="field-label">Category<select className="field-input" value={draft.category} onChange={(event) => {
          setDraft({ ...draft, category: event.target.value })
          if (event.target.value) setCategoryErrorMessage('')
        }} required aria-invalid={Boolean(categoryErrorMessage)} aria-describedby={categoryErrorMessage ? categoryErrorId : undefined}><option value="">Select a category</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>{categoryErrorMessage && <span id={categoryErrorId} className="mt-2 block text-xs font-semibold text-red-700" role="alert">{categoryErrorMessage}</span>}</label>
        {creatingCategory ? <div className="flex items-end gap-2"><label className="field-label flex-1">New category<input className="field-input" value={newCategoryName} onChange={(event) => {
          setNewCategoryName(event.target.value)
          if (event.target.value.trim()) setCustomCategoryErrorMessage('')
        }} placeholder="e.g. Side project" autoFocus aria-invalid={Boolean(customCategoryErrorMessage)} aria-describedby={customCategoryErrorMessage ? customCategoryErrorId : undefined} />{customCategoryErrorMessage && <span id={customCategoryErrorId} className="mt-2 block text-xs font-semibold text-red-700" role="alert">{customCategoryErrorMessage}</span>}</label><button type="button" className="button-primary mb-px" onClick={createCategory}>Add</button><button type="button" className="button-secondary mb-px px-3" onClick={() => {
          setCreatingCategory(false)
          setCustomCategoryErrorMessage('')
        }} aria-label="Cancel category creation"><Icon name="close" className="size-4" /></button></div> : <button type="button" className="text-left text-sm font-bold text-[var(--accent-strong)]" onClick={() => setCreatingCategory(true)}>+ Create a new category</button>}
        <label className="field-label">Task name<input className="field-input" value={draft.title} onChange={(event) => {
          setDraft({ ...draft, title: event.target.value })
          if (event.target.value.trim()) setTaskNameErrorMessage('')
        }} placeholder={draft.category ? 'What would feel good to finish?' : 'Select a category first'} disabled={!draft.category} required aria-invalid={Boolean(taskNameErrorMessage)} aria-describedby={taskNameErrorMessage ? taskNameErrorId : undefined} />{taskNameErrorMessage && <span id={taskNameErrorId} className="mt-2 block text-xs font-semibold text-red-700" role="alert">{taskNameErrorMessage}</span>}</label>
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span>2</span><div><h3>Schedule it</h3><p>Give the task a clear place in your day.</p></div></div>
        <DatePicker label="Date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
        <div className="grid gap-4 sm:grid-cols-2"><TimeFields label="Start time" value={startTime} onChange={(time) => {
          setStartTime(time)
          setDurationErrorMessage('')
          if (time !== endTime) setEqualTimeErrorMessage('')
        }} errorMessage={startTimeInputErrorMessage} onValidationChange={setStartTimeInputErrorMessage} /><div><TimeFields label="End time" value={endTime} onChange={(time) => {
          setEndTime(time)
          setDurationErrorMessage('')
          if (time !== startTime) setEqualTimeErrorMessage('')
        }} errorMessage={endTimeInputErrorMessage || equalTimeErrorMessage} onValidationChange={setEndTimeInputErrorMessage} />{endDayOffset > 0 && <p className="mt-2 text-xs font-semibold text-[var(--accent-strong)]">Ends {endDayOffset === 1 ? 'the next day' : `in ${endDayOffset} days`}</p>}</div></div>
        <div><div className="rounded-2xl bg-[var(--accent-soft)] p-4 text-sm" aria-invalid={Boolean(durationErrorMessage)} aria-describedby={durationErrorMessage ? durationErrorId : undefined}><div className="flex items-center justify-between gap-4"><span className="font-bold text-[var(--accent-strong)]">Estimated duration</span><span className="font-black text-slate-800">{estimatedMinutes > 0 ? formatDuration(estimatedMinutes) : 'Choose different times'}</span></div><div className="mt-3 flex items-center justify-between gap-4 border-t border-[var(--accent)]/10 pt-3"><span className="font-bold text-[var(--accent-strong)]">Point potential</span><span className="font-black text-slate-800">{earnedPoints.toFixed(2)} / {maximumPoints.toFixed(2)} points</span></div>{task?.completionState === 'partial' && <p className="mt-2 text-xs text-slate-600">Existing partial progress is retained when you edit scheduling details.</p>}</div>{durationErrorMessage && <p id={durationErrorId} className="mt-2 text-xs font-semibold text-red-700" role="alert">{durationErrorMessage}</p>}</div>
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span>3</span><div><h3>Fine-tune it</h3><p>Add priority and an optional reminder preference.</p></div></div>
        <label className="toggle-row"><span><strong>Important task</strong><small>Keep it at the top of its category.</small></span><input type="checkbox" checked={draft.important} onChange={(event) => setDraft({ ...draft, important: event.target.checked })} /></label>
        <label className="toggle-row"><span><strong>Reminder</strong><small>Saved only—delivery is not enabled yet.</small></span><input type="checkbox" checked={draft.reminder.enabled} onChange={(event) => setDraft({ ...draft, reminder: { ...draft.reminder, enabled: event.target.checked } })} /></label>
        {draft.reminder.enabled && <label className="field-label">Remind me before<select className="field-input" value={draft.reminder.minutesBefore} onChange={(event) => setDraft({ ...draft, reminder: { ...draft.reminder, minutesBefore: Number(event.target.value) } })}>{[0, 5, 10, 15, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes === 0 ? 'At start time' : `${minutes} minutes before`}</option>)}</select></label>}
      </section>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" className="button-secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button-primary">{task ? 'Save changes' : 'Add task'}</button></div>
    </form>
  )
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} minutes`
  if (minutes === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return `${hours}h ${minutes}m`
}
