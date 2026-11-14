// Timetable events and study sessions (offline-safe writes).
import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/utils'
import { withOfflineCache } from '@/services/offline/cache'
import { writeOrQueue } from '@/services/offline/sync'
import type { StudySession, TimetableEvent } from '@/types/database'

export const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title').max(200),
    course_id: z.string().uuid().nullable(),
    kind: z.enum(['study', 'lecture', 'revision', 'other']),
    recurrence: z.enum(['weekly', 'once']),
    day_of_week: z.coerce.number<number>().int().min(0).max(6).nullable(),
    event_date: z.string().nullable(),
    start_time: z.string().regex(/^\d{2}:\d{2}/, 'Choose a start time'),
    end_time: z.string().regex(/^\d{2}:\d{2}/, 'Choose an end time'),
    location: z.string().max(200),
    notes: z.string().max(2000),
    /** Lectures only: the class allocation is not confirmed yet. Stored as is_provisional on lecture rows. */
    awaiting_confirmation: z.boolean(),
  })
  .refine((v) => v.end_time > v.start_time, { path: ['end_time'], message: 'End time must be after the start time' })
  .refine((v) => (v.recurrence === 'weekly' ? v.day_of_week !== null : Boolean(v.event_date)), {
    path: ['event_date'],
    message: 'Choose a day for this event',
  })
export type EventInput = z.infer<typeof eventSchema>

export function listEvents(): Promise<TimetableEvent[]> {
  return withOfflineCache('timetable', async () => {
    const result = await supabase.from('timetable_events').select('*').order('day_of_week').order('start_time')
    return ensureOk(result, 'We could not load your timetable.') as TimetableEvent[]
  })
}

export async function saveEvent(userId: string, input: EventInput, existing?: TimetableEvent): Promise<void> {
  const { awaiting_confirmation: awaitingConfirmation, ...parsed } = eventSchema.parse(input)
  await writeOrQueue(userId, {
    table: 'timetable_events',
    op: 'upsert',
    match: { id: existing?.id ?? newId() },
    payload: {
      ...parsed,
      day_of_week: parsed.recurrence === 'weekly' ? parsed.day_of_week : null,
      event_date: parsed.recurrence === 'once' ? parsed.event_date : null,
      user_id: userId,
      // A study block the student creates or edits is their own, not part of the provisional plan. For a lecture the
      // flag means "awaiting confirmation" of the official class allocation.
      is_provisional: parsed.kind === 'lecture' ? awaitingConfirmation : false,
    },
    baseUpdatedAt: existing?.updated_at ?? null,
  })
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  await writeOrQueue(userId, { table: 'timetable_events', op: 'delete', match: { id: eventId } })
}

/** Remove the provisional study blocks. Lectures awaiting confirmation are the student's own entries and are kept. */
export async function deleteProvisionalEvents(): Promise<void> {
  ensureOk(
    await supabase.from('timetable_events').delete().eq('is_provisional', true).neq('kind', 'lecture'),
    'We could not remove the provisional study blocks.',
  )
}

export async function restoreProvisionalTimetable(): Promise<number> {
  const { data, error } = await supabase.rpc('seed_default_timetable')
  ensureOk({ data, error }, 'We could not create the provisional timetable.')
  return typeof data === 'number' ? data : 0
}

export function listSessions(fromIso: string, toIso: string): Promise<StudySession[]> {
  return withOfflineCache(`sessions:${fromIso}:${toIso}`, async () => {
    const result = await supabase
      .from('study_sessions')
      .select('*')
      .gte('planned_start', fromIso)
      .lte('planned_start', toIso)
      .order('planned_start')
    return ensureOk(result, 'We could not load your study sessions.') as StudySession[]
  })
}

export interface SessionInput {
  id?: string
  title: string
  courseId: string | null
  start: Date
  end: Date
  status: StudySession['status']
  actualMinutes?: number | null
  notes?: string
  timetableEventId?: string | null
  occurrenceDate?: string | null
}

/**
 * Create or update a session. Occurrence sessions are keyed by (event, date), so marking the same
 * occurrence complete twice — including from an offline replay — updates one row instead of duplicating it.
 */
export async function saveSession(userId: string, input: SessionInput, existing?: StudySession | null): Promise<void> {
  if (input.end <= input.start) throw new Error('The session must end after it starts.')
  const linked = Boolean(input.timetableEventId && input.occurrenceDate)
  const id = existing?.id ?? input.id ?? newId()
  await writeOrQueue(userId, {
    table: 'study_sessions',
    op: 'upsert',
    match: linked && !existing ? { timetable_event_id: input.timetableEventId as string, occurrence_date: input.occurrenceDate as string } : { id },
    payload: {
      id,
      user_id: userId,
      title: input.title.slice(0, 200),
      course_id: input.courseId,
      planned_start: input.start.toISOString(),
      planned_end: input.end.toISOString(),
      status: input.status,
      actual_minutes: input.status === 'completed' ? (input.actualMinutes ?? null) : null,
      notes: input.notes ?? existing?.notes ?? '',
      timetable_event_id: input.timetableEventId ?? null,
      occurrence_date: input.occurrenceDate ?? null,
    },
    baseUpdatedAt: existing?.updated_at ?? null,
    onConflict: linked && !existing ? 'timetable_event_id,occurrence_date' : 'id',
  })
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await writeOrQueue(userId, { table: 'study_sessions', op: 'delete', match: { id: sessionId } })
}
