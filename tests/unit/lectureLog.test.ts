import { describe, expect, it } from 'vitest'
import { coursePace, dueCheckIns, lectureDateLabel, lecturesBegun, paceHeadline } from '@/lib/lectureLog'
import type { AttendanceStatus, OfficialSession } from '@/lib/officialTimetable'

const LECTURES_BEGIN = new Date('2026-11-16T00:00:00')

function session(id: string, code: string, dayOfWeek: number, start: string, end: string): OfficialSession {
  return {
    id,
    sourceId: 'src',
    courseId: `course-${code}`,
    code,
    title: code,
    slug: code.toLowerCase().replace(' ', '-'),
    accent: 'indigo',
    classification: 'compulsory',
    creditSlots: 1,
    dayOfWeek,
    start,
    end,
    venue: 'Room 1',
    status: 'scheduled',
    allocation: 'all_students',
    allocationNote: '',
    notes: '',
    sortOrder: 0,
    updatedAt: '',
  }
}

const monday601 = session('m601', 'CSIT 601', 1, '19:30', '21:30')
const wednesday607 = session('w607', 'CSIT 607', 3, '17:30', '19:30')
const saturday613 = session('s613', 'CSIT 613', 6, '07:30', '09:30')
const SESSIONS = [monday601, wednesday607, saturday613]
const confirmed = new Map<string, AttendanceStatus>(SESSIONS.map((s) => [s.id, 'confirmed']))

describe('check-ins due', () => {
  it('are offered only once a lecture has ended in Ghana time', () => {
    expect(dueCheckIns(SESSIONS, confirmed, [], new Date('2026-11-16T21:00:00Z'), LECTURES_BEGIN)).toEqual([])
    const due = dueCheckIns(SESSIONS, confirmed, [], new Date('2026-11-16T21:30:00Z'), LECTURES_BEGIN)
    expect(due.map((d) => [d.session.code, d.date, d.label])).toEqual([['CSIT 601', '2026-11-16', 'Monday 16 Nov']])
  })

  it('never include days before lectures begin, and list the newest first', () => {
    // Thursday 19 November: Monday's and Wednesday's lectures are due; the weekend before teaching is not.
    const due = dueCheckIns(SESSIONS, confirmed, [], new Date('2026-11-19T10:00:00Z'), LECTURES_BEGIN)
    expect(due.map((d) => `${d.session.code} ${d.date}`)).toEqual(['CSIT 607 2026-11-18', 'CSIT 601 2026-11-16'])
  })

  it('drop lectures already checked in, not attended by the class, or older than two weeks', () => {
    const logs = [{ entry_id: 'w607', held_on: '2026-11-18' }]
    const notMine = new Map(confirmed).set('m601', 'not_assigned')
    expect(dueCheckIns(SESSIONS, notMine, logs, new Date('2026-11-19T10:00:00Z'), LECTURES_BEGIN)).toEqual([])
    const later = dueCheckIns(SESSIONS, confirmed, [], new Date('2026-12-10T10:00:00Z'), LECTURES_BEGIN)
    expect(later.at(-1)?.date).toBe('2026-11-28')
    expect(later.every((d) => d.date >= '2026-11-26')).toBe(true)
  })

  it('label dates by weekday and day of the month', () => {
    expect(lectureDateLabel('2026-11-21')).toBe('Saturday 21 Nov')
  })
})

describe('pace against the lectures', () => {
  const lessons = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((id) => ({ id }))

  it('counts every completed lesson as ahead before lectures begin', () => {
    expect(lecturesBegun(LECTURES_BEGIN, new Date('2026-11-14T12:00:00Z'))).toBe(false)
    const pace = coursePace(lessons, new Set(['l1', 'l2']), [], false)
    expect(pace).toMatchObject({ basis: 'not-started', status: 'ahead', ahead: 2, lectureReach: 0, catchUp: [] })
    expect(pace.nextToPrepare).toEqual({ id: 'l3' })
    expect(paceHeadline(pace)).toBe('2 lessons ahead before lectures begin')
    expect(paceHeadline(coursePace(lessons, new Set(), [], false))).toBe('Lectures have not begun yet')
  })

  it('needs a check-in to compare once lectures have begun', () => {
    expect(lecturesBegun(LECTURES_BEGIN, new Date('2026-11-16T08:00:00Z'))).toBe(true)
    const pace = coursePace(lessons, new Set(['l1']), [{ covered_lesson_ids: [], held_on: '2026-11-16' }], true)
    expect(pace.status).toBe('unknown')
    expect(paceHeadline(pace)).toBe('Check in after a lecture to compare')
  })

  it('compares completed lessons with the furthest lesson any lecture covered', () => {
    const logs = [
      { covered_lesson_ids: ['l1', 'l2'], held_on: '2026-11-16' },
      { covered_lesson_ids: ['l3'], held_on: '2026-11-23' },
    ]
    const ahead = coursePace(lessons, new Set(['l1', 'l2', 'l3', 'l4', 'l5']), logs, true)
    expect(ahead).toMatchObject({ basis: 'check-ins', status: 'ahead', lectureReach: 3, ahead: 2, lastCheckIn: '2026-11-23' })
    expect(paceHeadline(ahead)).toBe('2 lessons ahead of the lectures')

    const behind = coursePace(lessons, new Set(['l1', 'l4']), logs, true)
    expect(behind.status).toBe('behind')
    expect(behind.catchUp.map((l) => l.id)).toEqual(['l2', 'l3'])
    expect(behind.nextToPrepare).toEqual({ id: 'l5' })
    expect(paceHeadline(behind)).toBe('2 lessons behind the lectures')

    const level = coursePace(lessons, new Set(['l1', 'l2', 'l3']), logs, true)
    expect(paceHeadline(level)).toBe('Level with the lectures')
  })
})
