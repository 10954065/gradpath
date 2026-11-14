import { describe, expect, it } from 'vitest'
import { attemptNumbers, timeSpentMinutes } from '@/lib/analytics'
import { coursesForPicker } from '@/lib/curriculum'
import { isMissed } from '@/lib/timetable'
import { preparationPercent, SEMINAR_STEPS } from '@/services/study/seminar'

describe('assessment records', () => {
  it('numbers attempts per assessment in the order they were started', () => {
    const numbers = attemptNumbers([
      { id: 'b', quiz_id: 'q1', started_at: '2026-11-10T10:00:00Z' },
      { id: 'a', quiz_id: 'q1', started_at: '2026-11-09T10:00:00Z' },
      { id: 'c', quiz_id: 'q2', started_at: '2026-11-11T10:00:00Z' },
    ])
    expect(Object.fromEntries(numbers)).toEqual({ a: 1, b: 2, c: 1 })
  })

  it('reports time spent in whole minutes, and nothing while an attempt is open', () => {
    expect(timeSpentMinutes({ started_at: '2026-11-10T10:00:00Z', submitted_at: '2026-11-10T10:42:20Z' })).toBe(42)
    expect(timeSpentMinutes({ started_at: '2026-11-10T10:00:00Z', submitted_at: '2026-11-10T10:00:10Z' })).toBe(1)
    expect(timeSpentMinutes({ started_at: '2026-11-10T10:00:00Z', submitted_at: null })).toBeNull()
  })
})

describe('study planner', () => {
  const now = new Date('2026-11-14T12:00:00Z')
  const end = (iso: string) => new Date(iso)

  it('marks a past study session that was never completed as missed', () => {
    expect(isMissed({ status: 'planned', kind: 'study', end: end('2026-11-13T16:00:00Z') }, now)).toBe(true)
  })

  it('does not mark future, completed, skipped or lecture entries as missed', () => {
    expect(isMissed({ status: 'planned', kind: 'study', end: end('2026-11-15T16:00:00Z') }, now)).toBe(false)
    expect(isMissed({ status: 'completed', kind: 'study', end: end('2026-11-13T16:00:00Z') }, now)).toBe(false)
    expect(isMissed({ status: 'skipped', kind: 'revision', end: end('2026-11-13T16:00:00Z') }, now)).toBe(false)
    expect(isMissed({ status: 'planned', kind: 'lecture', end: end('2026-11-13T16:00:00Z') }, now)).toBe(false)
  })

  it('offers only the courses a student takes, keeping an older item’s course selectable', () => {
    const taking = [{ id: 'c601' }, { id: 'c613' }]
    const all = [...taking, { id: 'c609' }]
    expect(coursesForPicker(taking, all, null).map((c) => c.id)).toEqual(['c601', 'c613'])
    expect(coursesForPicker(taking, all, 'c609').map((c) => c.id)).toEqual(['c601', 'c613', 'c609'])
  })
})

describe('seminar tracker', () => {
  it('measures preparation as the share of checklist steps completed', () => {
    expect(preparationPercent([])).toBe(0)
    expect(preparationPercent(['topic', 'question'])).toBe(Math.round((2 / SEMINAR_STEPS.length) * 100))
    expect(preparationPercent(SEMINAR_STEPS.map((s) => s.key))).toBe(100)
    expect(preparationPercent(['not-a-step'])).toBe(0)
  })
})
