import { useQuery } from '@tanstack/react-query'
import { addDays, endOfWeek, subWeeks } from 'date-fns'
import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { currentStreak } from '@/lib/analytics'
import { recommend, type LessonRef } from '@/lib/recommendations'
import { buildPlanner, studyTotals } from '@/lib/timetable'
import { listMyAttempts, listQuizzes } from '@/services/assessments'
import { getCatalogue } from '@/services/courses'
import { listMyProgress } from '@/services/progress'
import { listAssignments } from '@/services/study/assignments'
import { listActivityDays, getPlatformSettings, listAnnouncements } from '@/services/study/overview'
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
  const activity = useQuery({ queryKey: ['activity', isoDate(historyStart)], queryFn: () => listActivityDays(isoDate(subWeeks(historyStart, 8))) })
  const announcements = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements })
  const settings = useQuery({ queryKey: ['platform-settings'], queryFn: getPlatformSettings })

  const derived = useMemo(() => {
    const courses = catalogue.data ?? []
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
    const streak = currentStreak((activity.data ?? []).map((d) => d.day))
    return { courses, lessons, weeks, current, upcoming, threshold, recommendations, streak }
  }, [catalogue.data, events.data, sessions.data, progress.data, attempts.data, quizzes.data, revision.data, assignments.data, activity.data, settings.data, profile, historyStart, thisWeek])

  const isLoading = catalogue.isPending || progress.isPending
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
    ...derived,
  }
}
