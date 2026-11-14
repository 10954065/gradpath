// The official University timetable: pure helpers shared by the timetable pages, the planner and the tests.
// Published times are Ghana local time (Africa/Accra, GMT all year) and are shown as published, whatever the
// time zone of the device.
import type { PlannerEntry } from './timetable'
import { dateRange } from './timetable'

export const GHANA_TIME_ZONE = 'Africa/Accra'

/** Indexed by day_of_week (0 = Sunday … 6 = Saturday), as stored. */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
/** Monday-first, as the University publishes the week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export type EntryStatus = 'scheduled' | 'rescheduled' | 'cancelled' | 'removed'
export type Allocation = 'pending_confirmation' | 'all_students' | 'group_specific'
export type AttendanceStatus = 'awaiting' | 'confirmed' | 'not_assigned' | 'cancelled'

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ['awaiting', 'confirmed', 'not_assigned', 'cancelled']
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  awaiting: 'Awaiting confirmation',
  confirmed: 'Confirmed for my class',
  not_assigned: 'Not assigned to my class',
  cancelled: 'Cancelled or rescheduled',
}
export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  scheduled: 'Scheduled',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  removed: 'Removed',
}
export const ALLOCATION_LABEL: Record<Allocation, string> = {
  pending_confirmation: 'Attendance allocation pending confirmation',
  all_students: 'Confirmed for all ITB students',
  group_specific: 'Specific student group',
}

/** One published session joined with its course (from the central course record). */
export interface OfficialSession {
  id: string
  sourceId: string
  courseId: string
  code: string
  title: string
  slug: string
  accent: string
  classification: string
  creditSlots: number
  dayOfWeek: number
  start: string
  end: string
  venue: string
  status: EntryStatus
  allocation: Allocation
  allocationNote: string
  notes: string
  sortOrder: number
  updatedAt: string
}

export type AttendanceMap = ReadonlyMap<string, AttendanceStatus>

export const attendanceOf = (map: AttendanceMap, entryId: string): AttendanceStatus => map.get(entryId) ?? 'awaiting'

/**
 * The student's choices with the confirmed allocation filled in: a session confirmed for all students counts as
 * confirmed until the student records otherwise. Matches lecture_reminder_core on the server.
 */
export function effectiveAttendance(sessions: readonly Pick<OfficialSession, 'id' | 'allocation'>[], choices: AttendanceMap): AttendanceMap {
  const merged = new Map(choices)
  for (const s of sessions) if (s.allocation === 'all_students' && !merged.has(s.id)) merged.set(s.id, 'confirmed')
  return merged
}

export function dayFromName(name: string): number | null {
  const index = DAY_NAMES.findIndex((d) => d.toLowerCase() === name.trim().toLowerCase())
  return index < 0 ? null : index
}

/** "19:30" or "19:30:00" -> minutes since midnight. */
export function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':')
  return Number(h) * 60 + Number(m)
}

export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "19:30" -> "7:30 pm", the way the University publishes times. */
export function ghanaClock(time: string): string {
  const total = toMinutes(time)
  const h = Math.floor(total / 60)
  const m = total % 60
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export const ghanaRange = (start: string, end: string): string => `${ghanaClock(start)} – ${ghanaClock(end)}`

/** "CSIT 601 Monday 7:30 pm – 9:30 pm", for accessible names. */
export function sessionLabel(s: Pick<OfficialSession, 'code' | 'dayOfWeek' | 'start' | 'end'>): string {
  return `${s.code} ${DAY_NAMES[s.dayOfWeek]} ${ghanaRange(s.start, s.end)}`
}

/** Every session links to its course page in the central course record. */
export function coursePath(s: Pick<OfficialSession, 'slug'>): string {
  return `/courses/${s.slug}`
}

/** The current day, minute and date in Ghana, independent of the device's time zone. */
export function ghanaNow(now: Date = new Date()): { dayOfWeek: number; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: GHANA_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    dayOfWeek: dayFromName(get('weekday')) ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    date: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

/** A session still taking place: not cancelled or removed by the University. */
export const isActive = (s: Pick<OfficialSession, 'status'>): boolean => s.status === 'scheduled' || s.status === 'rescheduled'

/** A session the student may attend: active and not marked as someone else's class or cancelled. */
export function mayAttend(s: OfficialSession, attendance: AttendanceMap): boolean {
  const mine = attendanceOf(attendance, s.id)
  return isActive(s) && mine !== 'not_assigned' && mine !== 'cancelled'
}

/** Sort by day in the order given (Monday first by default), then by start time. */
export function sortWeek<T extends Pick<OfficialSession, 'dayOfWeek' | 'start' | 'sortOrder'>>(sessions: readonly T[], order: readonly number[] = WEEK_ORDER): T[] {
  const rank = (d: number) => order.indexOf(d)
  return [...sessions].sort((a, b) => rank(a.dayOfWeek) - rank(b.dayOfWeek) || a.start.localeCompare(b.start) || a.sortOrder - b.sortOrder)
}

/** How many active sessions each course has in the published week. */
export function sessionsPerCourse(sessions: readonly OfficialSession[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of sessions) if (isActive(s)) counts.set(s.courseId, (counts.get(s.courseId) ?? 0) + 1)
  return counts
}

/**
 * The allocation label shown on a session. The published timetable does not say who attends repeated sessions,
 * so nothing is ever presented as compulsory unless an administrator records the department's confirmation.
 */
export function allocationLabel(session: Pick<OfficialSession, 'allocation'>): string {
  return ALLOCATION_LABEL[session.allocation]
}

export interface NextSession {
  session: OfficialSession
  daysAhead: number
  label: string
}

const DAY_MS = 86_400_000

/** yyyy-mm-dd of a Date built from a local calendar day (as lib/semesterCalendar does). */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * The next session in Ghana time from the given sessions (only those the student may attend), never before the day
 * lectures begin. Within the coming week it is named by weekday; further ahead, by weekday and date.
 */
export function nextSession(
  sessions: readonly OfficialSession[],
  attendance: AttendanceMap,
  now: Date = new Date(),
  lecturesStartOn: Date | null = null,
): NextSession | null {
  const { dayOfWeek, minutes } = ghanaNow(now)
  const firstDay = lecturesStartOn ? localDay(lecturesStartOn) : null
  let best: NextSession | null = null
  let bestOffset = Infinity
  for (const s of sessions) {
    if (!mayAttend(s, attendance)) continue
    let daysAhead = (s.dayOfWeek - dayOfWeek + 7) % 7
    if (daysAhead === 0 && toMinutes(s.start) <= minutes) daysAhead = 7
    if (firstDay) while (ghanaNow(new Date(now.getTime() + daysAhead * DAY_MS)).date < firstDay) daysAhead += 7
    const offset = daysAhead * 1440 + toMinutes(s.start)
    if (offset < bestOffset) {
      bestOffset = offset
      const date = ghanaNow(new Date(now.getTime() + daysAhead * DAY_MS)).date
      const when =
        daysAhead === 0 ? 'Today' : daysAhead === 1 ? 'Tomorrow' : daysAhead < 7 ? DAY_NAMES[s.dayOfWeek] : `${DAY_NAMES[s.dayOfWeek]} ${shortDate(date)}`
      best = { session: s, daysAhead, label: `${when}, ${ghanaClock(s.start)}` }
    }
  }
  return best
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
/** "2026-11-23" -> "23 Nov". */
export function shortDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`
}

export interface LaidOutSession {
  session: OfficialSession
  lane: number
  lanes: number
}

/** Place a day's sessions side by side where they overlap, so no session is hidden behind another. */
export function layoutDay(sessions: readonly OfficialSession[]): LaidOutSession[] {
  const sorted = [...sessions].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
  const out: LaidOutSession[] = []
  let group: LaidOutSession[] = []
  let laneEnds: number[] = []
  let groupEnd = -1
  const close = () => {
    for (const item of group) item.lanes = laneEnds.length
    out.push(...group)
    group = []
    laneEnds = []
  }
  for (const session of sorted) {
    const start = toMinutes(session.start)
    const end = toMinutes(session.end)
    if (group.length && start >= groupEnd) close()
    let lane = laneEnds.findIndex((e) => e <= start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    groupEnd = Math.max(group.length ? groupEnd : -1, end)
    group.push({ session, lane, lanes: 1 })
  }
  if (group.length) close()
  return out
}

export interface SessionFilters {
  courseId?: string
  dayOfWeek?: number
  venue?: string
  attendance?: AttendanceStatus
}

export function filterSessions(sessions: readonly OfficialSession[], filters: SessionFilters, attendance: AttendanceMap): OfficialSession[] {
  return sessions.filter(
    (s) =>
      (!filters.courseId || s.courseId === filters.courseId) &&
      (filters.dayOfWeek === undefined || s.dayOfWeek === filters.dayOfWeek) &&
      (!filters.venue || s.venue === filters.venue) &&
      (!filters.attendance || attendanceOf(attendance, s.id) === filters.attendance),
  )
}

/** Weekly minutes of published lectures (all active sessions, or only those the student may attend). */
export function lectureMinutes(sessions: readonly OfficialSession[], attendance?: AttendanceMap): number {
  return sessions
    .filter((s) => (attendance ? mayAttend(s, attendance) : isActive(s)))
    .reduce((sum, s) => sum + toMinutes(s.end) - toMinutes(s.start), 0)
}

function at(date: string, time: string): Date {
  const d = new Date(`${date}T00:00:00`)
  const minutes = toMinutes(time)
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d
}

/**
 * Official sessions as read-only planner entries for a date range. Lectures never count towards study time
 * (studyTotals skips kind "lecture"). Sessions marked not assigned or cancelled are left out; unconfirmed
 * sessions stay visible but flagged, unless onlyConfirmed is set.
 */
export function officialPlannerEntries(
  sessions: readonly OfficialSession[],
  attendance: AttendanceMap,
  start: Date,
  end: Date,
  options: { onlyConfirmed?: boolean; lecturesStartOn?: Date | null } = {},
): PlannerEntry[] {
  const entries: PlannerEntry[] = []
  const firstDay = options.lecturesStartOn ? localDay(options.lecturesStartOn) : null
  for (const date of dateRange(start, end)) {
    // No official lecture is held before teaching begins.
    if (firstDay && date < firstDay) continue
    const dow = new Date(`${date}T00:00:00`).getDay()
    for (const s of sessions) {
      if (s.dayOfWeek !== dow || !mayAttend(s, attendance)) continue
      const confirmed = attendanceOf(attendance, s.id) === 'confirmed'
      if (options.onlyConfirmed && !confirmed) continue
      entries.push({
        key: `official|${s.id}|${date}`,
        title: `${s.code} lecture · ${s.venue || 'venue not given'}`,
        courseId: s.courseId,
        kind: 'lecture',
        start: at(date, s.start),
        end: at(date, s.end),
        date,
        event: null,
        session: null,
        status: 'planned',
        isProvisional: !confirmed,
        official: s,
      })
    }
  }
  return entries
}

export interface CsvSession {
  course_code: string
  day_of_week: number
  start_time: string
  end_time: string
  venue: string
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/
const CODE = /^[A-Z]{3,5} [0-9]{3}$/

/**
 * Parse a revised timetable for import: one session per line as "day,start,end,course,venue", for example
 * "Monday,19:30,21:30,CSIT 601,Earth Science Room 1". A header line and blank lines are ignored.
 */
export function parseTimetableCsv(text: string): { sessions: CsvSession[]; errors: string[] } {
  const sessions: CsvSession[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line || /^day\s*,/i.test(line)) return
    const [day = '', start = '', end = '', course = '', ...venueParts] = line.split(',').map((p) => p.trim())
    const venue = venueParts.join(', ').trim()
    const row = index + 1
    const dow = dayFromName(day)
    const code = course.toUpperCase().replace(/\s+/g, ' ')
    if (dow === null) return void errors.push(`Line ${row}: "${day}" is not a day of the week.`)
    if (!TIME.test(start) || !TIME.test(end)) return void errors.push(`Line ${row}: use 24-hour times such as 19:30.`)
    const startTime = fromMinutes(toMinutes(start))
    const endTime = fromMinutes(toMinutes(end))
    if (endTime <= startTime) return void errors.push(`Line ${row}: the end time must be after the start time.`)
    if (!CODE.test(code)) return void errors.push(`Line ${row}: "${course}" is not a course code such as CSIT 601.`)
    if (venue.length > 120) return void errors.push(`Line ${row}: the venue is longer than 120 characters.`)
    sessions.push({ course_code: code, day_of_week: dow, start_time: startTime, end_time: endTime, venue })
  })
  if (!sessions.length && !errors.length) errors.push('Paste at least one session.')
  return { sessions, errors }
}
