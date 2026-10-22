import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Task, TaskDraft } from '../../types/planner'
import { getEarnedPoints, getMaxPoints } from '../../utils/taskMetrics'
import { DatePicker } from '../ui/DatePicker'
import { Icon } from '../ui/Icon'

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
  const [durationHours, setDurationHours] = useState(() => Math.floor(draft.plannedMinutes / 60))
  const [durationMinutes, setDurationMinutes] = useState(() => draft.plannedMinutes % 60)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const estimatedMinutes = durationHours * 60 + durationMinutes
  const maximumPoints = estimatedMinutes > 0 ? getMaxPoints(estimatedMinutes) : 0
  const earnedPoints = estimatedMinutes > 0 ? getEarnedPoints(draft.actualCompletedMinutes, estimatedMinutes) : 0

  const createCategory = () => {
    const categoryName = newCategoryName.trim()
    if (!categoryName) {
      setErrorMessage('Enter a category name before adding it.')
      return
    }
    const existingCategory = categories.find((category) => category.toLocaleLowerCase() === categoryName.toLocaleLowerCase())
    const selectedCategory = existingCategory ?? categoryName
    if (!existingCategory) onCreateCategory(selectedCategory)
    setDraft({ ...draft, category: selectedCategory })
    setNewCategoryName('')
    setCreatingCategory(false)
    setErrorMessage('')
  }

  const submitTask = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.category) {
      setErrorMessage('Choose or create a category first.')
      return
    }
    if (!draft.title.trim()) {
      setErrorMessage('Give this task a short, clear name.')
      return
    }
    if (estimatedMinutes <= 0) {
      setErrorMessage('Estimated duration must be greater than zero.')
      return
    }
    onSave({ ...draft, title: draft.title.trim(), plannedMinutes: estimatedMinutes })
  }

  return (
    <form onSubmit={submitTask} className="space-y-6 p-5 sm:p-7">
      {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{errorMessage}</p>}
      <section className="form-section">
        <div className="form-section-heading"><span>1</span><div><h3>Organize it</h3><p>Choose where this task belongs before naming it.</p></div></div>
        <label className="field-label">Category<select className="field-input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required><option value="">Select a category</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        {creatingCategory ? <div className="flex items-end gap-2"><label className="field-label flex-1">New category<input className="field-input" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="e.g. Side project" autoFocus /></label><button type="button" className="button-primary mb-px" onClick={createCategory}>Add</button><button type="button" className="button-secondary mb-px px-3" onClick={() => setCreatingCategory(false)} aria-label="Cancel category creation"><Icon name="close" className="size-4" /></button></div> : <button type="button" className="text-left text-sm font-bold text-[var(--accent-strong)]" onClick={() => setCreatingCategory(true)}>+ Create a new category</button>}
        <label className="field-label">Task name<input className="field-input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={draft.category ? 'What would feel good to finish?' : 'Select a category first'} disabled={!draft.category} required /></label>
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span>2</span><div><h3>Schedule it</h3><p>Give the task a clear place in your day.</p></div></div>
        <DatePicker label="Date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
        <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Start time<input className="field-input" type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} required /></label><div><span className="field-label">Estimated duration</span><div className="mt-2 grid grid-cols-2 gap-2"><label className="duration-control"><input type="number" min="0" max="999" value={durationHours} onChange={(event) => setDurationHours(Math.max(0, Number(event.target.value)))} aria-label="Estimated hours" /><span>hours</span></label><label className="duration-control"><select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} aria-label="Estimated minutes">{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={minute}>{String(minute).padStart(2, '0')}</option>)}</select><span>min</span></label></div></div></div>
        <div className="rounded-2xl bg-[var(--accent-soft)] p-4 text-sm"><div className="flex items-center justify-between"><span className="font-bold text-[var(--accent-strong)]">Point potential</span><span className="font-black text-slate-800">{earnedPoints.toFixed(2)} / {maximumPoints.toFixed(2)} points</span></div>{task?.completionState === 'partial' && <p className="mt-2 text-xs text-slate-600">Existing partial progress is retained when you edit scheduling details.</p>}</div>
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
