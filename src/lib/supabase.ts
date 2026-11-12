import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the public Supabase configuration is present. The UI shows a setup screen otherwise. */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'gradpath-auth',
  },
})

export function siteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL as string | undefined
  return (configured && configured.trim()) || window.location.origin
}
