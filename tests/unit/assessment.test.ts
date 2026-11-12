import { describe, expect, it } from 'vitest'
import { describeCorrectAnswer, formatClock, isAnswered, masteryBand, secondsRemaining } from '@/lib/assessment'
import type { AttemptQuestion } from '@/types/database'

function question(partial: Partial<AttemptQuestion>): AttemptQuestion {
  return {
    id: 'q',
    type: 'mcq',
    bloom: 'apply',
    difficulty: 'medium',
    objective: '',
    prompt: 'Prompt',
    scenario: null,
    case: null,
    options: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
    ],
    marks: 1,
    structure: [],
    rubric: [],
    lessonId: null,
    moduleId: null,
    courseId: null,
    source: 'ai_practice',
    ...partial,
  }
}

describe('assessment helpers', () => {
  it('detects answered questions for every type', () => {
    expect(isAnswered(question({}), undefined)).toBe(false)
    expect(isAnswered(question({}), { option: 'a' })).toBe(true)
    expect(isAnswered(question({ type: 'true_false', options: null }), { value: false })).toBe(true)
    expect(isAnswered(question({ type: 'short_answer', options: null }), { text: '   ' })).toBe(false)
    const matching = question({
      type: 'matching',
      options: { left: [{ id: 'l1', text: 'A' }, { id: 'l2', text: 'B' }], right: [{ id: 'r1', text: '1' }, { id: 'r2', text: '2' }] },
    })
    expect(isAnswered(matching, { pairs: { l1: 'r2' } })).toBe(false)
    expect(isAnswered(matching, { pairs: { l1: 'r2', l2: 'r1' } })).toBe(true)
  })

  it('describes correct answers after submission', () => {
    expect(describeCorrectAnswer(question({ correct: { option: 'b' } }))).toBe('Beta')
    expect(describeCorrectAnswer(question({ type: 'true_false', options: null, correct: { value: true } }))).toBe('True')
    expect(describeCorrectAnswer(question({ type: 'short_answer', options: null, correct: { answers: ['TLS', 'Transport Layer Security'] } }))).toBe(
      'TLS / Transport Layer Security',
    )
    expect(describeCorrectAnswer(question({}))).toBeNull()
  })

  it('computes and formats the remaining time', () => {
    const now = Date.parse('2026-11-12T10:00:00Z')
    expect(secondsRemaining(null, now)).toBeNull()
    expect(secondsRemaining('2026-11-12T10:01:30Z', now)).toBe(90)
    expect(secondsRemaining('2026-11-12T09:00:00Z', now)).toBe(0)
    expect(formatClock(90)).toBe('01:30')
    expect(formatClock(3725)).toBe('1:02:05')
  })

  it('bands results against the pass mark', () => {
    expect(masteryBand(85, 80)).toBe('mastered')
    expect(masteryBand(80, 80)).toBe('mastered')
    expect(masteryBand(65, 80)).toBe('developing')
    expect(masteryBand(40, 80)).toBe('needs-work')
  })
})
