import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { focusedMinutes, isDone, isPaused, parseFocusState, pause, resume, startBreak, startFocus, type FocusState } from '@/lib/focusTimer'
import { logFocusMinutes } from '@/services/study/focus'

// One timer per device, kept in localStorage so it survives navigation, reloads and other tabs.
const KEY = 'gradpath:focus-timer'

function load(): FocusState | null {
  try {
    return parseFocusState(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

let current: FocusState | null = load()
const listeners = new Set<() => void>()

function setTimer(next: FocusState | null): void {
  current = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable (private mode): the timer still runs for this page.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    current = load()
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The current time, refreshed every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return active ? now : Date.now()
}

function useLogger() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return async (s: FocusState, minutes: number) => {
    if (!user || minutes < 1) return
    try {
      await logFocusMinutes(user.id, { title: s.title, courseId: s.courseId, startedAt: s.startedAt, minutes, target: s.target })
      toast.success(`${minutes} focused minute${minutes === 1 ? '' : 's'} logged in your planner.`)
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
    } catch (e) {
      toast.error(toUserMessage(e, 'We could not log your focused minutes.'))
    }
  }
}

/** Shows a system notification only when the student has already allowed them; never asks for permission. */
function notify(title: string, body: string): void {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return
    void navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, tag: 'gradpath-focus', data: { url: '/focus' } }))
  } catch {
    // Notifications are a convenience; the in-app message is enough.
  }
}

export function useFocusTimer() {
  const timer = useSyncExternalStore(subscribe, () => current, () => null)
  const now = useNow(Boolean(timer && !isPaused(timer)))
  const log = useLogger()
  return {
    timer,
    now,
    start: (opts: Parameters<typeof startFocus>[0]) => setTimer(startFocus(opts, Date.now())),
    pause: () => timer && setTimer(pause(timer, Date.now())),
    resume: () => timer && setTimer(resume(timer, Date.now())),
    /** Stop early: log the whole minutes focused so far, or discard them. */
    stop: async (keep: boolean) => {
      if (!timer) return
      const minutes = focusedMinutes(timer, Date.now())
      setTimer(null)
      if (keep) await log(timer, minutes)
    },
    endBreak: () => setTimer(null),
  }
}

/** Mounted once in the app shell: logs a finished focus phase, starts the break and ends it, wherever the student is. */
export function useFocusWatcher(): void {
  const timer = useSyncExternalStore(subscribe, () => current, () => null)
  const now = useNow(Boolean(timer && !isPaused(timer)))
  const log = useLogger()
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!timer || !isDone(timer, now)) return
    const key = `${timer.phase}|${timer.startedAt}`
    if (handled.current === key) return
    handled.current = key
    if (timer.phase === 'focus') {
      // Another tab may have handled it already.
      const stored = load()
      if (stored && (stored.phase !== 'focus' || stored.startedAt !== timer.startedAt)) return
      setTimer(startBreak(timer, Date.now()))
      const minutes = focusedMinutes(timer, now)
      void log(timer, minutes)
      notify('Focus session done', `${minutes} minutes logged. Time for a break.`)
    } else {
      setTimer(null)
      toast.info('Break over. Ready for another focus session?')
      notify('Break over', 'Ready for another focus session?')
    }
  }, [timer, now, log])
}
