import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { flushOutbox, refreshSyncCounts } from '@/services/offline/sync'

const SYNC_INTERVAL_MS = 30_000

/** Replays queued offline writes on start-up, on reconnection and periodically while the app is open. */
export function useBackgroundSync(): void {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return
    const userId = user.id
    let cancelled = false
    const run = async () => {
      if (!navigator.onLine || cancelled) return
      await flushOutbox(userId)
      if (!cancelled) await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'profile' })
    }
    void refreshSyncCounts(userId)
    void run()
    const onOnline = () => void run()
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void flushOutbox(userId), SYNC_INTERVAL_MS)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
  }, [user, queryClient])
}
