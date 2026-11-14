// Examinations (deadlines of kind "examination"), the countdown to each, and a revision plan that works back from the
// exam: every module of the course, then the least finished ones again, the weakest topics and a final review.
import { ghanaNow, fromMinutes, toMinutes } from '@/lib/officialTimetable'
import type { Assignment } from '@/types/database'

const DAY_MS = 86_400_000

/** Upcoming examinations that are not marked done, soonest first. */
export function upcomingExams(assignments: readonly Assignment[], now: Date = new Date()): Assignment[] {
  return assignments
    .filter((a) => a.kind === 'examination' && a.due_at && new Date(a.due_at) > now && a.status !== 'completed' && a.status !== 'submitted')
    .sort((a, b) => (a.due_at as string).localeCompare(b.due_at as string))
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS

/** Calendar days from today to the exam, in Ghana time. */
export function daysUntil(due: Date, now: Date = new Date()): number {
  return dayNumber(ghanaNow(due).date) - dayNumber(ghanaNow(now).date)
}

export function countdownLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

export interface PlanModule {
  title: string
  lessonIds: readonly string[]
}

export interface PlanOptions {
  /** How many days before the exam revision starts. */
  daysBefore: number
  /** Preferred start, HH:MM Ghana time. */
  startTime: string
  /** Length of each session in minutes. */
  minutes: number
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = { daysBefore: 14, startTime: '18:00', minutes: 90 }

/** A busy stretch of a day, in minutes from midnight. */
export interface Busy {
  start: number
  end: number
}

export interface RevisionBlock {
  /** yyyy-mm-dd, Ghana date. */
  date: string
  start: string
  end: string
  title: string
  notes: string
}

const EARLIEST = 6 * 60
const LATEST_END = 23 * 60
const STEP = 30

/** The first free slot of the given length at or after the preferred start, else earlier in the day; null if none. */
export function freeSlot(busy: readonly Busy[], preferred: number, minutes: number): number | null {
  const fits = (start: number) => start >= EARLIEST && start + minutes <= LATEST_END && busy.every((b) => start + minutes <= b.start || start >= b.end)
  for (let start = preferred; start + minutes <= LATEST_END; start += STEP) if (fits(start)) return start
  for (let start = preferred - STEP; start >= EARLIEST; start -= STEP) if (fits(start)) return start
  return null
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

const unfinishedIn = (m: PlanModule, completed: ReadonlySet<string>) => m.lessonIds.filter((id) => !completed.has(id)).length

/** What each revision day covers, in order: modules (grouped when days are short), weakest topics, final review. */
export function revisionTopics(code: string, modules: readonly PlanModule[], completed: ReadonlySet<string>, days: number): { title: string; notes: string }[] {
  if (days <= 0) return []
  const final = { title: `${code} final review`, notes: 'Key terms, revision summaries and a timed mock examination for this course.' }
  if (days === 1 || !modules.length) return Array.from({ length: days }, (_, i) => (i === days - 1 ? final : { title: `${code} revision`, notes: 'Mixed revision across the course.' }))
  const weakest = { title: `${code} revision: weakest topics`, notes: 'Questions you got wrong, weak topics and your Revision Centre items for this course.' }
  const tail = days >= 4 ? [weakest, final] : [final]
  const slots = days - tail.length

  const describe = (group: readonly PlanModule[]) => {
    const first = group[0] as PlanModule
    const title = group.length === 1 ? `${code} revision: ${first.title}` : `${code} revision: ${first.title} to ${(group.at(-1) as PlanModule).title}`
    const unfinished = group.reduce((n, m) => n + unfinishedIn(m, completed), 0)
    const notes = `${group.map((m) => m.title).join('; ')}.${unfinished ? ` ${unfinished} lesson${unfinished === 1 ? '' : 's'} here not completed yet.` : ''}`
    return { title, notes }
  }

  const sessions: { title: string; notes: string }[] = []
  if (slots < modules.length) {
    // Fewer days than modules: consecutive modules share a day.
    for (let i = 0; i < slots; i += 1) {
      const from = Math.floor((i * modules.length) / slots)
      const to = Math.floor(((i + 1) * modules.length) / slots)
      sessions.push(describe(modules.slice(from, to)))
    }
  } else {
    for (const m of modules) sessions.push(describe([m]))
    // Spare days: the least finished modules again.
    const byNeed = [...modules].sort((a, b) => unfinishedIn(b, completed) / Math.max(1, b.lessonIds.length) - unfinishedIn(a, completed) / Math.max(1, a.lessonIds.length))
    for (let i = 0; sessions.length < slots; i += 1) {
      const again = describe([byNeed[i % byNeed.length] as PlanModule])
      sessions.push({ title: `${again.title} (again)`, notes: again.notes })
    }
  }
  return [...sessions, ...tail]
}

/**
 * Revision sessions from the start of the revision window to the day before the exam, one a day at the preferred time
 * or the nearest free time that day. Days with no free slot are left out.
 */
export function buildExamRevisionPlan(args: {
  code: string
  /** yyyy-mm-dd, Ghana date of the exam. */
  examDate: string
  /** yyyy-mm-dd, Ghana date today. */
  today: string
  modules: readonly PlanModule[]
  completed: ReadonlySet<string>
  options: PlanOptions
  busy: (date: string) => readonly Busy[]
}): RevisionBlock[] {
  const { code, examDate, today, modules, completed, options, busy } = args
  const firstDay = addDays(examDate, -options.daysBefore) > today ? addDays(examDate, -options.daysBefore) : addDays(today, 1)
  const dates: string[] = []
  for (let d = firstDay; d < examDate; d = addDays(d, 1)) dates.push(d)
  const topics = revisionTopics(code, modules, completed, dates.length)
  const preferred = toMinutes(options.startTime)
  const blocks: RevisionBlock[] = []
  dates.forEach((date, i) => {
    const start = freeSlot(busy(date), preferred, options.minutes)
    const topic = topics[i]
    if (start === null || !topic) return
    blocks.push({ date, start: fromMinutes(start), end: fromMinutes(start + options.minutes), ...topic })
  })
  return blocks
}
