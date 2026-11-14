import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { History, Megaphone, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useAdminAction } from '@/components/admin/hooks'
import { TimetableImport } from '@/components/admin/TimetableImport'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { useMyCourses } from '@/hooks/useMyCourses'
import { toUserMessage } from '@/lib/errors'
import { ALLOCATION_LABEL, DAY_NAMES, ENTRY_STATUS_LABEL, ghanaRange, sortWeek, WEEK_ORDER, type OfficialSession } from '@/lib/officialTimetable'
import {
  adminListEntries,
  entrySchema,
  getOfficialTimetable,
  listChanges,
  OFFICIAL_TIMETABLE_KEY,
  publishChanges,
  saveEntry,
  type EntryInput,
  type TimetableChange,
} from '@/services/timetable/official'

const CHANGE_LABEL: Record<TimetableChange['change_type'], string> = {
  imported: 'Imported',
  added: 'Added',
  updated: 'Updated',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  removed: 'Removed',
  restored: 'Restored',
}

const BLANK: EntryInput = {
  course_id: '',
  day_of_week: 1,
  start_time: '17:30',
  end_time: '19:30',
  venue: '',
  status: 'scheduled',
  allocation: 'pending_confirmation',
  allocation_note: '',
  notes: '',
  change_reason: '',
}

const toInput = (s: OfficialSession, patch: Partial<EntryInput> = {}): EntryInput => ({
  course_id: s.courseId,
  day_of_week: s.dayOfWeek,
  start_time: s.start,
  end_time: s.end,
  venue: s.venue,
  status: s.status,
  allocation: s.allocation,
  allocation_note: s.allocationNote,
  notes: s.notes,
  change_reason: '',
  ...patch,
})

/** Administer the official timetable: every change needs a reason and is kept in the audit trail. */
export function TimetableAdmin() {
  const my = useMyCourses()
  const current = useQuery({ queryKey: OFFICIAL_TIMETABLE_KEY, queryFn: getOfficialTimetable })
  const sourceId = current.data?.source.id
  const entries = useQuery({ queryKey: ['admin', 'timetable', sourceId], queryFn: () => adminListEntries(sourceId as string), enabled: Boolean(sourceId) })
  const changes = useQuery({ queryKey: ['admin', 'timetable-changes', sourceId], queryFn: () => listChanges(sourceId as string), enabled: Boolean(sourceId) })
  const [editing, setEditing] = useState<{ id?: string; input: EntryInput } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [summary, setSummary] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const invalidate = [[...OFFICIAL_TIMETABLE_KEY], ['admin', 'timetable', sourceId ?? ''], ['admin', 'timetable-changes', sourceId ?? '']]
  const save = useAdminAction((e: { id?: string; input: EntryInput }) => saveEntry(sourceId as string, e.input, e.id), {
    success: 'Session saved. Publish the changes to notify students.',
    invalidate,
  })
  const publish = useAdminAction((text: string) => publishChanges(sourceId as string, text), {
    success: 'Changes published and students notified',
    invalidate: [...invalidate, ['timetable-publications', sourceId ?? '']],
  })

  if (current.isError) return <ErrorState message={toUserMessage(current.error)} onRetry={() => void current.refetch()} />
  if (current.isPending) return <Skeleton className="h-64" />
  if (!current.data) return <TimetableImport source={null} />

  const source = current.data.source
  const pending = (changes.data ?? []).filter((c) => !c.publication_id)
  const courseCode = (id: unknown) => my.all.find((c) => c.id === id)?.code ?? 'Unknown course'
  const submit = () => {
    if (!editing) return
    const parsed = entrySchema.safeParse(editing.input)
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? 'Check the session details')
    setFormError(null)
    save.mutate({ id: editing.id, input: parsed.data }, { onSuccess: () => setEditing(null) })
  }
  const set = (patch: Partial<EntryInput>) => editing && setEditing({ ...editing, input: { ...editing.input, ...patch } })

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{source.title}</CardTitle>
          <CardDescription>
            {source.programme} · {source.academic_year} · {source.semester} · version {source.version}, update {source.revision} · last updated{' '}
            {format(new Date(source.last_updated_at), 'd MMM yyyy')}. Changes are visible to students straight away and marked in the history; publishing
            sends the notice.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setEditing({ input: BLANK })}>
            <Plus /> Add session
          </Button>
          <Button variant="secondary" disabled={!pending.length} onClick={() => setPublishing(true)}>
            <Megaphone /> Publish {pending.length || ''} change{pending.length === 1 ? '' : 's'} and notify students
          </Button>
        </CardContent>
      </Card>

      {entries.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-surface shadow-card">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <caption className="sr-only">Published sessions</caption>
            <thead className="border-b bg-surface-2 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Day and time (Ghana)</th>
                <th scope="col" className="px-3 py-2 font-medium">Course</th>
                <th scope="col" className="px-3 py-2 font-medium">Venue</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Allocation</th>
                <th scope="col" className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortWeek(entries.data ?? []).map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {DAY_NAMES[s.dayOfWeek]} · {ghanaRange(s.start, s.end)}
                  </td>
                  <td className="px-3 py-2 font-medium">{s.code}</td>
                  <td className="px-3 py-2">{s.venue || 'Not given'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={s.status === 'scheduled' ? 'neutral' : s.status === 'rescheduled' ? 'primary' : 'danger'}>{ENTRY_STATUS_LABEL[s.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{ALLOCATION_LABEL[s.allocation]}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${s.code} ${DAY_NAMES[s.dayOfWeek]}`} onClick={() => setEditing({ id: s.id, input: toInput(s) })}>
                        <Pencil />
                      </Button>
                      {s.status === 'cancelled' || s.status === 'removed' ? (
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.id, input: toInput(s, { status: 'scheduled' }) })}>
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.id, input: toInput(s, { status: 'cancelled' }) })}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.id, input: toInput(s, { status: 'removed' }) })}>
                            Remove
                          </Button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Every change since the original import, with its reason. The imported original is never overwritten.</CardDescription>
        </CardHeader>
        <CardContent>
          {!changes.data?.length ? (
            <EmptyState icon={History} title="No changes yet" description="The timetable is as originally published." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {changes.data.map((c) => (
                <li key={c.id} className="rounded-lg border p-3">
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={c.change_type === 'cancelled' || c.change_type === 'removed' ? 'danger' : 'primary'}>{CHANGE_LABEL[c.change_type]}</Badge>
                    <span className="font-medium">{courseCode(c.after?.course_id ?? c.before?.course_id)}</span>
                    <span className="text-muted-foreground">{format(new Date(c.changed_at), 'd MMM yyyy, HH:mm')}</span>
                    {c.publication_id ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Not yet published</Badge>}
                  </span>
                  <span className="mt-1 block">{describeChange(c)}</span>
                  {c.reason ? <span className="block text-xs text-muted-foreground">Reason: {c.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TimetableImport source={source} />

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Change a published session' : 'Add a session'} description="Times are Ghana local time (Africa/Accra).">
          {editing ? (
            <form
              noValidate
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Course" htmlFor="tt-course">
                  <Select id="tt-course" value={editing.input.course_id} onValueChange={(v) => set({ course_id: v })}>
                    {my.all.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} {c.title}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
                <Field label="Day" htmlFor="tt-day">
                  <Select id="tt-day" value={String(editing.input.day_of_week)} onValueChange={(v) => set({ day_of_week: Number(v) })}>
                    {WEEK_ORDER.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {DAY_NAMES[d]}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
                <Field label="Start" htmlFor="tt-start">
                  <Input id="tt-start" type="time" value={editing.input.start_time} onChange={(e) => set({ start_time: e.target.value })} />
                </Field>
                <Field label="End" htmlFor="tt-end">
                  <Input id="tt-end" type="time" value={editing.input.end_time} onChange={(e) => set({ end_time: e.target.value })} />
                </Field>
                <Field label="Venue" htmlFor="tt-venue">
                  <Input id="tt-venue" maxLength={120} value={editing.input.venue} onChange={(e) => set({ venue: e.target.value })} />
                </Field>
                <Field label="Status" htmlFor="tt-status">
                  <Select id="tt-status" value={editing.input.status} onValueChange={(v) => set({ status: v as EntryInput['status'] })}>
                    {(Object.keys(ENTRY_STATUS_LABEL) as EntryInput['status'][]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {ENTRY_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
                <Field label="Attendance allocation" htmlFor="tt-allocation" className="sm:col-span-2" hint="Only change this when the department has confirmed who attends.">
                  <Select id="tt-allocation" value={editing.input.allocation} onValueChange={(v) => set({ allocation: v as EntryInput['allocation'] })}>
                    {(Object.keys(ALLOCATION_LABEL) as EntryInput['allocation'][]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {ALLOCATION_LABEL[a]}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Allocation note" htmlFor="tt-allocation-note">
                <Input id="tt-allocation-note" maxLength={500} value={editing.input.allocation_note} onChange={(e) => set({ allocation_note: e.target.value })} />
              </Field>
              <Field label="Notes for students" htmlFor="tt-notes">
                <Textarea id="tt-notes" rows={2} maxLength={1000} value={editing.input.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              <Field label="Reason for this change (kept in the history)" htmlFor="tt-reason">
                <Input id="tt-reason" maxLength={500} value={editing.input.change_reason} onChange={(e) => set({ change_reason: e.target.value })} />
              </Field>
              {formError ? <Alert tone="danger">{formError}</Alert> : null}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  Close
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  Save session
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={publishing} onOpenChange={setPublishing}>
        <DialogContent
          title="Publish timetable changes"
          description={`${pending.length} change${pending.length === 1 ? '' : 's'} will be published. Students who take an affected course are notified (if they allow timetable change alerts).`}
        >
          <Field label="Summary for students" htmlFor="tt-summary" hint="For example: CSIT 605 on Thursday moves to Earth Science Room 2 from next week.">
            <Textarea id="tt-summary" rows={3} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPublishing(false)}>
              Cancel
            </Button>
            <Button
              disabled={summary.trim().length < 5 || publish.isPending}
              onClick={() =>
                publish.mutate(summary.trim(), {
                  onSuccess: () => {
                    setPublishing(false)
                    setSummary('')
                  },
                })
              }
            >
              Publish and notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function describeChange(c: TimetableChange): string {
  const describe = (v: Record<string, unknown> | null) =>
    v ? `${DAY_NAMES[Number(v.day_of_week)]} ${ghanaRange(String(v.start_time), String(v.end_time))}, ${String(v.venue) || 'no venue'}` : ''
  if (!c.before) return `Added: ${describe(c.after)}`
  const fields = ['day_of_week', 'start_time', 'end_time', 'venue', 'status', 'allocation', 'allocation_note', 'notes'].filter(
    (f) => String(c.before?.[f]) !== String(c.after?.[f]),
  )
  return `${describe(c.before)} → ${describe(c.after)}${fields.length ? ` (changed: ${fields.join(', ').replace(/_/g, ' ')})` : ''}`
}
