import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { NotebookPen, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea, Input } from '@/components/ui/form-controls'
import { toUserMessage } from '@/lib/errors'
import { deleteNote, listNotes, saveNote } from '@/services/notes'
import type { StudentNote } from '@/types/database'
import { relativeTime } from '@/utils/dates'
import { RichText } from './RichText'

interface LessonNotesProps {
  userId: string
  courseId: string
  moduleId: string
  lessonId: string
}

/** Private notes linked to the current lesson. Visible only to the signed-in student. */
export function LessonNotes({ userId, courseId, moduleId, lessonId }: LessonNotesProps) {
  const queryClient = useQueryClient()
  const notes = useQuery({ queryKey: ['notes'], queryFn: listNotes })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const update = (fn: (list: StudentNote[]) => StudentNote[]) =>
    queryClient.setQueryData<StudentNote[]>(['notes'], (list) => fn(list ?? []))

  const create = useMutation({
    mutationFn: () =>
      saveNote(userId, { title: title.trim(), body, tags: [], course_id: courseId, module_id: moduleId, lesson_id: lessonId, is_pinned: false }),
    onSuccess: (note) => {
      update((list) => [note, ...list])
      setTitle('')
      setBody('')
      toast.success('Note saved')
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteNote(userId, id),
    onSuccess: (_, id) => update((list) => list.filter((n) => n.id !== id)),
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const lessonNotes = (notes.data ?? []).filter((n) => n.lesson_id === lessonId)
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim() || title.trim()) create.mutate()
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <Input aria-label="Note title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <Textarea
          aria-label="Note"
          placeholder="Write a private note about this lesson… (Markdown supported)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
        />
        <Button type="submit" size="sm" disabled={create.isPending || (!body.trim() && !title.trim())}>
          <NotebookPen /> Save note
        </Button>
      </form>
      {lessonNotes.length ? (
        <ul className="flex flex-col gap-2">
          {lessonNotes.map((n) => (
            <li key={n.id} className="rounded-lg border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{n.title || 'Untitled note'}</p>
                <Button variant="ghost" size="icon-sm" aria-label="Delete note" onClick={() => remove.mutate(n.id)}>
                  <Trash2 />
                </Button>
              </div>
              <RichText markdown={n.body} className="mt-1 font-sans text-sm" />
              <p className="mt-1 text-[11px] text-muted-foreground">Updated {relativeTime(n.updated_at)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No notes for this lesson yet. Notes are private to you.</p>
      )}
      <Link to="/notes" className="text-xs font-medium text-primary hover:underline">
        Open My Notes
      </Link>
    </div>
  )
}
