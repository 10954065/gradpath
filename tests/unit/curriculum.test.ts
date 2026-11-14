import { describe, expect, it } from 'vitest'
import { selectionStatus, summariseSelection, takingCourses } from '@/lib/curriculum'
import type { Course, CourseClassification, CourseEnrolment } from '@/types/database'

type Row = Pick<Course, 'id' | 'code' | 'classification' | 'credit_slots'>
const course = (code: string, classification: CourseClassification, credit_slots: number): Row => ({ id: code, code, classification, credit_slots })

// The programme listing for Semester 1, plus CSIT 609 as the alternative elective (test fixture only).
const programme: Row[] = [
  course('CSIT 601', 'core', 3),
  course('CSIT 603', 'core', 3),
  course('CSIT 605', 'core', 3),
  course('CSIT 607', 'core', 3),
  course('CSIT 609', 'elective', 3),
  course('CSIT 610', 'required', 1),
  course('CSIT 613', 'elective', 3),
  course('CSIT 617', 'core', 3),
  course('CSIT 621', 'special_topic', 1),
]

const enrolment = (code: string, status: CourseEnrolment['status']): CourseEnrolment => ({ id: `e-${code}`, user_id: 'u', course_id: code, status })

// The owner's confirmed selection: every compulsory course plus CSIT 613; CSIT 609 not taken.
const mySelection: CourseEnrolment[] = [
  ...['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 617', 'CSIT 621'].map((c) => enrolment(c, 'enrolled')),
  enrolment('CSIT 613', 'enrolled'),
  enrolment('CSIT 609', 'dropped'),
]

describe('Semester 1 personal selection', () => {
  const summary = summariseSelection(programme, mySelection)
  const codes = (rows: Row[]) => rows.map((c) => c.code)

  it('has eight enrolled courses worth twenty credit slots', () => {
    expect(summary.enrolled).toHaveLength(8)
    expect(summary.creditSlots).toBe(20)
  })

  it('counts five core courses, one required seminar and one special topic', () => {
    expect(summary.byClassification).toEqual({ core: 5, required: 1, special_topic: 1, elective: 1 })
  })

  it('has CSIT 613 as the selected elective and excludes CSIT 609', () => {
    expect(codes(summary.selectedElectives)).toEqual(['CSIT 613'])
    expect(codes(summary.enrolled)).not.toContain('CSIT 609')
    expect(codes(summary.notTaking)).toEqual(['CSIT 609'])
  })

  it('includes the one-slot courses CSIT 610 and CSIT 621', () => {
    expect(codes(summary.enrolled)).toEqual(expect.arrayContaining(['CSIT 610', 'CSIT 621']))
  })

  it('lists the same eight courses wherever "my courses" are shown, in programme order', () => {
    expect(codes(takingCourses(programme, mySelection))).toEqual(['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 613', 'CSIT 617', 'CSIT 621'])
  })
})

describe('selection rules for other students', () => {
  it('treats compulsory courses as enrolled and electives as not selected until a student chooses', () => {
    expect(selectionStatus(programme[0] as Row, [])).toBe('enrolled')
    expect(selectionStatus(programme[4] as Row, [])).toBe('not_selected')
  })

  it('keeps an elective awaiting confirmation visible but out of the credit total', () => {
    const pending = [enrolment('CSIT 613', 'pending_confirmation')]
    const summary = summariseSelection(programme, pending)
    expect(summary.pending.map((c) => c.code)).toEqual(['CSIT 613'])
    expect(summary.creditSlots).toBe(17)
    expect(summary.creditSlots + summary.pendingCreditSlots).toBe(20)
    expect(summary.taking.map((c) => c.code)).toContain('CSIT 613')
  })

  it('respects a classmate who chose CSIT 609 instead', () => {
    const classmate = [enrolment('CSIT 609', 'enrolled'), enrolment('CSIT 613', 'dropped')]
    const summary = summariseSelection(programme, classmate)
    expect(summary.selectedElectives.map((c) => c.code)).toEqual(['CSIT 609'])
    expect(summary.creditSlots).toBe(20)
  })
})
