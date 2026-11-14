import { ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/types/database'

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) return 0
  return count ?? 0
}

export async function listNotifications(limit = 100): Promise<AppNotification[]> {
  const result = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  return ensureOk(result, 'We could not load your notifications.') as AppNotification[]
}

export async function markRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  ensureOk(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids))
}

export async function markAllRead(): Promise<void> {
  ensureOk(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null))
}

export async function deleteNotification(id: string): Promise<void> {
  ensureOk(await supabase.from('notifications').delete().eq('id', id))
}

/**
 * Ask the database to create due-date, revision and lecture reminders (idempotent). Lecture reminders are only for
 * official sessions the student has confirmed, and follow their timetable preferences.
 */
export async function generateDueNotifications(): Promise<number> {
  const results = await Promise.all([supabase.rpc('generate_due_notifications'), supabase.rpc('generate_lecture_notifications')])
  return results.reduce((sum, { data, error }) => sum + (!error && typeof data === 'number' ? data : 0), 0)
}

/** Optional browser notification; only shown when the student granted permission in Settings. */
export function showBrowserNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/icons/icon-192.png', tag: title })
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}
