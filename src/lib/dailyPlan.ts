import type { PlannerEntry } from '@/lib/timetable'
import type { LessonProgress } from '@/types/database'

/**
 * Today's lessons, guided by the timetable. Each course on today's timetable gets its next lesson in
 * course order, so the lessons rotate with the timetable day by day. When the timetable names no course
 * today, GradPath rotates to the course the student studied least recently, so every day has a lesson.
 */
export interface PlanCourse {
  id: string
  code: string
  title: string
  lessons: { id: string; title: string; href: string }[]
}

export interface DailyLesson {
  courseId: string
  courseCode: string
  courseTitle: string
  source: 'timetable' | 'rotation'
  slot: { start: Date; end: Date } | null
  /** The lesson to take next in this course; null once every lesson in the course is complete. */
  next: { id: string; title: string; href: string } | null
  /** A lesson in this course that already has progress recorded today. */
  doneToday: { id: string; title: string } | null
  reason: string
}

export interface DailyPlanInput {
  todayEntries: PlannerEntry[]
  courses: PlanCourse[]
  droppedCourseIds: readonly string[]
  progress: LessonProgress[]
  lessonIdsToday: readonly string[]
}

function nextLesson(course: PlanCourse, progress: Map<string, LessonProgress>): DailyLesson['next'] {
  const unfinished = course.lessons.filter((l) => progress.get(l.id)?.status !== 'completed')
  const started = unfinished
    .filter((l) => (progress.get(l.id)?.reading_percent ?? 0) > 0)
    .sort((a, b) => (progress.get(b.id)?.updated_at ?? '').localeCompare(progress.get(a.id)?.updated_at ?? ''))
  return started[0] ?? unfinished[0] ?? null
}

function lastStudied(course: PlanCourse, progress: Map<string, LessonProgress>): string {
  return course.lessons.reduce((latest, l) => {
    const at = progress.get(l.id)?.updated_at ?? ''
    return at > latest ? at : latest
  }, '')
}

export function planToday(input: DailyPlanInput): DailyLesson[] {
  const progress = new Map(input.progress.map((p) => [p.lesson_id, p]))
  const today = new Set(input.lessonIdsToday)
  const dropped = new Set(input.droppedCourseIds)
  const courseById = new Map(input.courses.map((c) => [c.id, c]))

  const describe = (course: PlanCourse, source: DailyLesson['source'], slot: DailyLesson['slot'], reason: string): DailyLesson => {
    const done = course.lessons.find((l) => today.has(l.id))
    return {
      courseId: course.id,
      courseCode: course.code,
      courseTitle: course.title,
      source,
      slot,
      next: nextLesson(course, progress),
      doneToday: done ? { id: done.id, title: done.title } : null,
      reason,
    }
  }

  const scheduled: DailyLesson[] = []
  for (const entry of input.todayEntries) {
    if (entry.status === 'cancelled' || entry.status === 'skipped' || !entry.courseId) continue
    const course = courseById.get(entry.courseId)
    if (!course || dropped.has(course.id) || scheduled.some((s) => s.courseId === course.id)) continue
    scheduled.push(describe(course, 'timetable', { start: entry.start, end: entry.end }, `${course.code} is on your timetable today.`))
  }
  if (scheduled.length) return scheduled

  const active = input.courses.filter((c) => !dropped.has(c.id))
  const studiedToday = active.find((c) => c.lessons.some((l) => today.has(l.id)))
  const reason = input.todayEntries.length
    ? 'Today’s timetable has no course block, so GradPath picks the course you studied least recently.'
    : 'Nothing is on your timetable today, so GradPath picks the course you studied least recently.'
  if (studiedToday) return [describe(studiedToday, 'rotation', null, reason)]
  const candidate = active
    .filter((c) => nextLesson(c, progress) !== null)
    .map((c, order) => ({ c, order, at: lastStudied(c, progress) }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order)[0]
  return candidate ? [describe(candidate.c, 'rotation', null, reason)] : []
}
