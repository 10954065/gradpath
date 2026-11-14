import { format } from 'date-fns'
import { CalendarClock, CheckCircle2, ClipboardList, GraduationCap, Megaphone, RefreshCcw, Target, Timer } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { accentClass } from '@/components/courses/badges'
import { RecommendationList } from '@/components/dashboard/Recommendations'
import { SelectionSummary } from '@/components/dashboard/SelectionSummary'
import { StreakFlame } from '@/components/dashboard/StreakFlame'
import { CoursePerformanceChart, WeeklyStudyChart } from '@/components/dashboard/StudyCharts'
import { TodayLessons } from '@/components/dashboard/TodayLessons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { StatTile } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { useStudyOverview } from '@/hooks/useStudyOverview'
import { bestScoreAverage, streakMessage } from '@/lib/analytics'
import { toUserMessage } from '@/lib/errors'
import { courseLessonIds, summariseProgress } from '@/lib/progress'
import { generateDueNotifications } from '@/services/notifications'
import { ASSIGNMENT_KIND_LABEL, bucketOf } from '@/services/study/assignments'
import { formatDateTime, minutesToHours, relativeTime } from '@/utils/dates'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const data = useStudyOverview()

  useEffect(() => {
    void generateDueNotifications()
  }, [])

  const allLessonIds = useMemo(() => data.courses.flatMap(courseLessonIds), [data.courses])
  const overall = summariseProgress(allLessonIds, data.progress)
  const targetHours = Number(profile?.weekly_study_target_hours ?? 15)
  const quizCourse = new Map(data.quizzes.map((q) => [q.id, q.course_id]))
  const perf = bestScoreAverage(
    data.attempts.filter((a) => a.status === 'submitted'),
    (a) => quizCourse.get(a.quiz_id) ?? null,
  )
  const perfData = data.courses.filter((c) => perf.has(c.id)).map((c) => ({ code: c.code, score: perf.get(c.id) as number }))
  const due = data.revision.filter((r) => r.status !== 'mastered' && r.status !== 'suspended' && new Date(r.due_at) <= new Date())
  const upcomingAssignments = data.assignments.filter((a) => bucketOf(a) === 'upcoming' || bucketOf(a) === 'overdue').slice(0, 4)
  const recent = data.attempts.filter((a) => a.status === 'submitted').slice(0, 4)
  const quizTitle = new Map(data.quizzes.map((q) => [q.id, q.title]))
  const weakest = data.recommendations.filter((r) => r.kind === 'weak-topic')
  const next = data.upcoming[0]
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there'
  const isNew = data.progress.length === 0 && data.attempts.length === 0
  const startedLessonIds = useMemo(() => new Set(data.progress.filter((p) => p.reading_percent > 0).map((p) => p.lesson_id)), [data.progress])

  if (data.error) return <ErrorState message={toUserMessage(data.error)} />

  return (
    <>
      <header className="mb-6 flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {profile?.programme ?? 'MSc IT for Business'} · {profile?.semester ?? 'Semester 1'} · {profile?.institution ?? 'University of Ghana'}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE d MMMM yyyy')}</p>
      </header>

      {data.isLoading ? (
        <Skeleton className="h-[60vh]" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Overall course progress" value={`${overall.percent}%`} hint={`${overall.completed} of ${overall.total} lessons across your ${data.courses.length} courses`} icon={<GraduationCap className="size-4" aria-hidden />} />
            <StatTile label="Study this week" value={minutesToHours(data.current.completedMinutes)} hint={`Target ${targetHours} h · ${Math.min(100, Math.round((data.current.completedMinutes / (targetHours * 60)) * 100))}%`} icon={<Timer className="size-4" aria-hidden />} />
            <StatTile
              label="Study streak"
              value={
                <span className="flex items-center gap-2">
                  <StreakFlame state={data.streak.state} className="size-7" />
                  {data.streak.current} day{data.streak.current === 1 ? '' : 's'}
                </span>
              }
              hint={streakMessage(data.streak)}
            />
            <StatTile label="Revision due" value={due.length} hint={due.length ? 'Open the Revision Centre' : 'Nothing due right now'} icon={<RefreshCcw className="size-4" aria-hidden />} />
          </div>

          <SelectionSummary summary={data.selection} />

          {isNew ? (
            <Card className="mb-6 border-primary/30 bg-accent/40">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Welcome to GradPath. Let's begin.</p>
                  <p className="text-sm text-muted-foreground">Your dashboard fills in as you read lessons, take quizzes and record study sessions. Nothing here is estimated or invented.</p>
                </div>
                <Button asChild>
                  <Link to="/courses">Browse your courses</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <TodayLessons plan={data.todayPlan} flame={data.streak.state} startedLessonIds={startedLessonIds} />

              <Card>
                <CardHeader>
                  <CardTitle>Recommended next</CardTitle>
                </CardHeader>
                <CardContent>
                  <RecommendationList items={data.recommendations} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Course progress</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.courses.map((c) => {
                    const s = summariseProgress(courseLessonIds(c), data.progress)
                    return (
                      <Link key={c.id} to={`/courses/${c.slug}`} className="relative overflow-hidden rounded-lg border p-3 pl-4 hover:border-primary/40">
                        <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${accentClass(c.accent)}`} />
                        <span className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-primary">{c.code}</span>
                          <span className="tabular-nums">{s.percent}%</span>
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-medium">{c.title}</span>
                        <ProgressBar value={s.percent} label={`${c.code} progress`} className="mt-2" />
                      </Link>
                    )
                  })}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Weekly study activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.weeks.some((w) => w.plannedMinutes || w.completedMinutes) ? (
                      <WeeklyStudyChart weeks={data.weeks} targetHours={targetHours} />
                    ) : (
                      <p className="text-sm text-muted-foreground">Record study sessions in the planner to see your weekly activity.</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Course mastery</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {perfData.length ? (
                      <CoursePerformanceChart data={perfData} />
                    ) : (
                      <p className="text-sm text-muted-foreground">Take a quiz to see your practice performance by course.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <aside className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-primary" aria-hidden /> Next study session
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {next ? (
                    <div className="text-sm">
                      <p className="font-medium">{next.title}</p>
                      <p className="text-muted-foreground">
                        {formatDateTime(next.start)} to {format(next.end, 'HH:mm')}
                      </p>
                      {next.isProvisional ? <Badge className="mt-2">Provisional</Badge> : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No sessions planned for the next 7 days.</p>
                  )}
                  <Button asChild variant="link" size="sm" className="mt-2">
                    <Link to="/planner">Open planner</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="size-4 text-primary" aria-hidden /> Upcoming assessments and deadlines
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingAssignments.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                      {upcomingAssignments.map((a) => (
                        <li key={a.id} className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {a.kind !== 'assignment' ? <span className="font-medium">{ASSIGNMENT_KIND_LABEL[a.kind]}: </span> : null}
                            {a.title}
                          </span>
                          <span className={bucketOf(a) === 'overdue' ? 'shrink-0 text-xs font-semibold text-danger' : 'shrink-0 text-xs text-muted-foreground'}>
                            {a.due_at ? (bucketOf(a) === 'overdue' ? 'Overdue' : relativeTime(a.due_at)) : 'No date'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={CheckCircle2} title="No upcoming deadlines" description="Add assignments, tests and examination dates from your official course information." className="py-6" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="size-4 text-primary" aria-hidden /> Recent results and weak topics
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  {recent.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {recent.map((a) => (
                        <li key={a.id}>
                          <Link to={`/assessments/attempts/${a.id}`} className="flex items-center justify-between gap-2 hover:underline">
                            <span className="truncate">{(quizTitle.get(a.quiz_id) ?? 'Assessment').replace(/^(Lesson quiz|Module assessment): /, '')}</span>
                            <Badge tone={a.passed ? 'success' : 'warning'}>{a.percent === null ? 'n/a' : `${Math.round(Number(a.percent))}%`}</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No quiz results yet.</p>
                  )}
                  {weakest.length ? (
                    <div className="border-t pt-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Weakest topics</p>
                      <ul className="flex flex-col gap-1">
                        {weakest.map((w) => (
                          <li key={w.id}>
                            <Link to={w.href} className="text-primary hover:underline">
                              {w.title.replace(/^Revisit /, '')}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="size-4 text-primary" aria-hidden /> Announcements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.announcements.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                      {data.announcements.slice(0, 3).map((a) => (
                        <li key={a.id}>
                          <Link to="/announcements" className="font-medium hover:underline">
                            {a.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">{a.published_at ? relativeTime(a.published_at) : ''}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No announcements yet.</p>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
