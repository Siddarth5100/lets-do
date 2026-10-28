import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthenticationStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthenticationStatus
  session: Session | null
  user: User | null
  restorationError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthenticationStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [restorationError, setRestorationError] = useState<string | null>(null)

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession)
    setStatus(nextSession ? 'authenticated' : 'unauthenticated')
  }, [])

  useEffect(() => {
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      authEventReceived = true
      setRestorationError(null)
      applySession(nextSession)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return
      if (error) {
        setRestorationError('Your saved session could not be restored. Please sign in again.')
        applySession(null)
        return
      }
      applySession(data.session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [applySession])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    setRestorationError(null)
    applySession(data.session)
  }, [applySession])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    applySession(null)
    if (error) throw new Error(error.message)
  }, [applySession])

  const contextValue = useMemo<AuthContextValue>(() => ({
    status,
    session,
    user: session?.user ?? null,
    restorationError,
    signIn,
    signOut,
  }), [restorationError, session, signIn, signOut, status])

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components -- the hook belongs to this provider context.
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
