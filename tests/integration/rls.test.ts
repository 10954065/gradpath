import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createStudent, deleteUser, serviceClient, type TestUser } from './helpers'

/**
 * Proves that Student A cannot read or change Student B's private records, that shared content is
 * read-only for students, and that privileged operations are enforced by the database.
 */

let a: TestUser
let b: TestUser
let lessonId: string
let courseId: string

beforeAll(async () => {
  a = await createStudent('student-a')
  b = await createStudent('student-b')
  const { data: lesson } = await a.client.from('lessons').select('id, course_modules!inner(course_id)').limit(1).single()
  if (!lesson) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
  lessonId = lesson.id as string
  courseId = (lesson.course_modules as unknown as { course_id: string }).course_id
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

describe('anonymous visitors', () => {
  it('cannot read courses or lessons', async () => {
    const anon = anonClient()
    const { data: courses } = await anon.from('courses').select('id')
    const { data: lessons } = await anon.from('lessons').select('id')
    expect(courses).toEqual([])
    expect(lessons).toEqual([])
  })
})

describe('private record isolation between two students', () => {
  const ownedTables: { table: string; row: () => Record<string, unknown>; patch: Record<string, unknown> }[] = [
    { table: 'student_notes', row: () => ({ title: 'A private note', body: 'secret', lesson_id: lessonId }), patch: { body: 'tampered' } },
    { table: 'assignments', row: () => ({ title: 'A assignment', course_id: courseId }), patch: { title: 'tampered' } },
    {
      table: 'study_sessions',
      row: () => ({ title: 'A session', planned_start: '2026-11-16T14:00:00Z', planned_end: '2026-11-16T16:00:00Z' }),
      patch: { title: 'tampered' },
    },
    {
      table: 'timetable_events',
      row: () => ({ title: 'A event', recurrence: 'weekly', day_of_week: 1, start_time: '14:00', end_time: '16:00' }),
      patch: { title: 'tampered' },
    },
    { table: 'bookmarks', row: () => ({ lesson_id: lessonId }), patch: { note: 'tampered' } },
    { table: 'revision_items', row: () => ({ item_type: 'topic', topic: 'Hashing' }), patch: { topic: 'tampered' } },
    { table: 'notifications', row: () => ({ kind: 'study_reminder', title: 'A reminder' }), patch: { title: 'tampered' } },
  ]

  for (const spec of ownedTables) {
    it(`${spec.table}: B cannot read, update or delete A's row, nor create rows as A`, async () => {
      const { data: created, error } = await a.client.from(spec.table).insert(spec.row()).select('id').single()
      expect(error).toBeNull()
      const id = (created as { id: string }).id

      const { data: seenByB } = await b.client.from(spec.table).select('id').eq('id', id)
      expect(seenByB).toEqual([])

      const { data: updated } = await b.client.from(spec.table).update(spec.patch).eq('id', id).select('id')
      expect(updated).toEqual([])

      const { data: deleted } = await b.client.from(spec.table).delete().eq('id', id).select('id')
      expect(deleted).toEqual([])

      const { data: stillThere } = await a.client.from(spec.table).select('id').eq('id', id)
      expect(stillThere).toHaveLength(1)

      const { error: forgeError } = await b.client.from(spec.table).insert({ ...spec.row(), user_id: a.id })
      expect(forgeError).not.toBeNull()
    })
  }

  it('profiles and preferences are only visible to their owner', async () => {
    const { data: ownProfile } = await a.client.from('profiles').select('id, institution, programme, time_zone')
    expect(ownProfile).toHaveLength(1)
    expect(ownProfile?.[0]).toMatchObject({
      id: a.id,
      institution: 'University of Ghana',
      programme: 'MSc IT for Business',
      time_zone: 'Africa/Accra',
    })
    const { data: otherProfile } = await a.client.from('profiles').select('id').eq('id', b.id)
    expect(otherProfile).toEqual([])
    const { data: tampered } = await a.client.from('profiles').update({ full_name: 'x' }).eq('id', b.id).select('id')
    expect(tampered).toEqual([])
    const { data: prefs } = await b.client.from('student_preferences').select('user_id').eq('user_id', a.id)
    expect(prefs).toEqual([])
  })

  it('lesson progress is private', async () => {
    await a.client.from('lesson_progress').upsert({ user_id: a.id, lesson_id: lessonId, reading_percent: 20 })
    const { data } = await b.client.from('lesson_progress').select('lesson_id').eq('user_id', a.id)
    expect(data).toEqual([])
  })

  it('search only returns the caller\'s own notes', async () => {
    await a.client.from('student_notes').insert({ title: 'Zyxwvut unique marker', body: 'private' })
    const { data: forA } = await a.client.rpc('search_content', { p_query: 'Zyxwvut' })
    const { data: forB } = await b.client.rpc('search_content', { p_query: 'Zyxwvut' })
    expect((forA as { kind: string }[]).filter((r) => r.kind === 'note')).toHaveLength(1)
    expect((forB as { kind: string }[]).filter((r) => r.kind === 'note')).toHaveLength(0)
  })
})

describe('shared content is read-only for students', () => {
  it('students cannot create or modify courses and lessons', async () => {
    const { error: insertError } = await a.client.from('courses').insert({ code: 'CSIT 999', slug: 'csit-999', title: 'Fake' })
    expect(insertError).not.toBeNull()
    const { data: updated } = await a.client.from('lessons').update({ title: 'Hacked' }).eq('id', lessonId).select('id')
    expect(updated).toEqual([])
  })

  it('unpublished lessons are hidden from students', async () => {
    const svc = serviceClient()
    const { data: module } = await svc.from('course_modules').select('id').limit(1).single()
    const { data: draft } = await svc
      .from('lessons')
      .insert({ module_id: module?.id, slug: `draft-${Date.now()}`, title: 'Draft lesson', is_published: false })
      .select('id')
      .single()
    const { data: seen } = await a.client.from('lessons').select('id').eq('id', draft?.id)
    expect(seen).toEqual([])
    await svc.from('lessons').delete().eq('id', draft?.id)
  })

  it('answer keys are never readable by students', async () => {
    const { data } = await a.client.from('question_keys').select('question_id').limit(5)
    expect(data).toEqual([])
  })
})

describe('role and privilege enforcement', () => {
  it('a student cannot grant themselves the admin role', async () => {
    const { error: roleError } = await a.client.from('user_roles').insert({ user_id: a.id, role: 'admin' })
    expect(roleError).not.toBeNull()
    const { error: rpcError } = await a.client.rpc('grant_admin', { p_email: a.email })
    expect(rpcError).not.toBeNull()
    const { data: isAdmin } = await a.client.rpc('is_admin')
    expect(isAdmin).toBe(false)
  })

  it('an administrator can manage content but still cannot read students\' notes', async () => {
    const admin = await createStudent('admin')
    try {
      const svc = serviceClient()
      const { error: grantError } = await svc.rpc('grant_admin', { p_email: admin.email })
      expect(grantError).toBeNull()
      const { data: isAdmin } = await admin.client.rpc('is_admin')
      expect(isAdmin).toBe(true)

      const { data: course, error } = await admin.client
        .from('announcements')
        .insert({ title: 'Integration test announcement', body: 'Hello', is_published: false })
        .select('id')
        .single()
      expect(error).toBeNull()
      await admin.client.from('announcements').delete().eq('id', course?.id)

      const { data: notes } = await admin.client.from('student_notes').select('id').eq('user_id', a.id)
      expect(notes).toEqual([])
    } finally {
      await deleteUser(admin)
    }
  })

  it('students cannot write attempts or answers directly', async () => {
    const { data: quiz } = await a.client.from('quizzes').select('id').eq('kind', 'lesson_quiz').limit(1).single()
    const { error } = await a.client
      .from('quiz_attempts')
      .insert({ user_id: a.id, quiz_id: quiz?.id, question_ids: [], status: 'submitted', percent: 100, passed: true })
    expect(error).not.toBeNull()
  })
})

describe('storage isolation', () => {
  it('avatars are private to their owner and course materials are admin-only', async () => {
    const path = `${a.id}/avatar.png`
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
    const { error: uploadError } = await a.client.storage.from('avatars').upload(path, png, { upsert: true })
    expect(uploadError).toBeNull()

    const { data: bDownload } = await b.client.storage.from('avatars').download(path)
    expect(bDownload).toBeNull()

    const { error: bUpload } = await b.client.storage.from('avatars').upload(`${a.id}/evil.png`, png)
    expect(bUpload).not.toBeNull()

    const txt = new Blob(['notes'], { type: 'text/plain' })
    const { error: materialError } = await a.client.storage.from('course-materials').upload('csit-601/x.txt', txt)
    expect(materialError).not.toBeNull()
  })
})
