import { useQuery } from '@tanstack/react-query'
import { Clock, Shuffle, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { toUserMessage } from '@/lib/errors'
import { listMyAttempts, listQuizzes } from '@/services/assessments'
import { listCourses } from '@/services/courses'

export default function MockExamsPage() {
  const quizzes = useQuery({ queryKey: ['quizzes', 'mock'], queryFn: () => listQuizzes({ kind: 'mock_exam' }) })
  const attempts = useQuery({ queryKey: ['attempts'], queryFn: listMyAttempts })
  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses })
  const codeOf = (id: string | null) => courses.data?.find((c) => c.id === id)?.code

  return (
    <>
      <PageHeader
        title="Mock Examinations"
        description="Timed, randomised practice examinations drawn from each course's question bank, plus a mixed-course paper for interleaved revision."
      />
      <Alert className="mb-6" title="Practice only">
        Mock examinations are built from supplementary practice questions. They do not reproduce official papers and do not predict your
        official grades. Check examination dates and formats with your lecturers.
      </Alert>
      {quizzes.isError ? <ErrorState message={toUserMessage(quizzes.error)} onRetry={() => void quizzes.refetch()} /> : null}
      {quizzes.isPending ? (
        <Skeleton className="h-80" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(quizzes.data ?? []).map((exam) => {
            const mine = (attempts.data ?? []).filter((a) => a.quiz_id === exam.id && a.status === 'submitted')
            const best = mine.reduce<number | null>((m, a) => (a.percent === null ? m : Math.max(m ?? 0, Number(a.percent))), null)
            return (
              <li key={exam.id} className="flex flex-col rounded-xl border bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-primary">{codeOf(exam.course_id) ?? 'All courses'}</span>
                  {best !== null ? <Badge tone={mine.some((a) => a.passed) ? 'success' : 'neutral'}>Best {Math.round(best)}%</Badge> : null}
                </div>
                <h2 className="mt-1 font-semibold tracking-tight">{exam.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{exam.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <Badge>
                    <Timer aria-hidden /> {exam.time_limit_minutes} min
                  </Badge>
                  <Badge>{exam.question_count} objective questions</Badge>
                  {exam.open_ended_count ? <Badge>{exam.open_ended_count} extended response</Badge> : null}
                  <Badge>
                    <Shuffle aria-hidden /> Randomised
                  </Badge>
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden /> {mine.length} attempt{mine.length === 1 ? '' : 's'}
                  </span>
                  <Button asChild size="sm">
                    <Link to={`/assessments/${exam.id}`}>View instructions</Link>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
