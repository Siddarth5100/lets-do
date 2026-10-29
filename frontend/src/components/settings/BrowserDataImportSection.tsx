import { useState } from 'react'
import type { BrowserDataImportResult } from '../../api/planner'
import { LEGACY_OWNER_STORAGE_KEY, STORAGE_KEY } from '../../utils/storage'

interface BrowserDataImportSectionProps {
  authenticatedUserId: string | null
  authenticatedUserEmail: string | null
  onPreview: (
    serializedState: string,
    includeSettings: boolean,
  ) => Promise<BrowserDataImportResult>
  onCommit: (
    serializedState: string,
    includeSettings: boolean,
    previewDigest: string,
  ) => Promise<BrowserDataImportResult>
}

interface PreviewSnapshot {
  serializedState: string
  includeSettings: boolean
  result: BrowserDataImportResult
  ownerWarning: string | null
}

function requestErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The browser data import could not be completed.'
}

export function BrowserDataImportSection({
  authenticatedUserId,
  authenticatedUserEmail,
  onPreview,
  onCommit,
}: BrowserDataImportSectionProps) {
  const [includeSettings, setIncludeSettings] = useState(false)
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null)
  const [commitResult, setCommitResult] = useState<BrowserDataImportResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewBrowserData = async () => {
    setBusy(true)
    setError(null)
    setCommitResult(null)
    setConfirmed(false)
    try {
      const serializedState = window.localStorage.getItem(STORAGE_KEY)
      if (!serializedState) {
        throw new Error('No Let’s Do browser data was found on this device.')
      }
      const legacyOwner = window.localStorage.getItem(LEGACY_OWNER_STORAGE_KEY)
      const ownerWarning = legacyOwner && legacyOwner !== authenticatedUserId
        ? 'This browser data was previously associated with a different account identifier.'
        : null
      const result = await onPreview(serializedState, includeSettings)
      setPreview({ serializedState, includeSettings, result, ownerWarning })
    } catch (previewError) {
      setPreview(null)
      setError(requestErrorMessage(previewError))
    } finally {
      setBusy(false)
    }
  }

  const commitBrowserData = async () => {
    if (!preview || !confirmed) return
    setBusy(true)
    setError(null)
    try {
      const result = await onCommit(
        preview.serializedState,
        preview.includeSettings,
        preview.result.previewDigest,
      )
      setCommitResult(result)
      setPreview(null)
      setConfirmed(false)
    } catch (commitError) {
      setError(requestErrorMessage(commitError))
    } finally {
      setBusy(false)
    }
  }

  const changeIncludeSettings = (nextValue: boolean) => {
    setIncludeSettings(nextValue)
    setPreview(null)
    setCommitResult(null)
    setConfirmed(false)
    setError(null)
  }

  return (
    <section className="panel p-5 sm:p-7" aria-labelledby="browser-data-import-heading">
      <h2 id="browser-data-import-heading" className="text-xl font-black text-slate-900">
        Import browser data
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Preview planner data saved by an earlier browser-only version, then import it into your
        signed-in account. Existing server data and the original browser copy are kept unchanged.
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        Importing into: {authenticatedUserEmail ?? 'your authenticated account'}
      </p>

      <label className="mt-5 flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 size-4 rounded border-slate-300 accent-[var(--accent)]"
          checked={includeSettings}
          disabled={busy}
          onChange={(event) => changeIncludeSettings(event.target.checked)}
        />
        <span>
          Import theme and sidebar preferences if this account does not already have settings.
        </span>
      </label>

      <button
        type="button"
        className="button-secondary mt-5"
        disabled={busy}
        onClick={() => void previewBrowserData()}
      >
        {busy && !preview ? 'Checking browser data…' : 'Preview browser data'}
      </button>

      {error && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}

      {preview && (
        <div className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="font-black text-slate-900">
              Version {preview.result.sourceVersion ?? 'unknown'} preview
            </h3>
            <ImportSummary result={preview.result} />
          </div>
          {preview.ownerWarning && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              {preview.ownerWarning} Import only if this data belongs to you.
            </p>
          )}
          <ImportMessages result={preview.result} />
          <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-slate-300 accent-[var(--accent)]"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I reviewed this preview and confirm that this browser data should be imported into
              {authenticatedUserEmail ? ` ${authenticatedUserEmail}` : ' this account'}.
            </span>
          </label>
          <button
            type="button"
            className="button-primary"
            disabled={busy || !confirmed || preview.result.sourceVersion === null}
            onClick={() => void commitBrowserData()}
          >
            {busy ? 'Importing…' : 'Confirm import'}
          </button>
        </div>
      )}

      {commitResult && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status">
          <h3 className="font-black text-emerald-900">Browser data import finished</h3>
          <ImportSummary result={commitResult} />
          <p className="mt-2 text-sm text-emerald-800">
            Created records are shown above. Existing records were left unchanged, and you can
            safely preview and retry this import.
          </p>
          <ImportMessages result={commitResult} />
        </div>
      )}
    </section>
  )
}

function ImportSummary({ result }: { result: BrowserDataImportResult }) {
  const summaries = [
    ['Tasks', result.tasks],
    ['Categories', result.categories],
    ['Activity dates', result.activityDates],
    ['Completion events', result.completionEvents],
  ] as const
  return (
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {summaries.map(([label, summary]) => (
        <div key={label} className="rounded-xl bg-slate-50 px-3 py-2 text-slate-600">
          <strong className="block text-slate-800">{label}</strong>
          {summary.valid} valid · {summary.invalid} skipped
          {(summary.created > 0 || summary.existing > 0) && (
            <span className="block text-xs">
              {summary.created} created · {summary.existing} already present
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ImportMessages({ result }: { result: BrowserDataImportResult }) {
  if (result.issues.length === 0 && result.warnings.length === 0) return null
  return (
    <div className="space-y-3 text-sm">
      {result.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-amber-800">
          {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      {result.issues.length > 0 && (
        <div>
          <p className="font-bold text-slate-800">Skipped records</p>
          <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-slate-600">
            {result.issues.map((issue, index) => (
              <li key={`${issue.entity}-${issue.sourceId ?? index}`}>
                {issue.entity}{issue.sourceId ? ` (${issue.sourceId})` : ''}: {issue.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
