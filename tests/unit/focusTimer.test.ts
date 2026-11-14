import { describe, expect, it } from 'vitest'
import { elapsedMs, focusedMinutes, formatClock, isDone, parseFocusState, pause, remainingMs, resume, startBreak, startFocus } from '@/lib/focusTimer'

const MIN = 60_000
const T0 = Date.parse('2026-11-16T18:00:00Z')
const start = () => startFocus({ focusMinutes: 25, breakMinutes: 5, courseId: 'c601', title: 'Focus: CSIT 601', target: null }, T0)

describe('the focus timer', () => {
  it('counts down from the focus length and finishes', () => {
    const s = start()
    expect(remainingMs(s, T0)).toBe(25 * MIN)
    expect(formatClock(remainingMs(s, T0 + 30_500))).toBe('24:30')
    expect(isDone(s, T0 + 25 * MIN - 1)).toBe(false)
    expect(isDone(s, T0 + 25 * MIN)).toBe(true)
    expect(elapsedMs(s, T0 + 40 * MIN)).toBe(25 * MIN)
    expect(focusedMinutes(s, T0 + 40 * MIN)).toBe(25)
  })

  it('leaves paused time out of the minutes focused', () => {
    let s = pause(start(), T0 + 10 * MIN)
    // Ten minutes away from the desk.
    expect(focusedMinutes(s, T0 + 20 * MIN)).toBe(10)
    s = resume(s, T0 + 20 * MIN)
    expect(focusedMinutes(s, T0 + 22 * MIN + 59_000)).toBe(12)
    expect(remainingMs(s, T0 + 35 * MIN)).toBe(0)
    expect(pause(pause(s, T0 + 21 * MIN), T0 + 30 * MIN)).toEqual(pause(s, T0 + 21 * MIN))
  })

  it('takes the break after focusing, which logs nothing', () => {
    const rest = startBreak(start(), T0 + 25 * MIN)
    expect(rest).toMatchObject({ phase: 'break', lengthMs: 5 * MIN, courseId: 'c601' })
    expect(focusedMinutes(rest, T0 + 28 * MIN)).toBe(0)
    expect(isDone(rest, T0 + 30 * MIN)).toBe(true)
  })

  it('formats long sessions with hours', () => {
    expect(formatClock(90 * MIN)).toBe('1:30:00')
    expect(formatClock(-5)).toBe('00:00')
  })

  it('restores a stored timer and rejects anything malformed', () => {
    const s = start()
    expect(parseFocusState(JSON.stringify(s))).toEqual(s)
    expect(parseFocusState(null)).toBeNull()
    expect(parseFocusState('not json')).toBeNull()
    expect(parseFocusState(JSON.stringify({ ...s, phase: 'nap' }))).toBeNull()
  })
})
