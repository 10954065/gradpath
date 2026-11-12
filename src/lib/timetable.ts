import type { StudySession, TimetableEvent } from '@/types/database'

/** One concrete calendar entry: a timetable occurrence (possibly overridden by a session) or a one-off session. */
export interface PlannerEntry {
  key: string
  title: string
  courseId: string | null
  kind: TimetableEvent['kind']
  start: Date
  end: Date
  date: string
  event: TimetableEvent | null
  session: StudySession | null
  status: StudySession['status']
  isProvisional: boolean
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function at(date: string, time: string): Date {
  const [h = '0', m = '0'] = time.split(':')
  const d = new Date(`${date}T00:00:00`)
  d.setHours(Number(h), Number(m), 0, 0)
  return d
}

/** Dates (yyyy-MM-dd) from start to end inclusive. */
export function dateRange(start: Date, end: Date): string[] {
  const out: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor <= last) {
    out.push(toIsoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** Does a timetable event occur on this date? */
export function occursOn(event: TimetableEvent, date: string): boolean {
  if (event.starts_on && date < event.starts_on) return false
  if (event.ends_on && date > event.ends_on) return false
  if (event.recurrence === 'once') return event.event_date === date
  return new Date(`${date}T00:00:00`).getDay() === event.day_of_week
}

/**
 * Expand recurring events into dated entries and merge study sessions. A session linked to an occurrence
 * replaces it (completed, skipped, cancelled or rescheduled); unlinked sessions appear as one-off entries.
 */
export function buildPlanner(events: TimetableEvent[], sessions: StudySession[], start: Date, end: Date): PlannerEntry[] {
  const days = dateRange(start, end)
  const linked = new Map(sessions.filter((s) => s.timetable_event_id && s.occurrence_date).map((s) => [`${s.timetable_event_id}|${s.occurrence_date}`, s]))
  const entries: PlannerEntry[] = []

  for (const date of days) {
    for (const event of events) {
      if (!occursOn(event, date)) continue
      const session = linked.get(`${event.id}|${date}`) ?? null
      entries.push({
        key: `${event.id}|${date}`,
        title: session?.title ?? event.title,
        courseId: session?.course_id ?? event.course_id,
        kind: event.kind,
        start: session ? new Date(session.planned_start) : at(date, event.start_time),
        end: session ? new Date(session.planned_end) : at(date, event.end_time),
        date,
        event,
        session,
        status: session?.status ?? 'planned',
        isProvisional: event.is_provisional,
      })
    }
  }

  const first = days[0] ?? ''
  const lastDay = days[days.length - 1] ?? ''
  for (const s of sessions) {
    if (s.timetable_event_id && s.occurrence_date) continue
    const date = toIsoDate(new Date(s.planned_start))
    if (date < first || date > lastDay) continue
    entries.push({
      key: s.id,
      title: s.title,
      courseId: s.course_id,
      kind: 'study',
      start: new Date(s.planned_start),
      end: new Date(s.planned_end),
      date,
      event: null,
      session: s,
      status: s.status,
      isProvisional: false,
    })
  }
  return entries.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function durationMinutes(entry: Pick<PlannerEntry, 'start' | 'end'>): number {
  return Math.max(0, Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000))
}

export interface StudyTotals {
  plannedMinutes: number
  completedMinutes: number
  completedSessions: number
}

/** Planned study time excludes cancelled/skipped entries; completed time uses the recorded actual minutes. */
export function studyTotals(entries: PlannerEntry[]): StudyTotals {
  let plannedMinutes = 0
  let completedMinutes = 0
  let completedSessions = 0
  for (const e of entries) {
    if (e.kind === 'lecture') continue
    if (e.status !== 'cancelled' && e.status !== 'skipped') plannedMinutes += durationMinutes(e)
    if (e.status === 'completed') {
      completedMinutes += e.session?.actual_minutes ?? durationMinutes(e)
      completedSessions += 1
    }
  }
  return { plannedMinutes, completedMinutes, completedSessions }
}
