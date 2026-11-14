import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, serviceClient, type TestUser } from './helpers'

/**
 * The Semester 1 selection in the database: compulsory courses enrol automatically, the elective is each student's
 * own choice, credit slots add up to 20 for the owner's selection, and personal records stay private.
 */

let a: TestUser
let b: TestUser
let courseByCode: Map<string, { id: string; classification: string; credit_slots: number }>

beforeAll(async () => {
  a = await createStudent('selection-a')
  b = await createStudent('selection-b')
  const { data } = await serviceClient().from('courses').select('id, code, classification, credit_slots')
  courseByCode = new Map((data ?? []).map((c) => [c.code as string, c as { id: string; classification: string; credit_slots: number }]))
  if (!courseByCode.has('CSIT 610')) throw new Error('Seed data missing: run `npm run content:build` and `npx supabase db reset`')
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

const id = (code: string) => courseByCode.get(code)?.id as string

async function enrolmentsOf(user: TestUser) {
  const { data, error } = await user.client.from('course_enrolments').select('status, courses(code, classification, credit_slots)')
  expect(error).toBeNull()
  return (data ?? []).map((r) => {
    const c = r.courses as unknown as { code: string; classification: string; credit_slots: number }
    return { code: c.code, classification: c.classification, slots: c.credit_slots, status: r.status as string }
  })
}

describe('programme listing', () => {
  it('lists the eight Semester 1 courses with their classification and credit slots', () => {
    const expected: Record<string, [string, number]> = {
      'CSIT 601': ['core', 3],
      'CSIT 603': ['core', 3],
      'CSIT 605': ['core', 3],
      'CSIT 607': ['core', 3],
      'CSIT 610': ['required', 1],
      'CSIT 613': ['elective', 3],
      'CSIT 617': ['core', 3],
      'CSIT 621': ['special_topic', 1],
    }
    for (const [code, [classification, slots]] of Object.entries(expected)) {
      expect(courseByCode.get(code), code).toMatchObject({ classification, credit_slots: slots })
    }
    expect(courseByCode.has('CSIT 609')).toBe(false)
  })
})

describe('personal course selection', () => {
  it('enrols a new student in every compulsory course and leaves the elective for them to confirm', async () => {
    const { error } = await a.client.rpc('enrol_default_courses')
    expect(error).toBeNull()
    const rows = await enrolmentsOf(a)
    expect(rows.filter((r) => r.status === 'enrolled').map((r) => r.code).sort()).toEqual(
      ['CSIT 601', 'CSIT 603', 'CSIT 605', 'CSIT 607', 'CSIT 610', 'CSIT 617', 'CSIT 621'],
    )
    expect(rows.find((r) => r.code === 'CSIT 613')?.status).toBe('pending_confirmation')
  })

  it('gives eight enrolled courses and twenty credit slots once CSIT 613 is selected, without CSIT 609', async () => {
    const { error } = await a.client.from('course_enrolments').update({ status: 'enrolled' }).eq('course_id', id('CSIT 613'))
    expect(error).toBeNull()
    const enrolled = (await enrolmentsOf(a)).filter((r) => r.status === 'enrolled')
    expect(enrolled).toHaveLength(8)
    expect(enrolled.reduce((sum, r) => sum + r.slots, 0)).toBe(20)
    expect(enrolled.filter((r) => r.classification === 'core')).toHaveLength(5)
    expect(enrolled.filter((r) => r.classification === 'required').map((r) => r.code)).toEqual(['CSIT 610'])
    expect(enrolled.filter((r) => r.classification === 'special_topic').map((r) => r.code)).toEqual(['CSIT 621'])
    expect(enrolled.filter((r) => r.classification === 'elective').map((r) => r.code)).toEqual(['CSIT 613'])
    expect(enrolled.map((r) => r.code)).not.toContain('CSIT 609')
  })

  it('never overwrites a choice when the defaults run again, and never touches a classmate', async () => {
    await a.client.rpc('enrol_default_courses')
    expect((await enrolmentsOf(a)).find((r) => r.code === 'CSIT 613')?.status).toBe('enrolled')
    expect(await enrolmentsOf(b)).toEqual([])
    const { data } = await b.client.from('course_enrolments').select('id').eq('user_id', a.id)
    expect(data).toEqual([])
  })
})

describe('provisional study plan', () => {
  it('includes a CSIT 610 seminar block and leaves out courses the student does not take', async () => {
    await b.client.rpc('enrol_default_courses')
    await b.client.from('course_enrolments').update({ status: 'dropped' }).eq('course_id', id('CSIT 613'))
    const { error } = await b.client.rpc('seed_default_timetable')
    expect(error).toBeNull()
    const { data } = await b.client.from('timetable_events').select('title, kind, is_provisional, course_id')
    const titles = (data ?? []).map((e) => e.title as string)
    expect(titles.some((t) => t.startsWith('CSIT 610'))).toBe(true)
    expect(titles.some((t) => t.startsWith('CSIT 613'))).toBe(false)
    expect((data ?? []).every((e) => e.is_provisional && e.kind !== 'lecture')).toBe(true)
  })
})

describe('mixed revision tests and personal mock examinations', () => {
  it('draws a revision test only from its own course, objective questions only', async () => {
    const { data: quiz } = await a.client.from('quizzes').select('id, course_id, question_count').eq('kind', 'revision_test').eq('course_id', id('CSIT 610')).single()
    expect(quiz).not.toBeNull()
    const { data: review, error } = await a.client.rpc('start_attempt', { p_quiz_id: quiz?.id })
    expect(error).toBeNull()
    const ids = ((review as { questions: { id: string }[] }).questions ?? []).map((q) => q.id)
    expect(ids.length).toBe(quiz?.question_count)
    const { data: rows } = await serviceClient().from('quiz_questions').select('course_id, type').in('id', ids)
    expect((rows ?? []).every((r) => r.course_id === id('CSIT 610'))).toBe(true)
    expect((rows ?? []).some((r) => r.type === 'essay' || r.type === 'case_analysis')).toBe(false)
  })

  it('never puts questions from a course the student does not take into the mixed mock examination', async () => {
    const { data: mixed } = await b.client.from('quizzes').select('id').eq('external_ref', 'mixed/mock-exam').single()
    const { data: review, error } = await b.client.rpc('start_attempt', { p_quiz_id: mixed?.id })
    expect(error).toBeNull()
    const ids = ((review as { questions: { id: string }[] }).questions ?? []).map((q) => q.id)
    expect(ids.length).toBeGreaterThan(0)
    const { data: rows } = await serviceClient().from('quiz_questions').select('course_id').in('id', ids)
    expect((rows ?? []).some((r) => r.course_id === id('CSIT 613'))).toBe(false)
  })
})

describe('seminar tracker privacy', () => {
  it('keeps each student’s seminar entries private', async () => {
    const { data: created, error } = await a.client
      .from('seminar_presentations')
      .insert({ topic: 'Mobile money interoperability in Ghana', course_id: id('CSIT 610'), checklist: ['topic'] })
      .select('id')
      .single()
    expect(error).toBeNull()

    expect((await b.client.from('seminar_presentations').select('id')).data).toEqual([])
    const tamper = await b.client.from('seminar_presentations').update({ feedback: 'tampered' }).eq('id', created?.id).select()
    expect(tamper.data ?? []).toEqual([])
    const remove = await b.client.from('seminar_presentations').delete().eq('id', created?.id).select()
    expect(remove.data ?? []).toEqual([])
    const forged = await b.client.from('seminar_presentations').insert({ topic: 'Forged entry', user_id: a.id })
    expect(forged.error).not.toBeNull()

    const { data: mine } = await a.client.from('seminar_presentations').select('topic, feedback')
    expect(mine).toEqual([{ topic: 'Mobile money interoperability in Ghana', feedback: '' }])
  })
})
