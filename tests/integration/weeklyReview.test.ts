import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, type TestUser } from './helpers'

/**
 * The end-of-week review: at 9 pm on the last day of each student's own study week, once, with their figures.
 * a's studies started on Friday 13 November 2026 (weeks Friday to Thursday); b has no start of their own, so weeks
 * follow the day lectures begin, Monday 16 November (Monday to Sunday).
 */

let a: TestUser
let b: TestUser

beforeAll(async () => {
  a = await createStudent('review-a')
  b = await createStudent('review-b')
  const onboarded = new Date().toISOString()
  await a.client.from('profiles').update({ onboarding_completed_at: onboarded, study_started_on: '2026-11-13', weekly_study_target_hours: 15 }).eq('id', a.id)
  await b.client.from('profiles').update({ onboarding_completed_at: onboarded }).eq('id', b.id)
  await a.client.from('study_sessions').insert({
    user_id: a.id,
    title: 'Focus: CSIT 601',
    planned_start: '2026-11-17T18:00:00Z',
    planned_end: '2026-11-17T19:30:00Z',
    status: 'completed',
    actual_minutes: 90,
  })
  await a.client.from('assignments').insert({ user_id: a.id, title: 'CSIT 601 proposal', due_at: '2026-11-21T12:00:00Z' })
  const { data: entry } = await a.client.from('timetable_entries').select('id, courses!inner(code)').eq('courses.code', 'CSIT 601').eq('day_of_week', 1).single()
  const log = await a.client.from('lecture_logs').insert({ user_id: a.id, entry_id: entry?.id as string, held_on: '2026-11-16', attendance: 'attended' })
  if (log.error) throw log.error
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

const run = (user: TestUser, at: string) => user.client.rpc('generate_weekly_review', { p_now: at }).then((r) => r.data as number)

describe('the weekly review', () => {
  it('arrives from 9 pm on the last day of the student’s study week, once', async () => {
    expect(await run(a, '2026-11-19T20:59:00Z')).toBe(0)
    expect(await run(a, '2026-11-18T21:30:00Z')).toBe(0)
    expect(await run(a, '2026-11-19T21:05:00Z')).toBe(1)
    expect(await run(a, '2026-11-19T22:30:00Z')).toBe(0)
    const { data } = await a.client.from('notifications').select('title, body, link').eq('title', 'Your week in review')
    expect(data).toEqual([
      {
        title: 'Your week in review',
        body: 'This week: 1.5 of 15 hours studied, 0 lessons completed, 1 lecture checked in. Coming up in the next 7 days: 1 deadline.',
        link: '/review',
      },
    ])
  })

  it('follows the day lectures begin for a student without a start of their own', async () => {
    expect(await run(b, '2026-11-19T21:05:00Z')).toBe(0)
    expect(await run(b, '2026-11-22T21:05:00Z')).toBe(1)
    const { data } = await b.client.from('notifications').select('body').eq('title', 'Your week in review')
    expect(data?.[0]?.body).toBe('This week: 0 of 15 hours studied, 0 lessons completed, 0 lectures checked in. Coming up in the next 7 days: 0 deadlines.')
  })

  it('can be turned off', async () => {
    await a.client.from('timetable_preferences').upsert({ user_id: a.id, weekly_review: false })
    expect(await run(a, '2026-11-26T21:05:00Z')).toBe(0)
  })
})
