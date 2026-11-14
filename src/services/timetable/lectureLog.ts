// The student's private after-lecture check-ins (lecture_logs).
import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import type { LectureLog } from '@/lib/lectureLog'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'

export const LECTURE_LOGS_KEY = ['lecture-logs'] as const

const COLUMNS = 'id, entry_id, course_id, held_on, attendance, covered_lesson_ids, review_lesson_ids, note, updated_at'

export const checkInSchema = z
  .object({
    entry_id: z.string().uuid(),
    held_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the day of the lecture'),
    attendance: z.enum(['attended', 'missed', 'cancelled']),
    covered_lesson_ids: z.array(z.string().uuid()).max(40, 'Choose at most 40 lessons'),
    review_lesson_ids: z.array(z.string().uuid()).max(40),
    note: z.string().trim().max(5000, 'Keep the note under 5,000 characters'),
  })
  .refine((v) => v.review_lesson_ids.every((id) => v.covered_lesson_ids.includes(id)), {
    message: 'Only lessons the lecture covered can be marked for review',
    path: ['review_lesson_ids'],
  })

export type CheckInInput = z.infer<typeof checkInSchema>

export function listLectureLogs(): Promise<LectureLog[]> {
  return withOfflineCache('lecture-logs', async () => {
    const result = await supabase.from('lecture_logs').select(COLUMNS).order('held_on', { ascending: false })
    return ensureOk(result, 'We could not load your lecture check-ins.') as LectureLog[]
  })
}

/** Saves a check-in; a second check-in for the same lecture and day replaces the first. */
export async function saveLectureLog(userId: string, input: CheckInInput): Promise<LectureLog> {
  const values = checkInSchema.parse(input)
  const cancelled = values.attendance === 'cancelled'
  const result = await supabase
    .from('lecture_logs')
    .upsert(
      {
        ...values,
        user_id: userId,
        covered_lesson_ids: cancelled ? [] : values.covered_lesson_ids,
        review_lesson_ids: cancelled ? [] : values.review_lesson_ids,
      },
      { onConflict: 'user_id,entry_id,held_on' },
    )
    .select(COLUMNS)
    .single()
  return ensureOk(result, 'We could not save your check-in.') as LectureLog
}

export async function deleteLectureLog(logId: string): Promise<void> {
  ensureOk(await supabase.from('lecture_logs').delete().eq('id', logId), 'We could not delete this check-in.')
}
