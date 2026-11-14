import { describe, expect, it } from 'vitest'
import { buildExamRevisionPlan, countdownLabel, daysUntil, freeSlot, revisionTopics, upcomingExams, type PlanModule } from '@/lib/examPlan'
import type { Assignment } from '@/types/database'

const exam = (id: string, due: string | null, extra: Partial<Assignment> = {}) =>
  ({ id, kind: 'examination', due_at: due, status: 'not_started', title: id, course_id: 'c', ...extra }) as Assignment

describe('upcoming examinations', () => {
  it('lists future, unfinished examinations soonest first', () => {
    const now = new Date('2027-03-01T12:00:00Z')
    const list = upcomingExams(
      [
        exam('later', '2027-03-20T09:00:00Z'),
        exam('sooner', '2027-03-10T09:00:00Z'),
        exam('past', '2027-02-20T09:00:00Z'),
        exam('done', '2027-03-15T09:00:00Z', { status: 'completed' }),
        exam('undated', null),
        exam('assignment', '2027-03-05T09:00:00Z', { kind: 'assignment' }),
      ],
      now,
    )
    expect(list.map((e) => e.id)).toEqual(['sooner', 'later'])
  })

  it('counts calendar days in Ghana time', () => {
    const now = new Date('2027-03-01T23:30:00Z')
    expect(daysUntil(new Date('2027-03-02T08:00:00Z'), now)).toBe(1)
    expect(countdownLabel(1)).toBe('Tomorrow')
    expect(countdownLabel(0)).toBe('Today')
    expect(countdownLabel(12)).toBe('In 12 days')
  })
})

describe('a free slot', () => {
  it('is the preferred time, or the next free half hour, or earlier in the day', () => {
    expect(freeSlot([], 18 * 60, 90)).toBe(18 * 60)
    // A lecture 17:30 to 19:30: the 90-minute block moves to 19:30.
    expect(freeSlot([{ start: 17 * 60 + 30, end: 19 * 60 + 30 }], 18 * 60, 90)).toBe(19 * 60 + 30)
    // Busy from 18:00 to 23:00: the block moves earlier, to 16:30.
    expect(freeSlot([{ start: 18 * 60, end: 23 * 60 }], 18 * 60, 90)).toBe(16 * 60 + 30)
    expect(freeSlot([{ start: 0, end: 24 * 60 }], 18 * 60, 90)).toBeNull()
  })
})

const modules: PlanModule[] = [
  { title: 'Foundations', lessonIds: ['a1', 'a2'] },
  { title: 'Design', lessonIds: ['b1', 'b2'] },
  { title: 'Analysis', lessonIds: ['c1', 'c2'] },
  { title: 'Writing up', lessonIds: ['d1', 'd2'] },
]

describe('revision topics', () => {
  it('give every module a day, then the least finished again, then weakest topics and a final review', () => {
    const topics = revisionTopics('CSIT 601', modules, new Set(['a1', 'a2', 'b1', 'b2', 'c1']), 8)
    expect(topics.map((t) => t.title)).toEqual([
      'CSIT 601 revision: Foundations',
      'CSIT 601 revision: Design',
      'CSIT 601 revision: Analysis',
      'CSIT 601 revision: Writing up',
      'CSIT 601 revision: Writing up (again)',
      'CSIT 601 revision: Analysis (again)',
      'CSIT 601 revision: weakest topics',
      'CSIT 601 final review',
    ])
    expect(topics[3]?.notes).toBe('Writing up. 2 lessons here not completed yet.')
  })

  it('group modules when there are fewer days than modules', () => {
    expect(revisionTopics('CSIT 601', modules, new Set(), 4).map((t) => t.title)).toEqual([
      'CSIT 601 revision: Foundations to Design',
      'CSIT 601 revision: Analysis to Writing up',
      'CSIT 601 revision: weakest topics',
      'CSIT 601 final review',
    ])
    expect(revisionTopics('CSIT 601', modules, new Set(), 1).map((t) => t.title)).toEqual(['CSIT 601 final review'])
  })
})

describe('an exam revision plan', () => {
  const busy = (date: string) => (date === '2027-03-08' ? [{ start: 17 * 60 + 30, end: 19 * 60 + 30 }] : [])

  it('runs from the start of the window to the day before the exam, around busy times', () => {
    const plan = buildExamRevisionPlan({
      code: 'CSIT 601',
      examDate: '2027-03-12',
      today: '2027-03-01',
      modules,
      completed: new Set(),
      options: { daysBefore: 7, startTime: '18:00', minutes: 90 },
      busy,
    })
    expect(plan.map((b) => b.date)).toEqual(['2027-03-05', '2027-03-06', '2027-03-07', '2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11'])
    expect(plan.find((b) => b.date === '2027-03-08')).toMatchObject({ start: '19:30', end: '21:00' })
    expect(plan[0]).toMatchObject({ start: '18:00', end: '19:30', title: 'CSIT 601 revision: Foundations' })
    expect(plan.at(-1)?.title).toBe('CSIT 601 final review')
  })

  it('starts tomorrow when the window has already begun, and is empty on the day of the exam', () => {
    const args = { code: 'CSIT 601', modules, completed: new Set<string>(), options: { daysBefore: 14, startTime: '18:00', minutes: 60 }, busy: () => [] }
    expect(buildExamRevisionPlan({ ...args, examDate: '2027-03-12', today: '2027-03-09' }).map((b) => b.date)).toEqual(['2027-03-10', '2027-03-11'])
    expect(buildExamRevisionPlan({ ...args, examDate: '2027-03-12', today: '2027-03-12' })).toEqual([])
  })
})
