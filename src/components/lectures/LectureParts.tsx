import { ArrowRight, BookOpenCheck, CircleAlert, ClipboardCheck, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CheckInDialog, type CheckInTarget } from '@/components/lectures/CheckInDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/feedback'
import { useLectureLogs } from '@/hooks/useLectureLogs'
import { useOfficialTimetable } from '@/hooks/useOfficialTimetable'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { LECTURE_ATTENDANCE_LABEL, lectureDateLabel, paceHeadline, type CoursePace, type DueCheckIn, type LectureLog, type PaceStatus } from '@/lib/lectureLog'
import { ghanaRange, nextSession } from '@/lib/officialTimetable'
import type { CourseDetail } from '@/services/courses'
import type { LessonSummary } from '@/types/database'

const PACE_TONE: Record<PaceStatus, 'success' | 'neutral' | 'warning'> = { ahead: 'success', level: 'neutral', behind: 'warning', unknown: 'neutral' }

/** Ended lectures without a check-in, each with a button that opens the check-in. */
export function DueCheckInList({ due, limit }: { due: readonly DueCheckIn[]; limit?: number }) {
  const [target, setTarget] = useState<CheckInTarget | null>(null)
  const shown = limit ? due.slice(0, limit) : due
  return (
    <>
      <ul className="flex flex-col gap-2" aria-label="Lectures waiting for a check-in">
        {shown.map((d) => (
          <li key={`${d.session.id}|${d.date}`} className="flex items-center justify-between gap-3 rounded-lg border p-3" data-testid="due-check-in">
            <span className="min-w-0 text-sm">
              <span className="block font-medium">
                {d.session.code} · {d.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {ghanaRange(d.session.start, d.session.end)} · {d.session.title}
              </span>
            </span>
            <Button size="sm" onClick={() => setTarget({ session: d.session, date: d.date })} aria-label={`Check in for ${d.session.code} on ${d.label}`}>
              Check in
            </Button>
          </li>
        ))}
      </ul>
      {limit && due.length > limit ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {due.length - limit} more waiting.{' '}
          <Link to="/lectures" className="font-medium text-primary hover:underline">
            See all
          </Link>
        </p>
      ) : null}
      <CheckInDialog target={target} onClose={() => setTarget(null)} />
    </>
  )
}

const lessonPath = (course: Pick<CourseDetail, 'slug'>, lesson: Pick<LessonSummary, 'slug'>) => `/courses/${course.slug}/lessons/${lesson.slug}`

/** How far ahead of (or behind) the lectures the student is in one course, and what to read next. */
export function CoursePaceCard({ course, pace, detailed = false }: { course: CourseDetail; pace: CoursePace<LessonSummary>; detailed?: boolean }) {
  const tt = useOfficialTimetable()
  const { lecturesStartOn } = useSemesterCalendar()
  const next = nextSession(tt.sessions.filter((s) => s.courseId === course.id), tt.attendance, new Date(), lecturesStartOn, tt.exceptions)
  const percent = pace.total ? Math.round((pace.completed / pace.total) * 100) : 0
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="course-pace">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/courses/${course.slug}`} className="min-w-0 hover:underline">
          <span className="block text-xs font-semibold text-primary">{course.code}</span>
          <span className="block truncate text-sm font-medium">{course.title}</span>
        </Link>
        <Badge tone={PACE_TONE[pace.status]} data-testid="pace-status">
          {paceHeadline(pace)}
        </Badge>
      </div>
      <ProgressBar value={percent} label={`${course.code} lessons completed`} />
      <p className="text-xs text-muted-foreground">
        {pace.completed} of {pace.total} lessons done
        {pace.basis === 'check-ins' ? ` · lectures have reached lesson ${pace.lectureReach}` : ''}
        {pace.lastCheckIn ? ` · last check-in ${lectureDateLabel(pace.lastCheckIn)}` : ''}
      </p>
      {pace.catchUp.length ? (
        <div className="text-sm">
          <p className="flex items-center gap-1 text-xs font-semibold text-warning">
            <CircleAlert className="size-3.5" aria-hidden /> Catch up on
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {pace.catchUp.slice(0, detailed ? 10 : 3).map((l) => (
              <li key={l.id}>
                <Link to={lessonPath(course, l)} className="text-primary hover:underline">
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {pace.nextToPrepare ? (
        <p className="text-sm">
          <span className="text-xs font-semibold text-muted-foreground">{next ? `Before ${next.label}: ` : 'Read next: '}</span>
          <Link to={lessonPath(course, pace.nextToPrepare)} className="text-primary hover:underline">
            {pace.nextToPrepare.title}
          </Link>
        </p>
      ) : pace.total ? (
        <p className="text-sm text-success">Every lesson in this course is done.</p>
      ) : null}
    </div>
  )
}

/** The pace card for one course, for its course page. */
export function CourseLecturePace({ courseId }: { courseId: string }) {
  const lectures = useLectureLogs()
  const course = lectures.courses.find((c) => c.id === courseId)
  const pace = lectures.paces.get(courseId)
  if (lectures.isPending || !course || !pace || !lectures.sessions.some((s) => s.courseId === courseId)) return null
  return (
    <section aria-labelledby="lecture-pace-heading" className="flex flex-col gap-2">
      <h2 id="lecture-pace-heading" className="flex items-center gap-2 text-sm font-semibold">
        <TrendingUp className="size-4 text-primary" aria-hidden /> You and the lectures
      </h2>
      <CoursePaceCard course={course} pace={pace} detailed />
      <Link to="/lectures" className="text-xs font-medium text-primary hover:underline">
        Lecture check-ins
      </Link>
    </section>
  )
}

/** The dashboard summary: check-ins waiting and where the student stands across their courses. */
export function LectureSummary() {
  const lectures = useLectureLogs()
  if (lectures.isPending || !lectures.sessions.length) return null
  const paces = lectures.courses.map((c) => lectures.paces.get(c.id)).filter((p) => p !== undefined)
  const count = (status: PaceStatus) => paces.filter((p) => p.status === status).length
  const parts = [
    count('ahead') ? `ahead in ${count('ahead')}` : '',
    count('level') ? `level in ${count('level')}` : '',
    count('behind') ? `behind in ${count('behind')}` : '',
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="lecture-summary">
      {lectures.due.length ? (
        <DueCheckInList due={lectures.due} limit={3} />
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground">
          <ClipboardCheck className="size-4" aria-hidden />
          {lectures.begun ? 'No check-ins waiting.' : 'Lectures have not begun yet.'}
        </p>
      )}
      {parts.length ? (
        <p className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-primary" aria-hidden />
          <span>
            Courses: {parts.join(', ')}
            {lectures.begun ? '' : ' (before lectures begin)'}.
          </span>
        </p>
      ) : null}
      <Link to="/lectures" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        Lecture check-ins and pace <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  )
}

/** Past check-ins, newest first, each editable. */
export function CheckInHistory({ logs }: { logs: readonly LectureLog[] }) {
  const lectures = useLectureLogs()
  const [target, setTarget] = useState<CheckInTarget | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const lessonTitle = new Map(lectures.courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => [l.id, l.title] as const))))
  return (
    <>
      <ul className="flex flex-col gap-2" aria-label="Your lecture check-ins">
        {logs.map((g) => {
          const session = lectures.sessions.find((s) => s.id === g.entry_id)
          const code = session?.code ?? lectures.courses.find((c) => c.id === g.course_id)?.code ?? 'Lecture'
          return (
            <li key={g.id} className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm" data-testid="check-in">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {code} · {lectureDateLabel(g.held_on)}
                </span>
                <Badge tone={g.attendance === 'attended' ? 'success' : g.attendance === 'missed' ? 'warning' : 'neutral'}>
                  {LECTURE_ATTENDANCE_LABEL[g.attendance]}
                </Badge>
              </div>
              {g.covered_lesson_ids.length ? (
                <p className="text-xs text-muted-foreground">
                  Covered: {g.covered_lesson_ids.map((id) => lessonTitle.get(id) ?? 'a lesson').join('; ')}
                  {g.review_lesson_ids.length ? ` · ${g.review_lesson_ids.length} to review` : ''}
                </p>
              ) : null}
              {g.note ? <p className="whitespace-pre-wrap">{g.note}</p> : null}
              <div className="flex gap-2">
                {session ? (
                  <Button size="sm" variant="secondary" onClick={() => setTarget({ session, date: g.held_on, existing: g })}>
                    Edit
                  </Button>
                ) : null}
                {confirming === g.id ? (
                  <Button size="sm" variant="danger" onClick={() => lectures.remove(g.id)}>
                    Confirm delete
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(g.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <CheckInDialog target={target} onClose={() => setTarget(null)} />
    </>
  )
}
