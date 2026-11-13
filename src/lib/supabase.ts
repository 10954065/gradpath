import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the public Supabase configuration is present. The UI shows a setup screen otherwise. */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Fail fast while the browser reports no connection. The client's built-in retries (with backoff) cannot
 * succeed offline and would delay the IndexedDB fallback by several seconds per request; an AbortError
 * stops them immediately. Retries still apply on flaky-but-connected networks.
 */
export const offlineAwareFetch: typeof fetch = (input, init) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new DOMException('Failed to fetch: the device is offline', 'AbortError'))
  }
  return fetch(input, init)
}

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  global: { fetch: offlineAwareFetch },
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
