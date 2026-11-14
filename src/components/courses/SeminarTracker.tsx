import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Mic, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ErrorState, ProgressBar, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { toUserMessage } from '@/lib/errors'
import {
  deleteSeminar,
  listSeminars,
  preparationPercent,
  saveSeminar,
  seminarSchema,
  SEMINAR_STATUS_LABEL,
  SEMINAR_STATUSES,
  SEMINAR_STEPS,
  type SeminarInput,
} from '@/services/study/seminar'
import type { SeminarPresentation } from '@/types/database'

const SEMINARS_KEY = ['seminars']
const EMPTY: SeminarInput = { topic: '', status: 'exploring', presentation_date: null, date_confirmed: false, checklist: [], feedback: '', notes: '' }

/** Personal seminar tracker on the CSIT 610 page. Topics, dates and feedback are the student's own entries. */
export function SeminarTracker({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient()
  const seminars = useQuery({ queryKey: SEMINARS_KEY, queryFn: listSeminars })
  const [editing, setEditing] = useState<SeminarPresentation | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SeminarPresentation | null>(null)
  const remove = useMutation({
    mutationFn: (id: string) => deleteSeminar(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SEMINARS_KEY })
      setDeleting(null)
      toast.success('Seminar entry deleted')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-4 text-primary" aria-hidden /> My seminar tracker
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Record your seminar topics, presentation dates, preparation and feedback. GradPath does not set seminar topics, dates or
            marking criteria: enter what your department gives you.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} className="shrink-0">
          <Plus /> Add seminar
        </Button>
      </CardHeader>
      <CardContent>
        {seminars.isError ? <ErrorState message={toUserMessage(seminars.error)} onRetry={() => void seminars.refetch()} /> : null}
        {seminars.isPending ? (
          <Skeleton className="h-24" />
        ) : seminars.data?.length ? (
          <ul className="flex flex-col gap-3">
            {seminars.data.map((s) => {
              const percent = preparationPercent(s.checklist)
              return (
                <li key={s.id} className="rounded-lg border bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{s.topic}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        <Badge tone={s.status === 'presented' ? 'success' : 'primary'}>{SEMINAR_STATUS_LABEL[s.status]}</Badge>
                        {s.presentation_date ? (
                          <Badge tone={s.date_confirmed ? 'neutral' : 'warning'}>
                            {format(new Date(`${s.presentation_date}T00:00:00`), 'EEE d MMM yyyy')}
                            {s.date_confirmed ? '' : ' · awaiting confirmation'}
                          </Badge>
                        ) : (
                          <Badge>No date yet</Badge>
                        )}
                      </div>
                    </div>
                    <span className="flex">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.topic}`} onClick={() => setEditing(s)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.topic}`} onClick={() => setDeleting(s)}>
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Preparation</span>
                      <span className="tabular-nums">{percent}%</span>
                    </div>
                    <ProgressBar value={percent} label={`${s.topic} preparation`} />
                  </div>
                  {s.feedback ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Feedback: </span>
                      {s.feedback}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No seminar entries yet. Add one when you receive or choose a seminar topic.</p>
        )}
      </CardContent>

      {editing ? (
        <SeminarDialog
          courseId={courseId}
          seminar={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: SEMINARS_KEY })}
        />
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent title="Delete this seminar entry?" description={deleting?.topic}>
          <p className="text-sm text-muted-foreground">Its preparation checklist, notes and feedback are deleted too. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SeminarDialog({
  courseId,
  seminar,
  onClose,
  onSaved,
}: {
  courseId: string
  seminar: SeminarPresentation | null
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<SeminarInput>(
    seminar
      ? {
          topic: seminar.topic,
          status: seminar.status,
          presentation_date: seminar.presentation_date,
          date_confirmed: seminar.date_confirmed,
          checklist: seminar.checklist,
          feedback: seminar.feedback,
          notes: seminar.notes,
        }
      : EMPTY,
  )
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => saveSeminar(courseId, draft, seminar?.id),
    onSuccess: () => {
      onSaved()
      onClose()
      toast.success('Seminar entry saved')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const toggleStep = (key: string) =>
    setDraft((d) => ({ ...d, checklist: d.checklist.includes(key) ? d.checklist.filter((k) => k !== key) : [...d.checklist, key] }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={seminar ? 'Edit seminar' : 'Add seminar'} size="lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const parsed = seminarSchema.safeParse(draft)
            if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form')
            setError(null)
            save.mutate()
          }}
        >
          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
          <Field label="Topic" htmlFor="s-topic">
            <Input id="s-topic" value={draft.topic} maxLength={300} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Stage" htmlFor="s-status">
              <Select id="s-status" value={draft.status} onValueChange={(next) => setDraft({ ...draft, status: next as SeminarInput['status'] })}>
                {SEMINAR_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEMINAR_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Presentation date" htmlFor="s-date" hint="Leave empty until a date is given.">
              <Input
                id="s-date"
                type="date"
                value={draft.presentation_date ?? ''}
                onChange={(e) => setDraft({ ...draft, presentation_date: e.target.value || null })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.date_confirmed}
              onChange={(e) => setDraft({ ...draft, date_confirmed: e.target.checked })}
              className="size-4 accent-primary"
            />
            The date is confirmed by the department
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Preparation checklist</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SEMINAR_STEPS.map((step) => (
                <label key={step.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="checkbox" checked={draft.checklist.includes(step.key)} onChange={() => toggleStep(step.key)} className="size-4 accent-primary" />
                  {step.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Notes" htmlFor="s-notes">
            <Textarea id="s-notes" value={draft.notes} maxLength={10000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </Field>
          <Field label="Feedback received" htmlFor="s-feedback" hint="Record feedback from your lecturer or peers after presenting.">
            <Textarea id="s-feedback" value={draft.feedback} maxLength={10000} onChange={(e) => setDraft({ ...draft, feedback: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
