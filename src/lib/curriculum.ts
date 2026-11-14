import type { Course, CourseClassification, CourseEnrolment } from '@/types/database'

/**
 * A student's own course selection. The shared programme curriculum lives in `courses`; what each student takes
 * lives in their `course_enrolments`. Core, required and special-topic courses apply to every student; an elective
 * counts only once the student has selected it.
 */
export type SelectionStatus = CourseEnrolment['status'] | 'not_selected'
type CourseLike = Pick<Course, 'id' | 'code' | 'classification' | 'credit_slots'>

export const CLASSIFICATION_LABEL: Record<CourseClassification, string> = {
  core: 'Core',
  required: 'Required',
  special_topic: 'Special topic',
  elective: 'Elective',
}

export const SELECTION_LABEL: Record<SelectionStatus, string> = {
  enrolled: 'Enrolled',
  pending_confirmation: 'To confirm',
  dropped: 'Not taking',
  not_selected: 'Not selected',
}

export function isCompulsory(course: Pick<Course, 'classification'>): boolean {
  return course.classification !== 'elective'
}

/** The student's status for a course. Without a row yet, compulsory courses count as enrolled and electives as not selected. */
export function selectionStatus(course: Pick<Course, 'id' | 'classification'>, enrolments: readonly CourseEnrolment[]): SelectionStatus {
  const row = enrolments.find((e) => e.course_id === course.id)
  if (row) return row.status
  return isCompulsory(course) ? 'enrolled' : 'not_selected'
}

/** Courses the student is taking: enrolled, or awaiting their confirmation. Order is preserved. */
export function takingCourses<T extends Pick<Course, 'id' | 'classification'>>(courses: readonly T[], enrolments: readonly CourseEnrolment[]): T[] {
  return courses.filter((c) => {
    const status = selectionStatus(c, enrolments)
    return status === 'enrolled' || status === 'pending_confirmation'
  })
}

export interface SelectionSummary<T extends CourseLike = CourseLike> {
  /** Enrolled courses (the confirmed selection). */
  enrolled: T[]
  /** Courses awaiting the student's confirmation (typically an elective not yet chosen). */
  pending: T[]
  /** Enrolled and pending: everything shown as "my courses". */
  taking: T[]
  /** Programme courses the student does not take (dropped, or electives not selected). */
  notTaking: T[]
  /** Credit slots across enrolled courses. */
  creditSlots: number
  /** Credit slots of courses still awaiting confirmation (shown separately so a pending elective is not forgotten). */
  pendingCreditSlots: number
  /** Enrolled courses per classification. */
  byClassification: Record<CourseClassification, number>
  /** Electives the student has enrolled in. */
  selectedElectives: T[]
}

export function summariseSelection<T extends CourseLike>(courses: readonly T[], enrolments: readonly CourseEnrolment[]): SelectionSummary<T> {
  const enrolled: T[] = []
  const pending: T[] = []
  const notTaking: T[] = []
  for (const c of courses) {
    const status = selectionStatus(c, enrolments)
    if (status === 'enrolled') enrolled.push(c)
    else if (status === 'pending_confirmation') pending.push(c)
    else notTaking.push(c)
  }
  const byClassification: Record<CourseClassification, number> = { core: 0, required: 0, special_topic: 0, elective: 0 }
  for (const c of enrolled) byClassification[c.classification] += 1
  return {
    enrolled,
    pending,
    taking: courses.filter((c) => enrolled.includes(c) || pending.includes(c)),
    notTaking,
    creditSlots: enrolled.reduce((sum, c) => sum + c.credit_slots, 0),
    pendingCreditSlots: pending.reduce((sum, c) => sum + c.credit_slots, 0),
    byClassification,
    selectedElectives: enrolled.filter((c) => c.classification === 'elective'),
  }
}

/** Options for a course picker: the courses the student takes, plus an item's current course if it is not one of them. */
export function coursesForPicker<T extends Pick<Course, 'id'>>(taking: readonly T[], all: readonly T[], currentId?: string | null): T[] {
  if (!currentId || taking.some((c) => c.id === currentId)) return [...taking]
  const current = all.find((c) => c.id === currentId)
  return current ? [...taking, current] : [...taking]
}
