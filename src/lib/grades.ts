// Official course marks, grades and grade point averages, following the University of Ghana Masters Regulations
// (July 2025): section 3.24 (grading system for course work, Table 5), 3.25 (pass grades) and 3.23 (good standing).

export const GRADE_SOURCE = 'University of Ghana Masters Regulations (July 2025), section 3.24, Table 5'

export type Grade = 'A' | 'B+' | 'B' | 'C' | 'D' | 'F'

export interface GradeBand {
  grade: Grade
  /** Lowest numerical mark for the grade. */
  min: number
  point: number
  interpretation: string
  /** A, B+, B and C are pass grades for course work (3.25.1). */
  pass: boolean
}

export const UG_GRADES: readonly GradeBand[] = [
  { grade: 'A', min: 80, point: 4.0, interpretation: 'Excellent', pass: true },
  { grade: 'B+', min: 70, point: 3.5, interpretation: 'Very Good', pass: true },
  { grade: 'B', min: 60, point: 3.0, interpretation: 'Good', pass: true },
  { grade: 'C', min: 50, point: 2.0, interpretation: 'Fairly Good', pass: true },
  { grade: 'D', min: 30, point: 1.5, interpretation: 'Satisfactory', pass: false },
  { grade: 'F', min: 0, point: 1.0, interpretation: 'Fail', pass: false },
]

/** A Final Grade Point Average of 2.50 or better is required at the end of course work (3.23.4). */
export const MIN_FINAL_GPA = 2.5
/** Good standing allows no more than three grade Cs or lower (3.23.1). */
export const MAX_C_OR_LOWER = 3

/**
 * The grade for a numerical mark. The regulations give whole-mark ranges and say nothing about rounding, so a mark is
 * never rounded up: 79.6 is a B+.
 */
export function gradeFor(mark: number): GradeBand {
  return UG_GRADES.find((b) => mark >= b.min) ?? (UG_GRADES.at(-1) as GradeBand)
}

export type MarkComponent = 'coursework' | 'examination'

export const COMPONENT_LABEL: Record<MarkComponent, string> = { coursework: 'Coursework', examination: 'Examination' }

export interface MarkItem {
  component: MarkComponent
  weight_percent: number
  /** Null until released. */
  score: number | null
  max_score: number
}

export type TargetStatus = 'secured' | 'possible' | 'out-of-reach'

export interface GradeTarget {
  band: GradeBand
  /** Average needed on everything not yet marked; null when secured or out of reach. */
  needed: number | null
  status: TargetStatus
}

export interface CourseStanding {
  /** Weight of every component entered so far (should reach 100). */
  weightTotal: number
  weightMarked: number
  /** Points of the final course mark already earned. */
  earned: number
  /** Average on the marked components, as a percentage; null before any mark. */
  average: number | null
  /** Weight still to be marked: 100 minus the marked weight. */
  remaining: number
  /** The final course mark once every component (weights totalling 100) is marked. */
  final: number | null
  /** The final grade, or the grade of the current average while marks are still to come. */
  grade: GradeBand | null
  /** What is needed on the rest for each pass grade. */
  targets: GradeTarget[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function courseStanding(items: readonly MarkItem[]): CourseStanding {
  const marked = items.filter((i) => i.score !== null)
  const weightTotal = round2(items.reduce((s, i) => s + i.weight_percent, 0))
  const weightMarked = round2(marked.reduce((s, i) => s + i.weight_percent, 0))
  const earned = round2(marked.reduce((s, i) => s + (i.weight_percent * (i.score as number)) / i.max_score, 0))
  const average = weightMarked > 0 ? round2((earned / weightMarked) * 100) : null
  const remaining = round2(Math.max(0, 100 - weightMarked))
  const final = remaining === 0 ? earned : null
  const targets = UG_GRADES.filter((b) => b.pass).map((band): GradeTarget => {
    if (earned >= band.min) return { band, needed: null, status: 'secured' }
    if (remaining === 0) return { band, needed: null, status: 'out-of-reach' }
    const needed = Math.ceil(((band.min - earned) / remaining) * 1000) / 10
    return needed > 100 ? { band, needed: null, status: 'out-of-reach' } : { band, needed, status: 'possible' }
  })
  const basis = final ?? average
  return { weightTotal, weightMarked, earned, average, remaining, final, grade: basis === null ? null : gradeFor(basis), targets }
}

export interface GpaCourse {
  credits: number
  /** The final course mark, or the current average for a projection. */
  mark: number | null
}

/** Grade point average: grade points times credits, divided by credits (3.24.2, 3.24.3). Null without any mark. */
export function gradePointAverage(courses: readonly GpaCourse[]): number | null {
  const counted = courses.filter((c) => c.mark !== null && c.credits > 0)
  const credits = counted.reduce((s, c) => s + c.credits, 0)
  if (!credits) return null
  const points = counted.reduce((s, c) => s + c.credits * gradeFor(c.mark as number).point, 0)
  return Math.round((points / credits) * 100) / 100
}

/** "78.5" or "78" for display. */
export function formatMark(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}
