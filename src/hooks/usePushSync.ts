import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { syncPush } from '@/services/notifications/push'
import { getPreferences } from '@/services/profile'

/**
 * Keeps this device subscribed to streak reminders while the student has them turned on (for example after
 * signing back in, or when the browser renewed its subscription). Never asks for permission by itself.
 */
export function usePushSync(): void {
  const { user } = useAuth()
  const prefs = useQuery({ queryKey: ['preferences', user?.id], queryFn: () => getPreferences(user?.id as string), enabled: Boolean(user) })
  const wanted = prefs.data?.browser_notifications === true

  useEffect(() => {
    if (wanted) void syncPush(true).catch(() => undefined)
  }, [wanted, user?.id])
}
