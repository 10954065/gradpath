import { CalendarPlus, GraduationCap, Hourglass, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form-controls'
import { ProgressBar } from '@/components/ui/feedback'
import { Select, SelectItem } from '@/components/ui/select'
import { useExams } from '@/hooks/useExams'
import { countdownLabel, DEFAULT_PLAN_OPTIONS, type PlanOptions } from '@/lib/examPlan'
import { lectureDateLabel } from '@/lib/lectureLog'
import { ghanaClock, ghanaNow, ghanaRange } from '@/lib/officialTimetable'

type ExamView = ReturnType<typeof useExams>['exams'][number]

/** "Monday 18 Jan, 9:00 am" in Ghana time. */
function examWhen(dueAt: string): string {
  const { date, minutes } = ghanaNow(new Date(dueAt))
  const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return `${lectureDateLabel(date)}, ${ghanaClock(time)}`
}

/** Add an examination date: stored with the student's deadlines as kind "examination". */
export function AddExamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const exams = useExams()
  const [courseId, setCourseId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [venue, setVenue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const course = exams.taking.find((c) => c.id === courseId)
    if (!course) return setError('Choose the course')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose the date of the examination')
    if (!/^\d{2}:\d{2}$/.test(time)) return setError('Choose the start time')
    setError(null)
    exams.addExam(
      {
        title: `${course.code} examination`,
        kind: 'examination',
        description: venue.trim() ? `Venue: ${venue.trim()}` : '',
        course_id: course.id,
        // Ghana time is GMT all year.
        due_at: `${date}T${time}:00Z`,
        priority: 'high',
        status: 'not_started',
        notes: '',
      },
      () => {
        setCourseId('')
        setDate('')
        setVenue('')
        onClose()
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      {open ? (
        <DialogContent title="Add an examination" description="Use the date, time and venue from the official examination timetable.">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            {error ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
            <Field label="Course" htmlFor="exam-course">
              <Select id="exam-course" value={courseId} onValueChange={setCourseId} placeholder="Choose a course">
                {exams.taking.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} {c.title}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Date" htmlFor="exam-date">
                <Input id="exam-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Start time (Ghana time)" htmlFor="exam-time">
                <Input id="exam-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
            <Field label="Venue" htmlFor="exam-venue">
              <Input id="exam-venue" value={venue} maxLength={120} onChange={(e) => setVenue(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={exams.adding}>
                Add examination
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

const DAYS_BEFORE = [7, 10, 14, 21, 28]
const LENGTHS = [45, 60, 90, 120]

/** Preview a revision plan for one exam with the student's choices, then put it in the planner. */
function PlanDialog({ view, onClose }: { view: ExamView | null; onClose: () => void }) {
  return (
    <Dialog open={view !== null} onOpenChange={(o) => (o ? undefined : onClose())}>
      {view ? (
        <DialogContent size="lg" title={`Revision plan · ${view.course?.code ?? view.exam.title}`} description={`Examination ${examWhen(view.exam.due_at as string)}. Sessions keep clear of your lectures, your own planner blocks and other examinations.`}>
          <PlanForm view={view} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function PlanForm({ view, onClose }: { view: ExamView; onClose: () => void }) {
  const exams = useExams()
  const [options, setOptions] = useState<PlanOptions>(DEFAULT_PLAN_OPTIONS)
  const blocks = exams.preview(view.exam, options)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Start revising" htmlFor="plan-days">
          <Select id="plan-days" value={String(options.daysBefore)} onValueChange={(v) => setOptions({ ...options, daysBefore: Number(v) })}>
            {DAYS_BEFORE.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d} days before
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Preferred time" htmlFor="plan-time">
          <Input id="plan-time" type="time" value={options.startTime} onChange={(e) => e.target.value && setOptions({ ...options, startTime: e.target.value })} />
        </Field>
        <Field label="Session length" htmlFor="plan-length">
          <Select id="plan-length" value={String(options.minutes)} onValueChange={(v) => setOptions({ ...options, minutes: Number(v) })}>
            {LENGTHS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} minutes
              </SelectItem>
            ))}
          </Select>
        </Field>
      </div>
      {blocks.length ? (
        <ol className="flex max-h-72 flex-col gap-1.5 overflow-y-auto" aria-label="Planned revision sessions">
          {blocks.map((b) => (
            <li key={b.date} className="rounded-md border px-2 py-1.5 text-sm">
              <span className="block font-medium">{b.title}</span>
              <span className="block text-xs text-muted-foreground">
                {lectureDateLabel(b.date)} · {ghanaRange(b.start, b.end)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">There is no time left to plan before this examination.</p>
      )}
      {view.plan.planned ? (
        <p className="text-xs text-warning">This replaces the {view.plan.planned} revision sessions already planned for this exam. Time you logged against them is kept.</p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!blocks.length || exams.applying} onClick={() => exams.applyPlan(view.exam, blocks, onClose)}>
          Add {blocks.length} session{blocks.length === 1 ? '' : 's'} to my planner
        </Button>
      </DialogFooter>
    </div>
  )
}

/** One upcoming exam: the countdown, how much of the course is done and the revision planned for it. */
export function ExamCard({ view }: { view: ExamView }) {
  const exams = useExams()
  const [planning, setPlanning] = useState<ExamView | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { exam, course, days, lessonsDone, lessonsTotal, plan } = view
  const percent = lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0
  const venue = exam.description.startsWith('Venue: ') ? exam.description.slice(7) : ''
  return (
    <Card data-testid="exam-card">
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">{course?.code ?? 'Examination'}</p>
            <p className="truncate font-medium">{course?.title ?? exam.title}</p>
            <p className="text-xs text-muted-foreground">{examWhen(exam.due_at as string)} Ghana time</p>
            {venue ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden /> {venue}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold tabular-nums" data-testid="exam-days">
              {Math.max(0, days)}
            </p>
            <p className="text-xs text-muted-foreground">{countdownLabel(days)}</p>
          </div>
        </div>
        {lessonsTotal ? (
          <div>
            <ProgressBar value={percent} label={`${course?.code ?? ''} lessons completed`} />
            <p className="mt-1 text-xs text-muted-foreground">
              {lessonsDone} of {lessonsTotal} lessons done
            </p>
          </div>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs" data-testid="exam-plan">
          <Hourglass className="size-3.5 text-primary" aria-hidden />
          {plan.planned ? `${plan.done} of ${plan.planned} revision sessions done` : 'No revision planned yet'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setPlanning(view)}>
            <CalendarPlus /> {plan.planned ? 'Re-plan revision' : 'Plan revision'}
          </Button>
          {plan.planned ? (
            <Button asChild size="sm" variant="secondary">
              <Link to="/planner">Open planner</Link>
            </Button>
          ) : null}
          {plan.planned ? (
            confirming ? (
              <Button size="sm" variant="danger" onClick={() => exams.removePlan(exam.id)}>
                Confirm remove
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Remove plan
              </Button>
            )
          ) : null}
        </div>
      </CardContent>
      <PlanDialog view={planning} onClose={() => setPlanning(null)} />
    </Card>
  )
}

/** Dashboard: the next examinations with their countdown; nothing until an examination is added. */
export function ExamCountdownCard() {
  const exams = useExams()
  if (exams.isPending || !exams.exams.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hourglass className="size-4 text-primary" aria-hidden /> Exam countdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ExamCountdownList views={exams.exams} />
        <Link to="/exams" className="mt-3 block text-xs font-medium text-primary hover:underline">
          Exam Countdown
        </Link>
      </CardContent>
    </Card>
  )
}

function ExamCountdownList({ views }: { views: readonly ExamView[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm" aria-label="Upcoming examinations" data-testid="exam-countdown">
      {views.slice(0, 3).map(({ exam, course, days, plan }) => (
        <li key={exam.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-medium">
              <GraduationCap className="size-3.5 text-primary" aria-hidden /> {course?.code ?? exam.title}
            </span>
            <span className="block text-xs text-muted-foreground">{plan.planned ? `${plan.done}/${plan.planned} revision sessions` : 'No revision planned'}</span>
          </span>
          <Badge tone={days <= 7 ? 'warning' : 'neutral'}>{countdownLabel(days)}</Badge>
        </li>
      ))}
    </ul>
  )
}
