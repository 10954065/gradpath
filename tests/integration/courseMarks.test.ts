import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createStudent, deleteUser, type TestUser } from './helpers'

/** Official marks: private to each student, with a course's weights never adding up to more than 100%. */

let a: TestUser
let b: TestUser
let csit601: string
let csit603: string

beforeAll(async () => {
  a = await createStudent('marks-a')
  b = await createStudent('marks-b')
  const { data } = await a.client.from('courses').select('id, code').in('code', ['CSIT 601', 'CSIT 603'])
  csit601 = (data?.find((c) => c.code === 'CSIT 601')?.id ?? '') as string
  csit603 = (data?.find((c) => c.code === 'CSIT 603')?.id ?? '') as string
  if (!csit601 || !csit603) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

const add = (user: TestUser, values: Record<string, unknown>) =>
  user.client
    .from('course_marks')
    .insert({ user_id: user.id, course_id: csit601, title: 'Mid-semester test', component: 'coursework', weight_percent: 30, ...values })
    .select('id, title, weight_percent, score, max_score')
    .single()

describe('course marks', () => {
  it('record each assessed component with its weight and, once released, the mark', async () => {
    const test = await add(a, { title: '  Mid-semester test ', score: 21.5, max_score: 25 })
    expect(test.error).toBeNull()
    expect(test.data).toMatchObject({ title: 'Mid-semester test', weight_percent: 30, score: 21.5, max_score: 25 })
    const exam = await add(a, { title: 'End-of-semester examination', component: 'examination', weight_percent: 70 })
    expect(exam.error).toBeNull()
    expect(exam.data?.score).toBeNull()
  })

  it('never let a course’s weights add up to more than 100%', async () => {
    const extra = await add(a, { title: 'Quiz', weight_percent: 5 })
    expect(extra.error?.code).toBe('P0001')
    expect(extra.error?.message).toBe('The weights for this course would add up to 105 percent; they cannot exceed 100.')
    const { data: test } = await a.client.from('course_marks').select('id').eq('title', 'Mid-semester test').single()
    const raise = await a.client.from('course_marks').update({ weight_percent: 31 }).eq('id', test?.id as string).select('id')
    expect(raise.error?.message).toContain('101 percent')
    // Each course has its own 100%.
    expect((await add(a, { course_id: csit603, weight_percent: 100 })).error).toBeNull()
  })

  it('reject a mark above what it is out of', async () => {
    const tooHigh = await add(b, { score: 31, max_score: 30 })
    expect(tooHigh.error).not.toBeNull()
  })

  it('are private to the student', async () => {
    expect((await b.client.from('course_marks').select('id')).data).toEqual([])
    const theirs = await b.client.from('course_marks').update({ score: 0 }).eq('user_id', a.id).select('id')
    expect(theirs.data ?? []).toEqual([])
    const forged = await b.client.from('course_marks').insert({ user_id: a.id, course_id: csit601, title: 'Forged', component: 'coursework', weight_percent: 1 })
    expect(forged.error).not.toBeNull()
    expect((await anonClient().from('course_marks').select('id')).data ?? []).toEqual([])
  })
})
