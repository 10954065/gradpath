import { describe, expect, it } from 'vitest'
import { intervalLabel, scheduleReview } from '@/lib/scheduler'
import { buildPlanner, occursOn, studyTotals } from '@/lib/timetable'
import type { StudySession, TimetableEvent } from '@/types/database'

const fresh = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 }
const now = new Date('2026-11-12T10:00:00Z')

describe('spaced-repetition scheduler', () => {
  it('graduates new items with growing intervals', () => {
    const first = scheduleReview(fresh, 'good', now)
    expect(first.intervalDays).toBe(1)
    const second = scheduleReview(first, 'good', now)
    expect(second.intervalDays).toBe(3)
    const third = scheduleReview(second, 'good', now)
    expect(third.intervalDays).toBe(8)
    expect(third.status).toBe('review')
  })

  it('resets on "again", records a lapse and lowers ease', () => {
    const learnt = { easeFactor: 2.5, intervalDays: 10, repetitions: 3, lapses: 0 }
    const r = scheduleReview(learnt, 'again', now)
    expect(r.repetitions).toBe(0)
    expect(r.lapses).toBe(1)
    expect(r.easeFactor).toBe(2.3)
    expect(r.dueAt.getTime() - now.getTime()).toBe(10 * 60_000)
    expect(r.status).toBe('learning')
  })

  it('never lets ease fall below the minimum and marks long intervals as mastered', () => {
    let state = { easeFactor: 1.35, intervalDays: 30, repetitions: 5, lapses: 2 }
    state = scheduleReview(state, 'hard', now)
    expect(state.easeFactor).toBe(1.3)
    const easy = scheduleReview({ easeFactor: 2.5, intervalDays: 10, repetitions: 4, lapses: 0 }, 'easy', now)
    expect(easy.intervalDays).toBeGreaterThanOrEqual(21)
    expect(easy.status).toBe('mastered')
  })

  it('labels the next interval for each rating', () => {
    expect(intervalLabel(fresh, 'again')).toBe('10 min')
    expect(intervalLabel(fresh, 'good')).toBe('1 day')
    expect(intervalLabel(fresh, 'easy')).toBe('3 days')
  })
})

function event(partial: Partial<TimetableEvent>): TimetableEvent {
  return {
    id: 'e1',
    user_id: 'u',
    course_id: 'c1',
    title: 'CSIT 601 study',
    kind: 'study',
    recurrence: 'weekly',
    day_of_week: 1,
    event_date: null,
    start_time: '14:00:00',
    end_time: '16:00:00',
    starts_on: null,
    ends_on: null,
    location: '',
    notes: '',
    is_provisional: true,
    time_zone: 'Africa/Accra',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

function session(partial: Partial<StudySession>): StudySession {
  return {
    id: 's1',
    user_id: 'u',
    course_id: 'c1',
    timetable_event_id: null,
    occurrence_date: null,
    title: 'Revision',
    planned_start: '2026-11-18T09:00:00',
    planned_end: '2026-11-18T10:30:00',
    status: 'planned',
    actual_minutes: null,
    completed_at: null,
    notes: '',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('timetable expansion', () => {
  // Week of Monday 16 Nov 2026 – Sunday 22 Nov 2026
  const start = new Date('2026-11-16T00:00:00')
  const end = new Date('2026-11-22T00:00:00')

  it('places weekly events on the right weekday and respects date bounds', () => {
    expect(occursOn(event({}), '2026-11-16')).toBe(true)
    expect(occursOn(event({}), '2026-11-17')).toBe(false)
    expect(occursOn(event({ ends_on: '2026-11-10' }), '2026-11-16')).toBe(false)
    expect(occursOn(event({ recurrence: 'once', day_of_week: null, event_date: '2026-11-20' }), '2026-11-20')).toBe(true)
  })

  it('merges a completed occurrence session instead of duplicating it', () => {
    const done = session({
      id: 's2',
      timetable_event_id: 'e1',
      occurrence_date: '2026-11-16',
      title: 'CSIT 601 study',
      planned_start: '2026-11-16T14:00:00',
      planned_end: '2026-11-16T16:00:00',
      status: 'completed',
      actual_minutes: 95,
    })
    const entries = buildPlanner([event({})], [done, session({})], start, end)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.status).toBe('completed')
    expect(studyTotals(entries)).toEqual({ plannedMinutes: 210, completedMinutes: 95, completedSessions: 1 })
  })

  it('excludes cancelled occurrences from planned time', () => {
    const cancelled = session({ timetable_event_id: 'e1', occurrence_date: '2026-11-16', planned_start: '2026-11-16T14:00:00', planned_end: '2026-11-16T16:00:00', status: 'cancelled' })
    expect(studyTotals(buildPlanner([event({})], [cancelled], start, end)).plannedMinutes).toBe(0)
  })
})
