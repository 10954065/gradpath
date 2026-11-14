import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createStudent, deleteUser, type TestUser } from './helpers'

/**
 * After-lecture check-ins: private to each student, consistent with the published session, and a check-in prompt
 * after each lecture until the student checks in.
 */

let a: TestUser
let b: TestUser
let monday601: string
let lessons601: string[]
let lesson603: string
const MONDAY = '2026-11-16'

async function lessonIds(user: TestUser, code: string): Promise<string[]> {
  const { data } = await user.client
    .from('courses')
    .select('modules:course_modules(sort_order, lessons(id, sort_order))')
    .eq('code', code)
    .single()
  const modules = ((data?.modules ?? []) as { sort_order: number; lessons: { id: string; sort_order: number }[] }[]).sort((x, y) => x.sort_order - y.sort_order)
  return modules.flatMap((m) => [...m.lessons].sort((x, y) => x.sort_order - y.sort_order).map((l) => l.id))
}

beforeAll(async () => {
  a = await createStudent('lectures-a')
  b = await createStudent('lectures-b')
  for (const user of [a, b]) {
    await user.client.rpc('enrol_default_courses')
    await user.client.from('course_enrolments').update({ status: 'enrolled' }).eq('status', 'pending_confirmation')
  }
  const { data } = await a.client.from('timetable_entries').select('id, day_of_week, courses!inner(code)').eq('courses.code', 'CSIT 601').eq('day_of_week', 1)
  monday601 = (data?.[0]?.id ?? '') as string
  lessons601 = await lessonIds(a, 'CSIT 601')
  lesson603 = (await lessonIds(a, 'CSIT 603'))[0] as string
  if (!monday601 || lessons601.length < 3 || !lesson603) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

const checkIn = (user: TestUser, values: Record<string, unknown>) =>
  user.client
    .from('lecture_logs')
    .upsert({ user_id: user.id, entry_id: monday601, held_on: MONDAY, attendance: 'attended', ...values }, { onConflict: 'user_id,entry_id,held_on' })
    .select('course_id, attendance, covered_lesson_ids, review_lesson_ids, note')
    .single()

describe('lecture check-ins', () => {
  it('record what a lecture covered, with the course taken from the published session', async () => {
    const { data, error } = await checkIn(a, {
      covered_lesson_ids: [lessons601[0], lessons601[1], lessons601[1]],
      review_lesson_ids: [lessons601[1]],
      note: 'Read chapter 2 before next week.',
      course_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).toBeNull()
    const { data: course } = await a.client.from('courses').select('id').eq('code', 'CSIT 601').single()
    expect(data?.course_id).toBe(course?.id)
    expect([...(data?.covered_lesson_ids ?? [])].sort()).toEqual([lessons601[0], lessons601[1]].sort())
    expect(data?.review_lesson_ids).toEqual([lessons601[1]])
  })

  it('replace the earlier check-in for the same lecture and day', async () => {
    const { data, error } = await checkIn(a, { covered_lesson_ids: [lessons601[0], lessons601[1], lessons601[2]], review_lesson_ids: [], note: 'Updated.' })
    expect(error).toBeNull()
    expect(data?.covered_lesson_ids).toHaveLength(3)
    const { count } = await a.client.from('lecture_logs').select('id', { count: 'exact', head: true })
    expect(count).toBe(1)
  })

  it('are private to the student', async () => {
    expect((await b.client.from('lecture_logs').select('id')).data).toEqual([])
    const theirs = await b.client.from('lecture_logs').update({ note: 'changed' }).eq('user_id', a.id).select('id')
    expect(theirs.data ?? []).toEqual([])
    const forged = await b.client.from('lecture_logs').insert({ user_id: a.id, entry_id: monday601, held_on: '2026-11-23', attendance: 'attended' })
    expect(forged.error).not.toBeNull()
    expect((await anonClient().from('lecture_logs').select('id')).data ?? []).toEqual([])
  })

  it('must match a day the lecture is held, on or after the day lectures begin', async () => {
    const wrongDay = await checkIn(b, { held_on: '2026-11-17' })
    expect(wrongDay.error?.message).toBe('This lecture is not held on that day')
    const beforeTeaching = await checkIn(b, { held_on: '2026-11-09' })
    expect(beforeTeaching.error?.message).toBe('Lectures had not begun on that day')
  })

  it('accept lessons from the lecture’s own course only, and reviews only of lessons covered', async () => {
    const otherCourse = await checkIn(b, { covered_lesson_ids: [lesson603] })
    expect(otherCourse.error?.message).toBe('Choose lessons from this course only')
    const notCovered = await checkIn(b, { covered_lesson_ids: [lessons601[0]], review_lesson_ids: [lessons601[1]] })
    expect(notCovered.error?.message).toBe('Only lessons the lecture covered can be marked for review')
  })

  it('keep no lessons for a cancelled lecture', async () => {
    const { data, error } = await checkIn(b, { attendance: 'cancelled', covered_lesson_ids: [lessons601[0]], review_lesson_ids: [lessons601[0]] })
    expect(error).toBeNull()
    expect(data).toMatchObject({ attendance: 'cancelled', covered_lesson_ids: [], review_lesson_ids: [] })
    await b.client.from('lecture_logs').delete().eq('user_id', b.id)
  })
})

describe('check-in prompts', () => {
  it('ask after a lecture ends, once, and not once the student has checked in', async () => {
    // Monday 16 November, 9:45 pm in Accra: CSIT 601 ended at 9:30 pm. a has checked in; b has not.
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-16T21:45:00Z' })).data).toBe(1)
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-16T22:00:00Z' })).data).toBe(0)
    const { data } = await b.client.from('notifications').select('title, link').like('title', 'How did%')
    expect(data).toEqual([{ title: 'How did CSIT 601 go?', link: '/lectures' }])
    expect((await a.client.rpc('generate_lecture_notifications', { p_now: '2026-11-16T21:45:00Z' })).data).toBe(0)
  })

  it('are not sent during a lecture, more than three hours after it, or before lectures begin', async () => {
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-23T20:00:00Z' })).data).toBe(0)
    await b.client.from('notifications').delete().eq('user_id', b.id)
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-24T00:31:00Z' })).data).toBe(0)
    // Saturday 14 November, 10 am: CSIT 613 would have ended at 9:30 am, but teaching begins on Monday 16 November.
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-14T10:00:00Z' })).data).toBe(0)
  })
})
