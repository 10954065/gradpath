import { describe, expect, it } from 'vitest'
import { dayOfStudyWeek, semesterCalendar, studyWeek, studyWeekEnd, studyWeekLabel, studyWeekStart, weekOrder } from '@/lib/semesterCalendar'
import { isoDate } from '@/utils/dates'

const day = (iso: string) => new Date(`${iso}T10:00:00`)
const FRIDAY = 5
const MONDAY = 1
const LECTURES_BEGIN = '2026-11-16'
const STUDIES_BEGAN = '2026-11-13'

describe('a student who starts studying before lectures begin', () => {
  const calendar = semesterCalendar(LECTURES_BEGIN, STUDIES_BEGAN)

  it('runs study weeks Friday to Thursday from Friday 13 November 2026', () => {
    expect(calendar.weekStartsOn).toBe(FRIDAY)
    expect(weekOrder(calendar.weekStartsOn)).toEqual([5, 6, 0, 1, 2, 3, 4])
    expect(isoDate(studyWeekStart(day('2026-11-14'), calendar.weekStartsOn))).toBe('2026-11-13')
    expect(isoDate(studyWeekEnd(day('2026-11-14'), calendar.weekStartsOn))).toBe('2026-11-19')
    // Monday 16 November is still in the first week, so what was done since Friday keeps counting.
    expect(isoDate(studyWeekStart(day('2026-11-16'), calendar.weekStartsOn))).toBe('2026-11-13')
    expect(isoDate(studyWeekStart(day('2026-11-20'), calendar.weekStartsOn))).toBe('2026-11-20')
  })

  it('numbers study weeks from that Friday and keeps lectures starting on Monday 16 November', () => {
    expect(isoDate(calendar.lecturesStartOn as Date)).toBe(LECTURES_BEGIN)
    expect(studyWeek(calendar, day('2026-11-13'))).toBe(1)
    expect(studyWeekLabel(calendar, day('2026-11-19'))).toBe('Study week 1')
    expect(studyWeekLabel(calendar, day('2026-11-20'))).toBe('Study week 2')
    expect(studyWeek(calendar, day('2027-01-08'))).toBe(9)
    expect(studyWeekLabel(calendar, day('2026-11-12'))).toBe('Before your studies started')
  })

  it('counts the days already begun in the study week', () => {
    expect(dayOfStudyWeek(day('2026-11-13'), calendar.weekStartsOn)).toBe(1)
    expect(dayOfStudyWeek(day('2026-11-15'), calendar.weekStartsOn)).toBe(3)
    expect(dayOfStudyWeek(day('2026-11-19'), calendar.weekStartsOn)).toBe(7)
  })
})

describe('without a personal start', () => {
  it('follows the day lectures begin', () => {
    const calendar = semesterCalendar(LECTURES_BEGIN, null)
    expect(calendar.weekStartsOn).toBe(MONDAY)
    expect(studyWeekLabel(calendar, day('2026-11-16'))).toBe('Study week 1')
    expect(studyWeekLabel(calendar, day('2026-11-14'))).toBe('Before your studies started')
  })

  it('falls back to Monday-to-Sunday weeks when neither date is known', () => {
    for (const missing of [null, undefined, '', 'next week']) {
      const fallback = semesterCalendar(missing, missing)
      expect(fallback).toEqual({ startedOn: null, weekStartsOn: MONDAY, lecturesStartOn: null })
      expect(studyWeekLabel(fallback, day('2026-11-14'))).toBeNull()
    }
    expect(weekOrder(MONDAY)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})
