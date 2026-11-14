import { useQuery } from '@tanstack/react-query'
import type { Day } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { semesterCalendar, weekOrder, type SemesterCalendar } from '@/lib/semesterCalendar'
import { getOfficialTimetable, OFFICIAL_TIMETABLE_KEY } from '@/services/timetable/official'

/**
 * The student's study week (from the day their studies started, set in Settings) and the day official lectures begin
 * (from the current official timetable, sharing its cached query).
 */
export function useSemesterCalendar(): SemesterCalendar & { order: Day[]; isPending: boolean } {
  const { profile } = useAuth()
  const timetable = useQuery({ queryKey: OFFICIAL_TIMETABLE_KEY, queryFn: getOfficialTimetable })
  const calendar = semesterCalendar(timetable.data?.source.teaching_started_on, profile?.study_started_on)
  /** Days of the week in the order the study week runs. */
  const order = weekOrder(calendar.weekStartsOn)
  return { ...calendar, order, isPending: timetable.isPending }
}
