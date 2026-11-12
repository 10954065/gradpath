import { supabase } from '@/lib/supabase'
import { AppError, isOfflineError } from '@/lib/errors'
import { cacheGet, cacheSet } from './db'

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Network-first read with an offline fallback: successful results are saved to the student's own
 * IndexedDB namespace; when the network is unavailable the last saved copy is returned instead.
 */
export async function withOfflineCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const userId = await currentUserId()
  try {
    const value = await fetcher()
    if (userId) await cacheSet(userId, key, value).catch(() => undefined)
    return value
  } catch (error) {
    if (userId && isOfflineError(error)) {
      const cached = await cacheGet<T>(userId, key).catch(() => null)
      if (cached) return cached.value
      throw new AppError('You are offline and this page has not been saved on this device yet.', { cause: error })
    }
    throw error
  }
}
