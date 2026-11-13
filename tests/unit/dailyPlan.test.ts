import { describe, expect, it } from 'vitest'
import { planToday, type DailyPlanInput, type PlanCourse } from '@/lib/dailyPlan'
import type { PlannerEntry } from '@/lib/timetable'
import type { LessonProgress } from '@/types/database'

const course = (id: string, code: string, lessonIds: string[]): PlanCourse => ({
  id,
  code,
  title: `${code} title`,
  lessons: lessonIds.map((l) => ({ id: l, title: `Lesson ${l}`, href: `/courses/${id}/lessons/${l}` })),
})
const courses = [course('c601', 'CSIT 601', ['a1', 'a2', 'a3']), course('c603', 'CSIT 603', ['b1', 'b2']), course('c605', 'CSIT 605', ['d1'])]

const entry = (courseId: string | null, status: PlannerEntry['status'] = 'planned'): PlannerEntry => ({
  key: `${courseId}`,
  title: 'Study block',
  courseId,
  kind: courseId ? 'study' : 'revision',
  start: new Date('2026-11-16T14:00:00'),
  end: new Date('2026-11-16T16:00:00'),
  date: '2026-11-16',
  event: null,
  session: null,
  status,
  isProvisional: true,
})

const progress = (lessonId: string, status: LessonProgress['status'], reading: number, updatedAt: string): LessonProgress => ({
  user_id: 'u', lesson_id: lessonId, status, reading_percent: reading, time_spent_seconds: 0, last_section: null, quiz_best_percent: null,
  mastered_at: null, started_at: '', completed_at: null, updated_at: updatedAt,
})

function input(partial: Partial<DailyPlanInput> = {}): DailyPlanInput {
  return { todayEntries: [], courses, droppedCourseIds: [], progress: [], lessonIdsToday: [], ...partial }
}

describe('today’s lessons from the timetable', () => {
  it('gives each course on today’s timetable its next unfinished lesson in course order', () => {
    const plan = planToday(input({ todayEntries: [entry('c601')], progress: [progress('a1', 'completed', 100, '2026-11-09T10:00:00Z')] }))
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ courseCode: 'CSIT 601', source: 'timetable', next: { id: 'a2' }, doneToday: null })
    expect(plan[0]?.slot?.start.getHours()).toBe(14)
  })

  it('moves on to the following lesson as lessons are completed, so the timetable rotates through the course', () => {
    const done = [progress('a1', 'completed', 100, '2026-11-09T10:00:00Z'), progress('a2', 'completed', 100, '2026-11-16T10:00:00Z')]
    expect(planToday(input({ todayEntries: [entry('c601')], progress: done }))[0]?.next?.id).toBe('a3')
  })

  it('prefers a lesson already started over the next unopened one', () => {
    const started = [progress('a3', 'in_progress', 40, '2026-11-10T10:00:00Z')]
    expect(planToday(input({ todayEntries: [entry('c601')], progress: started }))[0]?.next?.id).toBe('a3')
  })

  it('marks a course done today when one of its lessons has progress today', () => {
    const plan = planToday(input({ todayEntries: [entry('c603')], lessonIdsToday: ['b1'], progress: [progress('b1', 'in_progress', 60, '2026-11-16T09:00:00Z')] }))
    expect(plan[0]).toMatchObject({ doneToday: { id: 'b1' }, next: { id: 'b1' } })
  })

  it('ignores cancelled blocks, dropped courses and duplicate blocks for the same course', () => {
    const plan = planToday(input({ todayEntries: [entry('c601', 'cancelled'), entry('c603'), entry('c603'), entry('c605')], droppedCourseIds: ['c605'] }))
    expect(plan.map((p) => p.courseCode)).toEqual(['CSIT 603'])
  })

  it('rotates to the least recently studied course when the timetable has no course today', () => {
    const plan = planToday(
      input({
        todayEntries: [entry(null)],
        progress: [progress('a1', 'in_progress', 30, '2026-11-15T10:00:00Z'), progress('b1', 'in_progress', 30, '2026-11-12T10:00:00Z'), progress('d1', 'in_progress', 30, '2026-11-14T10:00:00Z')],
      }),
    )
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ courseCode: 'CSIT 603', source: 'rotation', slot: null })
    expect(plan[0]?.reason).toContain('no course block')
  })

  it('picks never-studied courses first in rotation, in catalogue order, and skips finished courses', () => {
    const plan = planToday(input({ progress: [progress('a1', 'in_progress', 30, '2026-11-15T10:00:00Z'), progress('b1', 'completed', 100, '2026-11-01T10:00:00Z'), progress('b2', 'completed', 100, '2026-11-01T10:00:00Z')] }))
    expect(plan[0]?.courseCode).toBe('CSIT 605')
  })

  it('keeps the course already studied today in rotation instead of switching', () => {
    const plan = planToday(input({ lessonIdsToday: ['a1'], progress: [progress('a1', 'in_progress', 30, '2026-11-16T10:00:00Z')] }))
    expect(plan[0]).toMatchObject({ courseCode: 'CSIT 601', doneToday: { id: 'a1' } })
  })

  it('reports a finished course with no next lesson', () => {
    const plan = planToday(input({ todayEntries: [entry('c605')], progress: [progress('d1', 'completed', 100, '2026-11-01T10:00:00Z')] }))
    expect(plan[0]?.next).toBeNull()
  })
})
