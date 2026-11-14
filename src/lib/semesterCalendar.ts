// The student's study week and the start of official lectures, which can differ: a student may start studying before
// teaching begins. Study weeks start on the weekday the student's studies started (or, without one, the day lectures
// began; otherwise Monday) and are numbered from it. Official lectures are never shown or reminded before the day
// teaching began. Only how dates are grouped into weeks changes: completed lessons, quiz attempts, study sessions
// and streaks keep their own dates.
import { differenceInCalendarDays, endOfWeek, startOfWeek, type Day } from 'date-fns'

export const DEFAULT_WEEK_STARTS_ON: Day = 1

export interface SemesterCalendar {
  /** The day the student's study weeks are counted from, local midnight; null when neither date is known. */
  startedOn: Date | null
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: Day
  /** The day official lectures begin, local midnight; null when not recorded. */
  lecturesStartOn: Date | null
}

function parseDay(value: string | null | undefined): Date | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null
}

export function semesterCalendar(teachingStartedOn: string | null | undefined, studyStartedOn?: string | null): SemesterCalendar {
  const lecturesStartOn = parseDay(teachingStartedOn)
  const startedOn = parseDay(studyStartedOn) ?? lecturesStartOn
  return { startedOn, weekStartsOn: startedOn ? (startedOn.getDay() as Day) : DEFAULT_WEEK_STARTS_ON, lecturesStartOn }
}

/** Days of the week (0 = Sunday … 6 = Saturday) in the order the study week runs. */
export function weekOrder(weekStartsOn: Day): Day[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Day)
}

export function studyWeekStart(date: Date, weekStartsOn: Day): Date {
  return startOfWeek(date, { weekStartsOn })
}

export function studyWeekEnd(date: Date, weekStartsOn: Day): Date {
  return endOfWeek(date, { weekStartsOn })
}

/** Days already begun in the study week, counting today: 1 on the first day of the week. */
export function dayOfStudyWeek(date: Date, weekStartsOn: Day): number {
  return ((date.getDay() - weekStartsOn + 7) % 7) + 1
}

/** 1 for the week studies started, 0 or less before it; null when no start is known. */
export function studyWeek(calendar: SemesterCalendar, date: Date): number | null {
  if (!calendar.startedOn) return null
  return Math.floor(differenceInCalendarDays(studyWeekStart(date, calendar.weekStartsOn), calendar.startedOn) / 7) + 1
}

export function studyWeekLabel(calendar: SemesterCalendar, date: Date): string | null {
  const week = studyWeek(calendar, date)
  if (week === null) return null
  return week >= 1 ? `Study week ${week}` : 'Before your studies started'
}
