import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, NotebookPen, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { RichText } from '@/components/lessons/RichText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { getCatalogue } from '@/services/courses'
import { deleteNote, filterNotes, listNotes, notesToMarkdown, saveNote, type NoteInput } from '@/services/notes'
import type { StudentNote } from '@/types/database'
import { relativeTime } from '@/utils/dates'

const EMPTY: NoteInput = { title: '', body: '', tags: [], course_id: null, module_id: null, lesson_id: null, is_pinned: false }

export default function NotesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [editing, setEditing] = useState<StudentNote | 'new' | null>(null)
  const [draft, setDraft] = useState<NoteInput>(EMPTY)
  const [tagText, setTagText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<StudentNote | null>(null)
  const notes = useQuery({ queryKey: ['notes'], queryFn: listNotes })
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })

  const lessonIndex = useMemo(() => {
    const map = new Map<string, { course: string; courseSlug: string; module: string; moduleId: string; lesson: string; slug: string; courseId: string }>()
    for (const c of catalogue.data ?? [])
      for (const m of c.modules)
        for (const l of m.lessons) map.set(l.id, { course: c.code, courseSlug: c.slug, courseId: c.id, module: m.title, moduleId: m.id, lesson: l.title, slug: l.slug })
    return map
  }, [catalogue.data])

  const focused = params.get('note')
  const visible = useMemo(() => {
    const list = filterNotes(notes.data ?? [], query).filter((n) => !courseFilter || n.course_id === courseFilter)
    return focused ? [...list].sort((a) => (a.id === focused ? -1 : 0)) : list
  }, [notes.data, query, courseFilter, focused])

  const setCache = (fn: (list: StudentNote[]) => StudentNote[]) => queryClient.setQueryData<StudentNote[]>(['notes'], (l) => fn(l ?? []))

  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not signed in')
      const tags = tagText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12)
      return saveNote(user.id, { ...draft, tags }, editing === 'new' || !editing ? undefined : editing)
    },
    onSuccess: (note) => {
      setCache((list) => [note, ...list.filter((n) => n.id !== note.id)])
      setEditing(null)
      toast.success('Note saved')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const togglePin = useMutation({
    mutationFn: (note: StudentNote) => saveNote(user?.id as string, { ...note, is_pinned: !note.is_pinned }, note),
    onSuccess: (note) => setCache((list) => list.map((n) => (n.id === note.id ? note : n))),
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (note: StudentNote) => deleteNote(user?.id as string, note.id),
    onSuccess: (_, note) => {
      setCache((list) => list.filter((n) => n.id !== note.id))
      setConfirmDelete(null)
      toast.success('Note deleted')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const openEditor = (note: StudentNote | 'new') => {
    if (note === 'new') {
      setDraft(EMPTY)
      setTagText('')
    } else {
      setDraft({ title: note.title, body: note.body, tags: note.tags, course_id: note.course_id, module_id: note.module_id, lesson_id: note.lesson_id, is_pinned: note.is_pinned })
      setTagText(note.tags.join(', '))
    }
    setEditing(note)
  }

  const label = (n: StudentNote) => {
    const l = n.lesson_id ? lessonIndex.get(n.lesson_id) : undefined
    if (l) return `${l.course} · ${l.module} · ${l.lesson}`
    const c = catalogue.data?.find((x) => x.id === n.course_id)
    return c ? `${c.code} ${c.title}` : ''
  }

  const exportNotes = () => {
    const blob = new Blob([notesToMarkdown(visible, label)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gradpath-notes-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const course = catalogue.data?.find((c) => c.id === draft.course_id)

  return (
    <>
      <PageHeader
        title="My Notes"
        description="Your private academic notebook. Only you can see these notes — administrators cannot read them."
        actions={
          <>
            <Button variant="secondary" onClick={exportNotes} disabled={!visible.length}>
              <Download /> Export
            </Button>
            <Button onClick={() => openEditor('new')}>
              <Plus /> New note
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search notes" placeholder="Search notes, tags…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filter by course" value={courseFilter} onValueChange={(next) => setCourseFilter(next)}>
          <SelectItem value="">All courses</SelectItem>
          {(catalogue.data ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.code} {c.title}
            </SelectItem>
          ))}
        </Select>
      </div>

      {notes.isError ? <ErrorState message={toUserMessage(notes.error)} onRetry={() => void notes.refetch()} /> : null}
      {notes.isPending ? (
        <Skeleton className="h-64" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={notes.data?.length ? 'No notes match' : 'No notes yet'}
          description={notes.data?.length ? 'Try another search.' : 'Create a note here, or add one while reading any lesson.'}
          action={<Button onClick={() => openEditor('new')}>Create a note</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((n) => {
            const l = n.lesson_id ? lessonIndex.get(n.lesson_id) : undefined
            return (
              <li key={n.id} className={`flex flex-col rounded-xl border bg-surface p-4 shadow-card ${n.id === focused ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => openEditor(n)} className="text-left font-medium hover:underline">
                    {n.title || 'Untitled note'}
                  </button>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon-sm" aria-label={n.is_pinned ? 'Unpin note' : 'Pin note'} onClick={() => togglePin.mutate(n)}>
                      {n.is_pinned ? <PinOff /> : <Pin />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete note" onClick={() => setConfirmDelete(n)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {l ? (
                  <Link to={`/courses/${l.courseSlug}/lessons/${l.slug}`} className="mt-0.5 truncate text-xs text-primary hover:underline">
                    {label(n)}
                  </Link>
                ) : label(n) ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{label(n)}</p>
                ) : null}
                <RichText markdown={n.body.length > 600 ? `${n.body.slice(0, 600)}…` : n.body} className="mt-2 font-sans text-sm" />
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
                  {n.is_pinned ? <Badge tone="primary">Pinned</Badge> : null}
                  {n.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                  <span className="ml-auto text-[11px] text-muted-foreground">Updated {relativeTime(n.updated_at)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
          if (!open && params.get('note')) setParams({}, { replace: true })
        }}
      >
        <DialogContent title={editing === 'new' ? 'New note' : 'Edit note'} size="lg">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate()
            }}
            className="grid gap-4"
          >
            <Field label="Title" htmlFor="note-title">
              <Input id="note-title" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Note" htmlFor="note-body" hint="Markdown is supported: **bold**, lists, tables.">
              <Textarea id="note-body" rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Course" htmlFor="note-course">
                <Select
                  id="note-course"
                  value={draft.course_id ?? ''}
                  onValueChange={(next) => setDraft({ ...draft, course_id: next || null, module_id: null, lesson_id: null })}
                >
                  <SelectItem value="">Not linked</SelectItem>
                  {(catalogue.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} {c.title}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
              <Field label="Lesson" htmlFor="note-lesson">
                <Select
                  id="note-lesson"
                  value={draft.lesson_id ?? ''}
                  disabled={!course}
                  onValueChange={(next) => {
                    const lessonId = next || null
                    setDraft({ ...draft, lesson_id: lessonId, module_id: lessonId ? (lessonIndex.get(lessonId)?.moduleId ?? null) : null })
                  }}
                >
                  <SelectItem value="">Not linked to a lesson</SelectItem>
                  {course?.modules.map((m) => (
                    <optgroup key={m.id} label={m.title}>
                      {m.lessons.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.title}
                        </SelectItem>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Tags" htmlFor="note-tags" hint="Separate tags with commas.">
              <Input id="note-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending || (!draft.title.trim() && !draft.body.trim())}>
                Save note
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent title="Delete this note?" description="This cannot be undone." size="sm">
          <DialogFooter className="mt-0">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Keep note
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && remove.mutate(confirmDelete)} disabled={remove.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
