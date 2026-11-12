import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/utils'
import { withOfflineCache } from '@/services/offline/cache'
import { writeOrQueue } from '@/services/offline/sync'
import type { StudentNote } from '@/types/database'

export const noteSchema = z.object({
  title: z.string().trim().max(200, 'Keep the title under 200 characters'),
  body: z.string().max(100_000, 'This note is too long'),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  course_id: z.string().uuid().nullable(),
  module_id: z.string().uuid().nullable(),
  lesson_id: z.string().uuid().nullable(),
  is_pinned: z.boolean(),
})
export type NoteInput = z.infer<typeof noteSchema>

export function listNotes(): Promise<StudentNote[]> {
  return withOfflineCache('notes', async () => {
    const result = await supabase
      .from('student_notes')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    return ensureOk(result, 'We could not load your notes.') as StudentNote[]
  })
}

/** Create or update a note (offline-safe). Returns the note as it will exist once synced. */
export async function saveNote(userId: string, input: NoteInput, existing?: StudentNote): Promise<StudentNote> {
  const parsed = noteSchema.parse(input)
  const id = existing?.id ?? newId()
  const now = new Date().toISOString()
  await writeOrQueue(userId, {
    table: 'student_notes',
    op: 'upsert',
    match: { id },
    payload: { ...parsed, user_id: userId },
    baseUpdatedAt: existing?.updated_at ?? null,
  })
  return { id, user_id: userId, created_at: existing?.created_at ?? now, updated_at: now, ...parsed }
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  await writeOrQueue(userId, { table: 'student_notes', op: 'delete', match: { id: noteId } })
}

/** Filter notes by free text (title, body, tags) — instant client-side search that also works offline. */
export function filterNotes(notes: StudentNote[], query: string): StudentNote[] {
  const q = query.trim().toLowerCase()
  if (!q) return notes
  return notes.filter(
    (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)),
  )
}

/** Markdown export of the student's own notes (generated in the browser; never uploaded anywhere). */
export function notesToMarkdown(notes: StudentNote[], label: (n: StudentNote) => string): string {
  const header = `# My GradPath notes\n\nExported ${new Date().toLocaleString('en-GB')}\n`
  const body = notes
    .map((n) => {
      const context = label(n)
      const tags = n.tags.length ? `\n_Tags: ${n.tags.join(', ')}_` : ''
      return `## ${n.title || 'Untitled note'}\n\n${context ? `_${context}_  \n` : ''}_Last updated ${new Date(n.updated_at).toLocaleString('en-GB')}_${tags}\n\n${n.body}\n`
    })
    .join('\n---\n\n')
  return `${header}\n${body}`
}
