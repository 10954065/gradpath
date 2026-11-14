import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { selectionStatus, summariseSelection, type SelectionStatus } from '@/lib/curriculum'
import { listCourses, listEnrolments, syncDefaultEnrolments } from '@/services/courses'
import type { Course } from '@/types/database'

export const ENROLMENTS_KEY = ['enrolments'] as const

/**
 * The student's own course selection, the single source for "my courses" on every screen: the dashboard, course
 * lists, planner, timetable, deadlines, notes, revision, flashcards, resources and assessments.
 */
export function useMyCourses() {
  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses })
  const enrolments = useQuery({ queryKey: ENROLMENTS_KEY, queryFn: listEnrolments })

  return useMemo(() => {
    const all = courses.data ?? []
    const rows = enrolments.data ?? []
    const ready = Boolean(courses.data && enrolments.data)
    const summary = summariseSelection(all, rows)
    const takingIds = new Set(summary.taking.map((c) => c.id))
    return {
      isPending: courses.isPending || enrolments.isPending,
      error: courses.error ?? enrolments.error ?? null,
      all,
      enrolments: rows,
      summary,
      /** Courses the student takes, in programme order: use for pickers and filters. */
      taking: summary.taking,
      /** Whether a course is one the student takes. Before the selection loads every course counts, so lists never flash empty. */
      isTaking: (courseId: string | null | undefined) => courseId != null && (!ready || takingIds.has(courseId)),
      statusOf: (course: Pick<Course, 'id' | 'classification'>): SelectionStatus => selectionStatus(course, rows),
    }
  }, [courses.data, courses.isPending, courses.error, enrolments.data, enrolments.isPending, enrolments.error])
}

/** Once per visit, add newly published compulsory courses (and new electives, as "to confirm") to the student's list. */
export function useEnrolmentSync(): void {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id
  const onboarded = Boolean(profile?.onboarding_completed_at)

  useEffect(() => {
    if (!userId || !onboarded) return
    void syncDefaultEnrolments()
      .then((added) => {
        if (added > 0) void queryClient.invalidateQueries({ queryKey: ENROLMENTS_KEY })
      })
      .catch(() => undefined)
  }, [userId, onboarded, queryClient])
}
