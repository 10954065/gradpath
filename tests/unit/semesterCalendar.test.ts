import { describe, expect, it } from 'vitest'
import { dayOfStudyWeek, semesterCalendar, semesterWeek, semesterWeekLabel, studyWeekEnd, studyWeekStart, weekOrder } from '@/lib/semesterCalendar'
import { isoDate } from '@/utils/dates'

const day = (iso: string) => new Date(`${iso}T10:00:00`)
const FRIDAY = 5
const MONDAY = 1

describe('the study week from the day teaching started', () => {
  const calendar = semesterCalendar('2026-11-13')

  it('runs Friday to Thursday when teaching started on Friday 13 November 2026', () => {
    expect(calendar.weekStartsOn).toBe(FRIDAY)
    expect(weekOrder(calendar.weekStartsOn)).toEqual([5, 6, 0, 1, 2, 3, 4])
    expect(isoDate(studyWeekStart(day('2026-11-14'), calendar.weekStartsOn))).toBe('2026-11-13')
    expect(isoDate(studyWeekEnd(day('2026-11-14'), calendar.weekStartsOn))).toBe('2026-11-19')
    // Monday 16 November is still in the first week, so what was done since Friday keeps counting.
    expect(isoDate(studyWeekStart(day('2026-11-16'), calendar.weekStartsOn))).toBe('2026-11-13')
    expect(isoDate(studyWeekStart(day('2026-11-20'), calendar.weekStartsOn))).toBe('2026-11-20')
  })

  it('numbers semester weeks from that Friday', () => {
    expect(semesterWeek(calendar, day('2026-11-13'))).toBe(1)
    expect(semesterWeekLabel(calendar, day('2026-11-19'))).toBe('Semester week 1')
    expect(semesterWeekLabel(calendar, day('2026-11-20'))).toBe('Semester week 2')
    expect(semesterWeek(calendar, day('2027-01-08'))).toBe(9)
    expect(semesterWeekLabel(calendar, day('2026-11-12'))).toBe('Before teaching started')
  })

  it('counts the days already begun in the study week', () => {
    expect(dayOfStudyWeek(day('2026-11-13'), calendar.weekStartsOn)).toBe(1)
    expect(dayOfStudyWeek(day('2026-11-15'), calendar.weekStartsOn)).toBe(3)
    expect(dayOfStudyWeek(day('2026-11-19'), calendar.weekStartsOn)).toBe(7)
  })

  it('falls back to Monday-to-Sunday weeks without a recorded start', () => {
    for (const missing of [null, undefined, '', 'next week']) {
      const fallback = semesterCalendar(missing)
      expect(fallback).toEqual({ startedOn: null, weekStartsOn: MONDAY })
      expect(semesterWeekLabel(fallback, day('2026-11-14'))).toBeNull()
    }
    expect(weekOrder(MONDAY)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})
