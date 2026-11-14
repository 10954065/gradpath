// A personal study plan built around the official lecture timetable.
//
// The strategy: every course gets a short preview before its first lecture of the week (so the lecture builds on
// something already met) and a review within a day of it (rewrite notes, take the quiz, add flashcards while the
// lecture is fresh). The rest of the weekly target goes to deep study for the three-credit courses, weighted by
// credit slots, plus one mixed revision and mock examination block. No block is placed inside, or within 30 minutes
// of, any published lecture the student may attend, so travel time is protected too. Lecture time never counts
// towards the independent study target.
import type { AttendanceMap, OfficialSession } from './officialTimetable'
import { attendanceOf, DAY_NAMES, fromMinutes, mayAttend, toMinutes, WEEK_ORDER } from './officialTimetable'

export const STUDY_WINDOWS: Record<string, readonly [number, number]> = {
  'Early morning': [5 * 60, 7 * 60 + 30],
  Morning: [8 * 60, 12 * 60],
  Lunchtime: [12 * 60 + 30, 13 * 60 + 30],
  Afternoon: [12 * 60 + 30, 17 * 60],
  Evening: [17 * 60, 21 * 60 + 30],
  'Late night': [21 * 60 + 30, 23 * 60],
}
/** Used when the student has not chosen preferred study times: around a working day, freer at weekends. */
const DEFAULT_WEEKDAY = ['Early morning', 'Lunchtime', 'Evening']
const DEFAULT_WEEKEND = ['Early morning', 'Morning', 'Afternoon', 'Evening']

/** How unwelcome a start time is: evenings, lunchtime and weekend daytime first, a 05:00 start last. */
function startCost(dow: number, minute: number): number {
  if (minute < 6 * 60) return 3
  if (minute < 8 * 60) return 1.5
  if (minute < 12 * 60) return isWeekend(dow) ? 0 : 1
  if (minute < 17 * 60) return isWeekend(dow) ? 0 : 0.5
  if (minute < 20 * 60 + 30) return 0
  return 2
}

const SLOT = 15
const SLOTS_PER_DAY = (24 * 60) / SLOT
export const TRAVEL_BUFFER_MINUTES = 30
const DAILY_CAP_WEEKDAY = 180
const DAILY_CAP_WEEKEND = 240
const REVISION_MINUTES = 90
const DEEP_BLOCK_MINUTES = 60

export interface StrategyCourse {
  id: string
  code: string
  title: string
  creditSlots: number
}

export interface BusyBlock {
  dayOfWeek: number
  start: string
  end: string
}

export interface StrategyInput {
  courses: readonly StrategyCourse[]
  sessions: readonly OfficialSession[]
  attendance: AttendanceMap
  /** The student's own blocks, kept as they are and planned around. */
  keep: readonly BusyBlock[]
  targetHours: number
  preferredTimes: readonly string[]
}

export type BlockPurpose = 'preview' | 'review' | 'deep' | 'revision'

export interface PlannedBlock {
  courseId: string | null
  title: string
  kind: 'study' | 'revision'
  purpose: BlockPurpose
  dayOfWeek: number
  start: string
  end: string
  notes: string
}

export interface StudyStrategy {
  blocks: PlannedBlock[]
  plannedMinutes: number
  targetMinutes: number
  /** Weekly lecture minutes the plan works around (not counted as study). */
  lectureMinutes: number
  /** Courses whose preview and review are anchored on a session the student confirmed. */
  confirmedCourses: string[]
}

const isWeekend = (dow: number) => dow === 0 || dow === 6
const rank = (dow: number) => WEEK_ORDER.indexOf(dow as (typeof WEEK_ORDER)[number])
const shift = (dow: number, days: number) => (((dow + days) % 7) + 7) % 7

class WeekGrid {
  private free: boolean[][]
  private used: number[] = Array.from({ length: 7 }, () => 0)

  constructor(preferred: readonly string[]) {
    this.free = Array.from({ length: 7 }, (_, dow) => {
      const day = Array.from({ length: SLOTS_PER_DAY }, () => false)
      const names = preferred.length ? preferred : isWeekend(dow) ? DEFAULT_WEEKEND : DEFAULT_WEEKDAY
      for (const name of names) {
        const window = STUDY_WINDOWS[name]
        if (!window) continue
        for (let q = Math.ceil(window[0] / SLOT); q < Math.floor(window[1] / SLOT); q++) day[q] = true
      }
      return day
    })
  }

  block(dow: number, startMin: number, endMin: number): void {
    const day = this.free[dow]
    if (!day) return
    for (let q = Math.max(0, Math.floor(startMin / SLOT)); q < Math.min(SLOTS_PER_DAY, Math.ceil(endMin / SLOT)); q++) day[q] = false
  }

  remaining(dow: number): number {
    return (isWeekend(dow) ? DAILY_CAP_WEEKEND : DAILY_CAP_WEEKDAY) - (this.used[dow] ?? 0)
  }

  freeMinutes(dow: number): number {
    return (this.free[dow] ?? []).filter(Boolean).length * SLOT
  }

  /**
   * Reserve a free run of the given length on a day, within optional bounds: the latest one (closest to a lecture)
   * or, by default, the one at the most welcome time of day.
   */
  take(dow: number, minutes: number, options: { notBefore?: number; notAfter?: number; latest?: boolean } = {}): [number, number] | null {
    if (this.remaining(dow) < minutes) return null
    const day = this.free[dow]
    if (!day) return null
    const need = Math.ceil(minutes / SLOT)
    const first = Math.ceil((options.notBefore ?? 0) / SLOT)
    const last = Math.floor((options.notAfter ?? 24 * 60) / SLOT) - need
    const starts: number[] = []
    for (let q = first; q <= last; q++) {
      let ok = true
      for (let k = 0; k < need && ok; k++) ok = day[q + k] === true
      if (ok) starts.push(q)
    }
    const best = () => starts.reduce<number | undefined>((pick, q) => (pick === undefined || startCost(dow, q * SLOT) < startCost(dow, pick * SLOT) ? q : pick), undefined)
    const q = options.latest ? starts[starts.length - 1] : best()
    if (q === undefined) return null
    const start = q * SLOT
    const end = start + need * SLOT
    this.block(dow, start, end)
    this.used[dow] = (this.used[dow] ?? 0) + (end - start)
    return [start, end]
  }
}

function anchorFor(course: StrategyCourse, sessions: readonly OfficialSession[], attendance: AttendanceMap) {
  const mine = sessions
    .filter((s) => s.courseId === course.id && mayAttend(s, attendance))
    .sort((a, b) => rank(a.dayOfWeek) - rank(b.dayOfWeek) || a.start.localeCompare(b.start))
  const confirmed = mine.find((s) => attendanceOf(attendance, s.id) === 'confirmed')
  return { anchor: confirmed ?? mine[0] ?? null, confirmed: Boolean(confirmed) }
}

const NOTES: Record<BlockPurpose, string> = {
  preview: 'Skim the next lesson and its key terms so the lecture builds on something you have already met.',
  review: 'Within a day of the lecture: tidy your notes, take the lesson quiz and add flashcards for anything new.',
  deep: 'Work through the next lesson in full, then practise with its questions.',
  revision: 'Interleave courses: due flashcards, a mixed revision test, or a timed mock examination.',
}

export function buildStudyStrategy(input: StrategyInput): StudyStrategy {
  const grid = new WeekGrid(input.preferredTimes)
  const attendable = input.sessions.filter((s) => mayAttend(s, input.attendance))
  for (const s of attendable) grid.block(s.dayOfWeek, toMinutes(s.start) - TRAVEL_BUFFER_MINUTES, toMinutes(s.end) + TRAVEL_BUFFER_MINUTES)
  for (const k of input.keep) grid.block(k.dayOfWeek, toMinutes(k.start), toMinutes(k.end))

  const targetMinutes = Math.round(Math.min(80, Math.max(1, input.targetHours)) * 60)
  const blocks: PlannedBlock[] = []
  const confirmedCourses: string[] = []
  let planned = 0

  const add = (course: StrategyCourse | null, purpose: BlockPurpose, dow: number, range: [number, number], title: string) => {
    blocks.push({
      courseId: course?.id ?? null,
      title: title.slice(0, 200),
      kind: purpose === 'revision' ? 'revision' : 'study',
      purpose,
      dayOfWeek: dow,
      start: fromMinutes(range[0]),
      end: fromMinutes(range[1]),
      notes: NOTES[purpose],
    })
    planned += range[1] - range[0]
  }

  // 1. Preview and review around each course's first lecture of the week, in lecture order so each course gets
  //    the time nearest its own lecture.
  const anchored = input.courses
    .map((course) => ({ course, ...anchorFor(course, attendable, input.attendance) }))
    .sort((a, b) => (a.anchor && b.anchor ? rank(a.anchor.dayOfWeek) - rank(b.anchor.dayOfWeek) || a.anchor.start.localeCompare(b.anchor.start) : a.anchor ? -1 : 1))
  for (const { course, anchor, confirmed } of anchored) {
    if (confirmed) confirmedCourses.push(course.code)
    const big = course.creditSlots >= 3
    if (!anchor) {
      const dow = [...WEEK_ORDER].sort((a, b) => grid.freeMinutes(b) - grid.freeMinutes(a))[0] ?? 1
      const range = grid.take(dow, DEEP_BLOCK_MINUTES)
      if (range) add(course, 'deep', dow, range, `${course.code} ${course.title} (study)`)
      continue
    }
    const day = DAY_NAMES[anchor.dayOfWeek]
    const previewMinutes = big ? 45 : 30
    // Latest free time before the lecture on the day, else the evening or morning before.
    for (const daysBefore of [0, 1, 2, 3]) {
      const dow = shift(anchor.dayOfWeek, -daysBefore)
      const range = grid.take(dow, previewMinutes, { latest: true, notAfter: daysBefore === 0 ? toMinutes(anchor.start) : undefined })
      if (range) {
        add(course, 'preview', dow, range, `${course.code} preview before the ${day} lecture`)
        break
      }
    }

    const reviewMinutes = big ? 60 : 30
    const candidates = [
      { dow: shift(anchor.dayOfWeek, 1), notBefore: undefined },
      { dow: anchor.dayOfWeek, notBefore: toMinutes(anchor.end) },
      { dow: shift(anchor.dayOfWeek, 2), notBefore: undefined },
      { dow: shift(anchor.dayOfWeek, 3), notBefore: undefined },
    ]
    for (const c of candidates) {
      const range = grid.take(c.dow, reviewMinutes, { notBefore: c.notBefore })
      if (range) {
        add(course, 'review', c.dow, range, `${course.code} review after the ${day} lecture`)
        break
      }
    }
  }

  // 2. One mixed revision and mock examination block on the day with the most room.
  const revisionDay = [...WEEK_ORDER].sort((a, b) => grid.freeMinutes(b) - grid.freeMinutes(a))[0]
  if (revisionDay !== undefined) {
    const range = grid.take(revisionDay, REVISION_MINUTES)
    if (range) add(null, 'revision', revisionDay, range, 'Mixed revision and mock examination practice')
  }

  // 3. Deep study for the larger courses until the weekly target is met, spread across the week.
  const deepCourses = input.courses.filter((c) => c.creditSlots >= 3)
  let progress = true
  while (deepCourses.length && targetMinutes - planned >= DEEP_BLOCK_MINUTES && progress) {
    progress = false
    for (const course of deepCourses) {
      if (targetMinutes - planned < DEEP_BLOCK_MINUTES) break
      const days = [...WEEK_ORDER].sort((a, b) => {
        const has = (d: number) => (blocks.some((x) => x.dayOfWeek === d && x.courseId === course.id) ? 1 : 0)
        return has(a) - has(b) || grid.remaining(b) - grid.remaining(a)
      })
      for (const dow of days) {
        const range = grid.take(dow, DEEP_BLOCK_MINUTES)
        if (range) {
          add(course, 'deep', dow, range, `${course.code} ${course.title} (deep study)`)
          progress = true
          break
        }
      }
    }
  }

  blocks.sort((a, b) => rank(a.dayOfWeek) - rank(b.dayOfWeek) || a.start.localeCompare(b.start))
  const lectureMinutes = attendable.reduce((sum, s) => sum + toMinutes(s.end) - toMinutes(s.start), 0)
  return { blocks, plannedMinutes: planned, targetMinutes, lectureMinutes, confirmedCourses }
}

/** Do two weekly blocks overlap, allowing a buffer around the first? */
export function overlaps(a: BusyBlock, b: BusyBlock, bufferMinutes = 0): boolean {
  return a.dayOfWeek === b.dayOfWeek && toMinutes(a.start) - bufferMinutes < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end) + bufferMinutes
}

/** The student's weekly study blocks that fall inside a published lecture they may attend. */
export function lectureClashes<T extends BusyBlock>(blocks: readonly T[], sessions: readonly OfficialSession[], attendance: AttendanceMap): T[] {
  const lectures = sessions.filter((s) => mayAttend(s, attendance)).map((s) => ({ dayOfWeek: s.dayOfWeek, start: s.start, end: s.end }))
  return blocks.filter((b) => lectures.some((l) => overlaps(l, b)))
}
