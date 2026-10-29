import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from './AuthProvider'

type AuthenticationFormMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'confirmation-pending'

export function LoginView() {
  const {
    authenticationMessage,
    clearAuthenticationMessage,
    requestPasswordReset,
    resendSignupConfirmation,
    restorationError,
    signIn,
    signUp,
  } = useAuth()
  const [mode, setMode] = useState<AuthenticationFormMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const normalizedEmail = email.trim()

  const selectMode = (nextMode: AuthenticationFormMode) => {
    setMode(nextMode)
    setSubmitError(null)
    setStatusMessage(null)
    clearAuthenticationMessage()
  }

  const submitAuthentication = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    setStatusMessage(null)
    try {
      if (mode === 'sign-in') {
        await signIn(normalizedEmail, password)
      } else if (mode === 'sign-up') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
        if (password !== confirmedPassword) throw new Error('The passwords do not match.')
        const result = await signUp(normalizedEmail, password)
        if (result.confirmationRequired) setMode('confirmation-pending')
      } else if (mode === 'forgot-password') {
        await requestPasswordReset(normalizedEmail)
        setStatusMessage(
          'If an account exists for that email, a password recovery link has been sent.',
        )
      }
    } catch (error) {
      setSubmitError(authenticationErrorMessage(error, mode))
    } finally {
      setSubmitting(false)
    }
  }

  const resendConfirmation = async () => {
    setSubmitting(true)
    setSubmitError(null)
    setStatusMessage(null)
    try {
      await resendSignupConfirmation(normalizedEmail)
      setStatusMessage(
        'If confirmation is still required, another confirmation email has been sent.',
      )
    } catch (error) {
      setSubmitError(authenticationErrorMessage(error, mode))
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode === 'sign-up'
    ? 'Create your account'
    : mode === 'forgot-password'
      ? 'Reset your password'
      : mode === 'confirmation-pending'
        ? 'Check your email'
        : 'Welcome back'

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-indigo-600">Let&apos;s Do</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {mode === 'sign-up' && 'Create an account to keep your planner securely synchronized.'}
          {mode === 'forgot-password' && 'Enter your email and we’ll send recovery instructions.'}
          {mode === 'confirmation-pending' && (
            <>We sent a confirmation link to <strong>{normalizedEmail}</strong>.</>
          )}
          {mode === 'sign-in' && 'Sign in to continue planning your day.'}
        </p>

        {mode === 'confirmation-pending' ? (
          <div className="mt-7 space-y-4">
            <button
              type="button"
              className="button-primary w-full"
              disabled={submitting}
              onClick={() => void resendConfirmation()}
            >
              {submitting ? 'Sending…' : 'Resend confirmation email'}
            </button>
            <button
              type="button"
              className="button-secondary w-full"
              disabled={submitting}
              onClick={() => selectMode('sign-in')}
            >
              Back to sign in
            </button>
            <AuthenticationFeedback
              error={submitError}
              status={statusMessage}
              callbackMessage={authenticationMessage}
              restorationError={restorationError}
            />
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={submitAuthentication}>
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
            {mode !== 'forgot-password' && (
              <label className="field-label">
                Password
                <input
                  className="field-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  minLength={mode === 'sign-up' ? 8 : undefined}
                  required
                  disabled={submitting}
                />
              </label>
            )}
            {mode === 'sign-up' && (
              <label className="field-label">
                Confirm password
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
            )}
            <AuthenticationFeedback
              error={submitError}
              status={statusMessage}
              callbackMessage={authenticationMessage}
              restorationError={restorationError}
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
              disabled={submitting}
            >
              {submitting
                ? 'Please wait…'
                : mode === 'sign-up'
                  ? 'Create account'
                  : mode === 'forgot-password'
                    ? 'Send recovery link'
                    : 'Sign in'}
            </button>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm font-semibold text-indigo-700">
              {mode === 'sign-in' && (
                <>
                  <button type="button" onClick={() => selectMode('sign-up')}>Create account</button>
                  <button type="button" onClick={() => selectMode('forgot-password')}>Forgot password?</button>
                </>
              )}
              {mode !== 'sign-in' && (
                <button type="button" onClick={() => selectMode('sign-in')}>Back to sign in</button>
              )}
            </div>
          </form>
        )}
      </section>
    </main>
  )
}

function AuthenticationFeedback({
  error,
  status,
  callbackMessage,
  restorationError,
}: {
  error: string | null
  status: string | null
  callbackMessage: { kind: 'success' | 'error'; text: string } | null
  restorationError: string | null
}) {
  const visibleError = error
    ?? restorationError
    ?? (callbackMessage?.kind === 'error' ? callbackMessage.text : null)
  const visibleStatus = status
    ?? (callbackMessage?.kind === 'success' ? callbackMessage.text : null)
  if (visibleError) {
    return (
      <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
        {visibleError}
      </p>
    )
  }
  return visibleStatus ? (
    <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
      {visibleStatus}
    </p>
  ) : null
}

function authenticationErrorMessage(error: unknown, mode: AuthenticationFormMode): string {
  if (mode === 'forgot-password') {
    return 'The recovery request could not be completed. Please wait and try again.'
  }
  return error instanceof Error ? error.message : 'Authentication failed. Please try again.'
}
