import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useMyCourses } from '@/hooks/useMyCourses'
import { toUserMessage } from '@/lib/errors'
import { courseStanding, gradeFor, gradePointAverage, MAX_C_OR_LOWER } from '@/lib/grades'
import { COURSE_MARKS_KEY, deleteCourseMark, listCourseMarks, saveCourseMark, type CourseMark, type MarkInput } from '@/services/study/marks'

const NO_MARKS: CourseMark[] = []

/** The student's official marks, the standing in each course they take and their grade point average. */
export function useCourseMarks() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const my = useMyCourses()
  const marks = useQuery({ queryKey: COURSE_MARKS_KEY, queryFn: listCourseMarks })

  const save = useMutation({
    mutationFn: ({ input, id }: { input: MarkInput; id?: string | undefined }) => saveCourseMark(user?.id as string, input, id),
    onSuccess: () => {
      toast.success('Mark saved.')
      void queryClient.invalidateQueries({ queryKey: COURSE_MARKS_KEY })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const remove = useMutation({
    mutationFn: deleteCourseMark,
    onSuccess: () => {
      toast.success('Mark deleted.')
      void queryClient.invalidateQueries({ queryKey: COURSE_MARKS_KEY })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const all = marks.data ?? NO_MARKS
  const summary = useMemo(() => {
    const courses = my.taking.map((course) => {
      const items = all.filter((m) => m.course_id === course.id)
      return { course, items, standing: courseStanding(items) }
    })
    const finals = courses.filter((c) => c.standing.final !== null)
    const cOrLower = finals.filter((c) => gradeFor(c.standing.final as number).point <= 2).length
    return {
      courses,
      /** Over courses with a final mark only. */
      gpa: gradePointAverage(finals.map((c) => ({ credits: c.course.credit_slots, mark: c.standing.final }))),
      /** Final marks where known, otherwise the current average. */
      projectedGpa: gradePointAverage(courses.map((c) => ({ credits: c.course.credit_slots, mark: c.standing.final ?? c.standing.average }))),
      finishedCourses: finals.length,
      cOrLower,
      withinGoodStanding: cOrLower <= MAX_C_OR_LOWER,
    }
  }, [my.taking, all])

  return {
    isPending: marks.isPending || my.isPending,
    error: marks.error ?? my.error ?? null,
    ...summary,
    save: (input: MarkInput, id: string | undefined, onDone?: () => void) => save.mutate({ input, id }, { onSuccess: () => onDone?.() }),
    saving: save.isPending,
    remove: (id: string) => remove.mutate(id),
  }
}
