import { describe, expect, it } from 'vitest'
import { bestScoreAverage, currentStreak, streakStatus } from '@/lib/analytics'
import { recommend, type RecommendationInput } from '@/lib/recommendations'
import type { LessonProgress, QuizAttemptRow, RevisionItem } from '@/types/database'

const now = new Date('2026-11-12T12:00:00Z') // a Thursday
const lessons = [
  { id: 'l1', title: 'Encryption', courseCode: 'CSIT 605', moduleId: 'm1', moduleTitle: 'Cryptography', href: '/courses/csit-605/lessons/encryption' },
  { id: 'l2', title: 'Hashing', courseCode: 'CSIT 605', moduleId: 'm1', moduleTitle: 'Cryptography', href: '/courses/csit-605/lessons/hashing' },
]

function base(partial: Partial<RecommendationInput> = {}): RecommendationInput {
  return { now, masteryThreshold: 80, lessons, progress: [], attempts: [], quizzes: [], revision: [], assignments: [], studiedMinutesThisWeek: 600, weeklyTargetHours: 15, ...partial }
}

const progress = (lessonId: string, status: LessonProgress['status'], reading: number): LessonProgress => ({
  user_id: 'u', lesson_id: lessonId, status, reading_percent: reading, time_spent_seconds: 0, last_section: null, quiz_best_percent: null,
  mastered_at: null, started_at: '', completed_at: null, updated_at: '2026-11-11T10:00:00Z',
})

const attempt = (quizId: string, pct: number, at: string, breakdown: { lessonId: string; percent: number }[] = []): QuizAttemptRow => ({
  id: `${quizId}-${at}`, user_id: 'u', quiz_id: quizId, status: 'submitted', question_ids: [], started_at: at, deadline_at: null, submitted_at: at,
  score: null, max_score: null, percent: pct, mastery_threshold: 80, passed: pct >= 80, is_late: false, objective_breakdown: [],
  lesson_breakdown: breakdown.map((b) => ({ lessonId: b.lessonId, lessonTitle: '', earned: 0, possible: 0, percent: b.percent })),
})

describe('recommendation engine', () => {
  it('suggests starting the first lesson for a brand-new student', () => {
    const recs = recommend(base())
    expect(recs.map((r) => r.kind)).toContain('start')
    expect(recs.find((r) => r.kind === 'start')?.href).toBe(lessons[0]?.href)
  })

  it('explains weak topics from scores below the mastery threshold, weakest first', () => {
    const recs = recommend(base({ progress: [progress('l1', 'in_progress', 40)], attempts: [attempt('q1', 50, '2026-11-10', [{ lessonId: 'l1', percent: 50 }, { lessonId: 'l2', percent: 90 }])] }))
    const weak = recs.filter((r) => r.kind === 'weak-topic')
    expect(weak).toHaveLength(1)
    expect(weak[0]?.reason).toContain('50%')
    expect(weak[0]?.reason).toContain('80%')
  })

  it('prioritises due revision and overdue assignments', () => {
    const due: RevisionItem = {
      id: 'r1', user_id: 'u', item_type: 'topic', course_id: null, lesson_id: null, flashcard_id: null, topic: 'Hashing', reason: '', ease_factor: 2.5,
      interval_days: 0, repetitions: 0, lapses: 0, due_at: '2026-11-12T08:00:00Z', last_reviewed_at: null, status: 'learning', created_at: '', updated_at: '',
    }
    const recs = recommend(
      base({
        progress: [progress('l1', 'in_progress', 10)],
        revision: [due],
        assignments: [{ id: 'a1', user_id: 'u', course_id: null, title: 'Essay', description: '', due_at: '2026-11-10T09:00:00Z', priority: 'high', status: 'in_progress', notes: '', attachment_paths: [], submitted_at: null, completed_at: null, created_at: '', updated_at: '' }],
      }),
    )
    expect(recs[0]?.priority).toBe(1)
    expect(recs.slice(0, 2).map((r) => r.kind).sort()).toEqual(['deadline', 'revision'])
    expect(recs.find((r) => r.kind === 'revision')?.title).toBe('You have 1 revision item due today')
  })

  it('reports improvement between the last two attempts', () => {
    const recs = recommend(base({ progress: [progress('l1', 'completed', 100)], attempts: [attempt('q1', 50, '2026-11-01'), attempt('q1', 75, '2026-11-05')] }))
    expect(recs.find((r) => r.kind === 'insight')?.reason).toBe('From 50% to 75% on your latest attempt.')
  })

  it('flags a slow weekly pace mid-week', () => {
    expect(recommend(base({ studiedMinutesThisWeek: 30, progress: [progress('l1', 'in_progress', 5)] })).some((r) => r.kind === 'pace')).toBe(true)
  })
})

describe('analytics helpers', () => {
  it('counts the current streak ending today or yesterday', () => {
    const today = new Date('2026-11-12T12:00:00')
    expect(currentStreak(['2026-11-10', '2026-11-11', '2026-11-12'], today)).toBe(3)
    expect(currentStreak(['2026-11-10', '2026-11-11'], today)).toBe(2)
    expect(currentStreak(['2026-11-09'], today)).toBe(0)
  })

  it('lights the flame only on days with a lesson, fades it overnight and puts it out after a missed day', () => {
    const today = new Date('2026-11-12T12:00:00')
    expect(streakStatus(['2026-11-11', '2026-11-12'], today)).toEqual({ current: 2, state: 'lit', best: 2 })
    expect(streakStatus(['2026-11-10', '2026-11-11'], today)).toEqual({ current: 2, state: 'fading', best: 2 })
    expect(streakStatus(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-09'], today)).toEqual({ current: 0, state: 'out', best: 3 })
    expect(streakStatus(['2026-11-01', '2026-11-12'], today)).toEqual({ current: 1, state: 'lit', best: 1 })
    expect(streakStatus([], today)).toEqual({ current: 0, state: 'out', best: 0 })
  })

  it('averages the best score per quiz within each group', () => {
    const rows = [
      { quiz_id: 'a', percent: 40, course: 'x' },
      { quiz_id: 'a', percent: 80, course: 'x' },
      { quiz_id: 'b', percent: 60, course: 'x' },
      { quiz_id: 'c', percent: null, course: 'y' },
    ]
    expect(bestScoreAverage(rows, (r) => r.course)).toEqual(new Map([['x', 70]]))
  })
})
