import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, serviceClient, type TestUser } from './helpers'

/**
 * The official timetable: shared and read-only for students, changed only by administrators with an audit trail,
 * private attendance choices, reminders only for confirmed sessions, and a study plan that keeps clear of lectures.
 */

let a: TestUser
let b: TestUser
let admin: TestUser
let sourceId: string
let entries: { id: string; day_of_week: number; start_time: string; end_time: string; venue: string; course_id: string; code: string }[]
const MY_COURSES = ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 613', 'CSIT 617', 'CSIT 621']
const entry = (code: string, day: number) => entries.find((e) => e.code === code && e.day_of_week === day) as (typeof entries)[number]
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

beforeAll(async () => {
  a = await createStudent('timetable-a')
  b = await createStudent('timetable-b')
  admin = await createStudent('timetable-admin')
  const service = serviceClient()
  const { error } = await service.from('user_roles').insert({ user_id: admin.id, role: 'admin' })
  if (error) throw error
  const { data: source } = await a.client.from('timetable_sources').select('id').eq('is_current', true).single()
  if (!source) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
  sourceId = source.id as string
  const { data } = await a.client.from('timetable_entries').select('id, day_of_week, start_time, end_time, venue, course_id, courses(code)').eq('source_id', sourceId)
  entries = (data ?? []).map((e) => ({ ...e, code: (e.courses as unknown as { code: string }).code })) as typeof entries
  for (const user of [a, b]) {
    await user.client.rpc('enrol_default_courses')
    await user.client.from('course_enrolments').update({ status: 'enrolled' }).eq('status', 'pending_confirmation')
  }
})

afterAll(async () => {
  const service = serviceClient()
  const thursday605 = entries ? entry('CSIT 605', 4) : undefined
  if (thursday605) await service.from('timetable_entries').update({ venue: 'Earth Science Room 1', change_reason: '' }).eq('id', thursday605.id)
  if (sourceId) {
    await service.from('timetable_entry_changes').delete().eq('source_id', sourceId).neq('change_type', 'imported')
    await service.from('timetable_publications').delete().eq('source_id', sourceId)
    await service.from('timetable_sources').update({ revision: 0 }).eq('id', sourceId)
  }
  await deleteUser(a)
  await deleteUser(b)
  await deleteUser(admin)
})

describe('published timetable', () => {
  it('gives every student all twenty published sessions for the eight courses, without CSIT 609', () => {
    expect(entries).toHaveLength(20)
    expect([...new Set(entries.map((e) => e.code))].sort()).toEqual(MY_COURSES)
    expect(entries.some((e) => e.code === 'CSIT 609')).toBe(false)
    expect(entries.filter((e) => e.code === 'CSIT 613').map((e) => e.venue)).toEqual(['Earth Science Room 2', 'Earth Science Room 2', 'Earth Science Room 2'])
  })

  it('records the source, the original import and the confirmed allocation', async () => {
    const { data: source } = await a.client.from('timetable_sources').select('time_zone, source_url, academic_year, semester, teaching_started_on').eq('id', sourceId).single()
    expect(source).toMatchObject({ time_zone: 'Africa/Accra', academic_year: '2026/2027', semester: 'Semester 1', teaching_started_on: '2026-11-16' })
    expect(source?.source_url).toBe('https://dcs.ug.edu.gh/post-grad-timetable/?programme=ITB')
    const { data: allocations } = await a.client.from('timetable_entries').select('allocation').eq('source_id', sourceId)
    expect(new Set((allocations ?? []).map((r) => r.allocation))).toEqual(new Set(['all_students']))
    const { count } = await a.client.from('timetable_entry_changes').select('id', { count: 'exact', head: true }).eq('change_type', 'imported').eq('source_id', sourceId)
    expect(count).toBe(20)
  })

  it('does not let a student change, add or import official sessions', async () => {
    const target = entry('CSIT 601', 1)
    const update = await a.client.from('timetable_entries').update({ venue: 'Somewhere else', change_reason: 'test' }).eq('id', target.id).select('id')
    expect(update.data ?? []).toEqual([])
    const insert = await a.client.from('timetable_entries').insert({ source_id: sourceId, course_id: target.course_id, day_of_week: 2, start_time: '08:00', end_time: '09:00', change_reason: 'x' })
    expect(insert.error).not.toBeNull()
    const source = await a.client.from('timetable_sources').update({ title: 'Hacked', teaching_started_on: '2026-11-16' }).eq('id', sourceId).select('id')
    expect(source.data ?? []).toEqual([])
    const publish = await a.client.rpc('publish_timetable_changes', { p_source_id: sourceId, p_summary: 'nope' })
    expect(publish.error).not.toBeNull()
    const imported = await a.client.rpc('import_timetable_version', { p_source: { slug: 'x-x-x', title: 'x', academic_year: '2026/2027', semester: 'Semester 1' }, p_entries: [] })
    expect(imported.error).not.toBeNull()
    const { data: still } = await serviceClient().from('timetable_entries').select('venue').eq('id', target.id).single()
    expect(still?.venue).toBe('Earth Science Room 1')
  })
})

describe('attendance choices', () => {
  it('are private to each student', async () => {
    const monday601 = entry('CSIT 601', 1)
    const saved = await a.client.from('timetable_attendance').upsert({ user_id: a.id, entry_id: monday601.id, status: 'confirmed' })
    expect(saved.error).toBeNull()
    const { data: mine } = await a.client.from('timetable_attendance').select('entry_id, status')
    expect(mine).toEqual([{ entry_id: monday601.id, status: 'confirmed' }])
    const { data: theirs } = await b.client.from('timetable_attendance').select('entry_id')
    expect(theirs).toEqual([])
    const spoof = await b.client.from('timetable_attendance').upsert({ user_id: a.id, entry_id: entry('CSIT 617', 2).id, status: 'not_assigned' })
    expect(spoof.error).not.toBeNull()
    const changeTheirs = await b.client.from('timetable_attendance').update({ status: 'not_assigned' }).eq('user_id', a.id).select('entry_id')
    expect(changeTheirs.data ?? []).toEqual([])
  })

  it('drive lecture reminders for confirmed sessions, once, with the venue in Ghana time', async () => {
    // Monday 16 November 2026, 18:45 in Accra: 45 minutes before the CSIT 601 lecture.
    const first = await a.client.rpc('generate_lecture_notifications', { p_now: '2026-11-16T18:45:00Z' })
    expect(first.data).toBe(1)
    const again = await a.client.rpc('generate_lecture_notifications', { p_now: '2026-11-16T18:50:00Z' })
    expect(again.data).toBe(0)
    const { data } = await a.client.from('notifications').select('title, body, link').eq('kind', 'lecture_reminder')
    expect(data).toEqual([
      { title: 'CSIT 601 lecture at 7:30 pm', body: expect.stringContaining('Earth Science Room 1 · 7:30 pm to 9:30 pm Ghana time.'), link: '/timetable/official' },
    ])
    // b has made no choice: the allocation is confirmed for all students, so b is reminded too.
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-16T18:45:00Z' })).data).toBe(1)
  })

  it('are not sent before official lectures begin on Monday 16 November 2026', async () => {
    // Saturday 14 November, 7 am and 9 am: the weekend sessions before teaching begins are not held.
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-14T07:00:00Z' })).data).toBe(0)
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-14T09:00:00Z' })).data).toBe(0)
  })

  it('stop when the student marks a confirmed session as not assigned to their class', async () => {
    const saved = await b.client.from('timetable_attendance').upsert({ user_id: b.id, entry_id: entry('CSIT 601', 1).id, status: 'not_assigned' })
    expect(saved.error).toBeNull()
    expect((await b.client.rpc('generate_lecture_notifications', { p_now: '2026-11-23T18:45:00Z' })).data).toBe(0)
  })

  it('send a morning summary and respect the student’s preferences', async () => {
    expect((await a.client.rpc('generate_lecture_notifications', { p_now: '2026-11-23T07:00:00Z' })).data).toBe(1)
    const { data } = await a.client.from('notifications').select('title, body').like('title', 'You have%')
    expect(data).toEqual([{ title: 'You have 1 lecture today', body: 'CSIT 601 at 7:30 pm (Earth Science Room 1). Ghana time.' }])
    await a.client.from('timetable_preferences').upsert({ user_id: a.id, lecture_reminders: false, same_day_summary: false })
    expect((await a.client.rpc('generate_lecture_notifications', { p_now: '2026-11-30T18:45:00Z' })).data).toBe(0)
  })
})

describe('administrator changes', () => {
  it('require a reason, show students the new venue and keep the original in the history', async () => {
    const thursday605 = entry('CSIT 605', 4)
    const noReason = await admin.client.from('timetable_entries').update({ venue: 'Earth Science Room 3', change_reason: '' }).eq('id', thursday605.id)
    expect(noReason.error?.message).toMatch(/reason/)
    const ok = await admin.client.from('timetable_entries').update({ venue: 'Earth Science Room 3', change_reason: 'Room 1 under repair' }).eq('id', thursday605.id).select('id')
    expect(ok.data).toHaveLength(1)

    const { data: seen } = await a.client.from('timetable_entries').select('venue').eq('id', thursday605.id).single()
    expect(seen?.venue).toBe('Earth Science Room 3')
    const { data: history } = await admin.client.from('timetable_entry_changes').select('change_type, before, after, reason, publication_id').eq('entry_id', thursday605.id).order('changed_at')
    expect(history?.map((h) => h.change_type)).toEqual(['imported', 'updated'])
    expect(history?.[1]).toMatchObject({ reason: 'Room 1 under repair', publication_id: null })
    expect((history?.[1]?.before as { venue: string }).venue).toBe('Earth Science Room 1')
    const { data: row } = await admin.client.from('timetable_entries').select('change_reason').eq('id', thursday605.id).single()
    expect(row?.change_reason).toBe('')
    const reusedReason = await admin.client.from('timetable_entries').update({ notes: 'No reason given' }).eq('id', thursday605.id)
    expect(reusedReason.error?.message).toMatch(/reason/)
    const { data: hiddenFromStudent } = await a.client.from('timetable_entry_changes').select('id').eq('entry_id', thursday605.id).eq('change_type', 'updated')
    expect(hiddenFromStudent).toEqual([])
  })

  it('publish the change and notify the students who take the course', async () => {
    const notified = await admin.client.rpc('publish_timetable_changes', { p_source_id: sourceId, p_summary: 'CSIT 605 on Thursday moves to Earth Science Room 3.' })
    expect(notified.error).toBeNull()
    expect(notified.data).toBeGreaterThanOrEqual(2)
    for (const user of [a, b]) {
      const { data } = await user.client.from('notifications').select('title, body').eq('kind', 'timetable_change')
      expect(data).toEqual([{ title: 'Official timetable updated', body: 'CSIT 605 on Thursday moves to Earth Science Room 3.' }])
    }
    const { data: visible } = await a.client.from('timetable_entry_changes').select('change_type').eq('entry_id', entry('CSIT 605', 4).id).eq('change_type', 'updated')
    expect(visible).toHaveLength(1)
    const { data: source } = await a.client.from('timetable_sources').select('revision').eq('id', sourceId).single()
    expect(source?.revision).toBe(1)
    const nothingLeft = await admin.client.rpc('publish_timetable_changes', { p_source_id: sourceId, p_summary: 'Again' })
    expect(nothingLeft.error?.message).toMatch(/no unpublished changes/)
  })
})

describe('personal study plan', () => {
  it('keeps the provisional study blocks clear of every published lecture and its travel time', async () => {
    expect((await b.client.rpc('seed_default_timetable')).error).toBeNull()
    const { data: blocks } = await b.client.from('timetable_events').select('title, kind, day_of_week, start_time, end_time')
    expect(blocks?.length).toBeGreaterThan(0)
    expect(blocks?.every((e) => e.kind !== 'lecture')).toBe(true)
    for (const block of blocks ?? [])
      for (const lecture of entries) {
        if (lecture.day_of_week !== block.day_of_week) continue
        const clash = minutes(block.start_time) < minutes(lecture.end_time) + 30 && minutes(lecture.start_time) - 30 < minutes(block.end_time)
        expect(clash, `${block.title} clashes with ${lecture.code}`).toBe(false)
      }
  })
})
