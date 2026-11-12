import type { LessonProgress } from '@/types/database'

export interface ProgressSummary {
  total: number
  completed: number
  inProgress: number
  percent: number
}

interface HasLessons {
  lessons: { id: string }[]
}

/** Completion summary for a set of lessons given the student's progress rows. */
export function summariseProgress(lessonIds: string[], progress: readonly LessonProgress[]): ProgressSummary {
  const byLesson = new Map(progress.map((p) => [p.lesson_id, p]))
  let completed = 0
  let inProgress = 0
  for (const id of lessonIds) {
    const row = byLesson.get(id)
    if (row?.status === 'completed') completed += 1
    else if (row && (row.reading_percent > 0 || row.status === 'in_progress')) inProgress += 1
  }
  const total = lessonIds.length
  return { total, completed, inProgress, percent: total ? Math.round((completed / total) * 100) : 0 }
}

export function courseLessonIds(course: { modules: HasLessons[] }): string[] {
  return course.modules.flatMap((m) => m.lessons.map((l) => l.id))
}

/** The next lesson a student should open: the first unfinished lesson in course order. */
export function nextLesson<T extends { id: string }>(ordered: readonly T[], progress: readonly LessonProgress[]): T | null {
  const done = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.lesson_id))
  return ordered.find((l) => !done.has(l.id)) ?? null
}

/** Reading percentage from scroll position: how much of the article has passed the bottom of the viewport. */
export function readingPercentFromScroll(articleTop: number, articleHeight: number, scrollY: number, viewportHeight: number): number {
  if (articleHeight <= 0) return 0
  const seen = scrollY + viewportHeight - articleTop
  return Math.max(0, Math.min(100, Math.round((seen / articleHeight) * 100)))
}
