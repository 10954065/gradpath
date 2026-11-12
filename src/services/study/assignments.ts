import { z } from 'zod'
import { AppError, ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/utils'
import { withOfflineCache } from '@/services/offline/cache'
import { writeOrQueue } from '@/services/offline/sync'
import type { Assignment } from '@/types/database'

export const assignmentSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().max(20000),
  course_id: z.string().uuid().nullable(),
  due_at: z.string().nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['not_started', 'in_progress', 'submitted', 'completed']),
  notes: z.string().max(20000),
})
export type AssignmentInput = z.infer<typeof assignmentSchema>

export function listAssignments(): Promise<Assignment[]> {
  return withOfflineCache('assignments', async () => {
    const result = await supabase.from('assignments').select('*').order('due_at', { ascending: true, nullsFirst: false })
    return ensureOk(result, 'We could not load your assignments.') as Assignment[]
  })
}

export async function saveAssignment(userId: string, input: AssignmentInput, existing?: Assignment): Promise<Assignment> {
  const parsed = assignmentSchema.parse(input)
  const id = existing?.id ?? newId()
  await writeOrQueue(userId, {
    table: 'assignments',
    op: 'upsert',
    match: { id },
    payload: { ...parsed, user_id: userId, attachment_paths: existing?.attachment_paths ?? [] },
    baseUpdatedAt: existing?.updated_at ?? null,
  })
  const now = new Date().toISOString()
  return {
    id,
    user_id: userId,
    attachment_paths: existing?.attachment_paths ?? [],
    submitted_at: existing?.submitted_at ?? null,
    completed_at: existing?.completed_at ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    ...parsed,
  }
}

export async function deleteAssignment(userId: string, assignmentId: string): Promise<void> {
  await writeOrQueue(userId, { table: 'assignments', op: 'delete', match: { id: assignmentId } })
}

const ATTACHMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/png',
  'image/jpeg',
]
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Upload a private attachment (stored in the student's own folder; requires a connection). */
export async function addAttachment(userId: string, assignment: Assignment, file: File): Promise<string[]> {
  if (!ATTACHMENT_TYPES.includes(file.type)) throw new AppError('Attach a PDF, Word, PowerPoint, text or image file.')
  if (file.size > MAX_ATTACHMENT_BYTES) throw new AppError('Attachments must be 10 MB or smaller.')
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120)
  const path = `${userId}/${assignment.id}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('assignment-files').upload(path, file, { contentType: file.type })
  if (error) throw new AppError('We could not upload the attachment.', { cause: error })
  const paths = [...assignment.attachment_paths, path]
  ensureOk(await supabase.from('assignments').update({ attachment_paths: paths }).eq('id', assignment.id), 'We could not save the attachment.')
  return paths
}

export async function removeAttachment(assignment: Assignment, path: string): Promise<string[]> {
  await supabase.storage.from('assignment-files').remove([path])
  const paths = assignment.attachment_paths.filter((p) => p !== path)
  ensureOk(await supabase.from('assignments').update({ attachment_paths: paths }).eq('id', assignment.id))
  return paths
}

export async function attachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('assignment-files').createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}

export type AssignmentBucket = 'overdue' | 'upcoming' | 'no_date' | 'done'

export function bucketOf(a: Pick<Assignment, 'status' | 'due_at'>, now = new Date()): AssignmentBucket {
  if (a.status === 'completed' || a.status === 'submitted') return 'done'
  if (!a.due_at) return 'no_date'
  return new Date(a.due_at) < now ? 'overdue' : 'upcoming'
}
