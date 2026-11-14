// After-lecture check-ins and how far the student is ahead of (or behind) the lectures in each course.
import { DAY_NAMES, ghanaNow, localDay, mayAttend, shortDate, toMinutes, type AttendanceMap, type OfficialSession } from '@/lib/officialTimetable'

export type LectureAttendance = 'attended' | 'missed' | 'cancelled'

export const LECTURE_ATTENDANCE_LABEL: Record<LectureAttendance, string> = {
  attended: 'Attended',
  missed: 'Missed',
  cancelled: 'Cancelled',
}

export interface LectureLog {
  id: string
  entry_id: string
  course_id: string
  /** yyyy-mm-dd, Ghana date the lecture was held. */
  held_on: string
  attendance: LectureAttendance
  covered_lesson_ids: string[]
  review_lesson_ids: string[]
  note: string
  updated_at: string
}

export interface DueCheckIn {
  session: OfficialSession
  /** yyyy-mm-dd, Ghana date. */
  date: string
  /** "Monday 16 Nov". */
  label: string
}

const DAY_MS = 86_400_000
/** How far back a missed check-in is still offered. */
export const CHECK_IN_LOOKBACK_DAYS = 14

export const logKey = (entryId: string, date: string): string => `${entryId}|${date}`

/** "Monday 16 Nov" for a yyyy-mm-dd date. */
export function lectureDateLabel(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return `${DAY_NAMES[day]} ${shortDate(date)}`
}

/**
 * Lectures that have ended, in Ghana time, and have no check-in yet: newest first, from the last two weeks, and
 * never before the day lectures began.
 */
export function dueCheckIns(
  sessions: readonly OfficialSession[],
  attendance: AttendanceMap,
  logs: readonly Pick<LectureLog, 'entry_id' | 'held_on'>[],
  now: Date = new Date(),
  lecturesStartOn: Date | null = null,
  lookbackDays = CHECK_IN_LOOKBACK_DAYS,
): DueCheckIn[] {
  const logged = new Set(logs.map((l) => logKey(l.entry_id, l.held_on)))
  const firstDay = lecturesStartOn ? localDay(lecturesStartOn) : null
  const today = ghanaNow(now)
  const due: DueCheckIn[] = []
  for (let back = 0; back <= lookbackDays; back += 1) {
    const { date, dayOfWeek } = ghanaNow(new Date(now.getTime() - back * DAY_MS))
    if (firstDay && date < firstDay) break
    const onDay = sessions
      .filter((s) => s.dayOfWeek === dayOfWeek && mayAttend(s, attendance))
      .filter((s) => back > 0 || toMinutes(s.end) <= today.minutes)
      .filter((s) => !logged.has(logKey(s.id, date)))
      .sort((a, b) => b.start.localeCompare(a.start))
    for (const session of onDay) due.push({ session, date, label: lectureDateLabel(date) })
  }
  return due
}

/** Whether lectures have begun by now (Ghana date). Unknown start dates count as begun. */
export function lecturesBegun(lecturesStartOn: Date | null, now: Date = new Date()): boolean {
  return !lecturesStartOn || ghanaNow(now).date >= localDay(lecturesStartOn)
}

export type PaceStatus = 'ahead' | 'level' | 'behind' | 'unknown'
/** Where the lecture position comes from: lectures not begun yet (position 0), check-ins, or nothing yet. */
export type PaceBasis = 'not-started' | 'check-ins' | 'none'

export interface CoursePace<T> {
  total: number
  completed: number
  /** How many lessons, in course order, the lectures have reached (the furthest lesson any check-in covered). */
  lectureReach: number
  basis: PaceBasis
  status: PaceStatus
  /** Lessons completed beyond the lectures' reach. */
  ahead: number
  /** Lessons the lectures have reached that the student has not completed, in course order. */
  catchUp: T[]
  /** The first lesson after the lectures' reach the student has not completed: read it before the next lecture. */
  nextToPrepare: T | null
  /** yyyy-mm-dd of the latest check-in, if any. */
  lastCheckIn: string | null
}

/** Compares the student's completed lessons with how far the lectures have gone in one course. */
export function coursePace<T extends { id: string }>(
  ordered: readonly T[],
  completedIds: ReadonlySet<string>,
  logs: readonly Pick<LectureLog, 'covered_lesson_ids' | 'held_on'>[],
  begun: boolean,
): CoursePace<T> {
  const position = new Map(ordered.map((l, i) => [l.id, i + 1]))
  const lectureReach = begun ? Math.max(0, ...logs.flatMap((g) => g.covered_lesson_ids.map((id) => position.get(id) ?? 0))) : 0
  const basis: PaceBasis = !begun ? 'not-started' : lectureReach > 0 ? 'check-ins' : 'none'
  const done = (l: T) => completedIds.has(l.id)
  const catchUp = ordered.slice(0, lectureReach).filter((l) => !done(l))
  const ahead = ordered.slice(lectureReach).filter(done).length
  const status: PaceStatus = basis === 'none' ? 'unknown' : catchUp.length ? 'behind' : ahead > 0 ? 'ahead' : 'level'
  const lastCheckIn = logs.reduce<string | null>((latest, g) => (!latest || g.held_on > latest ? g.held_on : latest), null)
  return {
    total: ordered.length,
    completed: ordered.filter(done).length,
    lectureReach,
    basis,
    status,
    ahead,
    catchUp,
    nextToPrepare: ordered.slice(lectureReach).find((l) => !done(l)) ?? null,
    lastCheckIn,
  }
}

const lessons = (n: number) => `${n} lesson${n === 1 ? '' : 's'}`

/** One line for the student: "3 lessons ahead of the lectures", "2 lessons behind", and so on. */
export function paceHeadline(pace: Pick<CoursePace<unknown>, 'status' | 'basis' | 'ahead' | 'catchUp'>): string {
  if (pace.status === 'unknown') return 'Check in after a lecture to compare'
  if (pace.status === 'behind') return `${lessons(pace.catchUp.length)} behind the lectures`
  if (pace.status === 'level') return pace.basis === 'not-started' ? 'Lectures have not begun yet' : 'Level with the lectures'
  return pace.basis === 'not-started' ? `${lessons(pace.ahead)} ahead before lectures begin` : `${lessons(pace.ahead)} ahead of the lectures`
}
