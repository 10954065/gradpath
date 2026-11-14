// iCalendar (RFC 5545) for the private calendar subscription: official lectures, planner blocks and examinations.
// Self-contained (no "@/" imports) because the calendar endpoint in api/ imports it too. Ghana time is GMT all year,
// so every time is written in UTC.

export interface CalendarFeed {
  lecturesStartOn: string | null
  lectures: { id: string; code: string; title: string; day_of_week: number; start_time: string; end_time: string; venue: string }[]
  /** One-off changes the student recorded: the normal date is left out, and a moved lecture is added on its new day. */
  exceptions?: {
    id: string
    entry_id: string
    held_on: string
    status: 'cancelled' | 'moved'
    moved_date: string | null
    moved_start: string | null
    moved_end: string | null
    moved_venue: string
  }[]
  events: {
    id: string
    title: string
    kind: string
    recurrence: 'weekly' | 'once'
    day_of_week: number | null
    event_date: string | null
    start_time: string
    end_time: string
    starts_on: string | null
    ends_on: string | null
    created_on: string
    location: string
    notes: string
  }[]
  exams: { id: string; title: string; due_at: string; description: string }[]
}

const DAY_MS = 86_400_000
const EXAM_HOURS = 3

/** yyyy-mm-dd of the first given weekday (0 = Sunday) on or after the date. */
export function firstOnOrAfter(date: string, dayOfWeek: number): string {
  const t = Date.parse(`${date}T00:00:00Z`)
  const shift = (dayOfWeek - new Date(t).getUTCDay() + 7) % 7
  return new Date(t + shift * DAY_MS).toISOString().slice(0, 10)
}

/** "2026-11-16" + "19:30" -> "20261116T193000Z". */
function at(date: string, time: string): string {
  return `${date.replaceAll('-', '')}T${time.replace(':', '').slice(0, 4)}00Z`
}

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escapes TEXT values (RFC 5545 3.3.11). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Folds a content line to at most 75 octets, never splitting a character (RFC 5545 3.1). */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let currentLine = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = parts.length ? 74 : 75
    if (bytes + size > limit) {
      parts.push(currentLine)
      currentLine = ''
      bytes = 0
    }
    currentLine += ch
    bytes += size
  }
  parts.push(currentLine)
  return parts.join('\r\n ')
}

function event(fields: [string, string | null | undefined][]): string[] {
  return ['BEGIN:VEVENT', ...fields.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}:${v}`), 'END:VEVENT']
}

export function buildCalendar(feed: CalendarFeed, now: Date = new Date()): string {
  const stamp = utc(now)
  const today = now.toISOString().slice(0, 10)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GradPath//Study calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:GradPath',
    'X-WR-TIMEZONE:Africa/Accra',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]

  const lecturesFrom = feed.lecturesStartOn ?? today
  const exceptions = feed.exceptions ?? []
  for (const l of feed.lectures) {
    const first = firstOnOrAfter(lecturesFrom, l.day_of_week)
    const changed = exceptions.filter((x) => x.entry_id === l.id)
    lines.push(
      ...event([
        ['UID', `lecture-${l.id}@gradpath`],
        ['DTSTAMP', stamp],
        ['DTSTART', at(first, l.start_time)],
        ['DTEND', at(first, l.end_time)],
        ['RRULE', 'FREQ=WEEKLY'],
        ['EXDATE', changed.map((x) => at(x.held_on, l.start_time)).join(',')],
        ['SUMMARY', escapeText(`${l.code} lecture`)],
        ['LOCATION', escapeText(l.venue)],
        ['DESCRIPTION', escapeText(`${l.title}. Official University timetable, Ghana time.`)],
        ['CATEGORIES', 'Lecture'],
      ]),
    )
    for (const x of changed) {
      if (x.status !== 'moved' || !x.moved_date || !x.moved_start || !x.moved_end) continue
      lines.push(
        ...event([
          ['UID', `lecture-${l.id}-${x.held_on}@gradpath`],
          ['DTSTAMP', stamp],
          ['DTSTART', at(x.moved_date, x.moved_start)],
          ['DTEND', at(x.moved_date, x.moved_end)],
          ['SUMMARY', escapeText(`${l.code} lecture (moved)`)],
          ['LOCATION', escapeText(x.moved_venue || l.venue)],
          ['DESCRIPTION', escapeText(`${l.title}. Moved from ${x.held_on}, Ghana time.`)],
          ['CATEGORIES', 'Lecture'],
        ]),
      )
    }
  }

  for (const e of feed.events) {
    let first: string | null
    let rule: string | null = null
    if (e.recurrence === 'weekly' && e.day_of_week !== null) {
      first = firstOnOrAfter(e.starts_on ?? e.created_on, e.day_of_week)
      rule = e.ends_on ? `FREQ=WEEKLY;UNTIL=${e.ends_on.replaceAll('-', '')}T235959Z` : 'FREQ=WEEKLY'
      if (e.ends_on && first > e.ends_on) continue
    } else {
      first = e.event_date
    }
    if (!first) continue
    lines.push(
      ...event([
        ['UID', `event-${e.id}@gradpath`],
        ['DTSTAMP', stamp],
        ['DTSTART', at(first, e.start_time)],
        ['DTEND', at(first, e.end_time)],
        ['RRULE', rule],
        ['SUMMARY', escapeText(e.title)],
        ['LOCATION', escapeText(e.location)],
        ['DESCRIPTION', escapeText(e.notes)],
        ['CATEGORIES', e.kind === 'revision' ? 'Revision' : e.kind === 'lecture' ? 'Lecture' : 'Study'],
      ]),
    )
  }

  for (const x of feed.exams) {
    const start = new Date(x.due_at)
    if (Number.isNaN(start.getTime())) continue
    const venue = x.description.startsWith('Venue: ') ? (x.description.slice(7).split('\n')[0] ?? '') : ''
    lines.push(
      'BEGIN:VEVENT',
      ...[
        `UID:exam-${x.id}@gradpath`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${utc(start)}`,
        `DTEND:${utc(new Date(start.getTime() + EXAM_HOURS * 3_600_000))}`,
        `SUMMARY:${escapeText(x.title)}`,
        venue ? `LOCATION:${escapeText(venue)}` : '',
        'CATEGORIES:Examination',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(`${x.title} tomorrow`)}`,
        'TRIGGER:-P1D',
        'END:VALARM',
      ].filter(Boolean),
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
