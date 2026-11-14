import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { BookOpenCheck, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, Lightbulb, RefreshCcw, Timer } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { PageHeader, StatTile } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { useLectureLogs } from '@/hooks/useLectureLogs'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { toUserMessage } from '@/lib/errors'
import { mayAttend } from '@/lib/officialTimetable'
import { studyWeekEnd, studyWeekLabel, studyWeekStart } from '@/lib/semesterCalendar'
import { reviewWeek } from '@/lib/weeklyReview'
import { listMyAttempts } from '@/services/assessments'
import { listMyProgress } from '@/services/progress'
import { listAssignments } from '@/services/study/assignments'
import { listSessions } from '@/services/study/planner'
import { listReviews } from '@/services/study/revision'
import { formatDateTime, isoDate, minutesToHours } from '@/utils/dates'

export default function ReviewPage() {
  const { profile } = useAuth()
  const calendar = useSemesterCalendar()
  const lectures = useLectureLogs()
  const [offset, setOffset] = useState(0)

  const start = addDays(studyWeekStart(new Date(), calendar.weekStartsOn), offset * 7)
  const end = studyWeekEnd(start, calendar.weekStartsOn)
  const rangeEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)
  const sessions = useQuery({ queryKey: ['sessions', isoDate(start), isoDate(end)], queryFn: () => listSessions(start.toISOString(), rangeEnd.toISOString()) })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const attempts = useQuery({ queryKey: ['attempts'], queryFn: listMyAttempts })
  const reviews = useQuery({ queryKey: ['revision-reviews'], queryFn: () => listReviews() })
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: listAssignments })

  const error = sessions.error ?? progress.error ?? attempts.error ?? reviews.error ?? assignments.error ?? lectures.error
  if (error) return <ErrorState message={toUserMessage(error)} />
  const pending = sessions.isPending || progress.isPending || attempts.isPending || reviews.isPending || assignments.isPending || lectures.isPending

  const targetMinutes = Math.round(Number(profile?.weekly_study_target_hours ?? 15) * 60)
  const behind = lectures.courses
    .map((c) => ({ code: c.code, lessons: lectures.paces.get(c.id)?.status === 'behind' ? (lectures.paces.get(c.id)?.catchUp.length ?? 0) : 0 }))
    .filter((b) => b.lessons > 0)
  const review = pending
    ? null
    : reviewWeek({
        from: isoDate(start),
        to: isoDate(end),
        targetMinutes,
        sessions: sessions.data ?? [],
        progress: progress.data ?? [],
        attempts: attempts.data ?? [],
        reviews: reviews.data ?? [],
        logs: lectures.logs,
        deadlines: assignments.data ?? [],
        behind,
      })
  const lessonTitle = new Map(lectures.courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => [l.id, `${c.code} · ${l.title}`] as const))))

  // Lectures in the following study week, from the day teaching begins.
  const nextStart = addDays(end, 1)
  const lecturesNextWeek = Array.from({ length: 7 }, (_, i) => addDays(nextStart, i))
    .filter((d) => !calendar.lecturesStartOn || d >= calendar.lecturesStartOn)
    .reduce((n, d) => n + lectures.sessions.filter((s) => s.dayOfWeek === d.getDay() && mayAttend(s, lectures.attendance)).length, 0)

  const label = studyWeekLabel(calendar, start)
  return (
    <>
      <PageHeader
        eyebrow="You"
        title="Weekly Review"
        description="How your study week went and what comes next. A summary also arrives at 9 pm on the last day of each study week; you can turn it off in Settings."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" data-testid="review-week">
          {[label, `${format(start, 'EEE d MMM')} to ${format(end, 'EEE d MMM yyyy')}`].filter(Boolean).join(' · ')}
        </p>
        <div className="flex gap-1">
          <Button variant="secondary" size="sm" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
            This week
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} aria-label="Next week">
            <ChevronRight />
          </Button>
        </div>
      </div>

      {!review ? (
        <Skeleton className="h-[50vh]" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Study time"
              value={<span data-testid="review-study">{minutesToHours(review.studyMinutes)}</span>}
              hint={`${review.targetPercent}% of your ${minutesToHours(review.targetMinutes)} target`}
              icon={<Timer className="size-4" aria-hidden />}
            />
            <StatTile label="Lessons completed" value={review.lessonIds.length} icon={<BookOpenCheck className="size-4" aria-hidden />} />
            <StatTile
              label="Quizzes"
              value={review.quizzes.count}
              hint={review.quizzes.average === null ? 'No quizzes this week' : `Average ${review.quizzes.average}%`}
              icon={<ClipboardCheck className="size-4" aria-hidden />}
            />
            <StatTile
              label="Lectures checked in"
              value={review.lectures.attended + review.lectures.missed + review.lectures.cancelled}
              hint={`${review.lectures.attended} attended · ${review.lectures.missed} missed · ${review.lectures.cancelled} cancelled`}
              icon={<RefreshCcw className="size-4" aria-hidden />}
            />
          </div>
          <ProgressBar value={Math.min(100, review.targetPercent)} label="Weekly study target" />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="size-4 text-primary" aria-hidden /> For next week
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm" aria-label="Suggestions for next week" data-testid="review-suggestions">
                  {review.suggestions.map((s) => (
                    <li key={s} className="rounded-md bg-surface-2 px-3 py-2">
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  {lecturesNextWeek} lecture{lecturesNextWeek === 1 ? '' : 's'} next week ·{' '}
                  <Link to="/planner" className="font-medium text-primary hover:underline">
                    Plan next week
                  </Link>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" aria-hidden /> Due in the next 7 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                {review.upcoming.length ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {review.upcoming.map((d) => (
                      <li key={d.id} className="flex justify-between gap-2">
                        <span className="truncate">{d.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(d.due_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing due in the week after this one.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {review.lessonIds.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Lessons you completed</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {review.lessonIds.map((id) => (
                    <li key={id}>{lessonTitle.get(id) ?? 'A lesson'}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  )
}
