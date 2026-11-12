import { useMutation, useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Info, PlayCircle, Timer } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { SourceBadge } from '@/components/courses/badges'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { toUserMessage } from '@/lib/errors'
import { getQuiz, listMyAttempts, QUIZ_KIND_LABEL, startAttempt } from '@/services/assessments'
import { formatDateTime } from '@/utils/dates'

export default function QuizPage() {
  const { quizId = '' } = useParams()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const quiz = useQuery({ queryKey: ['quiz', quizId], queryFn: () => getQuiz(quizId) })
  const attempts = useQuery({ queryKey: ['attempts'], queryFn: listMyAttempts })
  const start = useMutation({
    mutationFn: () => startAttempt(quizId),
    onSuccess: (review) => navigate(`/assessments/attempts/${review.attempt.id}/take`),
  })

  if (quiz.isError) return <ErrorState message={toUserMessage(quiz.error)} onRetry={() => void quiz.refetch()} />
  if (!quiz.data) return <Skeleton className="h-96" />

  const q = quiz.data
  const mine = (attempts.data ?? []).filter((a) => a.quiz_id === q.id)
  const open = mine.find((a) => a.status === 'in_progress')
  const submitted = mine.filter((a) => a.status === 'submitted')
  const remaining = q.max_attempts !== null ? Math.max(0, q.max_attempts - submitted.length) : null

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs items={[{ label: q.kind === 'mock_exam' ? 'Mock Examinations' : 'Assessments', to: q.kind === 'mock_exam' ? '/mock-exams' : '/assessments' }, { label: q.title }]} />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">{QUIZ_KIND_LABEL[q.kind]}</Badge>
            <SourceBadge source="ai_practice" />
          </div>
          <CardTitle className="mt-2 text-xl">{q.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{q.description}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted-foreground">Questions</dt>
              <dd className="mt-0.5 font-semibold">
                {q.question_count ?? 'All'} {q.open_ended_count ? `+ ${q.open_ended_count} written` : ''}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted-foreground">Time limit</dt>
              <dd className="mt-0.5 font-semibold">{q.time_limit_minutes ? `${q.time_limit_minutes} min` : 'Untimed'}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted-foreground">Mastery threshold</dt>
              <dd className="mt-0.5 font-semibold">{q.pass_mark ? `${q.pass_mark}%` : 'Platform default (80%)'}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted-foreground">Attempts</dt>
              <dd className="mt-0.5 font-semibold">{remaining === null ? `${submitted.length} · unlimited` : `${remaining} left`}</dd>
            </div>
          </dl>
          <div className="rounded-lg border p-4 text-sm">
            <p className="mb-1 inline-flex items-center gap-1.5 font-semibold">
              <Info className="size-4 text-primary" aria-hidden /> Instructions
            </p>
            <p className="text-muted-foreground">{q.instructions}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Your answers are saved on this device as you go, so a refresh will not lose them.</li>
              {q.time_limit_minutes ? <li>The timer keeps running if you leave the page. When time is up your answers are submitted automatically.</li> : null}
              <li>Answers and explanations are shown only after you submit.</li>
              <li>Written answers are self-assessed using the rubric and model answer guidance — they are not marked by a lecturer.</li>
            </ul>
          </div>
          {!online ? <Alert tone="warning">Assessments are scored on the server, so you need a connection to start or submit.</Alert> : null}
          {start.isError ? <Alert tone="danger">{toUserMessage(start.error)}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            {open ? (
              <Button asChild>
                <Link to={`/assessments/attempts/${open.id}/take`}>
                  <PlayCircle /> Resume attempt
                </Link>
              </Button>
            ) : (
              <Button onClick={() => start.mutate()} disabled={!online || start.isPending || remaining === 0}>
                {q.time_limit_minutes ? <Timer /> : <PlayCircle />}
                {start.isPending ? 'Preparing questions…' : submitted.length ? 'Retake' : 'Start'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {submitted.length ? (
        <section className="mt-6" aria-labelledby="previous-attempts">
          <h2 id="previous-attempts" className="mb-2 text-sm font-semibold">
            Previous attempts
          </h2>
          <ul className="divide-y rounded-xl border bg-surface">
            {submitted.map((a) => (
              <li key={a.id}>
                <Link to={`/assessments/attempts/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                  <span className="inline-flex items-center gap-2">
                    <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
                    {formatDateTime(a.submitted_at ?? a.started_at)}
                    {a.is_late ? <Badge tone="warning">Submitted late</Badge> : null}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {a.percent !== null ? <span className="font-semibold tabular-nums">{Math.round(Number(a.percent))}%</span> : <Badge>Self-assessed</Badge>}
                    {a.passed ? <Badge tone="success">Mastery</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
