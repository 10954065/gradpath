// The student's study week. Weeks start on the weekday teaching started (recorded on the official timetable) and
// are numbered from that week; without a recorded start they run Monday to Sunday. Only how dates are grouped into
// weeks changes: completed lessons, quiz attempts, study sessions and streaks keep their own dates.
import { differenceInCalendarDays, endOfWeek, startOfWeek, type Day } from 'date-fns'

export const DEFAULT_WEEK_STARTS_ON: Day = 1

export interface SemesterCalendar {
  /** The day teaching started, local midnight; null when no start has been recorded. */
  startedOn: Date | null
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: Day
}

export function semesterCalendar(teachingStartedOn: string | null | undefined): SemesterCalendar {
  if (!teachingStartedOn || !/^\d{4}-\d{2}-\d{2}$/.test(teachingStartedOn)) return { startedOn: null, weekStartsOn: DEFAULT_WEEK_STARTS_ON }
  const startedOn = new Date(`${teachingStartedOn}T00:00:00`)
  return { startedOn, weekStartsOn: startedOn.getDay() as Day }
}

/** Days of the week (0 = Sunday … 6 = Saturday) in the order the student's week runs. */
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

/** 1 for the week teaching started, 0 or less before it; null when no start has been recorded. */
export function semesterWeek(calendar: SemesterCalendar, date: Date): number | null {
  if (!calendar.startedOn) return null
  return Math.floor(differenceInCalendarDays(studyWeekStart(date, calendar.weekStartsOn), calendar.startedOn) / 7) + 1
}

export function semesterWeekLabel(calendar: SemesterCalendar, date: Date): string | null {
  const week = semesterWeek(calendar, date)
  if (week === null) return null
  return week >= 1 ? `Semester week ${week}` : 'Before teaching started'
}
