import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskForm } from './TaskForm'

const baseProps = {
  defaultDate: '2026-10-28',
  tasks: [],
  categories: ['Work'],
  onCreateCategory: vi.fn(async (name: string) => name),
  onSave: vi.fn(async () => undefined),
  onCancel: vi.fn(),
}

describe('TaskForm asynchronous persistence', () => {
  it('awaits category creation and selects the canonical API name', async () => {
    const onCreateCategory = vi.fn(async () => 'Side Project')
    render(<TaskForm {...baseProps} onCreateCategory={onCreateCategory} />)

    fireEvent.click(screen.getByRole('button', { name: /create a new category/i }))
    fireEvent.change(screen.getByLabelText('New category'), { target: { value: ' side project ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onCreateCategory).toHaveBeenCalledWith('side project'))
    expect(screen.queryByLabelText('New category')).toBeNull()
  })

  it('keeps the form open and reports a failed save', async () => {
    const onSave = vi.fn(async () => { throw new Error('Backend unavailable') })
    render(<TaskForm {...baseProps} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Work' } })
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Write report' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Backend unavailable')
    expect((screen.getByLabelText('Task name') as HTMLInputElement).value).toBe('Write report')
  })
})
