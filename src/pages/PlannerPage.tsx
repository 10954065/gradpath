import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, endOfMonth, endOfWeek, format, isToday, startOfMonth } from 'date-fns'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, SkipForward, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { PageHeader, StatTile } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { buildPlanner, durationMinutes, isMissed, studyTotals, type PlannerEntry } from '@/lib/timetable'
import { cn } from '@/lib/utils'
import { RecommendationList } from '@/components/dashboard/Recommendations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMyCourses } from '@/hooks/useMyCourses'
import { useOfficialTimetable } from '@/hooks/useOfficialTimetable'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { lectureMinutes, officialPlannerEntries } from '@/lib/officialTimetable'
import { studyWeekLabel } from '@/lib/semesterCalendar'
import { useStudyOverview } from '@/hooks/useStudyOverview'
import { coursesForPicker } from '@/lib/curriculum'
import { ASSIGNMENT_KIND_LABEL, bucketOf } from '@/services/study/assignments'
import { deleteSession, listEvents, listSessions, saveSession } from '@/services/study/planner'
import { combineDateTime, isoDate, minutesToHours, weekDays, weekStart } from '@/utils/dates'

interface EditorState {
  entry: PlannerEntry | null
  title: string
  courseId: string
  date: string
  start: string
  end: string
  notes: string
}

export default function PlannerPage() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  // Weeks run from the day the student's studies started; the offset keeps the chosen week while that day loads.
  const calendar = useSemesterCalendar()
  const [weekOffset, setWeekOffset] = useState(0)
  const anchor = addDays(weekStart(new Date(), calendar.weekStartsOn), weekOffset * 7)
  const weekLabel = studyWeekLabel(calendar, anchor)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [completing, setCompleting] = useState<{
    entry: PlannerEntry
    minutes: number
  } | null>(null)
  const weekEnd = endOfWeek(anchor, { weekStartsOn: calendar.weekStartsOn })
  const monthStart = startOfMonth(anchor)
  const monthEnd = endOfMonth(anchor)
  const rangeStart = monthStart < anchor ? monthStart : anchor
  const rangeEnd = monthEnd > weekEnd ? monthEnd : weekEnd

  const events = useQuery({ queryKey: ['timetable'], queryFn: listEvents })
  const sessions = useQuery({
    queryKey: ['sessions', isoDate(rangeStart), isoDate(rangeEnd)],
    queryFn: () => listSessions(rangeStart.toISOString(), addDays(rangeEnd, 1).toISOString()),
  })
  const my = useMyCourses()
  const official = useOfficialTimetable()
  const overview = useStudyOverview()
  const deadlines = overview.assignments.filter((a) => bucketOf(a) === 'upcoming' || bucketOf(a) === 'overdue').slice(0, 6)
  const revisionAdvice = overview.recommendations.filter(
    (r) => r.kind === 'weak-topic' || r.kind === 'revision' || r.kind === 'assessment' || r.kind === 'mock-exam',
  )

  // Official lectures are shown read-only alongside the study plan; studyTotals never counts them as study.
  const week = useMemo(
    () =>
      [
        ...buildPlanner(events.data ?? [], sessions.data ?? [], anchor, weekEnd),
        ...officialPlannerEntries(official.sessions, official.attendance, anchor, weekEnd, { lecturesStartOn: calendar.lecturesStartOn, exceptions: official.exceptions }),
      ].sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events.data, sessions.data, anchor, weekEnd, official.sessions, official.attendance, official.exceptions, calendar.lecturesStartOn],
  )
  const month = useMemo(() => buildPlanner(events.data ?? [], sessions.data ?? [], monthStart, monthEnd), [events.data, sessions.data, monthStart, monthEnd])
  const weekTotals = studyTotals(week)
  const monthTotals = studyTotals(month)
  const missedThisWeek = week.filter((e) => isMissed(e)).length
  const targetMinutes = (profile?.weekly_study_target_hours ?? 15) * 60

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['sessions'] })
  const mutate = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: invalidate,
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const setStatus = (entry: PlannerEntry, status: 'completed' | 'skipped' | 'cancelled' | 'planned', actualMinutes?: number) => {
    if (!user) return
    mutate.mutate(() =>
      saveSession(
        user.id,
        {
          title: entry.title,
          courseId: entry.courseId,
          start: entry.start,
          end: entry.end,
          status,
          actualMinutes: actualMinutes ?? null,
          timetableEventId: entry.event?.id ?? entry.session?.timetable_event_id ?? null,
          occurrenceDate: entry.event ? entry.date : (entry.session?.occurrence_date ?? null),
        },
        entry.session,
      ),
    )
  }

  const openEditor = (entry: PlannerEntry | null, date?: string) => {
    setEditor({
      entry,
      title: entry?.title ?? 'Study session',
      courseId: entry?.courseId ?? '',
      date: entry?.date ?? date ?? isoDate(new Date()),
      start: entry ? format(entry.start, 'HH:mm') : '18:00',
      end: entry ? format(entry.end, 'HH:mm') : '19:30',
      notes: entry?.session?.notes ?? '',
    })
  }

  const saveEditor = () => {
    if (!user || !editor) return
    const start = combineDateTime(editor.date, editor.start)
    const end = combineDateTime(editor.date, editor.end)
    if (end <= start) {
      toast.error('The session must end after it starts.')
      return
    }
    const entry = editor.entry
    mutate.mutate(() =>
      saveSession(
        user.id,
        {
          title: editor.title || 'Study session',
          courseId: editor.courseId || null,
          start,
          end,
          status: entry?.status === 'completed' ? 'completed' : 'planned',
          actualMinutes: entry?.session?.actual_minutes ?? null,
          notes: editor.notes,
          timetableEventId: entry?.event?.id ?? entry?.session?.timetable_event_id ?? null,
          occurrenceDate: entry?.event ? entry.date : (entry?.session?.occurrence_date ?? null),
        },
        entry?.session,
      ),
    )
    setEditor(null)
  }

  const codeOf = (id: string | null) => my.all.find((c) => c.id === id)?.code

  return (
    <>
      <PageHeader
        title="Study Planner"
        description="Your week of study, built from your timetable. Mark sessions complete, record the time you actually studied, or reschedule."
        actions={
          <Button onClick={() => openEditor(null)}>
            <CalendarPlus /> Add session
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Studied this week"
          value={minutesToHours(weekTotals.completedMinutes)}
          hint={`Target ${profile?.weekly_study_target_hours ?? 15} h · ${minutesToHours(lectureMinutes(official.sessions, official.attendance))} of lectures not counted`}
        />
        <StatTile
          label="Planned this week"
          value={minutesToHours(weekTotals.plannedMinutes)}
          hint={`${weekTotals.completedSessions} completed · ${missedThisWeek} missed`}
        />
        <StatTile
          label={`Studied in ${format(anchor, 'MMMM')}`}
          value={minutesToHours(monthTotals.completedMinutes)}
          hint={`${monthTotals.completedSessions} sessions`}
        />
        <div className="rounded-xl border bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted-foreground">Weekly target progress</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{Math.min(100, Math.round((weekTotals.completedMinutes / targetMinutes) * 100))}%</p>
          <ProgressBar value={(weekTotals.completedMinutes / targetMinutes) * 100} label="Weekly target progress" className="mt-2" tone="success" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
            This week
          </Button>
        </div>
        <h2 className="text-sm font-semibold" data-testid="planner-week">
          {weekLabel ? `${weekLabel} · ` : ''}
          {format(anchor, 'EEE d MMM')} to {format(weekEnd, 'EEE d MMM yyyy')}
        </h2>
        <span className="flex gap-1">
          <Button asChild variant="link" size="sm">
            <Link to="/timetable/official">Official timetable</Link>
          </Button>
          <Button asChild variant="link" size="sm">
            <Link to="/timetable">Edit study plan</Link>
          </Button>
        </span>
      </div>

      {events.isError ? <ErrorState message={toUserMessage(events.error)} onRetry={() => void events.refetch()} /> : null}
      {events.isPending || sessions.isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-7">
          {weekDays(anchor).map((day) => {
            const date = isoDate(day)
            const items = week.filter((e) => e.date === date)
            return (
              <li key={date} className={cn('flex min-h-40 flex-col rounded-xl border bg-surface p-2.5 shadow-card', isToday(day) && 'ring-2 ring-primary/50')}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-xs font-semibold">{format(day, 'EEE')}</span>
                  <span className={cn('text-xs text-muted-foreground', isToday(day) && 'font-semibold text-primary')}>{format(day, 'd MMM')}</span>
                </div>
                <ul className="flex flex-1 flex-col gap-2">
                  {items.map((e) => (
                    <li
                      key={e.key}
                      className={cn(
                        'rounded-lg border p-2 text-xs',
                        e.status === 'completed' && 'border-success/40 bg-success/8',
                        (e.status === 'skipped' || e.status === 'cancelled') && 'opacity-55',
                        e.kind === 'lecture' && 'border-primary/40 bg-accent',
                        e.official && e.isProvisional && 'border-dashed',
                      )}
                    >
                      {e.official ? (
                        <Link
                          to={`/courses/${e.official.slug}`}
                          className="block w-full text-left"
                          aria-label={`${e.title}, ${format(e.start, 'HH:mm')} to ${format(e.end, 'HH:mm')}`}
                        >
                          <span className="flex items-center gap-1 font-medium">
                            <Clock className="size-3" aria-hidden /> {format(e.start, 'HH:mm')}-{format(e.end, 'HH:mm')}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block">{e.title}</span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <Badge tone="primary">Official lecture</Badge>
                            {e.isProvisional ? <Badge tone="warning">Awaiting confirmation</Badge> : <Badge tone="success">Confirmed</Badge>}
                          </span>
                        </Link>
                      ) : (
                        <button type="button" className="w-full text-left" onClick={() => openEditor(e)}>
                          <span className="flex items-center gap-1 font-medium">
                            <Clock className="size-3" aria-hidden /> {format(e.start, 'HH:mm')}-{format(e.end, 'HH:mm')}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block">{e.title}</span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {codeOf(e.courseId) ? <Badge>{codeOf(e.courseId)}</Badge> : null}
                            {e.kind === 'lecture' ? <Badge tone="primary">Lecture</Badge> : null}
                            {e.isProvisional ? <Badge tone="warning">{e.kind === 'lecture' ? 'Awaiting confirmation' : 'Provisional'}</Badge> : null}
                            {e.status !== 'planned' ? (
                              <Badge tone={e.status === 'completed' ? 'success' : 'neutral'} className="capitalize">
                                {e.status}
                              </Badge>
                            ) : null}
                            {isMissed(e) ? <Badge tone="danger">Missed</Badge> : null}
                          </span>
                        </button>
                      )}
                      {e.status === 'planned' && e.kind !== 'lecture' ? (
                        <span className="mt-1.5 flex gap-1">
                          <Button
                            size="sm"
                            variant="subtle"
                            className="h-7 px-2"
                            onClick={() =>
                              setCompleting({
                                entry: e,
                                minutes: durationMinutes(e),
                              })
                            }
                          >
                            <Check /> Done
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Skip session" onClick={() => setStatus(e, 'skipped')}>
                            <SkipForward />
                          </Button>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => openEditor(null, date)} className="mt-2 rounded-md py-1 text-xs text-muted-foreground hover:bg-muted">
                  + Add
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming deadlines and examinations</CardTitle>
          </CardHeader>
          <CardContent>
            {deadlines.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {deadlines.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      {a.kind !== 'assignment' ? <span className="font-medium">{ASSIGNMENT_KIND_LABEL[a.kind]}: </span> : null}
                      {a.title}
                    </span>
                    <span className={cn('shrink-0 text-xs', bucketOf(a) === 'overdue' ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                      {a.due_at ? (bucketOf(a) === 'overdue' ? 'Overdue' : format(new Date(a.due_at), 'EEE d MMM, HH:mm')) : 'No date'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming deadlines. Add assignments, tests and examination dates on the Assignments page.</p>
            )}
            <Button asChild variant="link" size="sm" className="mt-2 px-0">
              <Link to="/assignments">Manage deadlines</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What to revise next</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">Based on your own results: topics below the 80% mastery target and revision that is due.</p>
            <RecommendationList items={revisionAdvice} limit={4} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={completing !== null} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent title="Record study time" description={completing?.entry.title} size="sm">
          <Field label="Minutes actually studied" htmlFor="actual-minutes">
            <Input
              id="actual-minutes"
              type="number"
              min={0}
              max={1440}
              value={completing?.minutes ?? 0}
              onChange={(e) =>
                completing &&
                setCompleting({
                  ...completing,
                  minutes: Number(e.target.value),
                })
              }
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (completing) setStatus(completing.entry, 'completed', Math.max(0, Math.min(1440, completing.minutes)))
                setCompleting(null)
              }}
            >
              Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editor !== null} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent title={editor?.entry ? 'Edit or reschedule session' : 'Add a study session'}>
          {editor ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                saveEditor()
              }}
            >
              <Field label="Title" htmlFor="s-title">
                <Input id="s-title" value={editor.title} maxLength={200} onChange={(e) => setEditor({ ...editor, title: e.target.value })} />
              </Field>
              <Field label="Course" htmlFor="s-course">
                <Select id="s-course" value={editor.courseId} onValueChange={(next) => setEditor({ ...editor, courseId: next })}>
                  <SelectItem value="">General study</SelectItem>
                  {coursesForPicker(my.taking, my.all, editor.courseId || null).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} {c.title}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Date" htmlFor="s-date">
                  <Input id="s-date" type="date" value={editor.date} onChange={(e) => setEditor({ ...editor, date: e.target.value })} />
                </Field>
                <Field label="Start" htmlFor="s-start">
                  <Input id="s-start" type="time" value={editor.start} onChange={(e) => setEditor({ ...editor, start: e.target.value })} />
                </Field>
                <Field label="End" htmlFor="s-end">
                  <Input id="s-end" type="time" value={editor.end} onChange={(e) => setEditor({ ...editor, end: e.target.value })} />
                </Field>
              </div>
              <Field label="Notes" htmlFor="s-notes">
                <Textarea id="s-notes" rows={3} value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })} />
              </Field>
              <p className="text-xs text-muted-foreground">Times use {profile?.time_zone ?? 'Africa/Accra'}.</p>
              <DialogFooter className="sm:justify-between">
                <div className="flex gap-2">
                  {editor.entry?.event ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (editor.entry) setStatus(editor.entry, 'cancelled')
                        setEditor(null)
                      }}
                    >
                      Cancel this occurrence
                    </Button>
                  ) : null}
                  {editor.entry?.session && !editor.entry.event ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        const id = editor.entry?.session?.id
                        if (user && id) mutate.mutate(() => deleteSession(user.id, id))
                        setEditor(null)
                      }}
                    >
                      <Trash2 /> Delete
                    </Button>
                  ) : null}
                </div>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
