import { useState } from 'react'
import App from '../App'
import { useAuth } from './AuthProvider'
import { LoginView } from './LoginView'

export const PLANNER_OWNER_STORAGE_KEY = 'lets-do.planner.owner.v1'

// oxlint-disable-next-line react/only-export-components -- exported for the storage safety regression test.
export function claimPlannerForUser(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  userId: string,
): boolean {
  try {
    const existingOwner = storage.getItem(PLANNER_OWNER_STORAGE_KEY)
    if (existingOwner) return existingOwner === userId
    storage.setItem(PLANNER_OWNER_STORAGE_KEY, userId)
    return storage.getItem(PLANNER_OWNER_STORAGE_KEY) === userId
  } catch {
    return false
  }
}

export function AuthGate() {
  const { status, user, signOut } = useAuth()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  if (status === 'loading') return <AuthenticationLoadingView />
  if (status === 'unauthenticated' || !user) return <LoginView />

  const plannerAllowed = claimPlannerForUser(window.localStorage, user.id)
  const logout = async () => {
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await signOut()
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Sign out failed.')
    } finally {
      setLoggingOut(false)
    }
  }

  if (!plannerAllowed) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
        <section className="max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          <h1 className="text-2xl font-black text-slate-950">Planner data is protected</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            This browser&apos;s existing planner belongs to another account. It will remain hidden
            until account-scoped backend data replaces local planner storage in Stage 2.
          </p>
          {logoutError && <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{logoutError}</p>}
          <button
            type="button"
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            onClick={() => void logout()}
            disabled={loggingOut}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <>
      <AccountControl
        email={user.email ?? 'Signed-in account'}
        loggingOut={loggingOut}
        logoutError={logoutError}
        onLogout={() => void logout()}
      />
      <App key={user.id} />
    </>
  )
}

function AuthenticationLoadingView() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4" aria-busy="true">
      <div className="text-center" role="status">
        <div className="mx-auto size-9 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        <p className="mt-4 text-sm font-bold text-slate-600">Restoring your session…</p>
      </div>
    </main>
  )
}

function AccountControl({
  email,
  loggingOut,
  logoutError,
  onLogout,
}: {
  email: string
  loggingOut: boolean
  logoutError: string | null
  onLogout: () => void
}) {
  return (
    <aside className="fixed right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
      <span className="max-w-40 truncate px-1 text-xs font-semibold text-slate-500">{email}</span>
      <button
        type="button"
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        onClick={onLogout}
        disabled={loggingOut}
      >
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </button>
      {logoutError && <span className="sr-only" role="alert">{logoutError}</span>}
    </aside>
  )
}
