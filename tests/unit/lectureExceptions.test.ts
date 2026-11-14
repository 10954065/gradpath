import { describe, expect, it } from 'vitest'
import { buildCalendar } from '@/lib/ics'
import { dueCheckIns } from '@/lib/lectureLog'
import { nextSession, officialPlannerEntries, type AttendanceStatus, type LectureException, type OfficialSession } from '@/lib/officialTimetable'

const LECTURES_BEGIN = new Date('2026-11-16T00:00:00')

const monday601: OfficialSession = {
  id: 'm601',
  sourceId: 'src',
  courseId: 'c601',
  code: 'CSIT 601',
  title: 'Research Methods',
  slug: 'csit-601',
  accent: 'indigo',
  classification: 'compulsory',
  creditSlots: 3,
  dayOfWeek: 1,
  start: '19:30',
  end: '21:30',
  venue: 'Earth Science Room 1',
  status: 'scheduled',
  allocation: 'all_students',
  allocationNote: '',
  notes: '',
  sortOrder: 0,
  updatedAt: '',
}
const confirmed = new Map<string, AttendanceStatus>([['m601', 'confirmed']])

const cancelled23: LectureException = {
  id: 'x1',
  entry_id: 'm601',
  held_on: '2026-11-23',
  status: 'cancelled',
  moved_date: null,
  moved_start: null,
  moved_end: null,
  moved_venue: '',
  note: '',
}
const moved16: LectureException = {
  id: 'x2',
  entry_id: 'm601',
  held_on: '2026-11-16',
  status: 'moved',
  moved_date: '2026-11-18',
  moved_start: '12:00',
  moved_end: '14:00',
  moved_venue: 'Great Hall',
  note: '',
}

describe('the next session with one-off changes', () => {
  it('skips a cancelled week', () => {
    // Saturday 21 November: Monday 23 is cancelled, so the next CSIT 601 lecture is Monday 30 November.
    const next = nextSession([monday601], confirmed, new Date('2026-11-21T10:00:00Z'), LECTURES_BEGIN, [cancelled23])
    expect(next?.label).toBe('Monday 30 Nov, 7:30 pm')
  })

  it('names a lecture moved to an earlier day', () => {
    const next = nextSession([monday601], confirmed, new Date('2026-11-17T10:00:00Z'), LECTURES_BEGIN, [moved16])
    expect(next?.label).toBe('Tomorrow, 12:00 pm (moved)')
    // Once the moved lecture is over, the next one is the following Monday.
    expect(nextSession([monday601], confirmed, new Date('2026-11-18T15:00:00Z'), LECTURES_BEGIN, [moved16])?.label).toBe('Monday, 7:30 pm')
  })
})

describe('the planner with one-off changes', () => {
  it('drops the cancelled or moved lecture and shows the moved one on its new day', () => {
    const entries = officialPlannerEntries([monday601], confirmed, new Date('2026-11-16T00:00:00'), new Date('2026-11-29T23:59:59'), {
      lecturesStartOn: LECTURES_BEGIN,
      exceptions: [cancelled23, moved16],
    })
    expect(entries.map((e) => [e.date, e.title])).toEqual([['2026-11-18', 'CSIT 601 lecture (moved) · Great Hall']])
  })
})

describe('check-ins with one-off changes', () => {
  it('ask about a moved lecture once it has ended on its new day, under its normal date', () => {
    expect(dueCheckIns([monday601], confirmed, [], new Date('2026-11-18T13:00:00Z'), LECTURES_BEGIN, 14, [moved16])).toEqual([])
    const due = dueCheckIns([monday601], confirmed, [], new Date('2026-11-18T14:30:00Z'), LECTURES_BEGIN, 14, [moved16])
    expect(due.map((d) => [d.date, d.label])).toEqual([['2026-11-16', 'Wednesday 18 Nov (moved)']])
  })

  it('never ask about a cancelled lecture', () => {
    expect(dueCheckIns([monday601], confirmed, [], new Date('2026-11-24T10:00:00Z'), LECTURES_BEGIN, 14, [cancelled23]).map((d) => d.date)).toEqual(['2026-11-16'])
  })
})

describe('the calendar subscription with one-off changes', () => {
  it('leaves out the changed dates and adds the moved lecture', () => {
    const ics = buildCalendar(
      {
        lecturesStartOn: '2026-11-16',
        lectures: [{ id: 'm601', code: 'CSIT 601', title: 'Research Methods', day_of_week: 1, start_time: '19:30', end_time: '21:30', venue: 'Earth Science Room 1' }],
        exceptions: [cancelled23, moved16],
        events: [],
        exams: [],
      },
      new Date('2026-11-14T10:00:00Z'),
    ).replace(/\r\n /g, '')
    expect(ics).toContain('RRULE:FREQ=WEEKLY\r\nEXDATE:20261123T193000Z,20261116T193000Z\r\n')
    expect(ics).toContain('UID:lecture-m601-2026-11-16@gradpath\r\nDTSTAMP:20261114T100000Z\r\nDTSTART:20261118T120000Z\r\nDTEND:20261118T140000Z\r\nSUMMARY:CSIT 601 lecture (moved)\r\nLOCATION:Great Hall')
  })
})
