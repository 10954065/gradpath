import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Send, Timer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { QuestionView } from '@/components/assessments/QuestionView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatClock, isAnswered, secondsRemaining } from '@/lib/assessment'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { clearDraft, getAttemptReview, loadDraft, saveDraft, submitAttempt } from '@/services/assessments'
import type { AnswerResponse } from '@/types/database'

/** The timed assessment runner. Answer keys are never sent to the browser until submission. */
export default function AttemptPage() {
  const { attemptId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const review = useQuery({ queryKey: ['attempt', attemptId], queryFn: () => getAttemptReview(attemptId), staleTime: Infinity })
  const [answers, setAnswers] = useState<Record<string, AnswerResponse>>(() => loadDraft(attemptId))
  const [current, setCurrent] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const autoSubmitted = useRef(false)

  const submit = useMutation({
    mutationFn: () => submitAttempt(attemptId, answers),
    onSuccess: (result) => {
      clearDraft(attemptId)
      queryClient.setQueryData(['attempt', attemptId], result)
      void queryClient.invalidateQueries({ queryKey: ['attempts'] })
      void queryClient.invalidateQueries({ queryKey: ['progress'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      navigate(`/assessments/attempts/${attemptId}`, { replace: true })
    },
  })

  const deadline = review.data?.attempt.deadlineAt ?? null
  useEffect(() => {
    if (!deadline) return
    const tick = () => setRemaining(secondsRemaining(deadline))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  useEffect(() => {
    if (remaining === 0 && !autoSubmitted.current && !submit.isPending && review.data?.attempt.status === 'in_progress') {
      autoSubmitted.current = true
      submit.mutate()
    }
  }, [remaining, submit, review.data])

  const setAnswer = useCallback(
    (questionId: string, response: AnswerResponse) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: response }
        saveDraft(attemptId, next)
        return next
      })
    },
    [attemptId],
  )

  const questions = useMemo(() => review.data?.questions ?? [], [review.data])
  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length

  if (review.isError) return <ErrorState message={toUserMessage(review.error)} onRetry={() => void review.refetch()} />
  if (!review.data) return <Skeleton className="h-[70vh]" />
  if (review.data.attempt.status === 'submitted') return <Navigate to={`/assessments/attempts/${attemptId}`} replace />

  const question = questions[current]
  const lowTime = remaining !== null && remaining <= 60

  return (
    <div className="mx-auto max-w-5xl">
      <div className="sticky top-16 z-10 -mx-4 mb-5 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{review.data.quiz.title}</p>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {answeredCount} of {questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-2">
            {remaining !== null ? (
              <span
                role="timer"
                aria-live={lowTime ? 'assertive' : 'off'}
                className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm tabular-nums', lowTime && 'border-danger text-danger')}
              >
                <Timer className="size-4" aria-hidden /> {formatClock(remaining)}
              </span>
            ) : null}
            <Button size="sm" onClick={() => setConfirming(true)} disabled={submit.isPending}>
              <Send /> Submit
            </Button>
          </div>
        </div>
        <ProgressBar value={(answeredCount / Math.max(1, questions.length)) * 100} label="Answered questions" className="mt-2" />
      </div>

      {!online ? (
        <Alert tone="warning" className="mb-4">
          You are offline. Keep answering — your answers are saved on this device — and submit when your connection returns.
        </Alert>
      ) : null}
      {submit.isError ? (
        <Alert tone="danger" className="mb-4">
          {toUserMessage(submit.error)} Your answers are still saved on this device; try submitting again.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="rounded-xl border bg-surface p-5 shadow-card sm:p-6">
          {question ? <QuestionView question={question} index={current} response={answers[question.id]} onChange={(r) => setAnswer(question.id, r)} /> : null}
          <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4">
            <Button variant="secondary" onClick={() => setCurrent((i) => Math.max(0, i - 1))} disabled={current === 0}>
              <ArrowLeft /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {current + 1} / {questions.length}
            </span>
            {current < questions.length - 1 ? (
              <Button onClick={() => setCurrent((i) => Math.min(questions.length - 1, i + 1))}>
                Next <ArrowRight />
              </Button>
            ) : (
              <Button onClick={() => setConfirming(true)}>
                Review &amp; submit <Send />
              </Button>
            )}
          </div>
        </div>
        <nav aria-label="Question navigation" className="rounded-xl border bg-surface p-4 shadow-card lg:sticky lg:top-40 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Questions</p>
          <ol className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {questions.map((q, i) => {
              const done = isAnswered(q, answers[q.id])
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Question ${i + 1}${done ? ', answered' : ', not answered'}`}
                    aria-current={i === current ? 'step' : undefined}
                    className={cn(
                      'grid size-9 place-items-center rounded-md border text-xs font-semibold tabular-nums',
                      done ? 'border-primary bg-accent text-accent-foreground' : 'bg-surface text-muted-foreground',
                      i === current && 'ring-2 ring-primary ring-offset-1',
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title="Submit your answers?" size="sm">
          <p className="text-sm text-muted-foreground">
            You have answered {answeredCount} of {questions.length} questions.
            {answeredCount < questions.length ? ' Unanswered questions will be marked as incorrect.' : ''} You cannot change your answers after
            submitting.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep working
            </Button>
            <Button
              onClick={() => {
                setConfirming(false)
                submit.mutate()
              }}
              disabled={submit.isPending || !online}
            >
              {submit.isPending ? 'Submitting…' : 'Submit now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
