/** Consecutive days with recorded learning activity, ending today (or yesterday if today has none yet). */
export function currentStreak(activeDays: readonly string[], today: Date = new Date()): number {
  const set = new Set(activeDays)
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (set.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export type FlameState = 'lit' | 'fading' | 'out'

export interface StreakStatus {
  /** Days in a row with lesson progress, ending today (or yesterday while today is still open). */
  current: number
  /** lit: a lesson is done today. fading: alive from yesterday, today's lesson not yet taken. out: no streak. */
  state: FlameState
  /** Longest run of consecutive lesson days on record. */
  best: number
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function streakStatus(lessonDays: readonly string[], today: Date = new Date()): StreakStatus {
  const days = new Set(lessonDays)
  const current = currentStreak(lessonDays, today)
  const state: FlameState = days.has(dayKey(today)) ? 'lit' : current > 0 ? 'fading' : 'out'
  let best = 0
  let run = 0
  let previous: number | null = null
  for (const day of [...days].sort()) {
    const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
    const index = Date.UTC(y, m - 1, d) / 86_400_000
    run = previous !== null && index === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = index
  }
  return { current, state, best }
}

export function streakMessage({ state, current, best }: StreakStatus): string {
  if (state === 'lit') return 'Today’s lesson is done. Your flame is lit.'
  if (state === 'fading') return `Take a lesson today to keep your ${current} day flame alive.`
  return best > 0 ? `Your flame went out. Take a lesson to relight it (best: ${best} days).` : 'Take a lesson today to light your flame.'
}

/** Mean of the best score per quiz, grouped by a key (e.g. course id). Returns null when nothing is scored. */
export function bestScoreAverage<T extends { quiz_id: string; percent: number | null }>(attempts: readonly T[], groupOf: (a: T) => string | null): Map<string, number> {
  const best = new Map<string, { group: string; pct: number }>()
  for (const a of attempts) {
    const group = groupOf(a)
    if (a.percent === null || group === null) continue
    const pct = Number(a.percent)
    const prev = best.get(a.quiz_id)
    if (!prev || pct > prev.pct) best.set(a.quiz_id, { group, pct })
  }
  const sums = new Map<string, { total: number; n: number }>()
  for (const { group, pct } of best.values()) {
    const s = sums.get(group) ?? { total: 0, n: 0 }
    sums.set(group, { total: s.total + pct, n: s.n + 1 })
  }
  return new Map([...sums.entries()].map(([g, s]) => [g, Math.round(s.total / s.n)]))
}
