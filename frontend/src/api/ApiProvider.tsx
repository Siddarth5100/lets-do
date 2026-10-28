import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { frontendEnvironment } from '../lib/environment'
import { supabase } from '../lib/supabase'
import { ApiClient } from './client'
import type { ApiSession } from './client'

const ApiContext = createContext<ApiClient | null>(null)

function toApiSession(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']): ApiSession | null {
  return session ? { accessToken: session.access_token, userId: session.user.id } : null
}

export function ApiProvider({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const apiClient = useMemo(() => new ApiClient({
    baseUrl: frontendEnvironment.apiBaseUrl,
    getSession: async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) return null
      return toApiSession(data.session)
    },
    refreshSession: async () => {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) return null
      return toApiSession(data.session)
    },
    onAuthenticationFailure: async () => {
      try {
        await signOut()
      } catch {
        // AuthProvider still clears the local session state when local sign-out reports an error.
      }
    },
  }), [signOut])

  useEffect(() => {
    apiClient.setActiveUser(user?.id ?? null)
    return () => apiClient.abortAll()
  }, [apiClient, user?.id])

  return <ApiContext.Provider value={apiClient}>{children}</ApiContext.Provider>
}

// oxlint-disable-next-line react/only-export-components -- the hook belongs to this provider context.
export function useApi(): ApiClient {
  const context = useContext(ApiContext)
  if (!context) throw new Error('useApi must be used inside ApiProvider.')
  return context
}
