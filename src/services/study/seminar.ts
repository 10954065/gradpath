import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'
import type { SeminarPresentation, SeminarStatus } from '@/types/database'

/** The seminar course gets the personal seminar tracker. */
export const SEMINAR_COURSE_CODE = 'CSIT 610'

export const SEMINAR_STATUSES = ['exploring', 'researching', 'drafting', 'rehearsing', 'presented'] as const satisfies readonly SeminarStatus[]
export const SEMINAR_STATUS_LABEL: Record<SeminarStatus, string> = {
  exploring: 'Exploring the topic',
  researching: 'Reading and researching',
  drafting: 'Drafting the presentation',
  rehearsing: 'Rehearsing',
  presented: 'Presented',
}

/** Preparation steps, following the CSIT 610 lessons. Progress is the share of steps the student has ticked. */
export const SEMINAR_STEPS = [
  { key: 'topic', label: 'Topic chosen and scoped' },
  { key: 'question', label: 'Focus question or argument written' },
  { key: 'sources', label: 'Key sources found, read and evaluated' },
  { key: 'outline', label: 'Presentation outline drafted' },
  { key: 'slides', label: 'Slides or handout prepared' },
  { key: 'references', label: 'References and citations checked' },
  { key: 'rehearsal', label: 'Rehearsed and timed' },
  { key: 'questions', label: 'Likely questions prepared' },
] as const
const STEP_KEYS = SEMINAR_STEPS.map((s) => s.key) as [string, ...string[]]

export const seminarSchema = z.object({
  topic: z.string().trim().min(3, 'Enter the seminar topic (at least 3 characters)').max(300),
  status: z.enum(SEMINAR_STATUSES),
  presentation_date: z.string().nullable(),
  date_confirmed: z.boolean(),
  checklist: z.array(z.enum(STEP_KEYS)).max(SEMINAR_STEPS.length),
  feedback: z.string().max(10000),
  notes: z.string().max(10000),
})
export type SeminarInput = z.infer<typeof seminarSchema>

export function preparationPercent(checklist: readonly string[]): number {
  const done = SEMINAR_STEPS.filter((s) => checklist.includes(s.key)).length
  return Math.round((done / SEMINAR_STEPS.length) * 100)
}

export function listSeminars(): Promise<SeminarPresentation[]> {
  return withOfflineCache('seminars', async () => {
    const result = await supabase
      .from('seminar_presentations')
      .select('*')
      .order('presentation_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    return ensureOk(result, 'We could not load your seminar tracker.') as SeminarPresentation[]
  })
}

export async function saveSeminar(courseId: string | null, input: SeminarInput, existingId?: string): Promise<void> {
  const row = { ...seminarSchema.parse(input), course_id: courseId }
  const result = existingId
    ? await supabase.from('seminar_presentations').update(row).eq('id', existingId)
    : await supabase.from('seminar_presentations').insert(row)
  ensureOk(result, 'We could not save this seminar entry.')
}

export async function deleteSeminar(id: string): Promise<void> {
  ensureOk(await supabase.from('seminar_presentations').delete().eq('id', id), 'We could not delete this seminar entry.')
}
