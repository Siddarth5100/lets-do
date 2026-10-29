import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from './AuthProvider'

export function UpdatePasswordView() {
  const { signOut, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.')
      return
    }
    if (password !== confirmedPassword) {
      setError('The passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await updatePassword(password)
    } catch (updateError) {
      setError(updateError instanceof Error
        ? updateError.message
        : 'Your password could not be updated.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-indigo-600">Let&apos;s Do</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Choose a new password</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Enter a new password before continuing to your planner.
        </p>
        <form className="mt-7 space-y-5" onSubmit={submitPassword}>
          <label className="field-label">
            New password
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={submitting}
            />
          </label>
          <label className="field-label">
            Confirm new password
            <input
              className="field-input"
              type="password"
              value={confirmedPassword}
              onChange={(event) => setConfirmedPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={submitting}
            />
          </label>
          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button-primary w-full" disabled={submitting}>
            {submitting ? 'Updating password…' : 'Update password'}
          </button>
          <button
            type="button"
            className="button-secondary w-full"
            disabled={submitting}
            onClick={() => void signOut().catch(() => undefined)}
          >
            Back to sign in
          </button>
        </form>
      </section>
    </main>
  )
}
