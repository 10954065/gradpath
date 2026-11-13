import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, BookOpen, RefreshCcw, Repeat, Target } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { QuestionView } from '@/components/assessments/QuestionView'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form-controls'
import { isObjective, masteryBand } from '@/lib/assessment'
import { toUserMessage } from '@/lib/errors'
import { getAttemptReview, recordSelfAssessment } from '@/services/assessments'
import { getCatalogue } from '@/services/courses'
import type { AttemptQuestion } from '@/types/database'
import { formatDateTime } from '@/utils/dates'

function SelfAssessment({ attemptId, question }: { attemptId: string; question: AttemptQuestion }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(question.selfMarks ?? '')
  const save = useMutation({
    mutationFn: () => recordSelfAssessment(attemptId, question.id, Number(value)),
    onSuccess: () => {
      toast.success('Self-assessment saved')
      void queryClient.invalidateQueries({ queryKey: ['attempt', attemptId] })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
      className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3 text-sm"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Your self-assessed mark (out of {question.marks})</span>
        <Input type="number" min={0} max={question.marks} step={0.5} value={value} onChange={(e) => setValue(e.target.value)} className="w-28" />
      </label>
      <Button size="sm" type="submit" variant="secondary" disabled={value === '' || save.isPending}>
        Save
      </Button>
      <p className="w-full text-xs text-muted-foreground">Self-assessment helps you reflect; it is not a lecturer's mark and is not included in your score.</p>
    </form>
  )
}

export default function AttemptResultPage() {
  const { attemptId = '' } = useParams()
  const review = useQuery({ queryKey: ['attempt', attemptId], queryFn: () => getAttemptReview(attemptId) })
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })

  if (review.isError) return <ErrorState message={toUserMessage(review.error)} onRetry={() => void review.refetch()} />
  if (!review.data) return <Skeleton className="h-[70vh]" />
  if (review.data.attempt.status === 'in_progress') return <Navigate to={`/assessments/attempts/${attemptId}/take`} replace />

  const { attempt, quiz, questions } = review.data
  const percent = attempt.percent === null ? null : Number(attempt.percent)
  const band = masteryBand(percent, quiz.passMark)
  const lessonLinks = new Map<string, string>()
  for (const c of catalogue.data ?? []) for (const m of c.modules) for (const l of m.lessons) lessonLinks.set(l.id, `/courses/${c.slug}/lessons/${l.slug}`)
  const weak = attempt.lessonBreakdown.filter((l) => l.percent !== null && Number(l.percent) < quiz.passMark)
  const objectiveCount = questions.filter(isObjective).length

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ label: quiz.kind === 'mock_exam' ? 'Mock Examinations' : 'Assessments', to: quiz.kind === 'mock_exam' ? '/mock-exams' : '/assessments' }, { label: quiz.title, to: `/assessments/${quiz.id}` }, { label: 'Results' }]} />
      <Card className="overflow-hidden">
        <div className={band === 'mastered' ? 'h-1 bg-success' : band === 'developing' ? 'h-1 bg-warning' : 'h-1 bg-danger'} aria-hidden />
        <CardHeader>
          <p className="text-xs text-muted-foreground">Submitted {attempt.submittedAt ? formatDateTime(attempt.submittedAt) : ''}</p>
          <CardTitle className="text-xl">{quiz.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="text-center sm:pr-6">
            <p className="text-5xl font-semibold tracking-tight tabular-nums">{percent === null ? 'n/a' : `${Math.round(percent)}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {objectiveCount ? `${attempt.score ?? 0} / ${attempt.maxScore ?? 0} marks on ${objectiveCount} objective questions` : 'Written answers only'}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            {band === 'mastered' ? (
              <p className="inline-flex items-center gap-2 font-semibold text-success">
                <Award className="size-5" aria-hidden /> Mastery achieved (target {quiz.passMark}%)
              </p>
            ) : percent !== null ? (
              <p className="inline-flex items-center gap-2 font-semibold text-warning">
                <Target className="size-5" aria-hidden /> Below the {quiz.passMark}% mastery target
              </p>
            ) : null}
            <p className="text-muted-foreground">
              {band === 'mastered'
                ? 'Strong work. Move on to the next lesson or module, and revisit this topic later in your revision schedule.'
                : 'The weaker topics below have been added to your revision queue. Revisit the lessons, then try again. You can retake this assessment.'}
            </p>
            {attempt.isLate ? <Badge tone="warning">Submitted after the time limit</Badge> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to={`/assessments/${quiz.id}`}>
                  <Repeat /> Retake
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to="/revision">
                  <RefreshCcw /> Revision queue
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert className="mt-4">This is a practice result from supplementary questions. It is not an official University of Ghana grade.</Alert>

      {attempt.lessonBreakdown.length > 1 || weak.length ? (
        <section className="mt-6" aria-labelledby="by-topic">
          <h2 id="by-topic" className="mb-3 text-sm font-semibold">
            Performance by lesson
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {attempt.lessonBreakdown.map((l) => (
              <li key={l.lessonId} className="rounded-lg border bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{l.lessonTitle}</span>
                  <span className="font-semibold tabular-nums">{l.percent === null ? 'n/a' : `${Math.round(Number(l.percent))}%`}</span>
                </div>
                <ProgressBar value={Number(l.percent ?? 0)} label={`${l.lessonTitle} score`} className="mt-2" tone={Number(l.percent) >= quiz.passMark ? 'success' : 'warning'} />
                {Number(l.percent) < quiz.passMark && lessonLinks.get(l.lessonId) ? (
                  <Link to={lessonLinks.get(l.lessonId) as string} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <BookOpen className="size-3.5" aria-hidden /> Revisit this lesson
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {attempt.objectiveBreakdown.length ? (
        <section className="mt-6" aria-labelledby="by-objective">
          <h2 id="by-objective" className="mb-3 text-sm font-semibold">
            Learning objectives to strengthen
          </h2>
          <ul className="flex flex-col gap-1.5">
            {attempt.objectiveBreakdown
              .filter((o) => o.percent !== null && Number(o.percent) < quiz.passMark)
              .slice(0, 8)
              .map((o) => (
                <li key={o.objective} className="flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2 text-sm">
                  <span>{o.objective || 'General understanding'}</span>
                  <Badge tone="warning">{Math.round(Number(o.percent))}%</Badge>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="answers">
        <h2 id="answers" className="mb-3 text-sm font-semibold">
          Question-by-question review
        </h2>
        <ol className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-xl border bg-surface p-5 shadow-card">
              <QuestionView question={q} index={i} response={q.response ?? undefined} review />
              {!isObjective(q) && review.data.answersRevealed ? <SelfAssessment attemptId={attemptId} question={q} /> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
