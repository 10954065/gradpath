import { CheckCircle2, ChevronRight, Clock, Repeat } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import type { Quiz, QuizAttemptRow } from '@/types/database'

/** Compact list of quizzes with the student's best score and attempt count. */
export function QuizList({ quizzes, attempts, emptyText }: { quizzes: Quiz[]; attempts: QuizAttemptRow[]; emptyText: string }) {
  if (quizzes.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>
  return (
    <ul className="divide-y rounded-xl border bg-surface shadow-card">
      {quizzes.map((quiz) => {
        const mine = attempts.filter((a) => a.quiz_id === quiz.id && a.status === 'submitted')
        const best = mine.reduce<number | null>((max, a) => (a.percent === null ? max : Math.max(max ?? 0, Number(a.percent))), null)
        const mastered = mine.some((a) => a.passed)
        return (
          <li key={quiz.id}>
            <Link to={`/assessments/${quiz.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{quiz.title.replace(/^(Lesson quiz|Module assessment): /, '')}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {quiz.time_limit_minutes ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" aria-hidden /> {quiz.time_limit_minutes} min
                    </span>
                  ) : (
                    <span>Untimed</span>
                  )}
                  {mine.length ? (
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="size-3" aria-hidden /> {mine.length} attempt{mine.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
              </span>
              {mastered ? (
                <Badge tone="success">
                  <CheckCircle2 aria-hidden /> Mastered
                </Badge>
              ) : null}
              {best !== null ? <span className="text-sm font-semibold tabular-nums">{Math.round(best)}%</span> : null}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
