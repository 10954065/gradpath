import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Clock, GraduationCap } from 'lucide-react'
import { Link } from 'react-router'
import { accentClass, ClassificationBadge } from '@/components/courses/badges'
import { EmptyState, ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { useMyCourses } from '@/hooks/useMyCourses'
import { toUserMessage } from '@/lib/errors'
import { courseLessonIds, summariseProgress } from '@/lib/progress'
import { getCatalogue, type CourseDetail } from '@/services/courses'
import { listMyProgress } from '@/services/progress'
import type { LessonProgress } from '@/types/database'

export default function CoursesPage() {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const my = useMyCourses()

  const courses = catalogue.data ?? []
  const mine = courses.filter((c) => my.isTaking(c.id))
  const others = courses.filter((c) => !my.isTaking(c.id))
  const { summary } = my

  return (
    <>
      <PageHeader
        eyebrow="Semester 1 · MSc IT for Business"
        title="My Courses"
        description={
          my.isPending
            ? 'Your Semester 1 courses.'
            : `${summary.enrolled.length} enrolled course${summary.enrolled.length === 1 ? '' : 's'} · ${summary.creditSlots} credit slots${
                summary.pending.length ? ` (plus ${summary.pendingCreditSlots} awaiting your elective confirmation)` : ''
              }. Change your elective in Settings, Courses.`
        }
      />
      {catalogue.isError ? <ErrorState message={toUserMessage(catalogue.error)} onRetry={() => void catalogue.refetch()} /> : null}
      {catalogue.isPending || my.isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No courses published yet" description="Courses will appear here once an administrator publishes them." />
      ) : (
        <>
          <CourseGrid courses={mine} progress={progress.data ?? []} statusOf={my.statusOf} label="My courses" />
          {others.length ? (
            <section className="mt-10" aria-labelledby="other-courses">
              <h2 id="other-courses" className="text-base font-semibold tracking-tight">
                Other programme courses
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Courses in the programme that are not part of your selection. They do not count towards your progress, planner or
                assessments.
              </p>
              <CourseGrid courses={others} progress={progress.data ?? []} statusOf={my.statusOf} label="Other programme courses" muted />
            </section>
          ) : null}
        </>
      )}
    </>
  )
}

function CourseGrid({
  courses,
  progress,
  statusOf,
  label,
  muted = false,
}: {
  courses: CourseDetail[]
  progress: LessonProgress[]
  statusOf: ReturnType<typeof useMyCourses>['statusOf']
  label: string
  muted?: boolean
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={label}>
      {courses.map((course) => {
        const ids = courseLessonIds(course)
        const summary = summariseProgress(ids, progress)
        const minutes = course.modules.flatMap((m) => m.lessons).reduce((sum, l) => sum + l.estimated_minutes, 0)
        return (
          <li key={course.id}>
            <Link
              to={`/courses/${course.slug}`}
              className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-ring ${muted ? 'opacity-80' : ''}`}
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${accentClass(course.accent)}`} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground">{course.code}</span>
                <ClassificationBadge course={course} selection={statusOf(course)} />
              </div>
              <h2 className="mt-2 text-lg leading-snug font-semibold tracking-tight">{course.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{course.description}</p>
              <div className="mt-auto pt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="size-3.5" aria-hidden /> {course.modules.length} modules · {ids.length} lessons
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> ~{Math.round(minutes / 60)} h
                  </span>
                </div>
                <ProgressBar value={summary.percent} label={`${course.code} progress`} />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {summary.completed}/{summary.total} completed
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    {summary.completed || summary.inProgress ? 'Continue' : 'Start'}
                    <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
