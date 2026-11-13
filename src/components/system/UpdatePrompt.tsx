import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

/** The "ready to work offline" notice is informational, so it clears itself instead of covering controls. */
const OFFLINE_READY_NOTICE_MS = 6000

/** Shows a prompt when a new version of the app has been downloaded, and confirms offline readiness. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  useEffect(() => {
    if (!offlineReady || needRefresh) return
    const timer = window.setTimeout(() => setOfflineReady(false), OFFLINE_READY_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [offlineReady, needRefresh, setOfflineReady])

  if (!needRefresh && !offlineReady) return null

  return (
    <div
      role="status"
      className="fixed right-4 bottom-20 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-surface p-4 shadow-raised lg:bottom-6"
    >
      <p className="text-sm font-medium">{needRefresh ? 'A new version of GradPath is available.' : 'GradPath is ready to work offline.'}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {needRefresh ? 'Reload to get the latest features and fixes.' : 'Lessons you open are saved on this device for offline reading.'}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setNeedRefresh(false)
            setOfflineReady(false)
          }}
        >
          Dismiss
        </Button>
        {needRefresh ? (
          <Button size="sm" onClick={() => void updateServiceWorker(true)}>
            Reload
          </Button>
        ) : null}
      </div>
    </div>
  )
}
