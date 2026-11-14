// A focus timer (focus, then a break) kept as timestamps, so it stays right while the app is closed or asleep.

export type FocusPhase = 'focus' | 'break'

/** A planned block in today's planner that the focused minutes count toward. */
export interface FocusTarget {
  eventId: string
  /** yyyy-mm-dd */
  date: string
  title: string
  /** ISO times of the planned occurrence. */
  start: string
  end: string
}

export interface FocusState {
  phase: FocusPhase
  /** Length of the current phase, in milliseconds. */
  lengthMs: number
  /** Time run before the latest start or resume. */
  runMs: number
  /** When the phase last started or resumed; null while paused. */
  resumedAt: number | null
  /** When the focus phase began (epoch ms): the start of the planner entry. */
  startedAt: number
  breakMs: number
  courseId: string | null
  title: string
  target: FocusTarget | null
}

export interface FocusPreset {
  label: string
  focus: number
  rest: number
}

export const FOCUS_PRESETS: readonly FocusPreset[] = [
  { label: '25 min + 5 min break', focus: 25, rest: 5 },
  { label: '50 min + 10 min break', focus: 50, rest: 10 },
  { label: '90 min + 15 min break', focus: 90, rest: 15 },
]

const MINUTE = 60_000

export function startFocus(opts: { focusMinutes: number; breakMinutes: number; courseId: string | null; title: string; target: FocusTarget | null }, now: number): FocusState {
  return {
    phase: 'focus',
    lengthMs: opts.focusMinutes * MINUTE,
    runMs: 0,
    resumedAt: now,
    startedAt: now,
    breakMs: opts.breakMinutes * MINUTE,
    courseId: opts.courseId,
    title: opts.title,
    target: opts.target,
  }
}

export function elapsedMs(s: FocusState, now: number): number {
  return Math.min(s.lengthMs, s.runMs + (s.resumedAt === null ? 0 : Math.max(0, now - s.resumedAt)))
}

export function remainingMs(s: FocusState, now: number): number {
  return s.lengthMs - elapsedMs(s, now)
}

export const isDone = (s: FocusState, now: number): boolean => remainingMs(s, now) <= 0
export const isPaused = (s: FocusState): boolean => s.resumedAt === null

export function pause(s: FocusState, now: number): FocusState {
  return isPaused(s) ? s : { ...s, runMs: elapsedMs(s, now), resumedAt: null }
}

export function resume(s: FocusState, now: number): FocusState {
  return isPaused(s) ? { ...s, resumedAt: now } : s
}

/** The break after a focus phase, keeping the course and target for the next round. */
export function startBreak(s: FocusState, now: number): FocusState {
  return { ...s, phase: 'break', lengthMs: s.breakMs, runMs: 0, resumedAt: now, startedAt: now }
}

/** Whole minutes focused so far in a focus phase (pauses excluded); a break logs nothing. */
export function focusedMinutes(s: FocusState, now: number): number {
  return s.phase === 'focus' ? Math.floor(elapsedMs(s, now) / MINUTE) : 0
}

/** "24:59", or "1:29:59" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`
}

/** Read back a stored timer, rejecting anything malformed. */
export function parseFocusState(raw: string | null): FocusState | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Partial<FocusState>
    const ok =
      (s.phase === 'focus' || s.phase === 'break') &&
      typeof s.lengthMs === 'number' &&
      typeof s.runMs === 'number' &&
      (s.resumedAt === null || typeof s.resumedAt === 'number') &&
      typeof s.startedAt === 'number' &&
      typeof s.breakMs === 'number' &&
      typeof s.title === 'string'
    return ok ? ({ courseId: null, target: null, ...s } as FocusState) : null
  } catch {
    return null
  }
}
