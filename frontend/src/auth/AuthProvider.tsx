import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthenticationStatus = 'loading' | 'authenticated' | 'unauthenticated'
type AuthenticationMessage = { kind: 'success' | 'error'; text: string }

interface SignUpResult {
  confirmationRequired: boolean
}

interface AuthenticationCallback {
  intent: 'confirmed' | 'recovery' | null
  error: AuthenticationMessage | null
}

interface AuthContextValue {
  status: AuthenticationStatus
  session: Session | null
  user: User | null
  restorationError: string | null
  authenticationMessage: AuthenticationMessage | null
  passwordRecoveryActive: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<SignUpResult>
  resendSignupConfirmation: (email: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
  clearAuthenticationMessage: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthenticationStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [restorationError, setRestorationError] = useState<string | null>(null)
  const [authenticationMessage, setAuthenticationMessage] = useState<AuthenticationMessage | null>(null)
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false)
  const callbackRef = useRef(readAuthenticationCallback())

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession)
    setStatus(nextSession ? 'authenticated' : 'unauthenticated')
  }, [])

  useEffect(() => {
    let active = true
    let authEventReceived = false
    const finishCallback = (nextSession: Session | null, event: string | null) => {
      const callback = callbackRef.current
      if (callback.error) {
        setAuthenticationMessage(callback.error)
      } else if (event === 'PASSWORD_RECOVERY' || (callback.intent === 'recovery' && nextSession)) {
        setPasswordRecoveryActive(true)
        setAuthenticationMessage(null)
      } else if (callback.intent === 'confirmed' && nextSession) {
        setAuthenticationMessage({
          kind: 'success',
          text: 'Your email is confirmed. Welcome to Let’s Do.',
        })
      } else if (callback.intent && !nextSession && event !== 'INITIAL_SESSION') {
        setAuthenticationMessage({
          kind: 'error',
          text: 'This authentication link is invalid or has already been used.',
        })
      }
      if ((callback.intent && (nextSession || event !== 'INITIAL_SESSION')) || callback.error) {
        clearAuthenticationCallbackFromUrl()
        callbackRef.current = { intent: null, error: null }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      authEventReceived = true
      setRestorationError(null)
      finishCallback(nextSession, event)
      applySession(nextSession)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (authEventReceived && !callbackRef.current.intent && !callbackRef.current.error) return
      if (error) {
        if (callbackRef.current.error) {
          setAuthenticationMessage(callbackRef.current.error)
          clearAuthenticationCallbackFromUrl()
          callbackRef.current = { intent: null, error: null }
        } else {
          setRestorationError('Your saved session could not be restored. Please sign in again.')
        }
        applySession(null)
        return
      }
      finishCallback(data.session, null)
      applySession(data.session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [applySession])

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthenticationMessage(null)
    setPasswordRecoveryActive(false)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    setRestorationError(null)
    applySession(data.session)
  }, [applySession])

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    setAuthenticationMessage(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: createAuthenticationRedirect('confirmed') },
    })
    if (error) throw new Error(error.message)
    if (data.session) applySession(data.session)
    return { confirmationRequired: data.session === null }
  }, [applySession])

  const resendSignupConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: createAuthenticationRedirect('confirmed') },
    })
    if (error) throw new Error(error.message)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: createAuthenticationRedirect('recovery'),
    })
    if (error) throw new Error(error.message)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    setPasswordRecoveryActive(false)
    setAuthenticationMessage({
      kind: 'success',
      text: 'Your password has been updated.',
    })
  }, [])

  const clearAuthenticationMessage = useCallback(() => {
    setAuthenticationMessage(null)
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    setPasswordRecoveryActive(false)
    setAuthenticationMessage(null)
    applySession(null)
    if (error) throw new Error(error.message)
  }, [applySession])

  const contextValue = useMemo<AuthContextValue>(() => ({
    status,
    session,
    user: session?.user ?? null,
    restorationError,
    authenticationMessage,
    passwordRecoveryActive,
    signIn,
    signUp,
    resendSignupConfirmation,
    requestPasswordReset,
    updatePassword,
    signOut,
    clearAuthenticationMessage,
  }), [
    authenticationMessage,
    clearAuthenticationMessage,
    passwordRecoveryActive,
    requestPasswordReset,
    resendSignupConfirmation,
    restorationError,
    session,
    signIn,
    signOut,
    signUp,
    status,
    updatePassword,
  ])

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

function createAuthenticationRedirect(intent: 'confirmed' | 'recovery'): string {
  const redirectUrl = new URL(window.location.origin)
  redirectUrl.searchParams.set('auth', intent)
  return redirectUrl.toString()
}

function readAuthenticationCallback(): AuthenticationCallback {
  const currentUrl = new URL(window.location.href)
  const fragmentParameters = new URLSearchParams(currentUrl.hash.replace(/^#/, ''))
  const errorCode = currentUrl.searchParams.get('error_code')
    ?? fragmentParameters.get('error_code')
  const hasCallbackError = Boolean(
    currentUrl.searchParams.get('error')
    ?? fragmentParameters.get('error'),
  )
  const intent = currentUrl.searchParams.get('auth')

  if (errorCode || hasCallbackError) {
    return {
      intent: null,
      error: {
        kind: 'error',
        text: errorCode === 'otp_expired'
          ? 'This authentication link has expired. Request a new one.'
          : 'This authentication link is invalid or has already been used.',
      },
    }
  }
  return {
    intent: intent === 'confirmed' || intent === 'recovery' ? intent : null,
    error: null,
  }
}

function clearAuthenticationCallbackFromUrl(): void {
  const currentUrl = new URL(window.location.href)
  for (const parameter of ['auth', 'error', 'error_code', 'error_description']) {
    currentUrl.searchParams.delete(parameter)
  }
  if (/access_token|refresh_token|error(?:_code|_description)?=/.test(currentUrl.hash)) {
    currentUrl.hash = ''
  }
  window.history.replaceState(
    window.history.state,
    '',
    `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
  )
}

// oxlint-disable-next-line react/only-export-components -- the hook belongs to this provider context.
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
