import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserDataImportResult } from '../../api/planner'
import { LEGACY_OWNER_STORAGE_KEY, STORAGE_KEY } from '../../utils/storage'
import { BrowserDataImportSection } from './BrowserDataImportSection'

const importResult: BrowserDataImportResult = {
  sourceVersion: 2,
  previewDigest: 'a'.repeat(64),
  tasks: { valid: 1, invalid: 0, created: 0, existing: 0 },
  categories: { valid: 1, invalid: 0, created: 0, existing: 0 },
  activityDates: { valid: 1, invalid: 0, created: 0, existing: 0 },
  completionEvents: { valid: 0, invalid: 0, created: 0, existing: 0 },
  settingsStatus: 'not_requested',
  issues: [],
  warnings: [],
}

describe('BrowserDataImportSection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('previews and confirms the exact browser payload without modifying localStorage', async () => {
    const serializedState = JSON.stringify({ version: 2, tasks: [] })
    localStorage.setItem(STORAGE_KEY, serializedState)
    localStorage.setItem(LEGACY_OWNER_STORAGE_KEY, 'user-1')
    const onPreview = vi.fn().mockResolvedValue(importResult)
    const onCommit = vi.fn().mockResolvedValue({
      ...importResult,
      tasks: { ...importResult.tasks, created: 1 },
    })
    render(
      <BrowserDataImportSection
        authenticatedUserId="user-1"
        authenticatedUserEmail="planner@example.com"
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Preview browser data' }))
    await screen.findByText('Version 2 preview')
    expect(onPreview).toHaveBeenCalledWith(serializedState, false)

    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed this preview/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    await screen.findByText('Browser data import finished')

    expect(onCommit).toHaveBeenCalledWith(serializedState, false, importResult.previewDigest)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(serializedState)
    expect(localStorage.getItem(LEGACY_OWNER_STORAGE_KEY)).toBe('user-1')
  })

  it('invalidates the preview when import options change', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, tasks: [] }))
    const onPreview = vi.fn().mockResolvedValue(importResult)
    render(
      <BrowserDataImportSection
        authenticatedUserId="user-1"
        authenticatedUserEmail={null}
        onPreview={onPreview}
        onCommit={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview browser data' }))
    await screen.findByText('Version 2 preview')

    fireEvent.click(screen.getByRole('checkbox', { name: /Import theme and sidebar/ }))

    await waitFor(() => expect(screen.queryByText('Version 2 preview')).toBeNull())
  })

  it('shows an ownership warning without blocking an explicit confirmation', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, tasks: [] }))
    localStorage.setItem(LEGACY_OWNER_STORAGE_KEY, 'another-user')
    render(
      <BrowserDataImportSection
        authenticatedUserId="user-1"
        authenticatedUserEmail={null}
        onPreview={vi.fn().mockResolvedValue(importResult)}
        onCommit={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Preview browser data' }))

    expect(await screen.findByText(/previously associated with a different account/)).not.toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm import' }).disabled).toBe(true)
  })
})
