import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createStudent, deleteUser, type TestUser } from './helpers'

/**
 * One-off changes to a single lecture: private, checked against the published session, and followed by reminders,
 * the morning summary, check-in prompts and the calendar subscription. CSIT 601 is on Mondays, 7:30 to 9:30 pm.
 */

let a: TestUser
let b: TestUser
let monday601: string

beforeAll(async () => {
  a = await createStudent('changes-a')
  b = await createStudent('changes-b')
  for (const user of [a, b]) {
    await user.client.rpc('enrol_default_courses')
    await user.client.from('course_enrolments').update({ status: 'enrolled' }).eq('status', 'pending_confirmation')
  }
  const { data } = await a.client.from('timetable_entries').select('id, courses!inner(code)').eq('courses.code', 'CSIT 601').eq('day_of_week', 1).single()
  monday601 = data?.id as string
  if (!monday601) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

const change = (user: TestUser, values: Record<string, unknown>) =>
  user.client
    .from('lecture_exceptions')
    .upsert({ user_id: user.id, entry_id: monday601, held_on: '2026-11-23', status: 'cancelled', ...values }, { onConflict: 'user_id,entry_id,held_on' })
    .select('status, moved_date, moved_start, moved_venue')
    .single()
const remind = (user: TestUser, at: string) => user.client.rpc('generate_lecture_notifications', { p_now: at }).then((r) => r.data as number)

describe('changes to a single lecture', () => {
  it('must be for a day the lecture is held, from the day lectures begin, with a full new time when moved', async () => {
    expect((await change(a, { held_on: '2026-11-24' })).error?.message).toBe('This lecture is not held on that day')
    expect((await change(a, { held_on: '2026-11-09' })).error?.message).toBe('Lectures have not begun on that day')
    expect((await change(a, { status: 'moved', moved_date: '2026-11-25' })).error?.message).toBe('Give the new day, start and end time')
    expect((await change(a, { status: 'moved', moved_date: '2026-11-25', moved_start: '14:00', moved_end: '12:00' })).error?.message).toBe(
      'The new end time must be after the start time',
    )
    const cancelled = await change(a, { moved_date: '2026-11-25', moved_start: '12:00', moved_end: '14:00', moved_venue: 'Hall' })
    expect(cancelled.error).toBeNull()
    expect(cancelled.data).toEqual({ status: 'cancelled', moved_date: null, moved_start: null, moved_venue: '' })
  })

  it('are private to the student', async () => {
    expect((await b.client.from('lecture_exceptions').select('id')).data).toEqual([])
    const forged = await b.client.from('lecture_exceptions').insert({ user_id: a.id, entry_id: monday601, held_on: '2026-11-30', status: 'cancelled' })
    expect(forged.error).not.toBeNull()
    expect((await anonClient().from('lecture_exceptions').select('id')).data ?? []).toEqual([])
  })

  it('stop the reminder, the morning summary and the check-in prompt of a cancelled lecture', async () => {
    // Monday 23 November: a cancelled CSIT 601; b did not.
    expect(await remind(a, '2026-11-23T07:00:00Z')).toBe(0)
    expect(await remind(a, '2026-11-23T18:45:00Z')).toBe(0)
    expect(await remind(a, '2026-11-23T21:45:00Z')).toBe(0)
    expect(await remind(b, '2026-11-23T18:45:00Z')).toBe(1)
  })

  it('remind about a moved lecture on its new day and ask about it afterwards, under its normal date', async () => {
    // Monday 30 November moved to Wednesday 2 December, 12:00 to 2:00 pm in the Great Hall.
    const moved = await change(a, { held_on: '2026-11-30', status: 'moved', moved_date: '2026-12-02', moved_start: '12:00', moved_end: '14:00', moved_venue: 'Great Hall' })
    expect(moved.error).toBeNull()
    expect(await remind(a, '2026-11-30T18:45:00Z')).toBe(0)
    expect(await remind(a, '2026-12-02T07:00:00Z')).toBe(1)
    expect(await remind(a, '2026-12-02T11:15:00Z')).toBe(1)
    expect(await remind(a, '2026-12-02T14:15:00Z')).toBe(1)
    const { data } = await a.client.from('notifications').select('title, body, dedupe_key').like('dedupe_key', '%2026-1%').order('created_at')
    // Wednesday also has its own lectures; the summary lists the moved CSIT 601 among them, in its new room.
    expect(data?.map((n) => n.title)).toEqual(['You have 3 lectures today', 'CSIT 601 lecture at 12:00 pm (moved)', 'How did CSIT 601 go?'])
    expect(data?.[0]?.body).toMatch(/^CSIT 601 at 12:00 pm \(Great Hall\), /)
    expect(data?.[1]?.body).toContain('Great Hall · 12:00 pm to 2:00 pm Ghana time.')
    expect(data?.[2]?.dedupe_key).toBe(`checkin:${monday601}:2026-11-30`)
  })

  it('appear in the calendar subscription', async () => {
    const token = (await a.client.rpc('create_calendar_feed')).data as string
    const feed = (await anonClient().rpc('calendar_feed', { p_token: token })).data as { exceptions: { held_on: string; status: string; moved_start: string | null }[] }
    expect(feed.exceptions.map((x) => [x.held_on, x.status, x.moved_start])).toEqual(
      expect.arrayContaining([
        ['2026-11-23', 'cancelled', null],
        ['2026-11-30', 'moved', '12:00'],
      ]),
    )
  })
})
