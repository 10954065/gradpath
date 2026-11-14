import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useMyCourses } from '@/hooks/useMyCourses'
import { toUserMessage } from '@/lib/errors'
import { effectiveAttendance, sortWeek, type AttendanceStatus } from '@/lib/officialTimetable'
import { ATTENDANCE_KEY, getOfficialTimetable, listAttendance, OFFICIAL_TIMETABLE_KEY, setAttendance } from '@/services/timetable/official'

const EMPTY_ATTENDANCE: ReadonlyMap<string, AttendanceStatus> = new Map()

/**
 * The official timetable filtered to the courses the student takes, with their private attendance choices.
 * Sessions for courses the student does not take (for example an elective they did not choose) are counted but
 * never shown in the personal timetable.
 */
export function useOfficialTimetable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const my = useMyCourses()
  const timetable = useQuery({ queryKey: OFFICIAL_TIMETABLE_KEY, queryFn: getOfficialTimetable })
  const attendance = useQuery({ queryKey: ATTENDANCE_KEY, queryFn: listAttendance })

  const update = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: AttendanceStatus }) => setAttendance(user?.id as string, ids, status),
    onMutate: async ({ ids, status }) => {
      await queryClient.cancelQueries({ queryKey: ATTENDANCE_KEY })
      const previous = queryClient.getQueryData<Map<string, AttendanceStatus>>(ATTENDANCE_KEY)
      const next = new Map(previous ?? [])
      for (const id of ids) next.set(id, status)
      queryClient.setQueryData(ATTENDANCE_KEY, next)
      return { previous }
    },
    onError: (e, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(ATTENDANCE_KEY, context.previous)
      toast.error(toUserMessage(e))
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
  })

  const all = timetable.data?.sessions ?? []
  const mine = sortWeek(all.filter((s) => my.isTaking(s.courseId)))
  const choices = attendance.data ?? EMPTY_ATTENDANCE
  return {
    isPending: timetable.isPending || attendance.isPending || my.isPending,
    error: timetable.error ?? attendance.error ?? null,
    refetch: () => {
      void timetable.refetch()
      void attendance.refetch()
    },
    source: timetable.data?.source ?? null,
    /** Sessions for the student's own courses, Monday first. */
    sessions: mine,
    hiddenCount: all.length - mine.length,
    /** Each session's attendance: the student's choice, or confirmed when the allocation covers all students. */
    attendance: effectiveAttendance(mine, choices),
    setAttendance: (ids: string[], status: AttendanceStatus) => update.mutate({ ids, status }),
    saving: update.isPending,
    taking: my.taking,
  }
}
