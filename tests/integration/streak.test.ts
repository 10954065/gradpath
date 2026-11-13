import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, type TestUser } from './helpers'

/** The streak counts days with lesson progress. Proves the database logs them and students cannot forge them. */

let a: TestUser
let b: TestUser
let lessonIds: string[]

beforeAll(async () => {
  a = await createStudent('streak-a')
  b = await createStudent('streak-b')
  const { data } = await a.client.from('lessons').select('id').limit(2)
  if (!data || data.length < 2) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
  lessonIds = data.map((l) => l.id as string)
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

const daysOf = async (user: TestUser) => {
  const { data, error } = await user.client.from('lesson_days').select('day, lesson_id')
  expect(error).toBeNull()
  return data ?? []
}

describe('lesson days behind the streak flame', () => {
  it('does not count opening a lesson without reading it', async () => {
    const { error } = await a.client.from('lesson_progress').insert({ lesson_id: lessonIds[0], reading_percent: 0 })
    expect(error).toBeNull()
    expect(await daysOf(a)).toEqual([])
  })

  it('logs today once the student reads further, once per lesson', async () => {
    await a.client.from('lesson_progress').update({ reading_percent: 30 }).eq('lesson_id', lessonIds[0])
    await a.client.from('lesson_progress').update({ reading_percent: 60 }).eq('lesson_id', lessonIds[0])
    await a.client.from('lesson_progress').insert({ lesson_id: lessonIds[1], reading_percent: 10 })
    const days = await daysOf(a)
    expect(days).toHaveLength(2)
    expect(new Set(days.map((d) => d.day)).size).toBe(1)
  })

  it('keeps each student’s lesson days private', async () => {
    expect(await daysOf(b)).toEqual([])
  })

  it('does not let a student write lesson days directly', async () => {
    const { error } = await a.client.from('lesson_days').insert({ user_id: a.id, day: '2026-01-01', lesson_id: lessonIds[0] })
    expect(error).not.toBeNull()
    const { data } = await a.client.from('lesson_days').delete().eq('user_id', a.id).select()
    expect(data ?? []).toEqual([])
    expect(await daysOf(a)).toHaveLength(2)
  })
})
