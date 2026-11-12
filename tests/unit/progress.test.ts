import { describe, expect, it } from 'vitest'
import { courseLessonIds, nextLesson, readingPercentFromScroll, summariseProgress } from '@/lib/progress'
import type { LessonProgress } from '@/types/database'

function row(lessonId: string, status: LessonProgress['status'], reading = 0): LessonProgress {
  return {
    user_id: 'u',
    lesson_id: lessonId,
    status,
    reading_percent: reading,
    time_spent_seconds: 0,
    last_section: null,
    quiz_best_percent: null,
    mastered_at: null,
    started_at: '2026-11-01T00:00:00Z',
    completed_at: null,
    updated_at: '2026-11-01T00:00:00Z',
  }
}

describe('progress helpers', () => {
  it('summarises completed and in-progress lessons', () => {
    const summary = summariseProgress(['a', 'b', 'c', 'd'], [row('a', 'completed', 100), row('b', 'in_progress', 30), row('x', 'completed')])
    expect(summary).toEqual({ total: 4, completed: 1, inProgress: 1, percent: 25 })
  })

  it('returns 0% for an empty course without dividing by zero', () => {
    expect(summariseProgress([], [])).toEqual({ total: 0, completed: 0, inProgress: 0, percent: 0 })
  })

  it('lists lesson ids in course order', () => {
    expect(courseLessonIds({ modules: [{ lessons: [{ id: '1' }, { id: '2' }] }, { lessons: [{ id: '3' }] }] })).toEqual(['1', '2', '3'])
  })

  it('picks the first unfinished lesson as next', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(nextLesson(ordered, [row('a', 'completed')])?.id).toBe('b')
    expect(nextLesson(ordered, ordered.map((l) => row(l.id, 'completed')))).toBeNull()
  })

  it('computes reading percentage from scroll position and clamps it', () => {
    expect(readingPercentFromScroll(100, 1000, 0, 600)).toBe(50)
    expect(readingPercentFromScroll(100, 1000, 5000, 600)).toBe(100)
    expect(readingPercentFromScroll(1000, 1000, 0, 600)).toBe(0)
    expect(readingPercentFromScroll(0, 0, 0, 600)).toBe(0)
  })
})
