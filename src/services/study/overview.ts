import { ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'
import type { Announcement, PlatformSettings, SearchResult } from '@/types/database'

export function listAnnouncements(): Promise<Announcement[]> {
  return withOfflineCache('announcements', async () => {
    const result = await supabase
      .from('announcements')
      .select('*')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(100)
    return ensureOk(result, 'We could not load announcements.') as Announcement[]
  })
}

export function getPlatformSettings(): Promise<PlatformSettings> {
  return withOfflineCache('platform-settings', async () => {
    const result = await supabase.from('platform_settings').select('*').single()
    return ensureOk(result, 'We could not load platform settings.') as PlatformSettings
  })
}

/** Days (Accra time) with recorded learning activity — used for streaks and activity charts. */
export function listActivityDays(sinceIso: string): Promise<{ day: string; activities: number }[]> {
  return withOfflineCache(`activity:${sinceIso}`, async () => {
    const { data, error } = await supabase.rpc('activity_days', { p_since: sinceIso })
    ensureOk({ data, error }, 'We could not load your activity.')
    return (data ?? []) as { day: string; activities: number }[]
  })
}

export async function searchContent(query: string): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('search_content', { p_query: query, p_limit: 60 })
  ensureOk({ data, error }, 'Search is unavailable right now.')
  return (data ?? []) as SearchResult[]
}
