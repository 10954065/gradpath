// The student's private official marks per course (course_marks).
import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import type { MarkComponent } from '@/lib/grades'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'

export const COURSE_MARKS_KEY = ['course-marks'] as const

export interface CourseMark {
  id: string
  course_id: string
  title: string
  component: MarkComponent
  weight_percent: number
  score: number | null
  max_score: number
  recorded_on: string | null
  note: string
}

interface MarkRow extends Omit<CourseMark, 'weight_percent' | 'score' | 'max_score'> {
  weight_percent: string | number
  score: string | number | null
  max_score: string | number
}

const COLUMNS = 'id, course_id, title, component, weight_percent, score, max_score, recorded_on, note'

/** Postgres numerics arrive as strings. */
function toMark(row: MarkRow): CourseMark {
  return { ...row, weight_percent: Number(row.weight_percent), score: row.score === null ? null : Number(row.score), max_score: Number(row.max_score) }
}

const optionalNumber = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().min(0, 'Enter 0 or more').nullable())

export const markSchema = z
  .object({
    course_id: z.string().uuid('Choose a course'),
    title: z.string().trim().min(1, 'Name the assessment, for example "Mid-semester test"').max(120),
    component: z.enum(['coursework', 'examination']),
    weight_percent: z.coerce.number({ message: 'Enter the weight' }).gt(0, 'Enter a weight above 0').max(100, 'A weight cannot exceed 100%'),
    score: optionalNumber,
    max_score: z.coerce.number({ message: 'Enter what the mark is out of' }).gt(0, 'Enter a number above 0'),
    recorded_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Enter a date').optional(),
    note: z.string().trim().max(500),
  })
  .refine((v) => v.score === null || v.score <= v.max_score, { message: 'The mark cannot be more than it is out of', path: ['score'] })

export type MarkInput = z.input<typeof markSchema>

export function listCourseMarks(): Promise<CourseMark[]> {
  return withOfflineCache('course-marks', async () => {
    const result = await supabase.from('course_marks').select(COLUMNS).order('created_at')
    return (ensureOk(result, 'We could not load your marks.') as MarkRow[]).map(toMark)
  })
}

export async function saveCourseMark(userId: string, input: MarkInput, existingId?: string): Promise<CourseMark> {
  const values = markSchema.parse(input)
  const row = { ...values, recorded_on: values.recorded_on || null, user_id: userId }
  const result = existingId
    ? await supabase.from('course_marks').update(row).eq('id', existingId).select(COLUMNS).single()
    : await supabase.from('course_marks').insert(row).select(COLUMNS).single()
  return toMark(ensureOk(result, 'We could not save this mark.') as MarkRow)
}

export async function deleteCourseMark(markId: string): Promise<void> {
  ensureOk(await supabase.from('course_marks').delete().eq('id', markId), 'We could not delete this mark.')
}
