import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { listCourses } from '@/services/courses'
import { deleteEvent, deleteProvisionalEvents, eventSchema, listEvents, restoreProvisionalTimetable, saveEvent, type EventInput } from '@/services/study/planner'
import type { TimetableEvent } from '@/types/database'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const KIND_LABEL = { study: 'Study', lecture: 'Lecture', revision: 'Revision', other: 'Other' } as const

const EMPTY: EventInput = { title: '', course_id: null, kind: 'lecture', recurrence: 'weekly', day_of_week: 1, event_date: null, start_time: '09:00', end_time: '11:00', location: '', notes: '' }

export default function TimetablePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const events = useQuery({ queryKey: ['timetable'], queryFn: listEvents })
  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses })
  const [editing, setEditing] = useState<TimetableEvent | 'new' | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const form = useForm<EventInput>({ resolver: zodResolver(eventSchema), defaultValues: EMPTY })
  const recurrence = form.watch('recurrence')

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['timetable'] })
    void queryClient.invalidateQueries({ queryKey: ['sessions'] })
  }
  const run = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: done, onError: (e) => toast.error(toUserMessage(e)) })

  const open = (event: TimetableEvent | 'new') => {
    form.reset(
      event === 'new'
        ? EMPTY
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
          },
    )
    setEditing(event)
  }

  const onSubmit = form.handleSubmit((values) => {
    if (!user) return
    run.mutate(() => saveEvent(user.id, { ...values, course_id: values.course_id || null }, editing === 'new' || !editing ? undefined : editing))
    setEditing(null)
  })

  const list = events.data ?? []
  const provisional = list.filter((e) => e.is_provisional)
  const codeOf = (id: string | null) => courses.data?.find((c) => c.id === id)?.code

  return (
    <>
      <PageHeader
        title="Timetable"
        description="Your recurring weekly schedule and one-off events. The study planner builds each week from this timetable."
        actions={
          <Button onClick={() => open('new')}>
            <Plus /> Add event
          </Button>
        }
      />
      {provisional.length ? (
        <Alert className="mb-5" title="Provisional study schedule">
          The blocks marked “Provisional” are a suggested independent-study plan, not the official University of Ghana lecture timetable. Add your
          official lectures and adjust or remove these blocks.{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setConfirmReplace(true)}>
            Remove all provisional blocks
          </button>
        </Alert>
      ) : (
        <Alert className="mb-5">
          No provisional blocks.{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => run.mutate(restoreProvisionalTimetable)}>
            <RotateCcw className="mr-1 inline size-3.5" aria-hidden />
            Add the suggested weekly study plan
          </button>
        </Alert>
      )}
      {events.isError ? <ErrorState message={toUserMessage(events.error)} onRetry={() => void events.refetch()} /> : null}
      {events.isPending ? (
        <Skeleton className="h-96" />
      ) : list.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Your timetable is empty" description="Add your lectures and study blocks to plan your week." action={<Button onClick={() => open('new')}>Add event</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ORDER.map((dow) => {
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
                          {e.is_provisional ? <Badge tone="warning">Provisional</Badge> : null}
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
                  {(courses.data ?? []).map((c) => (
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
                    {ORDER.map((d) => (
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
