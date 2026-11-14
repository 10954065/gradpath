import { describe, expect, it } from 'vitest'
import { reviewWeek, type WeekInput } from '@/lib/weeklyReview'

// Study week Friday 13 to Thursday 19 November 2026. Times at midday so the device's time zone cannot move a date.
const base: WeekInput = {
  from: '2026-11-13',
  to: '2026-11-19',
  targetMinutes: 900,
  sessions: [
    { status: 'completed', actual_minutes: 90, planned_start: '2026-11-13T12:00:00Z' },
    { status: 'completed', actual_minutes: 120, planned_start: '2026-11-19T12:00:00Z' },
    { status: 'planned', actual_minutes: null, planned_start: '2026-11-17T12:00:00Z' },
    { status: 'completed', actual_minutes: 60, planned_start: '2026-11-12T12:00:00Z' },
  ],
  progress: [
    { lesson_id: 'l1', status: 'completed', completed_at: '2026-11-14T12:00:00Z' },
    { lesson_id: 'l2', status: 'completed', completed_at: '2026-11-20T12:00:00Z' },
    { lesson_id: 'l3', status: 'in_progress', completed_at: null },
  ],
  attempts: [
    { status: 'submitted', submitted_at: '2026-11-15T12:00:00Z', percent: 80 },
    { status: 'submitted', submitted_at: '2026-11-16T12:00:00Z', percent: 65 },
    { status: 'in_progress', submitted_at: null, percent: null },
  ],
  reviews: [{ reviewed_at: '2026-11-18T12:00:00Z' }],
  logs: [
    { held_on: '2026-11-16', attendance: 'attended' },
    { held_on: '2026-11-18', attendance: 'missed' },
  ],
  deadlines: [
    { id: 'd2', title: 'CSIT 607 project', due_at: '2026-11-25T12:00:00Z', status: 'not_started' },
    { id: 'd1', title: 'CSIT 601 proposal', due_at: '2026-11-21T12:00:00Z', status: 'in_progress' },
    { id: 'd3', title: 'Already handed in', due_at: '2026-11-22T12:00:00Z', status: 'submitted' },
    { id: 'd4', title: 'Far away', due_at: '2026-12-10T12:00:00Z', status: 'not_started' },
  ],
  behind: [{ code: 'CSIT 603', lessons: 2 }],
}

describe('a week in review', () => {
  it('counts only what happened in the study week', () => {
    const r = reviewWeek(base)
    expect(r.studyMinutes).toBe(210)
    expect(r.targetPercent).toBe(23)
    expect(r.lessonIds).toEqual(['l1'])
    expect(r.quizzes).toEqual({ count: 2, average: 73 })
    expect(r.reviews).toBe(1)
    expect(r.lectures).toEqual({ attended: 1, missed: 1, cancelled: 0 })
  })

  it('lists the unfinished deadlines of the next seven days, soonest first', () => {
    expect(reviewWeek(base).upcoming.map((d) => d.title)).toEqual(['CSIT 601 proposal', 'CSIT 607 project'])
  })

  it('suggests what to do next week', () => {
    expect(reviewWeek(base).suggestions).toEqual([
      'You studied 3.5 hours of your 15 hours target. Plan 11.5 hours more next week.',
      'CSIT 603: catch up on 2 lessons the lectures have covered.',
      'Go over the 1 lecture you missed using your check-in notes.',
      '2 deadlines next week: start with CSIT 601 proposal.',
    ])
    const quiet = reviewWeek({ ...base, sessions: [{ status: 'completed', actual_minutes: 900, planned_start: '2026-11-15T12:00:00Z' }], reviews: [], logs: [], deadlines: [], behind: [] })
    expect(quiet.suggestions).toEqual([
      'You reached your weekly target of 15 hours. Keep the same rhythm next week.',
      'No revision reviews this week: spend a few minutes in the Revision Centre.',
    ])
  })
})
