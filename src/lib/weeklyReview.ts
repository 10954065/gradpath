// A study week in review: study time against the target, lessons, quizzes, revision, lecture check-ins, what is due
// in the coming week and a few suggestions. Dates are the device's calendar dates (Ghana time for the student).

export interface WeekInput {
  /** First and last day of the study week, yyyy-mm-dd, inclusive. */
  from: string
  to: string
  targetMinutes: number
  sessions: readonly { status: string; actual_minutes: number | null; planned_start: string }[]
  progress: readonly { lesson_id: string; status: string; completed_at: string | null }[]
  attempts: readonly { status: string; submitted_at: string | null; percent: number | null }[]
  reviews: readonly { reviewed_at: string }[]
  logs: readonly { held_on: string; attendance: 'attended' | 'missed' | 'cancelled' }[]
  deadlines: readonly { id: string; title: string; due_at: string | null; status: string }[]
  /** Courses the lectures have got ahead of, with how many lessons to catch up on. */
  behind: readonly { code: string; lessons: number }[]
}

export interface WeekReview {
  studyMinutes: number
  targetMinutes: number
  targetPercent: number
  lessonIds: string[]
  quizzes: { count: number; average: number | null }
  reviews: number
  lectures: { attended: number; missed: number; cancelled: number }
  /** Unfinished deadlines in the seven days after the week, soonest first. */
  upcoming: { id: string; title: string; due_at: string }[]
  suggestions: string[]
}

const DAY_MS = 86_400_000

/** yyyy-mm-dd of a timestamp in the device's time zone. */
function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
const hours = (minutes: number) => {
  const h = Math.round((minutes / 60) * 10) / 10
  return `${h} hour${h === 1 ? '' : 's'}`
}

export function reviewWeek(input: WeekInput): WeekReview {
  const inWeek = (date: string) => date >= input.from && date <= input.to
  const studyMinutes = input.sessions
    .filter((s) => s.status === 'completed' && inWeek(localDate(s.planned_start)))
    .reduce((sum, s) => sum + (s.actual_minutes ?? 0), 0)
  const lessonIds = input.progress.filter((p) => p.status === 'completed' && p.completed_at && inWeek(localDate(p.completed_at))).map((p) => p.lesson_id)
  const scored = input.attempts.filter((a) => a.status === 'submitted' && a.submitted_at && inWeek(localDate(a.submitted_at)))
  const percents = scored.map((a) => a.percent).filter((p): p is number => p !== null)
  const logs = input.logs.filter((g) => inWeek(g.held_on))
  const lectures = {
    attended: logs.filter((g) => g.attendance === 'attended').length,
    missed: logs.filter((g) => g.attendance === 'missed').length,
    cancelled: logs.filter((g) => g.attendance === 'cancelled').length,
  }
  const nextTo = addDays(input.to, 7)
  const upcoming = input.deadlines
    .filter((d) => d.due_at && d.status !== 'submitted' && d.status !== 'completed')
    .filter((d) => {
      const date = localDate(d.due_at as string)
      return date > input.to && date <= nextTo
    })
    .map((d) => ({ id: d.id, title: d.title, due_at: d.due_at as string }))
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
  const targetPercent = input.targetMinutes > 0 ? Math.round((studyMinutes / input.targetMinutes) * 100) : 0

  const suggestions: string[] = []
  if (studyMinutes >= input.targetMinutes) suggestions.push(`You reached your weekly target of ${hours(input.targetMinutes)}. Keep the same rhythm next week.`)
  else suggestions.push(`You studied ${hours(studyMinutes)} of your ${hours(input.targetMinutes)} target. Plan ${hours(input.targetMinutes - studyMinutes)} more next week.`)
  for (const b of input.behind.slice(0, 2)) suggestions.push(`${b.code}: catch up on ${b.lessons} lesson${b.lessons === 1 ? '' : 's'} the lectures have covered.`)
  if (lectures.missed) suggestions.push(`Go over the ${lectures.missed} lecture${lectures.missed === 1 ? '' : 's'} you missed using your check-in notes.`)
  if (upcoming.length) suggestions.push(`${upcoming.length} deadline${upcoming.length === 1 ? '' : 's'} next week: start with ${upcoming[0]?.title}.`)
  if (!input.reviews.some((r) => inWeek(localDate(r.reviewed_at)))) suggestions.push('No revision reviews this week: spend a few minutes in the Revision Centre.')

  return {
    studyMinutes,
    targetMinutes: input.targetMinutes,
    targetPercent,
    lessonIds,
    quizzes: { count: scored.length, average: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null },
    reviews: input.reviews.filter((r) => inWeek(localDate(r.reviewed_at))).length,
    lectures,
    upcoming,
    suggestions,
  }
}
