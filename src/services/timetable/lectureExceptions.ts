// The student's private one-off changes to single lectures (lecture_exceptions).
import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import type { LectureException } from '@/lib/officialTimetable'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'

export const LECTURE_EXCEPTIONS_KEY = ['lecture-exceptions'] as const

interface ExceptionRow extends Omit<LectureException, 'moved_start' | 'moved_end'> {
  moved_start: string | null
  moved_end: string | null
}

const COLUMNS = 'id, entry_id, held_on, status, moved_date, moved_start, moved_end, moved_venue, note'
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null)

export function listLectureExceptions(): Promise<LectureException[]> {
  return withOfflineCache('lecture-exceptions', async () => {
    const result = await supabase.from('lecture_exceptions').select(COLUMNS).order('held_on')
    const rows = ensureOk(result, 'We could not load your lecture changes.') as ExceptionRow[]
    return rows.map((r) => ({ ...r, moved_start: hhmm(r.moved_start), moved_end: hhmm(r.moved_end) }))
  })
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

export const exceptionSchema = z
  .object({
    entry_id: z.string().uuid('Choose the lecture'),
    held_on: z.string().regex(DATE, 'Choose the week'),
    status: z.enum(['cancelled', 'moved']),
    moved_date: z.string(),
    moved_start: z.string(),
    moved_end: z.string(),
    moved_venue: z.string().trim().max(120),
    note: z.string().trim().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'moved') return
    if (!DATE.test(v.moved_date)) ctx.addIssue({ code: 'custom', path: ['moved_date'], message: 'Choose the new day' })
    if (!TIME.test(v.moved_start)) ctx.addIssue({ code: 'custom', path: ['moved_start'], message: 'Choose the new start time' })
    if (!TIME.test(v.moved_end)) ctx.addIssue({ code: 'custom', path: ['moved_end'], message: 'Choose the new end time' })
    else if (TIME.test(v.moved_start) && v.moved_end <= v.moved_start) ctx.addIssue({ code: 'custom', path: ['moved_end'], message: 'The end must be after the start' })
  })

export type ExceptionInput = z.infer<typeof exceptionSchema>

/** Records a change for one lecture and week, replacing any earlier change for the same week. */
export async function saveLectureException(userId: string, input: ExceptionInput): Promise<void> {
  const v = exceptionSchema.parse(input)
  const moved = v.status === 'moved'
  ensureOk(
    await supabase.from('lecture_exceptions').upsert(
      {
        user_id: userId,
        entry_id: v.entry_id,
        held_on: v.held_on,
        status: v.status,
        moved_date: moved ? v.moved_date : null,
        moved_start: moved ? v.moved_start : null,
        moved_end: moved ? v.moved_end : null,
        moved_venue: moved ? v.moved_venue : '',
        note: v.note,
      },
      { onConflict: 'user_id,entry_id,held_on' },
    ),
    'We could not save this change.',
  )
}

export async function deleteLectureException(id: string): Promise<void> {
  ensureOk(await supabase.from('lecture_exceptions').delete().eq('id', id), 'We could not remove this change.')
}
