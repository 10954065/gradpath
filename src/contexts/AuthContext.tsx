import type { Session, User } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { clearUserOfflineData } from '@/services/offline/db'
import { getProfile, isAdmin as fetchIsAdmin } from '@/services/profile'
import type { Profile } from '@/types/database'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  /** True until the initial session (and profile, when signed in) has loaded. */
  isLoading: boolean
  isPasswordRecovery: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session)
      })
      .finally(() => {
        if (active) setIsRestoring(false)
      })
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false)
        queryClient.clear()
      }
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [queryClient])

  const userId = session?.user.id
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  })
  const adminQuery = useQuery({
    queryKey: ['is-admin', userId],
    queryFn: fetchIsAdmin,
    enabled: Boolean(userId),
    staleTime: 10 * 60 * 1000,
  })

  const refreshProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['profile', userId] })
  }, [queryClient, userId])

  const signOut = useCallback(async () => {
    const id = userId
    await supabase.auth.signOut()
    // Shared-device privacy: remove this student's cached offline data on sign-out.
    if (id) await clearUserOfflineData(id).catch(() => undefined)
    queryClient.clear()
  }, [queryClient, userId])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile: profileQuery.data ?? null,
      isAdmin: adminQuery.data === true,
      isLoading: isRestoring || (Boolean(userId) && profileQuery.isPending && !profileQuery.isError),
      isPasswordRecovery,
      refreshProfile,
      signOut,
    }),
    [session, profileQuery.data, profileQuery.isPending, profileQuery.isError, adminQuery.data, isRestoring, userId, isPasswordRecovery, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For components that only render inside protected routes. */
export function useRequiredUser(): { user: User; profile: Profile | null } {
  const { user, profile } = useAuth()
  if (!user) throw new Error('useRequiredUser used outside a protected route')
  return { user, profile }
}
