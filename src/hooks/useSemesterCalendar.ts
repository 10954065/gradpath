import { useQuery } from '@tanstack/react-query'
import type { Day } from 'date-fns'
import { semesterCalendar, weekOrder, type SemesterCalendar } from '@/lib/semesterCalendar'
import { getOfficialTimetable, OFFICIAL_TIMETABLE_KEY } from '@/services/timetable/official'

/** The study week of the current official timetable: shares (and caches) the official timetable query. */
export function useSemesterCalendar(): SemesterCalendar & { order: Day[]; isPending: boolean } {
  const timetable = useQuery({ queryKey: OFFICIAL_TIMETABLE_KEY, queryFn: getOfficialTimetable })
  const calendar = semesterCalendar(timetable.data?.source.teaching_started_on)
  /** Days of the week in the order the study week runs. */
  const order = weekOrder(calendar.weekStartsOn)
  return { ...calendar, order, isPending: timetable.isPending }
}
