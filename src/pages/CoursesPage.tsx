import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Clock, GraduationCap } from 'lucide-react'
import { Link } from 'react-router'
import { accentClass, CourseStatusBadge } from '@/components/courses/badges'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { toUserMessage } from '@/lib/errors'
import { courseLessonIds, summariseProgress } from '@/lib/progress'
import { getCatalogue, listEnrolments } from '@/services/courses'
import { listMyProgress } from '@/services/progress'

const ENROLMENT_LABEL = { enrolled: 'Registered', pending_confirmation: 'Registration to confirm', dropped: 'Not taking' } as const

export default function CoursesPage() {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const enrolments = useQuery({ queryKey: ['enrolments'], queryFn: listEnrolments })

  return (
    <>
      <PageHeader
        eyebrow="Semester 1 · MSc IT for Business"
        title="My Courses"
        description="The seven courses in GradPath's initial curriculum. Confirm each against your official registration in Settings."
      />
      {catalogue.isError ? <ErrorState message={toUserMessage(catalogue.error)} onRetry={() => void catalogue.refetch()} /> : null}
      {catalogue.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : catalogue.data?.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No courses published yet" description="Courses will appear here once an administrator publishes them." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalogue.data?.map((course) => {
            const ids = courseLessonIds(course)
            const summary = summariseProgress(ids, progress.data ?? [])
            const minutes = course.modules.flatMap((m) => m.lessons).reduce((sum, l) => sum + l.estimated_minutes, 0)
            const enrolment = enrolments.data?.find((e) => e.course_id === course.id)
            return (
              <li key={course.id}>
                <Link
                  to={`/courses/${course.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${accentClass(course.accent)}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground">{course.code}</span>
                    {enrolment ? (
                      <Badge tone={enrolment.status === 'enrolled' ? 'success' : 'neutral'}>{ENROLMENT_LABEL[enrolment.status]}</Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-2 text-lg leading-snug font-semibold tracking-tight">{course.title}</h2>
                  <div className="mt-1.5">
                    <CourseStatusBadge course={course} />
                  </div>
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
      )}
    </>
  )
}
