/** Consecutive days with recorded learning activity, ending today (or yesterday if today has none yet). */
export function currentStreak(activeDays: readonly string[], today: Date = new Date()): number {
  const set = new Set(activeDays)
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (!set.has(key(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (set.has(key(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
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
