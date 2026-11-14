import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useOfficialTimetable } from '@/hooks/useOfficialTimetable'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { toUserMessage } from '@/lib/errors'
import { buildExamRevisionPlan, daysUntil, upcomingExams, type Busy, type PlanOptions, type RevisionBlock } from '@/lib/examPlan'
import { ghanaNow, localDay, mayAttend, toMinutes } from '@/lib/officialTimetable'
import { occursOn } from '@/lib/timetable'
import { getCatalogue } from '@/services/courses'
import { listMyProgress } from '@/services/progress'
import { saveAssignment, listAssignments, type AssignmentInput } from '@/services/study/assignments'
import { deleteExamPlan, saveExamPlan } from '@/services/study/exams'
import { listEvents, listSessions } from '@/services/study/planner'
import type { Assignment } from '@/types/database'
import { isoDate } from '@/utils/dates'

const EXAM_LENGTH_MINUTES = 180
const HISTORY_DAYS = 90

/** Upcoming examinations, the revision planned for each, and planning that keeps clear of lectures and other blocks. */
export function useExams() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const tt = useOfficialTimetable()
  const { lecturesStartOn } = useSemesterCalendar()
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: listAssignments })
  const events = useQuery({ queryKey: ['timetable'], queryFn: listEvents })
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const from = new Date(Date.now() - HISTORY_DAYS * 86_400_000)
  const to = new Date(Date.now() + 365 * 86_400_000)
  const sessions = useQuery({ queryKey: ['sessions', isoDate(from), isoDate(to)], queryFn: () => listSessions(from.toISOString(), to.toISOString()) })

  const exams = upcomingExams(assignments.data ?? [])
  const allEvents = events.data ?? []
  const completed = new Set((progress.data ?? []).filter((p) => p.status === 'completed').map((p) => p.lesson_id))

  const planOf = (examId: string) => {
    const planned = allEvents.filter((e) => e.exam_id === examId)
    const ids = new Set(planned.map((e) => e.id))
    const done = (sessions.data ?? []).filter((s) => s.timetable_event_id && ids.has(s.timetable_event_id) && s.status === 'completed').length
    return { planned: planned.length, done, events: planned }
  }

  /** Lectures, the student's own blocks (not the provisional weekly plan or this exam's own sessions) and other exams. */
  const busyOn = (examId: string) => (date: string): Busy[] => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const lecturesBegun = !lecturesStartOn || date >= localDay(lecturesStartOn)
    const lectures = lecturesBegun
      ? tt.sessions.filter((s) => s.dayOfWeek === weekday && mayAttend(s, tt.attendance)).map((s) => ({ start: toMinutes(s.start), end: toMinutes(s.end) }))
      : []
    const own = allEvents
      .filter((e) => !e.is_provisional && e.exam_id !== examId && occursOn(e, date))
      .map((e) => ({ start: toMinutes(e.start_time), end: toMinutes(e.end_time) }))
    const otherExams = exams
      .filter((x) => x.id !== examId && ghanaNow(new Date(x.due_at as string)).date === date)
      .map((x) => {
        const start = ghanaNow(new Date(x.due_at as string)).minutes
        return { start, end: start + EXAM_LENGTH_MINUTES }
      })
    return [...lectures, ...own, ...otherExams]
  }

  const preview = (exam: Assignment, options: PlanOptions): RevisionBlock[] => {
    const course = catalogue.data?.find((c) => c.id === exam.course_id)
    return buildExamRevisionPlan({
      code: course?.code ?? exam.title,
      examDate: ghanaNow(new Date(exam.due_at as string)).date,
      today: ghanaNow().date,
      modules: (course?.modules ?? []).map((m) => ({ title: m.title, lessonIds: m.lessons.map((l) => l.id) })),
      completed,
      options,
      busy: busyOn(exam.id),
    })
  }

  const invalidatePlanner = () => {
    void queryClient.invalidateQueries({ queryKey: ['timetable'] })
    void queryClient.invalidateQueries({ queryKey: ['sessions'] })
  }

  const applyPlan = useMutation({
    mutationFn: ({ exam, blocks }: { exam: Assignment; blocks: RevisionBlock[] }) => saveExamPlan(user?.id as string, exam, blocks),
    onSuccess: (count) => {
      toast.success(`${count} revision session${count === 1 ? '' : 's'} added to your planner.`)
      invalidatePlanner()
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const removePlan = useMutation({
    mutationFn: deleteExamPlan,
    onSuccess: () => {
      toast.success('Revision plan removed from your planner.')
      invalidatePlanner()
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const addExam = useMutation({
    mutationFn: (input: AssignmentInput) => saveAssignment(user?.id as string, input),
    onSuccess: () => {
      toast.success('Examination added.')
      void queryClient.invalidateQueries({ queryKey: ['assignments'] })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  return {
    isPending: assignments.isPending || events.isPending || catalogue.isPending || progress.isPending,
    error: assignments.error ?? events.error ?? catalogue.error ?? progress.error ?? null,
    exams: exams.map((exam) => {
      const course = catalogue.data?.find((c) => c.id === exam.course_id) ?? null
      const lessonIds = course?.modules.flatMap((m) => m.lessons.map((l) => l.id)) ?? []
      return {
        exam,
        course,
        days: daysUntil(new Date(exam.due_at as string)),
        lessonsDone: lessonIds.filter((id) => completed.has(id)).length,
        lessonsTotal: lessonIds.length,
        plan: planOf(exam.id),
      }
    }),
    taking: tt.taking,
    preview,
    applyPlan: (exam: Assignment, blocks: RevisionBlock[], onDone?: () => void) => applyPlan.mutate({ exam, blocks }, { onSuccess: () => onDone?.() }),
    applying: applyPlan.isPending,
    removePlan: (examId: string) => removePlan.mutate(examId),
    addExam: (input: AssignmentInput, onDone?: () => void) => addExam.mutate(input, { onSuccess: () => onDone?.() }),
    adding: addExam.isPending,
  }
}
