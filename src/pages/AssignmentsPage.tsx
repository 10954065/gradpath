import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ClipboardList, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { PageHeader } from '@/components/ui/page'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { listCourses } from '@/services/courses'
import {
  addAttachment,
  assignmentSchema,
  attachmentUrl,
  bucketOf,
  deleteAssignment,
  listAssignments,
  removeAttachment,
  saveAssignment,
  type AssignmentInput,
} from '@/services/study/assignments'
import type { Assignment } from '@/types/database'
import { daysUntil, formatDateTime } from '@/utils/dates'

const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const
const STATUS_LABEL = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', completed: 'Completed' } as const
const EMPTY: AssignmentInput = { title: '', description: '', course_id: null, due_at: null, priority: 'medium', status: 'not_started', notes: '' }

export default function AssignmentsPage() {
  const { user } = useAuth()
  const online = useOnlineStatus()
  const queryClient = useQueryClient()
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: listAssignments })
  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses })
  const [view, setView] = useState<'upcoming' | 'overdue' | 'done' | 'all'>('upcoming')
  const [course, setCourse] = useState('')
  const [sort, setSort] = useState<'due' | 'priority' | 'created'>('due')
  const [editing, setEditing] = useState<Assignment | 'new' | null>(null)
  const [draft, setDraft] = useState<AssignmentInput>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Assignment | null>(null)

  const setCache = (fn: (l: Assignment[]) => Assignment[]) => queryClient.setQueryData<Assignment[]>(['assignments'], (l) => fn(l ?? []))
  const save = useMutation({
    mutationFn: () => saveAssignment(user?.id as string, draft, editing === 'new' || !editing ? undefined : editing),
    onSuccess: (a) => {
      setCache((l) => [a, ...l.filter((x) => x.id !== a.id)])
      setEditing(null)
      toast.success('Assignment saved')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const quick = useMutation({
    mutationFn: (a: Assignment) => saveAssignment(user?.id as string, { ...a, status: a.status === 'completed' ? 'in_progress' : 'completed' }, a),
    onSuccess: (a) => setCache((l) => l.map((x) => (x.id === a.id ? a : x))),
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (a: Assignment) => deleteAssignment(user?.id as string, a.id),
    onSuccess: (_, a) => {
      setCache((l) => l.filter((x) => x.id !== a.id))
      setDeleting(null)
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const attach = useMutation({
    mutationFn: async ({ a, file }: { a: Assignment; file: File }) => ({ a, paths: await addAttachment(user?.id as string, a, file) }),
    onSuccess: ({ a, paths }) => {
      setCache((l) => l.map((x) => (x.id === a.id ? { ...x, attachment_paths: paths } : x)))
      if (editing && editing !== 'new') setEditing({ ...editing, attachment_paths: paths })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const filtered = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 }
    return (assignments.data ?? [])
      .filter((a) => (view === 'all' ? true : bucketOf(a) === view || (view === 'upcoming' && bucketOf(a) === 'no_date')))
      .filter((a) => !course || a.course_id === course)
      .sort((a, b) =>
        sort === 'priority'
          ? rank[a.priority] - rank[b.priority]
          : sort === 'created'
            ? b.created_at.localeCompare(a.created_at)
            : (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'),
      )
  }, [assignments.data, view, course, sort])

  const counts = useMemo(() => {
    const c = { upcoming: 0, overdue: 0, done: 0 }
    for (const a of assignments.data ?? []) {
      const b = bucketOf(a)
      if (b === 'overdue') c.overdue += 1
      else if (b === 'done') c.done += 1
      else c.upcoming += 1
    }
    return c
  }, [assignments.data])

  const open = (a: Assignment | 'new') => {
    setError(null)
    setDraft(
      a === 'new'
        ? EMPTY
        : { title: a.title, description: a.description, course_id: a.course_id, due_at: a.due_at, priority: a.priority, status: a.status, notes: a.notes },
    )
    setEditing(a)
  }
  const submit = () => {
    const parsed = assignmentSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form')
      return
    }
    save.mutate()
  }
  const codeOf = (id: string | null) => courses.data?.find((c) => c.id === id)?.code

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Track coursework deadlines, priorities and progress. Reminders appear in Notifications 48 hours before each deadline."
        actions={
          <Button onClick={() => open('new')}>
            <Plus /> New assignment
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({counts.upcoming})</TabsTrigger>
            <TabsTrigger value="overdue">Overdue ({counts.overdue})</TabsTrigger>
            <TabsTrigger value="done">Completed ({counts.done})</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Select aria-label="Filter by course" value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">All courses</option>
            {(courses.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="due">Sort by due date</option>
            <option value="priority">Sort by priority</option>
            <option value="created">Newest first</option>
          </Select>
        </div>
      </div>
      {assignments.isError ? <ErrorState message={toUserMessage(assignments.error)} onRetry={() => void assignments.refetch()} /> : null}
      {assignments.isPending ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing here" description="Add assignments from your course outlines to keep every deadline in view." action={<Button onClick={() => open('new')}>Add assignment</Button>} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((a) => {
            const bucket = bucketOf(a)
            const days = a.due_at ? daysUntil(a.due_at) : null
            return (
              <li key={a.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-4 shadow-card', bucket === 'overdue' && 'border-danger/40')}>
                <input
                  type="checkbox"
                  aria-label={`Mark ${a.title} ${a.status === 'completed' ? 'not completed' : 'completed'}`}
                  checked={a.status === 'completed'}
                  onChange={() => quick.mutate(a)}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(a)}>
                  <span className={cn('block font-medium', a.status === 'completed' && 'text-muted-foreground line-through')}>{a.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {codeOf(a.course_id) ? <Badge>{codeOf(a.course_id)}</Badge> : null}
                    <Badge tone={PRIORITY_TONE[a.priority]} className="capitalize">
                      {a.priority} priority
                    </Badge>
                    <Badge>{STATUS_LABEL[a.status]}</Badge>
                    {a.attachment_paths.length ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Paperclip className="size-3" aria-hidden /> {a.attachment_paths.length}
                      </span>
                    ) : null}
                  </span>
                </button>
                <span className={cn('text-sm tabular-nums', bucket === 'overdue' ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                  {a.due_at ? (bucket === 'overdue' ? `Overdue · ${formatDateTime(a.due_at)}` : days === 0 ? `Due today ${format(new Date(a.due_at), 'HH:mm')}` : `Due ${formatDateTime(a.due_at)}`) : 'No due date'}
                </span>
                <span className="flex">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.title}`} onClick={() => open(a)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}>
                    <Trash2 />
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === 'new' ? 'New assignment' : 'Edit assignment'} size="lg">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
            <Field label="Title" htmlFor="a-title">
              <Input id="a-title" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Course" htmlFor="a-course">
                <Select id="a-course" value={draft.course_id ?? ''} onChange={(e) => setDraft({ ...draft, course_id: e.target.value || null })}>
                  <option value="">None</option>
                  {(courses.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Due" htmlFor="a-due">
                <Input
                  id="a-due"
                  type="datetime-local"
                  value={draft.due_at ? format(new Date(draft.due_at), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={(e) => setDraft({ ...draft, due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </Field>
              <Field label="Priority" htmlFor="a-priority">
                <Select id="a-priority" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as AssignmentInput['priority'] })}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </Select>
              </Field>
              <Field label="Status" htmlFor="a-status">
                <Select id="a-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as AssignmentInput['status'] })}>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="a-desc">
              <Textarea id="a-desc" rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label="Personal notes" htmlFor="a-notes">
              <Textarea id="a-notes" rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            {editing && editing !== 'new' ? (
              <div>
                <p className="mb-2 text-sm font-medium">Attachments</p>
                <ul className="mb-2 flex flex-col gap-1">
                  {editing.attachment_paths.map((p) => (
                    <li key={p} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
                      <button
                        type="button"
                        className="truncate text-primary hover:underline"
                        onClick={async () => {
                          const url = await attachmentUrl(p)
                          if (url) window.open(url, '_blank', 'noopener,noreferrer')
                        }}
                      >
                        {p.split('/').pop()?.replace(/^\d+-/, '')}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove attachment"
                        onClick={async () => {
                          const paths = await removeAttachment(editing, p)
                          setEditing({ ...editing, attachment_paths: paths })
                          setCache((l) => l.map((x) => (x.id === editing.id ? { ...x, attachment_paths: paths } : x)))
                        }}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
                <label className={cn('inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm', !online && 'pointer-events-none opacity-50')}>
                  <Paperclip className="size-4" aria-hidden /> Attach file (PDF, Word, PowerPoint, text or image, max 10 MB)
                  <input type="file" className="sr-only" disabled={!online} onChange={(e) => e.target.files?.[0] && attach.mutate({ a: editing, file: e.target.files[0] })} />
                </label>
                {!online ? <p className="mt-1 text-xs text-muted-foreground">Attachments need a connection.</p> : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">You can attach files after saving.</p>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent title="Delete this assignment?" description={deleting?.title} size="sm">
          <DialogFooter className="mt-0">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Keep
            </Button>
            <Button variant="danger" onClick={() => deleting && remove.mutate(deleting)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
