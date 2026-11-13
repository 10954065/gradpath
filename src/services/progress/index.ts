import { AppError, ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/utils'
import { withOfflineCache } from '@/services/offline/cache'
import { writeOrQueue } from '@/services/offline/sync'
import type { Bookmark, LessonProgress } from '@/types/database'

export function listMyProgress(): Promise<LessonProgress[]> {
  return withOfflineCache('progress:all', async () => {
    const result = await supabase.from('lesson_progress').select('*')
    return ensureOk(result, 'We could not load your progress.') as LessonProgress[]
  })
}

export interface ReadingUpdate {
  userId: string
  lessonId: string
  readingPercent: number
  timeSpentSeconds: number
  lastSection: string | null
}

/** Save reading progress. The database keeps the maximum reading percentage and never completes a lesson implicitly. */
export async function saveReading(update: ReadingUpdate): Promise<{ queued: boolean }> {
  return writeOrQueue(update.userId, {
    table: 'lesson_progress',
    op: 'upsert',
    match: { user_id: update.userId, lesson_id: update.lessonId },
    payload: {
      reading_percent: Math.round(update.readingPercent),
      time_spent_seconds: Math.round(update.timeSpentSeconds),
      last_section: update.lastSection,
      // When the reading happened, so reading saved offline counts towards the streak on the day it was done.
      last_read_at: new Date().toISOString(),
    },
  })
}

/** Explicit completion. The server rejects it unless the lesson's reading (and quiz, if configured) requirements are met. */
export async function setLessonCompleted(userId: string, lessonId: string, completed: boolean, readingPercent: number): Promise<void> {
  const { error } = await supabase
    .from('lesson_progress')
    .upsert(
      { user_id: userId, lesson_id: lessonId, status: completed ? 'completed' : 'in_progress', reading_percent: Math.round(readingPercent) },
      { onConflict: 'user_id,lesson_id' },
    )
  if (error) {
    if (error.code === 'P0001') throw new AppError(error.message, { cause: error })
    throw new AppError(
      completed ? 'We could not mark this lesson as complete. Check your connection and try again.' : 'We could not update this lesson.',
      { cause: error },
    )
  }
}

// --- bookmarks -------------------------------------------------------------------------------------
export function listBookmarks(): Promise<Bookmark[]> {
  return withOfflineCache('bookmarks', async () => {
    const result = await supabase.from('bookmarks').select('*').order('created_at', { ascending: false })
    return ensureOk(result, 'We could not load your bookmarks.') as Bookmark[]
  })
}

export async function addBookmark(userId: string, target: { lessonId?: string; resourceId?: string }): Promise<void> {
  await writeOrQueue(userId, {
    table: 'bookmarks',
    op: 'upsert',
    match: { id: newId() },
    payload: { user_id: userId, lesson_id: target.lessonId ?? null, resource_id: target.resourceId ?? null },
    onConflict: target.lessonId ? 'user_id,lesson_id' : 'user_id,resource_id',
  })
}

export async function removeBookmark(userId: string, bookmarkId: string): Promise<void> {
  await writeOrQueue(userId, { table: 'bookmarks', op: 'delete', match: { id: bookmarkId } })
}
