import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import { scheduleReview } from '@/lib/scheduler'
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/utils'
import { withOfflineCache } from '@/services/offline/cache'
import { writeOrQueue } from '@/services/offline/sync'
import type { Flashcard, ReviewRating, RevisionItem, RevisionReview } from '@/types/database'

export function listRevisionItems(): Promise<RevisionItem[]> {
  return withOfflineCache('revision-items', async () => {
    const result = await supabase.from('revision_items').select('*').order('due_at')
    return ensureOk(result, 'We could not load your revision queue.') as RevisionItem[]
  })
}

export function listReviews(limit = 500): Promise<RevisionReview[]> {
  return withOfflineCache('revision-reviews', async () => {
    const result = await supabase.from('revision_reviews').select('*').order('reviewed_at', { ascending: false }).limit(limit)
    return ensureOk(result, 'We could not load your revision history.') as RevisionReview[]
  })
}

/** Record a review: reschedule the item (spaced repetition) and append to the review history. Offline-safe. */
export async function reviewItem(userId: string, item: RevisionItem, rating: ReviewRating): Promise<RevisionItem> {
  const result = scheduleReview(
    { easeFactor: Number(item.ease_factor), intervalDays: Number(item.interval_days), repetitions: item.repetitions, lapses: item.lapses },
    rating,
  )
  const reviewedAt = new Date().toISOString()
  const updated: RevisionItem = {
    ...item,
    ease_factor: result.easeFactor,
    interval_days: result.intervalDays,
    repetitions: result.repetitions,
    lapses: result.lapses,
    due_at: result.dueAt.toISOString(),
    last_reviewed_at: reviewedAt,
    status: result.status,
  }
  await writeOrQueue(userId, {
    table: 'revision_items',
    op: 'upsert',
    match: { id: item.id },
    payload: {
      user_id: userId,
      item_type: item.item_type,
      lesson_id: item.lesson_id,
      flashcard_id: item.flashcard_id,
      topic: item.topic,
      course_id: item.course_id,
      ease_factor: updated.ease_factor,
      interval_days: updated.interval_days,
      repetitions: updated.repetitions,
      lapses: updated.lapses,
      due_at: updated.due_at,
      last_reviewed_at: reviewedAt,
      status: updated.status,
    },
  })
  await writeOrQueue(userId, {
    table: 'revision_reviews',
    op: 'upsert',
    match: { id: newId() },
    payload: {
      user_id: userId,
      revision_item_id: item.id,
      rating,
      previous_interval: Number(item.interval_days),
      new_interval: result.intervalDays,
      ease_factor: result.easeFactor,
      reviewed_at: reviewedAt,
    },
  })
  return updated
}

/** Add a lesson, flashcard or free topic to the revision queue (due now). */
export async function addToQueue(
  userId: string,
  target: { lessonId?: string; flashcardId?: string; topic?: string; courseId?: string | null; reason?: string },
): Promise<void> {
  const itemType = target.lessonId ? 'lesson' : target.flashcardId ? 'flashcard' : 'topic'
  await writeOrQueue(userId, {
    table: 'revision_items',
    op: 'upsert',
    match: { id: newId() },
    payload: {
      user_id: userId,
      item_type: itemType,
      lesson_id: target.lessonId ?? null,
      flashcard_id: target.flashcardId ?? null,
      topic: target.topic ?? null,
      course_id: target.courseId ?? null,
      reason: target.reason ?? '',
      due_at: new Date().toISOString(),
    },
    onConflict: target.lessonId ? 'user_id,lesson_id' : target.flashcardId ? 'user_id,flashcard_id' : 'id',
  })
}

export async function removeFromQueue(userId: string, itemId: string): Promise<void> {
  await writeOrQueue(userId, { table: 'revision_items', op: 'delete', match: { id: itemId } })
}

// --- flashcards ----------------------------------------------------------------------------------
export function listFlashcards(): Promise<Flashcard[]> {
  return withOfflineCache('flashcards', async () => {
    const all: Flashcard[] = []
    // Curriculum decks exceed PostgREST's default page size; page through them.
    for (let from = 0; ; from += 1000) {
      const result = await supabase.from('flashcards').select('*').order('created_at').range(from, from + 999)
      const page = ensureOk(result, 'We could not load the flashcards.') as Flashcard[]
      all.push(...page)
      if (page.length < 1000) break
    }
    return all
  })
}

export const flashcardSchema = z.object({
  front: z.string().trim().min(1, 'Write the question side').max(2000),
  back: z.string().trim().min(1, 'Write the answer side').max(4000),
  course_id: z.string().uuid().nullable(),
  lesson_id: z.string().uuid().nullable(),
})
export type FlashcardInput = z.infer<typeof flashcardSchema>

export async function saveOwnFlashcard(userId: string, input: FlashcardInput, existing?: Flashcard): Promise<void> {
  const parsed = flashcardSchema.parse(input)
  await writeOrQueue(userId, {
    table: 'flashcards',
    op: 'upsert',
    match: { id: existing?.id ?? newId() },
    payload: { ...parsed, user_id: userId, source: 'student', is_published: true },
    baseUpdatedAt: existing?.updated_at ?? null,
  })
}

export async function deleteOwnFlashcard(userId: string, cardId: string): Promise<void> {
  await writeOrQueue(userId, { table: 'flashcards', op: 'delete', match: { id: cardId } })
}
