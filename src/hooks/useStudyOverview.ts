import { useQuery } from '@tanstack/react-query'
import { addDays, endOfWeek, subWeeks } from 'date-fns'
import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLessonStreak } from '@/hooks/useLessonStreak'
import { ENROLMENTS_KEY } from '@/hooks/useMyCourses'
import { summariseSelection, takingCourses } from '@/lib/curriculum'
import { planToday } from '@/lib/dailyPlan'
import { recommend, type LessonRef } from '@/lib/recommendations'
import { buildPlanner, studyTotals } from '@/lib/timetable'
import { listMyAttempts, listQuizzes } from '@/services/assessments'
import { getCatalogue, listEnrolments } from '@/services/courses'
import { listMyProgress } from '@/services/progress'
import { listAssignments } from '@/services/study/assignments'
import { getPlatformSettings, listAnnouncements } from '@/services/study/overview'
import { listEvents, listSessions } from '@/services/study/planner'
import { listReviews, listRevisionItems } from '@/services/study/revision'
import { isoDate, weekStart } from '@/utils/dates'

const WEEKS_OF_HISTORY = 8

/** Everything the dashboard and progress centre need, computed only from the student's own records. */
export function useStudyOverview() {
  const { profile } = useAuth()
  const thisWeek = weekStart(new Date())
  const historyStart = subWeeks(thisWeek, WEEKS_OF_HISTORY - 1)
  const weekEnd = endOfWeek(thisWeek, { weekStartsOn: 1 })

  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const attempts = useQuery({ queryKey: ['attempts'], queryFn: listMyAttempts })
  const quizzes = useQuery({ queryKey: ['quizzes', 'all'], queryFn: () => listQuizzes() })
  const revision = useQuery({ queryKey: ['revision-items'], queryFn: listRevisionItems })
  const reviews = useQuery({ queryKey: ['revision-reviews'], queryFn: () => listReviews() })
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: listAssignments })
  const events = useQuery({ queryKey: ['timetable'], queryFn: listEvents })
  const sessions = useQuery({
    queryKey: ['sessions', isoDate(historyStart), isoDate(weekEnd)],
    queryFn: () => listSessions(historyStart.toISOString(), addDays(weekEnd, 1).toISOString()),
  })
  const enrolments = useQuery({ queryKey: ENROLMENTS_KEY, queryFn: listEnrolments })
  const streak = useLessonStreak()
  const announcements = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements })
  const settings = useQuery({ queryKey: ['platform-settings'], queryFn: getPlatformSettings })

  const derived = useMemo(() => {
    // Only the courses the student takes: dashboard, progress, recommendations and today's plan all use this list.
    const courses = takingCourses(catalogue.data ?? [], enrolments.data ?? [])
    const selection = summariseSelection(catalogue.data ?? [], enrolments.data ?? [])
    const lessons: LessonRef[] = courses.flatMap((c) =>
      c.modules.flatMap((m) =>
        m.lessons.map((l) => ({ id: l.id, title: l.title, courseCode: c.code, moduleId: m.id, moduleTitle: m.title, href: `/courses/${c.slug}/lessons/${l.slug}` })),
      ),
    )
    const weeks = Array.from({ length: WEEKS_OF_HISTORY }, (_, i) => {
      const start = addDays(historyStart, i * 7)
      const entries = buildPlanner(events.data ?? [], sessions.data ?? [], start, addDays(start, 6))
      return { start, ...studyTotals(entries) }
    })
    const current = weeks[weeks.length - 1] ?? { completedMinutes: 0, plannedMinutes: 0, completedSessions: 0, start: thisWeek }
    const upcoming = buildPlanner(events.data ?? [], sessions.data ?? [], new Date(), addDays(new Date(), 7)).filter(
      (e) => e.status === 'planned' && e.end > new Date() && e.kind !== 'lecture',
    )
    const threshold = settings.data?.mastery_threshold ?? 80
    const recommendations = recommend({
      now: new Date(),
      masteryThreshold: threshold,
      lessons,
      progress: progress.data ?? [],
      attempts: attempts.data ?? [],
      quizzes: quizzes.data ?? [],
      revision: revision.data ?? [],
      assignments: assignments.data ?? [],
      studiedMinutesThisWeek: current.completedMinutes,
      weeklyTargetHours: Number(profile?.weekly_study_target_hours ?? 15),
    })
    const todayPlan = planToday({
      todayEntries: buildPlanner(events.data ?? [], sessions.data ?? [], new Date(), new Date()),
      courses: courses.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        lessons: c.modules.flatMap((m) => m.lessons.map((l) => ({ id: l.id, title: l.title, href: `/courses/${c.slug}/lessons/${l.slug}` }))),
      })),
      droppedCourseIds: (enrolments.data ?? []).filter((e) => e.status === 'dropped').map((e) => e.course_id),
      progress: progress.data ?? [],
      lessonIdsToday: streak.lessonIdsToday,
    })
    return { courses, selection, lessons, weeks, current, upcoming, threshold, recommendations, todayPlan }
  }, [catalogue.data, events.data, sessions.data, progress.data, attempts.data, quizzes.data, revision.data, assignments.data, enrolments.data, streak.lessonIdsToday, settings.data, profile, historyStart, thisWeek])

  const isLoading = catalogue.isPending || progress.isPending || enrolments.isPending
  return {
    isLoading,
    error: catalogue.error ?? progress.error ?? null,
    progress: progress.data ?? [],
    attempts: attempts.data ?? [],
    quizzes: quizzes.data ?? [],
    revision: revision.data ?? [],
    reviews: reviews.data ?? [],
    assignments: assignments.data ?? [],
    announcements: announcements.data ?? [],
    streak,
    ...derived,
  }
}
