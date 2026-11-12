import type { ReviewRating } from '@/types/database'

/**
 * Spaced-repetition scheduling (a variant of SM-2). Each review rating adjusts the ease factor and the
 * interval until the next review; lapses ("again") reset the item to short-term relearning.
 */
export interface SchedulingState {
  easeFactor: number
  intervalDays: number
  repetitions: number
  lapses: number
}

export interface SchedulingResult extends SchedulingState {
  dueAt: Date
  status: 'learning' | 'review' | 'mastered'
}

export const MIN_EASE = 1.3
export const MAX_EASE = 3.5
export const MASTERED_INTERVAL_DAYS = 21
const RELEARN_MINUTES = 10
const DAY_MS = 86_400_000

const clampEase = (ease: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100))

export function scheduleReview(state: SchedulingState, rating: ReviewRating, now: Date = new Date()): SchedulingResult {
  let { easeFactor, intervalDays, repetitions, lapses } = state

  switch (rating) {
    case 'again':
      lapses += 1
      repetitions = 0
      easeFactor = clampEase(easeFactor - 0.2)
      intervalDays = 0
      return { easeFactor, intervalDays, repetitions, lapses, dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000), status: 'learning' }
    case 'hard':
      easeFactor = clampEase(easeFactor - 0.15)
      intervalDays = repetitions === 0 ? 1 : Math.max(1, Math.round(intervalDays * 1.2))
      break
    case 'good':
      intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(1, Math.round(intervalDays * easeFactor))
      break
    case 'easy':
      easeFactor = clampEase(easeFactor + 0.15)
      intervalDays = repetitions === 0 ? 3 : Math.max(2, Math.round(intervalDays * easeFactor * 1.3))
      break
  }
  repetitions += 1
  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    status: intervalDays >= MASTERED_INTERVAL_DAYS ? 'mastered' : 'review',
  }
}

/** Human-readable preview of the next interval for each rating button. */
export function intervalLabel(state: SchedulingState, rating: ReviewRating): string {
  const r = scheduleReview(state, rating, new Date(0))
  if (rating === 'again') return `${RELEARN_MINUTES} min`
  return r.intervalDays === 1 ? '1 day' : r.intervalDays < 30 ? `${r.intervalDays} days` : `${Math.round(r.intervalDays / 30)} mo`
}

export function isDue(dueAt: string | Date, now: Date = new Date()): boolean {
  return new Date(dueAt).getTime() <= now.getTime()
}
