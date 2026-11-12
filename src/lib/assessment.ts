import type { AnswerResponse, AttemptQuestion, OptionItem } from '@/types/database'

export const OBJECTIVE_TYPES = ['mcq', 'true_false', 'short_answer', 'scenario', 'matching'] as const

export function isObjective(q: Pick<AttemptQuestion, 'type'>): boolean {
  return (OBJECTIVE_TYPES as readonly string[]).includes(q.type)
}

export function choiceOptions(q: AttemptQuestion): OptionItem[] {
  return Array.isArray(q.options) ? q.options : []
}

export function matchingOptions(q: AttemptQuestion): { left: OptionItem[]; right: OptionItem[] } {
  return q.options && !Array.isArray(q.options) ? q.options : { left: [], right: [] }
}

/** Whether the student has given a complete answer (used for navigation state and submit confirmation). */
export function isAnswered(q: AttemptQuestion, response: AnswerResponse | undefined): boolean {
  if (!response) return false
  switch (q.type) {
    case 'mcq':
    case 'scenario':
      return 'option' in response && Boolean(response.option)
    case 'true_false':
      return 'value' in response && typeof response.value === 'boolean'
    case 'short_answer':
    case 'essay':
    case 'case_analysis':
      return 'text' in response && response.text.trim().length > 0
    case 'matching': {
      if (!('pairs' in response)) return false
      const left = matchingOptions(q).left
      return left.length > 0 && left.every((l) => Boolean(response.pairs[l.id]))
    }
    default:
      return false
  }
}

/** Seconds remaining before the deadline (never negative); null for untimed attempts. */
export function secondsRemaining(deadlineAt: string | null, now = Date.now()): number | null {
  if (!deadlineAt) return null
  return Math.max(0, Math.floor((new Date(deadlineAt).getTime() - now) / 1000))
}

export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Human-readable correct answer for the review screen. */
export function describeCorrectAnswer(q: AttemptQuestion): string | null {
  const correct = q.correct
  if (!correct) return null
  switch (q.type) {
    case 'mcq':
    case 'scenario': {
      const option = choiceOptions(q).find((o) => o.id === correct.option)
      return option ? option.text : null
    }
    case 'true_false':
      return correct.value === true ? 'True' : correct.value === false ? 'False' : null
    case 'short_answer':
      return Array.isArray(correct.answers) ? (correct.answers as string[]).join(' / ') : null
    case 'matching': {
      const { left, right } = matchingOptions(q)
      const pairs = (correct.pairs ?? {}) as Record<string, string>
      return left.map((l) => `${l.text} → ${right.find((r) => r.id === pairs[l.id])?.text ?? '?'}`).join('; ')
    }
    default:
      return null
  }
}

export type MasteryBand = 'mastered' | 'developing' | 'needs-work'

/** Classification used for feedback copy. The pass mark comes from the server (default 80%). */
export function masteryBand(percent: number | null, passMark: number): MasteryBand {
  if (percent === null) return 'developing'
  if (percent >= passMark) return 'mastered'
  if (percent >= passMark - 20) return 'developing'
  return 'needs-work'
}
