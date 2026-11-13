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

/** Days (Accra time) with lesson progress, one row per lesson per day. The study streak counts these days only. */
export function listLessonDays(sinceIso: string): Promise<{ day: string; lesson_id: string }[]> {
  return withOfflineCache(`lesson-days:${sinceIso}`, async () => {
    const result = await supabase.from('lesson_days').select('day, lesson_id').gte('day', sinceIso).order('day').limit(5000)
    return ensureOk(result, 'We could not load your study streak.') as { day: string; lesson_id: string }[]
  })
}

export async function searchContent(query: string): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('search_content', { p_query: query, p_limit: 60 })
  ensureOk({ data, error }, 'Search is unavailable right now.')
  return (data ?? []) as SearchResult[]
}
