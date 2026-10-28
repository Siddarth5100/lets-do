import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from './AuthProvider'

export function LoginView() {
  const { restorationError, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      await signIn(email.trim(), password)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Sign in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-indigo-600">Let&apos;s Do</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Welcome back</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Sign in to continue planning your day.
        </p>

        <form className="mt-7 space-y-5" onSubmit={submitLogin}>
          <label className="field-label">
            Email
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={submitting}
            />
          </label>
          <label className="field-label">
            Password
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={submitting}
            />
          </label>
          {(submitError || restorationError) && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
              {submitError ?? restorationError}
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
