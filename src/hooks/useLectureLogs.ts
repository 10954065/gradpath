import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useOfficialTimetable } from '@/hooks/useOfficialTimetable'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { toUserMessage } from '@/lib/errors'
import { coursePace, dueCheckIns, lectureDateLabel, lecturesBegun, type CoursePace, type LectureLog } from '@/lib/lectureLog'
import { getCatalogue } from '@/services/courses'
import { listMyProgress } from '@/services/progress'
import { addToQueue } from '@/services/study/revision'
import { deleteLectureLog, LECTURE_LOGS_KEY, listLectureLogs, saveLectureLog, type CheckInInput } from '@/services/timetable/lectureLog'
import type { LessonSummary } from '@/types/database'

const NO_LOGS: LectureLog[] = []

export interface SaveCheckIn {
  input: CheckInInput
  courseId: string
  courseCode: string
}

/**
 * The student's lecture check-ins, the lectures still waiting for one, and how far ahead of (or behind) the lectures
 * the student is in each course they take.
 */
export function useLectureLogs() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const tt = useOfficialTimetable()
  const calendar = useSemesterCalendar()
  const logs = useQuery({ queryKey: LECTURE_LOGS_KEY, queryFn: listLectureLogs })
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })

  const save = useMutation({
    mutationFn: async ({ input, courseId, courseCode }: SaveCheckIn) => {
      const saved = await saveLectureLog(user?.id as string, input)
      const reason = `Unclear after the ${courseCode} lecture on ${lectureDateLabel(input.held_on)}`
      for (const lessonId of saved.review_lesson_ids) await addToQueue(user?.id as string, { lessonId, courseId, reason })
      return saved
    },
    onSuccess: (saved) => {
      toast.success(saved.review_lesson_ids.length ? 'Check-in saved. Lessons to review are in your Revision Centre.' : 'Check-in saved.')
      void queryClient.invalidateQueries({ queryKey: LECTURE_LOGS_KEY })
      if (saved.review_lesson_ids.length) void queryClient.invalidateQueries({ queryKey: ['revision-items'] })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const remove = useMutation({
    mutationFn: deleteLectureLog,
    onSuccess: () => {
      toast.success('Check-in deleted.')
      void queryClient.invalidateQueries({ queryKey: LECTURE_LOGS_KEY })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const all = logs.data ?? NO_LOGS
  const begun = lecturesBegun(calendar.lecturesStartOn)
  const paces = useMemo(() => {
    const completed = new Set((progress.data ?? []).filter((p) => p.status === 'completed').map((p) => p.lesson_id))
    const map = new Map<string, CoursePace<LessonSummary>>()
    for (const course of catalogue.data ?? []) {
      const ordered = course.modules.flatMap((m) => m.lessons)
      map.set(course.id, coursePace(ordered, completed, all.filter((g) => g.course_id === course.id), begun))
    }
    return map
  }, [catalogue.data, progress.data, all, begun])

  return {
    isPending: logs.isPending || catalogue.isPending || progress.isPending || tt.isPending,
    error: logs.error ?? catalogue.error ?? progress.error ?? tt.error ?? null,
    logs: all,
    /** Ended lectures with no check-in yet, newest first. */
    due: dueCheckIns(tt.sessions, tt.attendance, all, new Date(), calendar.lecturesStartOn),
    sessions: tt.sessions,
    attendance: tt.attendance,
    courses: (catalogue.data ?? []).filter((c) => tt.taking.some((t) => t.id === c.id)),
    paces,
    begun,
    save: (value: SaveCheckIn, onDone?: () => void) => save.mutate(value, { onSuccess: () => onDone?.() }),
    saving: save.isPending,
    remove: (logId: string) => remove.mutate(logId),
  }
}
