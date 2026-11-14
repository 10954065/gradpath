// The official University timetable (shared, admin-managed) and each student's private attendance choices.
import { z } from 'zod'
import { ensureOk } from '@/lib/errors'
import type { Allocation, AttendanceStatus, CsvSession, EntryStatus, OfficialSession } from '@/lib/officialTimetable'
import type { PlannedBlock } from '@/lib/studyStrategy'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'

export const OFFICIAL_TIMETABLE_KEY = ['official-timetable'] as const
export const ATTENDANCE_KEY = ['timetable-attendance'] as const

export interface TimetableSource {
  id: string
  slug: string
  title: string
  institution: string
  department: string
  programme: string
  programme_code: string
  academic_year: string
  semester: string
  time_zone: string
  source_url: string | null
  source_note: string
  version: number
  revision: number
  is_current: boolean
  published_at: string
  last_updated_at: string
}

export interface OfficialTimetable {
  source: TimetableSource
  sessions: OfficialSession[]
}

interface EntryRow {
  id: string
  source_id: string
  course_id: string
  day_of_week: number
  start_time: string
  end_time: string
  venue: string
  status: EntryStatus
  allocation: Allocation
  allocation_note: string
  notes: string
  sort_order: number
  updated_at: string
  courses: { code: string; title: string; slug: string; accent: string; classification: string; credit_slots: number } | null
}

const ENTRY_SELECT = '*, courses(code, title, slug, accent, classification, credit_slots)'

function toSession(row: EntryRow): OfficialSession {
  return {
    id: row.id,
    sourceId: row.source_id,
    courseId: row.course_id,
    code: row.courses?.code ?? '',
    title: row.courses?.title ?? '',
    slug: row.courses?.slug ?? '',
    accent: row.courses?.accent ?? '',
    classification: row.courses?.classification ?? '',
    creditSlots: row.courses?.credit_slots ?? 0,
    dayOfWeek: row.day_of_week,
    start: row.start_time.slice(0, 5),
    end: row.end_time.slice(0, 5),
    venue: row.venue,
    status: row.status,
    allocation: row.allocation,
    allocationNote: row.allocation_note,
    notes: row.notes,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
}

async function currentSource(): Promise<TimetableSource | null> {
  const result = await supabase.from('timetable_sources').select('*').eq('is_current', true).order('published_at', { ascending: false }).limit(1)
  const rows = ensureOk(result, 'We could not load the official timetable.') as TimetableSource[]
  return rows[0] ?? null
}

/** The current official timetable with its sessions (cancelled ones included, removed ones hidden by RLS). */
export function getOfficialTimetable(): Promise<OfficialTimetable | null> {
  return withOfflineCache('official-timetable', async () => {
    const source = await currentSource()
    if (!source) return null
    const result = await supabase.from('timetable_entries').select(ENTRY_SELECT).eq('source_id', source.id).neq('status', 'removed')
    const rows = ensureOk(result, 'We could not load the official timetable.') as EntryRow[]
    return { source, sessions: rows.map(toSession) }
  })
}

// ---------------------------------------------------------------------------
// Private attendance choices
// ---------------------------------------------------------------------------
export async function listAttendance(): Promise<Map<string, AttendanceStatus>> {
  const rows = await withOfflineCache('timetable-attendance', async () => {
    const result = await supabase.from('timetable_attendance').select('entry_id, status')
    return ensureOk(result, 'We could not load your attendance choices.') as { entry_id: string; status: AttendanceStatus }[]
  })
  return new Map(rows.map((r) => [r.entry_id, r.status]))
}

export async function setAttendance(userId: string, entryIds: readonly string[], status: AttendanceStatus): Promise<void> {
  if (!entryIds.length) return
  ensureOk(
    await supabase
      .from('timetable_attendance')
      .upsert(entryIds.map((entry_id) => ({ user_id: userId, entry_id, status })), { onConflict: 'user_id,entry_id' }),
    'We could not save your attendance choice.',
  )
}

// ---------------------------------------------------------------------------
// Timetable preferences
// ---------------------------------------------------------------------------
export interface TimetablePreferences {
  lecture_reminders: boolean
  reminder_lead_minutes: number
  same_day_summary: boolean
  change_alerts: boolean
  show_only_confirmed: boolean
}

export const DEFAULT_TIMETABLE_PREFERENCES: TimetablePreferences = {
  lecture_reminders: true,
  reminder_lead_minutes: 60,
  same_day_summary: true,
  change_alerts: true,
  show_only_confirmed: false,
}

export async function getTimetablePreferences(): Promise<TimetablePreferences> {
  const result = await supabase
    .from('timetable_preferences')
    .select('lecture_reminders, reminder_lead_minutes, same_day_summary, change_alerts, show_only_confirmed')
    .maybeSingle()
  const row = ensureOk(result, 'We could not load your timetable preferences.') as TimetablePreferences | null
  return row ?? DEFAULT_TIMETABLE_PREFERENCES
}

export async function saveTimetablePreferences(userId: string, patch: Partial<TimetablePreferences>): Promise<TimetablePreferences> {
  const current = await getTimetablePreferences()
  const next = { ...current, ...patch }
  ensureOk(await supabase.from('timetable_preferences').upsert({ user_id: userId, ...next }), 'We could not save your timetable preferences.')
  return next
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export interface TimetableChange {
  id: string
  entry_id: string | null
  change_type: 'imported' | 'added' | 'updated' | 'rescheduled' | 'cancelled' | 'removed' | 'restored'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string
  changed_at: string
  publication_id: string | null
}

export interface TimetablePublication {
  id: string
  revision: number
  summary: string
  changes: number
  notified: number
  published_at: string
}

/** Changes visible to the signed-in user: students see published ones, administrators also see pending ones. */
export async function listChanges(sourceId: string): Promise<TimetableChange[]> {
  const result = await supabase
    .from('timetable_entry_changes')
    .select('id, entry_id, change_type, before, after, reason, changed_at, publication_id')
    .eq('source_id', sourceId)
    .neq('change_type', 'imported')
    .order('changed_at', { ascending: false })
    .limit(200)
  return ensureOk(result, 'We could not load the timetable history.') as TimetableChange[]
}

export async function listPublications(sourceId: string): Promise<TimetablePublication[]> {
  const result = await supabase
    .from('timetable_publications')
    .select('id, revision, summary, changes, notified, published_at')
    .eq('source_id', sourceId)
    .order('published_at', { ascending: false })
    .limit(50)
  return ensureOk(result, 'We could not load the timetable publications.') as TimetablePublication[]
}

// ---------------------------------------------------------------------------
// Administration (enforced by RLS and the SECURITY DEFINER functions, not by the UI)
// ---------------------------------------------------------------------------
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const entrySchema = z
  .object({
    course_id: z.string().uuid('Choose a course'),
    day_of_week: z.coerce.number<number>().int().min(0).max(6),
    start_time: z.string().regex(TIME, 'Choose a start time'),
    end_time: z.string().regex(TIME, 'Choose an end time'),
    venue: z.string().trim().max(120),
    status: z.enum(['scheduled', 'rescheduled', 'cancelled', 'removed']),
    allocation: z.enum(['pending_confirmation', 'all_students', 'group_specific']),
    allocation_note: z.string().trim().max(500),
    notes: z.string().trim().max(1000),
    change_reason: z.string().trim().min(3, 'Say why this change is being made').max(500),
  })
  .refine((v) => v.end_time > v.start_time, { path: ['end_time'], message: 'End time must be after the start time' })
export type EntryInput = z.infer<typeof entrySchema>

/** Every session of a version, removed ones included (administrators only). */
export async function adminListEntries(sourceId: string): Promise<OfficialSession[]> {
  const result = await supabase.from('timetable_entries').select(ENTRY_SELECT).eq('source_id', sourceId)
  return (ensureOk(result, 'We could not load the timetable sessions.') as EntryRow[]).map(toSession)
}

export async function saveEntry(sourceId: string, input: EntryInput, existingId?: string): Promise<void> {
  const values = entrySchema.parse(input)
  const result = existingId
    ? await supabase.from('timetable_entries').update(values).eq('id', existingId).select('id')
    : await supabase.from('timetable_entries').insert({ ...values, source_id: sourceId }).select('id')
  const rows = ensureOk(result, 'We could not save the session.') as { id: string }[]
  if (!rows.length) throw new Error('Only administrators can change the official timetable.')
}

export async function publishChanges(sourceId: string, summary: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_timetable_changes', { p_source_id: sourceId, p_summary: summary })
  ensureOk({ data, error }, 'We could not publish the changes.')
  return typeof data === 'number' ? data : 0
}

export interface SourceInput {
  slug: string
  title: string
  academic_year: string
  semester: string
  programme_code: string
  source_url: string
  source_note: string
}

export async function importVersion(source: SourceInput, sessions: readonly CsvSession[], notify: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('import_timetable_version', { p_source: source, p_entries: sessions, p_notify: notify })
  ensureOk({ data, error }, 'We could not import the revised timetable.')
  return String(data)
}

export async function updateSource(id: string, patch: Pick<TimetableSource, 'source_url' | 'source_note' | 'title'>): Promise<void> {
  const result = await supabase.from('timetable_sources').update(patch).eq('id', id).select('id')
  const rows = ensureOk(result, 'We could not save the source details.') as { id: string }[]
  if (!rows.length) throw new Error('Only administrators can change the official timetable.')
}

// ---------------------------------------------------------------------------
// Personal study plan built around the lectures
// ---------------------------------------------------------------------------
/** Replace the provisional study blocks with a new plan. The student's own blocks and all sessions are kept. */
export async function replaceStudyPlan(userId: string, blocks: readonly PlannedBlock[]): Promise<void> {
  ensureOk(
    await supabase.from('timetable_events').delete().eq('is_provisional', true).neq('kind', 'lecture'),
    'We could not replace the provisional study blocks.',
  )
  if (!blocks.length) return
  ensureOk(
    await supabase.from('timetable_events').insert(
      blocks.map((b) => ({
        user_id: userId,
        course_id: b.courseId,
        title: b.title,
        kind: b.kind,
        recurrence: 'weekly',
        day_of_week: b.dayOfWeek,
        start_time: b.start,
        end_time: b.end,
        is_provisional: true,
        notes: b.notes,
      })),
    ),
    'We could not save the new study plan.',
  )
}
