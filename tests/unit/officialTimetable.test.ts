import { describe, expect, it } from 'vitest'
import { parseTimetable } from '@/lib/content/timetableParser'
import {
  ALLOCATION_LABEL,
  allocationLabel,
  attendanceOf,
  coursePath,
  filterSessions,
  ghanaClock,
  ghanaNow,
  ghanaRange,
  layoutDay,
  lectureMinutes,
  nextSession,
  officialPlannerEntries,
  parseTimetableCsv,
  sessionsPerCourse,
  toMinutes,
  type AttendanceStatus,
  type OfficialSession,
} from '@/lib/officialTimetable'
import { buildStudyStrategy, overlaps, TRAVEL_BUFFER_MINUTES, type StrategyCourse } from '@/lib/studyStrategy'
import { studyTotals } from '@/lib/timetable'
import timetableYaml from '../../content/timetables/itb-2026-2027-semester-1.yaml?raw'

const FILE = 'content/timetables/itb-2026-2027-semester-1.yaml'
const MY_COURSES = ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 613', 'CSIT 617', 'CSIT 621']
const SLOTS: Record<string, number> = { 'CSIT 610': 1, 'CSIT 621': 1 }
const SUN = 0
const MON = 1
const WED = 3
const FRI = 5
const SAT = 6

const { timetable, issues } = parseTimetable(FILE, timetableYaml, new Set(MY_COURSES))
if (!timetable) throw new Error(`timetable did not parse: ${JSON.stringify(issues)}`)

/** The published sessions as the app sees them, joined with the course record. */
const sessions: OfficialSession[] = timetable.sessions.map((s, i) => ({
  id: `entry-${i + 1}`,
  sourceId: 'source',
  courseId: `course-${s.courseCode}`,
  code: s.courseCode,
  title: `${s.courseCode} title`,
  slug: s.courseCode.toLowerCase().replace(' ', '-'),
  accent: 'indigo',
  classification: 'core',
  creditSlots: SLOTS[s.courseCode] ?? 3,
  dayOfWeek: s.dayOfWeek,
  start: s.start,
  end: s.end,
  venue: s.venue,
  status: 'scheduled',
  allocation: 'pending_confirmation',
  allocationNote: '',
  notes: '',
  sortOrder: i + 1,
  updatedAt: '2026-11-14T00:00:00Z',
}))
const courses: StrategyCourse[] = MY_COURSES.map((code) => ({ id: `course-${code}`, code, title: `${code} title`, creditSlots: SLOTS[code] ?? 3 }))
const none = new Map<string, AttendanceStatus>()
const on = (day: number) =>
  sessions
    .filter((s) => s.dayOfWeek === day)
    .map((s) => `${s.code} ${s.start}-${s.end} ${s.venue}`)
    .sort()

describe('the published ITB Semester 1 timetable', () => {
  it('parses without errors or warnings and keeps every published entry', () => {
    expect(issues).toEqual([])
    expect(sessions).toHaveLength(20)
    expect(timetable.timeZone).toBe('Africa/Accra')
    expect(timetable.academicYear).toBe('2026/2027')
  })

  it('represents all eight selected courses, includes CSIT 613 and never CSIT 609', () => {
    expect([...new Set(sessions.map((s) => s.code))].sort()).toEqual(MY_COURSES)
    expect(sessions.some((s) => s.code === 'CSIT 609')).toBe(false)
    expect(sessions.filter((s) => s.code === 'CSIT 613').map((s) => `${s.dayOfWeek} ${s.start}`)).toEqual([`${WED} 19:30`, `${SAT} 16:00`, `${SUN} 16:00`])
  })

  it('has every weekday session', () => {
    expect(on(MON)).toEqual(['CSIT 601 19:30-21:30 Earth Science Room 1'])
    expect(on(2)).toEqual(['CSIT 617 19:30-21:30 Earth Science Room 1'])
    expect(on(WED)).toEqual(['CSIT 607 17:30-19:30 Earth Science Room 1', 'CSIT 613 19:30-21:30 Earth Science Room 2'])
    expect(on(4)).toEqual(['CSIT 603 17:30-19:30 Earth Science Room 1', 'CSIT 605 19:30-21:30 Earth Science Room 1'])
    expect(on(FRI)).toEqual(['CSIT 610 19:30-21:30 Earth Science Room 1', 'CSIT 621 17:30-19:30 Earth Science Room 1'])
  })

  it('has every Saturday session', () => {
    expect(on(SAT)).toEqual([
      'CSIT 601 09:30-11:30 Earth Science Room 1',
      'CSIT 603 18:00-20:00 Earth Science Room 1',
      'CSIT 605 14:00-16:00 Earth Science Room 1',
      'CSIT 607 07:30-09:30 Earth Science Room 1',
      'CSIT 613 16:00-18:00 Earth Science Room 2',
      'CSIT 617 11:30-13:30 Earth Science Room 1',
    ])
  })

  it('has every Sunday session', () => {
    expect(on(SUN)).toEqual([
      'CSIT 601 09:30-11:30 Earth Science Room 1',
      'CSIT 603 11:30-13:30 Earth Science Room 1',
      'CSIT 605 14:00-16:00 Earth Science Room 1',
      'CSIT 607 07:30-09:30 Earth Science Room 1',
      'CSIT 613 16:00-18:00 Earth Science Room 2',
      'CSIT 617 18:00-20:00 Earth Science Room 1',
    ])
  })

  it('places every CSIT 613 session in Earth Science Room 2 and every other session in Room 1', () => {
    for (const s of sessions) expect(s.venue).toBe(s.code === 'CSIT 613' ? 'Earth Science Room 2' : 'Earth Science Room 1')
  })

  it('retains repeated sessions instead of collapsing them', () => {
    const counts = sessionsPerCourse(sessions)
    for (const code of ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 613', 'CSIT 617']) expect(counts.get(`course-${code}`)).toBe(3)
    expect(counts.get('course-CSIT 610')).toBe(1)
    expect(counts.get('course-CSIT 621')).toBe(1)
  })

  it('never marks an unconfirmed session as compulsory', () => {
    for (const s of sessions) {
      expect(attendanceOf(none, s.id)).toBe('awaiting')
      expect(allocationLabel(s)).toBe('Attendance allocation pending confirmation')
    }
    expect(Object.values(ALLOCATION_LABEL).some((l) => /compulsory/i.test(l))).toBe(false)
  })

  it('links every session to its course page', () => {
    expect(coursePath(sessions.find((s) => s.code === 'CSIT 607') as OfficialSession)).toBe('/courses/csit-607')
    for (const s of sessions) expect(coursePath(s)).toBe(`/courses/${s.code.toLowerCase().replace(' ', '-')}`)
  })

  it('rejects a session for a course that is not in the course list', () => {
    const bad = 'slug: x-test\ntitle: T\nacademicYear: 2026/2027\nsemester: Semester 1\nsessions:\n  - { day: monday, start: "09:00", end: "10:00", course: CSIT 609, venue: R1 }\n'
    const result = parseTimetable('bad.yaml', bad, new Set(MY_COURSES))
    expect(result.timetable).toBeNull()
    expect(result.issues[0]?.message).toMatch(/CSIT 609 is not a course/)
  })
})

describe('Ghana time', () => {
  it('shows published times as the University publishes them', () => {
    expect(ghanaClock('19:30')).toBe('7:30 pm')
    expect(ghanaClock('07:30')).toBe('7:30 am')
    expect(ghanaClock('12:00')).toBe('12:00 pm')
    expect(ghanaRange('17:30', '19:30')).toBe('5:30 pm – 7:30 pm')
  })

  it('reads the current day and time in Accra whatever the device time zone', () => {
    // 19:00 UTC on Monday 16 November 2026 is 19:00 in Accra (GMT, no daylight saving).
    expect(ghanaNow(new Date('2026-11-16T19:00:00Z'))).toEqual({ dayOfWeek: MON, minutes: 19 * 60, date: '2026-11-16' })
    expect(ghanaNow(new Date('2026-11-15T23:59:00-05:00')).dayOfWeek).toBe(MON)
  })

  it('finds the next published session from Ghana time', () => {
    const next = nextSession(sessions, none, new Date('2026-11-16T18:00:00Z'))
    expect(next?.session.code).toBe('CSIT 601')
    expect(next?.label).toBe('Today, 7:30 pm')
    const afterSunday = nextSession(sessions.filter((s) => s.code === 'CSIT 613'), none, new Date('2026-11-15T21:00:00Z'))
    expect(afterSunday?.label).toBe('Wednesday, 7:30 pm')
  })

  it('skips sessions the student marked as not theirs', () => {
    const notMine = new Map<string, AttendanceStatus>(sessions.filter((s) => s.code === 'CSIT 601' && s.dayOfWeek === MON).map((s) => [s.id, 'not_assigned']))
    expect(nextSession(sessions.filter((s) => s.code === 'CSIT 601'), notMine, new Date('2026-11-16T18:00:00Z'))?.label).toBe('Saturday, 9:30 am')
  })
})

describe('views', () => {
  it('lays overlapping sessions side by side and keeps the rest full width', () => {
    const base = sessions[0] as OfficialSession
    const a = { ...base, id: 'a', start: '09:00', end: '11:00' }
    const b = { ...base, id: 'b', start: '10:00', end: '12:00' }
    const c = { ...base, id: 'c', start: '13:00', end: '14:00' }
    const laid = layoutDay([a, b, c])
    expect(laid.find((l) => l.session.id === 'a')).toMatchObject({ lane: 0, lanes: 2 })
    expect(laid.find((l) => l.session.id === 'b')).toMatchObject({ lane: 1, lanes: 2 })
    expect(laid.find((l) => l.session.id === 'c')).toMatchObject({ lane: 0, lanes: 1 })
    expect(layoutDay(sessions.filter((s) => s.dayOfWeek === SAT)).every((l) => l.lanes === 1)).toBe(true)
  })

  it('filters by course, day, venue and attendance status', () => {
    const attendance = new Map<string, AttendanceStatus>([['entry-4', 'confirmed']])
    expect(filterSessions(sessions, { venue: 'Earth Science Room 2' }, none)).toHaveLength(3)
    expect(filterSessions(sessions, { dayOfWeek: SAT }, none)).toHaveLength(6)
    expect(filterSessions(sessions, { courseId: 'course-CSIT 607' }, none)).toHaveLength(3)
    expect(filterSessions(sessions, { attendance: 'confirmed' }, attendance).map((s) => s.code)).toEqual(['CSIT 613'])
    expect(filterSessions(sessions, { attendance: 'awaiting' }, attendance)).toHaveLength(19)
  })

  it('parses a revised timetable for import and reports bad lines', () => {
    const ok = parseTimetableCsv('day,start,end,course,venue\nMonday,19:30,21:30,csit 601,Earth Science Room 1\n\nSunday,7:30,9:30,CSIT 607,Room, 2')
    expect(ok.errors).toEqual([])
    expect(ok.sessions).toEqual([
      { course_code: 'CSIT 601', day_of_week: MON, start_time: '19:30', end_time: '21:30', venue: 'Earth Science Room 1' },
      { course_code: 'CSIT 607', day_of_week: SUN, start_time: '07:30', end_time: '09:30', venue: 'Room, 2' },
    ])
    const bad = parseTimetableCsv('Moonday,19:30,21:30,CSIT 601,R1\nMonday,21:30,19:30,CSIT 601,R1\nMonday,19:30,21:30,601,R1')
    expect(bad.sessions).toEqual([])
    expect(bad.errors).toHaveLength(3)
  })
})

describe('personal study kept separate from official lectures', () => {
  const start = new Date(2026, 10, 16)
  const end = new Date(2026, 10, 22)

  it('shows lectures in the planner without counting them as study time', () => {
    const lectures = officialPlannerEntries(sessions, none, start, end)
    expect(lectures).toHaveLength(20)
    expect(lectures.every((e) => e.kind === 'lecture' && e.official && e.isProvisional)).toBe(true)
    expect(studyTotals(lectures)).toEqual({ plannedMinutes: 0, completedMinutes: 0, completedSessions: 0 })
    expect(lectureMinutes(sessions)).toBe(20 * 120)
  })

  it('leaves out sessions marked not assigned and can show confirmed ones only', () => {
    const attendance = new Map<string, AttendanceStatus>([
      ['entry-1', 'confirmed'],
      ['entry-9', 'not_assigned'],
    ])
    expect(officialPlannerEntries(sessions, attendance, start, end)).toHaveLength(19)
    expect(officialPlannerEntries(sessions, attendance, start, end, { onlyConfirmed: true }).map((e) => e.official?.code)).toEqual(['CSIT 601'])
  })

  it('builds a study plan that never overlaps a lecture or its travel time', () => {
    const plan = buildStudyStrategy({ courses, sessions, attendance: none, keep: [], targetHours: 15, preferredTimes: [] })
    expect(plan.blocks.length).toBeGreaterThan(0)
    for (const block of plan.blocks)
      for (const s of sessions) expect(overlaps({ dayOfWeek: s.dayOfWeek, start: s.start, end: s.end }, block, TRAVEL_BUFFER_MINUTES)).toBe(false)
    expect(plan.plannedMinutes).toBe(plan.blocks.reduce((sum, b) => sum + toMinutes(b.end) - toMinutes(b.start), 0))
    expect(plan.plannedMinutes).toBeLessThanOrEqual(plan.targetMinutes)
    expect(plan.lectureMinutes).toBe(40 * 60)
  })

  it('gives every course a preview before and a review after its lecture', () => {
    const plan = buildStudyStrategy({ courses, sessions, attendance: none, keep: [], targetHours: 15, preferredTimes: [] })
    for (const c of courses) {
      expect(plan.blocks.some((b) => b.courseId === c.id && b.purpose === 'preview')).toBe(true)
      expect(plan.blocks.some((b) => b.courseId === c.id && b.purpose === 'review')).toBe(true)
    }
    expect(plan.blocks.filter((b) => b.purpose === 'revision')).toHaveLength(1)
    const preview601 = plan.blocks.find((b) => b.courseId === 'course-CSIT 601' && b.purpose === 'preview')
    expect(preview601?.dayOfWeek).toBe(MON)
    expect(toMinutes(preview601?.end ?? '23:59')).toBeLessThanOrEqual(toMinutes('19:30') - TRAVEL_BUFFER_MINUTES)
  })

  it('uses the weekend once the weekend sessions are marked as not the student’s class', () => {
    const weekdayOnly = new Map<string, AttendanceStatus>(
      sessions.map((s) => [s.id, s.dayOfWeek === SAT || s.dayOfWeek === SUN ? 'not_assigned' : 'confirmed'] as const),
    )
    const plan = buildStudyStrategy({ courses, sessions, attendance: weekdayOnly, keep: [], targetHours: 18, preferredTimes: [] })
    expect(plan.confirmedCourses).toHaveLength(8)
    expect(plan.lectureMinutes).toBe(8 * 120)
    expect(plan.blocks.some((b) => (b.dayOfWeek === SAT || b.dayOfWeek === SUN) && toMinutes(b.start) >= 8 * 60 && toMinutes(b.end) <= 17 * 60)).toBe(true)
    expect(plan.plannedMinutes).toBeGreaterThanOrEqual(17 * 60)
  })

  it('plans around the student’s own blocks and only for the courses they take', () => {
    const keep = [{ dayOfWeek: MON, start: '05:00', end: '07:30' }]
    const notTaken = { ...(sessions[0] as OfficialSession), id: 'x', courseId: 'course-CSIT 609', code: 'CSIT 609', dayOfWeek: 2, start: '08:00', end: '10:00' }
    const plan = buildStudyStrategy({ courses, sessions: [...sessions, notTaken], attendance: none, keep, targetHours: 15, preferredTimes: [] })
    expect(plan.blocks.some((b) => overlaps(keep[0] as (typeof keep)[0], b))).toBe(false)
    expect(plan.blocks.some((b) => b.courseId === 'course-CSIT 609')).toBe(false)
  })
})
