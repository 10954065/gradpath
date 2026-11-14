import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, startOfWeek, type Day } from 'date-fns'

/** All scheduling in GradPath uses Africa/Accra (UTC+0, no daylight saving) unless the student chooses otherwise. */
export const DEFAULT_TIME_ZONE = 'Africa/Accra'

export function formatDate(value: string | Date): string {
  return format(new Date(value), 'EEE d MMM yyyy')
}

export function formatDateTime(value: string | Date): string {
  return format(new Date(value), 'EEE d MMM yyyy, HH:mm')
}

export function formatTime(value: string | Date): string {
  return format(new Date(value), 'HH:mm')
}

export function relativeTime(value: string | Date): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

/** ISO date (yyyy-MM-dd) for a Date in local time. */
export function isoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Week start: Monday unless the student's week starts on another day (see lib/semesterCalendar). */
export function weekStart(date: Date, weekStartsOn: Day = 1): Date {
  return startOfWeek(date, { weekStartsOn })
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function daysUntil(value: string | Date, now = new Date()): number {
  return differenceInCalendarDays(new Date(value), now)
}

/** Combine a yyyy-MM-dd date and an HH:mm(:ss) time into a Date (local wall clock). */
export function combineDateTime(date: string, time: string): Date {
  const [h = '0', m = '0'] = time.split(':')
  const d = new Date(`${date}T00:00:00`)
  d.setHours(Number(h), Number(m), 0, 0)
  return d
}

export function minutesToHours(minutes: number): string {
  const h = minutes / 60
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h`
}
