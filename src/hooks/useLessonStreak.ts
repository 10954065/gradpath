import { useQuery } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { streakStatus } from '@/lib/analytics'
import { listLessonDays } from '@/services/study/overview'
import { isoDate } from '@/utils/dates'

/** Under the 'progress' key, so anything that refreshes lesson progress also refreshes the streak. */
export const LESSON_DAYS_KEY = ['progress', 'lesson-days'] as const
const HISTORY_DAYS = 400

/** The lesson streak (the flame) and the lessons with progress today. */
export function useLessonStreak() {
  const { user } = useAuth()
  const since = isoDate(subDays(new Date(), HISTORY_DAYS))
  const query = useQuery({
    queryKey: [...LESSON_DAYS_KEY, since],
    queryFn: () => listLessonDays(since),
    enabled: Boolean(user),
    staleTime: 0,
  })
  return useMemo(() => {
    const rows = query.data ?? []
    const today = isoDate(new Date())
    return {
      ...streakStatus([...new Set(rows.map((r) => r.day))]),
      lessonIdsToday: rows.filter((r) => r.day === today).map((r) => r.lesson_id),
      isPending: query.isPending,
    }
  }, [query.data, query.isPending])
}
