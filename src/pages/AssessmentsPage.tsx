import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { QuizList } from '@/components/assessments/QuizList'
import { Badge } from '@/components/ui/badge'
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Select, SelectItem } from '@/components/ui/select'
import { PageHeader, Section } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toUserMessage } from '@/lib/errors'
import { listMyAttempts, listQuizzes, QUIZ_KIND_LABEL } from '@/services/assessments'
import { getCatalogue } from '@/services/courses'
import { formatDateTime } from '@/utils/dates'

export default function AssessmentsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'modules'
  const course = params.get('course') ?? ''
  const quizzes = useQuery({ queryKey: ['quizzes', 'all'], queryFn: () => listQuizzes() })
  const attempts = useQuery({ queryKey: ['attempts'], queryFn: listMyAttempts })
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const all = quizzes.data ?? []
  const mine = attempts.data ?? []
  const courses = (catalogue.data ?? []).filter((c) => !course || c.id === course)
  const quizById = new Map(all.map((q) => [q.id, q]))

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Lesson quizzes and timed module assessments, scored securely on the server. Scoring at or above the mastery threshold (80% by default) records mastery."
      />
      <Alert className="mb-5">
        All questions are supplementary practice questions created for GradPath. They are not official University of Ghana examination
        questions, and your results are not official grades.
      </Alert>
      {quizzes.isError ? <ErrorState message={toUserMessage(quizzes.error)} onRetry={() => void quizzes.refetch()} /> : null}
      <Tabs value={tab} onValueChange={(v) => set('tab', v)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="modules">Module assessments</TabsTrigger>
            <TabsTrigger value="lessons">Lesson quizzes</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <Select aria-label="Filter by course" value={course} onValueChange={(next) => set('course', next)} className="w-full sm:w-64">
            <SelectItem value="">All courses</SelectItem>
            {(catalogue.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} {c.title}
              </SelectItem>
            ))}
          </Select>
        </div>
        {quizzes.isPending || catalogue.isPending ? <Skeleton className="mt-4 h-96" /> : null}
        <TabsContent value="modules">
          {courses.map((c) => (
            <Section key={c.id} title={`${c.code} ${c.title}`}>
              <QuizList
                quizzes={all.filter((q) => q.kind === 'module_assessment' && q.course_id === c.id)}
                attempts={mine}
                emptyText="No module assessments published yet."
              />
            </Section>
          ))}
        </TabsContent>
        <TabsContent value="lessons">
          {courses.map((c) => (
            <Section key={c.id} title={`${c.code} ${c.title}`}>
              {c.modules.map((m) => {
                const list = all.filter((q) => q.kind === 'lesson_quiz' && q.module_id === m.id)
                return list.length ? (
                  <div key={m.id} className="mb-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{m.title}</p>
                    <QuizList quizzes={list} attempts={mine} emptyText="" />
                  </div>
                ) : null
              })}
            </Section>
          ))}
        </TabsContent>
        <TabsContent value="history">
          {mine.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No attempts yet"
              description="Your submitted quizzes, assessments and mock exams will appear here with their results."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-surface shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Assessment</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Score</th>
                    <th className="px-4 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {mine
                    .filter((a) => !course || quizById.get(a.quiz_id)?.course_id === course)
                    .map((a) => {
                      const quiz = quizById.get(a.quiz_id)
                      return (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            <Link
                              to={a.status === 'submitted' ? `/assessments/attempts/${a.id}` : `/assessments/attempts/${a.id}/take`}
                              className="font-medium hover:underline"
                            >
                              {quiz?.title ?? 'Assessment'}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{quiz ? QUIZ_KIND_LABEL[quiz.kind] : ''}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(a.submitted_at ?? a.started_at)}</td>
                          <td className="px-4 py-2.5 tabular-nums">{a.percent !== null ? `${Math.round(Number(a.percent))}%` : 'n/a'}</td>
                          <td className="px-4 py-2.5">
                            {a.status === 'in_progress' ? (
                              <Badge tone="warning">In progress</Badge>
                            ) : a.passed ? (
                              <Badge tone="success">Mastery</Badge>
                            ) : a.percent === null ? (
                              <Badge>Self-assessed</Badge>
                            ) : (
                              <Badge tone="danger">Below target</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
