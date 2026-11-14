import yaml from 'js-yaml'
import { dayFromName, fromMinutes, toMinutes } from '../officialTimetable'
import type { ValidationIssue } from './types'

/** An official timetable as authored in content/timetables/*.yaml. */
export interface ParsedTimetableSession {
  dayOfWeek: number
  start: string
  end: string
  courseCode: string
  venue: string
}

export interface ParsedTimetable {
  slug: string
  title: string
  institution: string
  department: string
  programme: string
  programmeCode: string
  academicYear: string
  semester: string
  timeZone: 'Africa/Accra'
  sourceUrl: string | null
  sourceNote: string
  publishedAt: string
  sessions: ParsedTimetableSession[]
}

type Obj = Record<string, unknown>
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const CODE = /^[A-Z]{3,5} [0-9]{3}$/
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export function parseTimetable(file: string, text: string, knownCourseCodes?: ReadonlySet<string>): { timetable: ParsedTimetable | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const error = (message: string) => issues.push({ file, message, severity: 'error' })
  let doc: Obj
  try {
    doc = (yaml.load(text) ?? {}) as Obj
  } catch (e) {
    error(`invalid YAML: ${(e as Error).message}`)
    return { timetable: null, issues }
  }

  const required = ['slug', 'title', 'academicYear', 'semester'] as const
  for (const key of required) if (!str(doc[key])) error(`${key} is required`)
  if (str(doc.slug) && !/^[a-z0-9-]{3,80}$/.test(str(doc.slug))) error('slug must be lowercase letters, digits and hyphens')
  if (str(doc.academicYear) && !/^\d{4}\/\d{4}$/.test(str(doc.academicYear))) error('academicYear must look like 2026/2027')
  if (str(doc.timeZone || 'Africa/Accra') !== 'Africa/Accra') error('timeZone must be Africa/Accra (all times are Ghana local time)')
  const sourceUrl = str(doc.sourceUrl) || null
  if (sourceUrl && !sourceUrl.startsWith('https://')) error('sourceUrl must start with https://')
  const publishedAt = doc.publishedAt instanceof Date ? doc.publishedAt.toISOString().slice(0, 10) : str(doc.publishedAt)
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) error('publishedAt must be a date (yyyy-mm-dd)')

  const rawSessions = Array.isArray(doc.sessions) ? (doc.sessions as Obj[]) : []
  if (!rawSessions.length) error('sessions must list at least one session')
  const sessions: ParsedTimetableSession[] = []
  rawSessions.forEach((s, i) => {
    const where = `session ${i + 1}`
    const dayOfWeek = dayFromName(str(s.day))
    const start = str(s.start)
    const end = str(s.end)
    const courseCode = str(s.course)
    const venue = str(s.venue)
    if (dayOfWeek === null) return void error(`${where}: day "${str(s.day)}" is not a day of the week`)
    if (!TIME.test(start) || !TIME.test(end)) return void error(`${where}: start and end must be 24-hour times such as '19:30'`)
    if (toMinutes(end) <= toMinutes(start)) return void error(`${where}: end must be after start`)
    if (!CODE.test(courseCode)) return void error(`${where}: "${courseCode}" is not a course code`)
    if (knownCourseCodes && !knownCourseCodes.has(courseCode)) return void error(`${where}: ${courseCode} is not a course in content/courses`)
    if (venue.length > 120) return void error(`${where}: venue is longer than 120 characters`)
    if (!venue) issues.push({ file, message: `${where}: no venue given`, severity: 'warning' })
    const duplicate = sessions.find((x) => x.dayOfWeek === dayOfWeek && x.start === start && x.courseCode === courseCode)
    if (duplicate) return void error(`${where}: ${courseCode} is listed twice at the same time`)
    sessions.push({ dayOfWeek, start: fromMinutes(toMinutes(start)), end: fromMinutes(toMinutes(end)), courseCode, venue })
  })

  if (issues.some((i) => i.severity === 'error')) return { timetable: null, issues }
  return {
    timetable: {
      slug: str(doc.slug),
      title: str(doc.title),
      institution: str(doc.institution) || 'University of Ghana',
      department: str(doc.department) || 'Department of Computer Science',
      programme: str(doc.programme) || 'MSc IT for Business',
      programmeCode: str(doc.programmeCode) || 'ITB',
      academicYear: str(doc.academicYear),
      semester: str(doc.semester),
      timeZone: 'Africa/Accra',
      sourceUrl,
      sourceNote: str(doc.sourceNote),
      publishedAt: publishedAt || new Date().toISOString().slice(0, 10),
      sessions,
    },
    issues,
  }
}
