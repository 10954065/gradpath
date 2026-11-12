import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, serviceClient, type TestUser } from './helpers'

/**
 * Proves that administration is enforced by the database, not the UI: students cannot change shared
 * content, publish announcements, upload course materials or grant themselves the admin role, while an
 * administrator can — and hidden content stays invisible to students.
 */

let student: TestUser
let admin: TestUser
let lessonId: string
let courseId: string
const created: { announcements: string[]; materials: string[]; objects: string[] } = { announcements: [], materials: [], objects: [] }

beforeAll(async () => {
  student = await createStudent('admin-student')
  admin = await createStudent('admin-admin')
  const { error } = await serviceClient().from('user_roles').insert({ user_id: admin.id, role: 'admin' })
  if (error) throw error
  const { data: lesson } = await student.client.from('lessons').select('id, course_modules!inner(course_id)').limit(1).single()
  if (!lesson) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
  lessonId = lesson.id as string
  courseId = (lesson.course_modules as unknown as { course_id: string }).course_id
})

afterAll(async () => {
  const service = serviceClient()
  await service.from('lessons').update({ is_published: true }).eq('id', lessonId)
  if (created.announcements.length) await service.from('announcements').delete().in('id', created.announcements)
  if (created.materials.length) await service.from('uploaded_course_materials').delete().in('id', created.materials)
  if (created.objects.length) await service.storage.from('course-materials').remove(created.objects)
  await deleteUser(student)
  await deleteUser(admin)
})

describe('role checks', () => {
  it('reports is_admin() correctly for each user', async () => {
    expect((await student.client.rpc('is_admin')).data).toBe(false)
    expect((await admin.client.rpc('is_admin')).data).toBe(true)
  })

  it('does not let a student grant themselves the admin role', async () => {
    const rpc = await student.client.rpc('grant_admin', { p_email: student.email })
    expect(rpc.error).not.toBeNull()
    const insert = await student.client.from('user_roles').insert({ user_id: student.id, role: 'admin' })
    expect(insert.error).not.toBeNull()
    expect((await student.client.rpc('is_admin')).data).toBe(false)
  })
})

describe('shared content changes', () => {
  it('ignores a student attempt to unpublish a lesson', async () => {
    const { data } = await student.client.from('lessons').update({ is_published: false }).eq('id', lessonId).select('id')
    expect(data ?? []).toEqual([])
    const { data: still } = await serviceClient().from('lessons').select('is_published').eq('id', lessonId).single()
    expect(still?.is_published).toBe(true)
  })

  it('lets an administrator hide a lesson, which then disappears for students', async () => {
    const { data, error } = await admin.client.from('lessons').update({ is_published: false }).eq('id', lessonId).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    const { data: visible } = await student.client.from('lessons').select('id').eq('id', lessonId)
    expect(visible).toEqual([])
    const { data: adminView } = await admin.client.from('lessons').select('id').eq('id', lessonId)
    expect(adminView).toHaveLength(1)
    await admin.client.from('lessons').update({ is_published: true }).eq('id', lessonId)
  })

  it('blocks students from editing assessment settings or platform settings', async () => {
    const { data: quiz } = await student.client.from('quizzes').update({ max_attempts: 1 }).eq('course_id', courseId).select('id')
    expect(quiz ?? []).toEqual([])
    const { data: settings } = await student.client.from('platform_settings').update({ mastery_threshold: 50 }).eq('id', true).select('id')
    expect(settings ?? []).toEqual([])
  })
})

describe('announcements', () => {
  it('rejects announcements created by a student', async () => {
    const { error } = await student.client.from('announcements').insert({ title: 'Fake notice', body: 'x', is_published: true })
    expect(error).not.toBeNull()
  })

  it('notifies students once when an administrator publishes', async () => {
    const { data: draft, error } = await admin.client.from('announcements').insert({ title: 'Integration notice', body: 'Hello', is_published: false }).select('id').single()
    expect(error).toBeNull()
    created.announcements.push(draft!.id as string)
    expect((await student.client.from('announcements').select('id').eq('id', draft!.id)).data).toEqual([])

    await admin.client.from('announcements').update({ is_published: true }).eq('id', draft!.id)
    await admin.client.from('announcements').update({ is_pinned: true }).eq('id', draft!.id)
    const { data: visible } = await student.client.from('announcements').select('id, published_at').eq('id', draft!.id).single()
    expect(visible?.published_at).not.toBeNull()
    const { data: notes } = await student.client.from('notifications').select('id').eq('kind', 'announcement').eq('title', 'Integration notice')
    expect(notes).toHaveLength(1)
  })
})

describe('uploaded course materials', () => {
  it('stop students from uploading files', async () => {
    const { error } = await student.client.storage.from('course-materials').upload(`it-test/${Date.now()}-student.txt`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' })
    expect(error).not.toBeNull()
  })

  it('keep unpublished files private until an administrator publishes them', async () => {
    const path = `it-test/${Date.now()}-handout.txt`
    const upload = await admin.client.storage.from('course-materials').upload(path, new Blob(['handout'], { type: 'text/plain' }), { contentType: 'text/plain' })
    expect(upload.error).toBeNull()
    created.objects.push(path)
    const { data: row, error } = await admin.client
      .from('uploaded_course_materials')
      .insert({ course_id: courseId, title: 'Handout', storage_path: path, file_name: 'handout.txt', mime_type: 'text/plain', size_bytes: 7, is_published: false })
      .select('id')
      .single()
    expect(error).toBeNull()
    created.materials.push(row!.id as string)

    expect((await student.client.from('uploaded_course_materials').select('id').eq('id', row!.id)).data).toEqual([])
    const hidden = await student.client.storage.from('course-materials').createSignedUrl(path, 60)
    expect(hidden.data?.signedUrl).toBeFalsy()

    await admin.client.from('uploaded_course_materials').update({ is_published: true }).eq('id', row!.id)
    expect((await student.client.from('uploaded_course_materials').select('id').eq('id', row!.id)).data).toHaveLength(1)
    const shown = await student.client.storage.from('course-materials').createSignedUrl(path, 60)
    expect(shown.data?.signedUrl).toBeTruthy()
  })
})
