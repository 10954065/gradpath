import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createStudent, deleteUser, localEnv, type TestUser } from './helpers'

/** The private calendar subscription: a secret link per student, served by api/calendar.ts. */

let a: TestUser
let b: TestUser

beforeAll(async () => {
  a = await createStudent('calendar-a')
  b = await createStudent('calendar-b')
  for (const user of [a, b]) {
    await user.client.rpc('enrol_default_courses')
    await user.client.from('course_enrolments').update({ status: 'enrolled' }).eq('status', 'pending_confirmation')
  }
  await a.client.from('assignments').insert({ user_id: a.id, title: 'CSIT 601 examination', kind: 'examination', due_at: '2027-03-12T09:00:00Z', description: 'Venue: Great Hall' })
  await a.client.from('timetable_events').insert({ user_id: a.id, title: 'Own reading block', kind: 'study', recurrence: 'once', event_date: '2026-11-20', start_time: '10:00', end_time: '11:00' })
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

describe('calendar links', () => {
  let token: string

  it('are created by the student, visible only to them and never written directly', async () => {
    const created = await a.client.rpc('create_calendar_feed')
    expect(created.error).toBeNull()
    token = created.data as string
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect((await a.client.from('calendar_feeds').select('token')).data).toEqual([{ token }])
    expect((await b.client.from('calendar_feeds').select('token')).data).toEqual([])
    const forged = await b.client.from('calendar_feeds').insert({ user_id: b.id, token: 'f'.repeat(64) })
    expect(forged.error).not.toBeNull()
    expect((await anonClient().rpc('create_calendar_feed')).error).not.toBeNull()
  })

  it('give exactly that student’s lectures, own blocks and examinations, and nothing for a wrong token', async () => {
    const feed = (await anonClient().rpc('calendar_feed', { p_token: token })).data as {
      lecturesStartOn: string
      lectures: { code: string }[]
      events: { title: string }[]
      exams: { title: string }[]
    }
    expect(feed.lecturesStartOn).toBe('2026-11-16')
    expect(feed.lectures).toHaveLength(20)
    expect(feed.events.map((e) => e.title)).toContain('Own reading block')
    expect(feed.exams.map((e) => e.title)).toEqual(['CSIT 601 examination'])
    expect((await anonClient().rpc('calendar_feed', { p_token: 'a'.repeat(64) })).data).toBeNull()
    expect((await anonClient().rpc('calendar_feed', { p_token: "' or 1=1 --" })).data).toBeNull()
  })

  it('leave out a lecture the student marked as not for their class', async () => {
    const { data: entry } = await a.client.from('timetable_entries').select('id, courses!inner(code)').eq('courses.code', 'CSIT 601').limit(1).single()
    await a.client.from('timetable_attendance').upsert({ user_id: a.id, entry_id: entry?.id as string, status: 'not_assigned' })
    const feed = (await anonClient().rpc('calendar_feed', { p_token: token })).data as { lectures: unknown[] }
    expect(feed.lectures).toHaveLength(19)
  })

  it('are served as a calendar by the endpoint, and stop working when replaced', async () => {
    const env = localEnv()
    process.env.SUPABASE_URL = env.url
    process.env.SUPABASE_ANON_KEY = env.anonKey
    const { GET } = await import('../../api/calendar')
    const ok = await GET(new Request(`https://gradpath.test/api/calendar?token=${token}`))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    const body = await ok.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('SUMMARY:CSIT 603 lecture')
    expect(body).toContain('SUMMARY:Own reading block')
    expect(body).toContain('LOCATION:Great Hall')
    expect((await GET(new Request('https://gradpath.test/api/calendar?token=nope'))).status).toBe(404)

    const replaced = (await a.client.rpc('create_calendar_feed')).data as string
    expect(replaced).not.toBe(token)
    expect((await GET(new Request(`https://gradpath.test/api/calendar?token=${token}`))).status).toBe(404)
    await a.client.rpc('delete_calendar_feed')
    expect((await GET(new Request(`https://gradpath.test/api/calendar?token=${replaced}`))).status).toBe(404)
  })
})
