import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StudyStrategyCard } from '@/components/timetable/StudyStrategyCard'
import { useMyCourses } from '@/hooks/useMyCourses'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { coursesForPicker } from '@/lib/curriculum'
import { deleteEvent, deleteProvisionalEvents, eventSchema, listEvents, saveEvent, type EventInput } from '@/services/study/planner'
import type { TimetableEvent } from '@/types/database'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const KIND_LABEL = { study: 'Study', lecture: 'Lecture', revision: 'Revision', other: 'Other' } as const

const EMPTY: EventInput = {
  title: '',
  course_id: null,
  kind: 'study',
  recurrence: 'weekly',
  day_of_week: 1,
  event_date: null,
  start_time: '09:00',
  end_time: '11:00',
  location: '',
  notes: '',
  awaiting_confirmation: false,
}
type View = 'study' | 'university'
const inView = (e: Pick<TimetableEvent, 'kind'>, view: View) => (view === 'university' ? e.kind === 'lecture' : e.kind !== 'lecture')

export default function TimetablePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const events = useQuery({ queryKey: ['timetable'], queryFn: listEvents })
  const my = useMyCourses()
  const { order } = useSemesterCalendar()
  const [view, setView] = useState<View>('study')
  const [editing, setEditing] = useState<TimetableEvent | 'new' | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const form = useForm<EventInput>({ resolver: zodResolver(eventSchema), defaultValues: EMPTY })
  const recurrence = form.watch('recurrence')

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['timetable'] })
    void queryClient.invalidateQueries({ queryKey: ['sessions'] })
  }
  const run = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: done, onError: (e) => toast.error(toUserMessage(e)) })

  const open = (event: TimetableEvent | 'new', preset?: Partial<EventInput>) => {
    form.reset(
      event === 'new'
        ? { ...EMPTY, kind: view === 'university' ? 'lecture' : 'study', ...preset }
        : {
            title: event.title,
            course_id: event.course_id,
            kind: event.kind,
            recurrence: event.recurrence,
            day_of_week: event.day_of_week,
            event_date: event.event_date,
            start_time: event.start_time.slice(0, 5),
            end_time: event.end_time.slice(0, 5),
            location: event.location,
            notes: event.notes,
            awaiting_confirmation: event.kind === 'lecture' && event.is_provisional,
          },
    )
    setEditing(event)
  }

  const onSubmit = form.handleSubmit((values) => {
    if (!user) return
    run.mutate(() => saveEvent(user.id, { ...values, course_id: values.course_id || null }, editing === 'new' || !editing ? undefined : editing))
    setEditing(null)
  })

  const all = events.data ?? []
  const list = all.filter((e) => inView(e, view))
  const provisional = all.filter((e) => e.is_provisional && e.kind !== 'lecture')
  const codeOf = (id: string | null) => my.all.find((c) => c.id === id)?.code
  // Courses the student takes that have no study or revision block yet (for example a newly added course).
  const withoutStudyBlock = my.taking.filter((c) => !all.some((e) => e.course_id === c.id && e.kind !== 'lecture'))

  return (
    <>
      <PageHeader
        title="My Study Plan"
        description="Your personal weekly study plan. The official University lectures live on their own timetable; your study hours are planned around them and counted separately."
        actions={
          <Button onClick={() => open('new')}>
            <Plus /> {view === 'university' ? 'Add lecture' : 'Add study block'}
          </Button>
        }
      />
      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mb-5">
        <TabsList>
          <TabsTrigger value="study">My study plan</TabsTrigger>
          <TabsTrigger value="university">My lecture entries</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === 'university' ? (
        <Alert className="mb-5" title="The official timetable is now built in">
          The published University of Ghana ITB timetable, with venues and your private attendance choices, is on the{' '}
          <Link to="/timetable/official" className="font-medium text-primary hover:underline">
            Official Timetable
          </Link>{' '}
          page. Use this tab only for extra lectures you were told about that are not on the published timetable.
        </Alert>
      ) : provisional.length ? (
        <Alert className="mb-5" title="Provisional study schedule">
          The blocks marked “Provisional” are a suggested independent-study plan, not lectures. They are placed around the official University of
          Ghana timetable; edit any block to make it your own, or rebuild the plan after you confirm your sessions.{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setConfirmReplace(true)}>
            Remove all provisional blocks
          </button>
        </Alert>
      ) : (
        <Alert className="mb-5">
          No provisional blocks.{' '}
          Build one around your lectures below.
        </Alert>
      )}
      {view === 'study' && events.data ? <StudyStrategyCard events={all} onApplied={done} /> : null}
      {view === 'study' && withoutStudyBlock.length ? (
        <Alert className="mb-5" tone="warning" title="Courses without a study block">
          <span className="block">These courses you take have no time in your study plan yet:</span>
          <span className="mt-2 flex flex-wrap gap-2">
            {withoutStudyBlock.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant="secondary"
                onClick={() => open('new', { course_id: c.id, title: `${c.code} ${c.title} (study)`, kind: 'study' })}
              >
                <Plus /> Add a {c.code} study block
              </Button>
            ))}
          </span>
        </Alert>
      ) : null}
      {events.isError ? <ErrorState message={toUserMessage(events.error)} onRetry={() => void events.refetch()} /> : null}
      {events.isPending ? (
        <Skeleton className="h-96" />
      ) : list.length === 0 ? (
        <EmptyState icon={CalendarDays} title={view === 'university' ? 'No lectures entered yet' : 'Your study plan is empty'} description={view === 'university' ? 'Published lectures are on the Official Timetable page; add only extra lectures here.' : 'Add study blocks for your courses to plan your week.'} action={<Button onClick={() => open('new')}>Add event</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {order.map((dow) => {
            const day = list.filter((e) => e.recurrence === 'weekly' && e.day_of_week === dow)
            return (
              <section key={dow} className="rounded-xl border bg-surface p-4 shadow-card" aria-label={DAYS[dow]}>
                <h2 className="mb-2 text-sm font-semibold">{DAYS[dow]}</h2>
                {day.length === 0 ? <p className="text-xs text-muted-foreground">Nothing scheduled.</p> : null}
                <ul className="flex flex-col gap-2">
                  {day.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold tabular-nums">
                          {e.start_time.slice(0, 5)}-{e.end_time.slice(0, 5)}
                        </span>
                        <span className="block">{e.title}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <Badge tone={e.kind === 'lecture' ? 'primary' : 'neutral'}>{KIND_LABEL[e.kind]}</Badge>
                          {codeOf(e.course_id) ? <Badge>{codeOf(e.course_id)}</Badge> : null}
                          {e.kind === 'lecture' ? (
                            e.is_provisional ? <Badge tone="warning">Awaiting confirmation</Badge> : <Badge tone="success">Official</Badge>
                          ) : e.is_provisional ? (
                            <Badge tone="warning">Provisional</Badge>
                          ) : null}
                          {e.location ? <Badge>{e.location}</Badge> : null}
                        </span>
                      </span>
                      <span className="flex shrink-0">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${e.title}`} onClick={() => open(e)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${e.title}`} onClick={() => user && run.mutate(() => deleteEvent(user.id, e.id))}>
                          <Trash2 />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {list.some((e) => e.recurrence === 'once') ? (
            <section className="rounded-xl border bg-surface p-4 shadow-card" aria-label="One-off events">
              <h2 className="mb-2 text-sm font-semibold">One-off events</h2>
              <ul className="flex flex-col gap-2">
                {list
                  .filter((e) => e.recurrence === 'once')
                  .map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                      <span>
                        <span className="block text-xs font-semibold">
                          {e.event_date} · {e.start_time.slice(0, 5)}-{e.end_time.slice(0, 5)}
                        </span>
                        {e.title}
                      </span>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${e.title}`} onClick={() => open(e)}>
                        <Pencil />
                      </Button>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === 'new' ? 'Add timetable event' : 'Edit timetable event'}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <Field label="Title" htmlFor="t-title" error={form.formState.errors.title?.message}>
              <Input id="t-title" {...form.register('title')} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Type" htmlFor="t-kind">
                <Select id="t-kind" value={form.watch('kind')} onValueChange={(next) => form.setValue('kind', next as EventInput['kind'], { shouldDirty: true })}>
                  <SelectItem value="lecture">Lecture (official)</SelectItem>
                  <SelectItem value="study">Independent study</SelectItem>
                  <SelectItem value="revision">Revision</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </Select>
              </Field>
              <Field label="Course" htmlFor="t-course">
                <Select id="t-course" value={form.watch('course_id') ?? ''} onValueChange={(next) => form.setValue('course_id', next || null, { shouldDirty: true })}>
                  <SelectItem value="">None</SelectItem>
                  {coursesForPicker(my.taking, my.all, form.watch('course_id')).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
              <Field label="Repeats" htmlFor="t-recurrence">
                <Select id="t-recurrence" value={form.watch('recurrence')} onValueChange={(next) => form.setValue('recurrence', next as EventInput['recurrence'], { shouldDirty: true })}>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="once">Once</SelectItem>
                </Select>
              </Field>
              {recurrence === 'weekly' ? (
                <Field label="Day" htmlFor="t-day">
                  <Select id="t-day" value={String(form.watch('day_of_week') ?? '')} onValueChange={(next) => form.setValue('day_of_week', Number(next), { shouldDirty: true })}>
                    {order.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {DAYS[d]}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Date" htmlFor="t-date" error={form.formState.errors.event_date?.message}>
                  <Input id="t-date" type="date" {...form.register('event_date')} />
                </Field>
              )}
              <Field label="Start" htmlFor="t-start" error={form.formState.errors.start_time?.message}>
                <Input id="t-start" type="time" {...form.register('start_time')} />
              </Field>
              <Field label="End" htmlFor="t-end" error={form.formState.errors.end_time?.message}>
                <Input id="t-end" type="time" {...form.register('end_time')} />
              </Field>
            </div>
            {form.watch('kind') === 'lecture' ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" {...form.register('awaiting_confirmation')} />
                Awaiting confirmation (the official class allocation is not yet clear)
              </label>
            ) : null}
            <Field label="Location" htmlFor="t-location">
              <Input id="t-location" {...form.register('location')} />
            </Field>
            <Field label="Notes" htmlFor="t-notes">
              <Textarea id="t-notes" rows={2} {...form.register('notes')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <DialogContent title="Remove the provisional study blocks?" size="sm" description="Your own events and completed sessions are kept.">
          <DialogFooter className="mt-0">
            <Button variant="secondary" onClick={() => setConfirmReplace(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                run.mutate(deleteProvisionalEvents)
                setConfirmReplace(false)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
