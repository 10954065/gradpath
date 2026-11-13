import { format } from 'date-fns'
import { Award, BarChart3, RefreshCcw, Target } from 'lucide-react'
import { Link } from 'react-router'
import { RecommendationList } from '@/components/dashboard/Recommendations'
import { CoursePerformanceChart, ScoreTrendChart, WeeklyStudyChart } from '@/components/dashboard/StudyCharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, EmptyState, ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { PageHeader, StatTile } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { useStudyOverview } from '@/hooks/useStudyOverview'
import { bestScoreAverage } from '@/lib/analytics'
import { toUserMessage } from '@/lib/errors'
import { courseLessonIds, summariseProgress } from '@/lib/progress'
import { minutesToHours } from '@/utils/dates'

export default function ProgressPage() {
  const { profile } = useAuth()
  const data = useStudyOverview()
  if (data.error) return <ErrorState message={toUserMessage(data.error)} />
  if (data.isLoading) return <Skeleton className="h-[70vh]" />

  const submitted = data.attempts.filter((a) => a.status === 'submitted' && a.percent !== null)
  const quizById = new Map(data.quizzes.map((q) => [q.id, q]))
  const perf = bestScoreAverage(submitted, (a) => quizById.get(a.quiz_id)?.course_id ?? null)
  const perfData = data.courses.filter((c) => perf.has(c.id)).map((c) => ({ code: c.code, score: perf.get(c.id) as number }))
  const trend = [...submitted]
    .reverse()
    .slice(-15)
    .map((a) => ({ label: format(new Date(a.submitted_at ?? a.started_at), 'd MMM'), score: Math.round(Number(a.percent)) }))
  const mocks = submitted.filter((a) => quizById.get(a.quiz_id)?.kind === 'mock_exam')
  const masteredLessons = data.progress.filter((p) => p.mastered_at).length
  const completed = data.progress.filter((p) => p.status === 'completed').length
  const studied = data.weeks.reduce((s, w) => s + w.completedMinutes, 0)
  const reviewsByWeek = data.weeks.map((w) => data.reviews.filter((r) => new Date(r.reviewed_at) >= w.start && new Date(r.reviewed_at) < new Date(w.start.getTime() + 7 * 86_400_000)).length)
  const weak = data.recommendations.filter((r) => r.kind === 'weak-topic')

  return (
    <>
      <PageHeader title="Academic Progress" description="Your learning analytics, built only from your own recorded activity in GradPath." />
      <Alert className="mb-6" title="About these figures">
        These are practice statistics from supplementary GradPath assessments. They are not official University of Ghana grades, and GradPath does not
        predict your GPA or final results.
      </Alert>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Lessons completed" value={completed} hint={`${masteredLessons} with quiz mastery`} icon={<Award className="size-4" aria-hidden />} />
        <StatTile label="Assessments submitted" value={submitted.length} hint={`${submitted.filter((a) => a.passed).length} at or above mastery`} icon={<Target className="size-4" aria-hidden />} />
        <StatTile label="Study time (8 weeks)" value={minutesToHours(studied)} hint={`Weekly target ${profile?.weekly_study_target_hours ?? 15} h`} icon={<BarChart3 className="size-4" aria-hidden />} />
        <StatTile label="Revision reviews" value={data.reviews.length} hint={`${reviewsByWeek[reviewsByWeek.length - 1] ?? 0} this week`} icon={<RefreshCcw className="size-4" aria-hidden />} />
      </div>

      {submitted.length === 0 && data.progress.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No activity recorded yet"
          description="Read a lesson, take a quiz or complete a study session and your analytics will appear here."
          className="mb-6"
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Course progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.courses.map((c) => {
              const s = summariseProgress(courseLessonIds(c), data.progress)
              return (
                <div key={c.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <Link to={`/courses/${c.slug}`} className="font-medium hover:underline">
                      {c.code} {c.title}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">
                      {s.completed}/{s.total}
                    </span>
                  </div>
                  <ProgressBar value={s.percent} label={`${c.code} progress`} />
                </div>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <RecommendationList items={data.recommendations} limit={6} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assessment score trend</CardTitle>
          </CardHeader>
          <CardContent>{trend.length >= 2 ? <ScoreTrendChart data={trend} /> : <p className="text-sm text-muted-foreground">Submit at least two assessments to see a trend.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance by course</CardTitle>
          </CardHeader>
          <CardContent>{perfData.length ? <CoursePerformanceChart data={perfData} /> : <p className="text-sm text-muted-foreground">No scored assessments yet.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Study hours</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyStudyChart weeks={data.weeks} targetHours={Number(profile?.weekly_study_target_hours ?? 15)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mock examinations and weak topics</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {mocks.length ? (
              <ul className="flex flex-col gap-1.5">
                {mocks.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link to={`/assessments/attempts/${a.id}`} className="truncate hover:underline">
                      {quizById.get(a.quiz_id)?.title}
                    </Link>
                    <Badge tone={a.passed ? 'success' : 'warning'}>{Math.round(Number(a.percent))}%</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No mock examinations taken yet.</p>
            )}
            <div className="border-t pt-3">
              <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Weak topics (below mastery)</p>
              {weak.length ? (
                <ul className="flex flex-col gap-1">
                  {weak.map((w) => (
                    <li key={w.id}>
                      <Link to={w.href} className="text-primary hover:underline">
                        {w.title.replace(/^Revisit /, '')}
                      </Link>{' '}
                      <span className="text-xs text-muted-foreground">— {w.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">None identified from your latest results.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
