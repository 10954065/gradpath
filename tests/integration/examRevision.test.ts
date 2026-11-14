import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, type TestUser } from './helpers'

/** Revision sessions planned back from an examination: tied to the student's own exam and removed with it. */

let a: TestUser
let b: TestUser
let examId: string
let assignmentId: string

const block = (user: TestUser, values: Record<string, unknown>) =>
  user.client
    .from('timetable_events')
    .insert({ user_id: user.id, title: 'CSIT 601 revision: Foundations', kind: 'revision', recurrence: 'once', event_date: '2027-03-05', start_time: '18:00', end_time: '19:30', ...values })
    .select('id')

beforeAll(async () => {
  a = await createStudent('exams-a')
  b = await createStudent('exams-b')
  const exam = await a.client.from('assignments').insert({ user_id: a.id, title: 'CSIT 601 examination', kind: 'examination', due_at: '2027-03-12T09:00:00Z' }).select('id').single()
  const other = await a.client.from('assignments').insert({ user_id: a.id, title: 'Essay', kind: 'assignment', due_at: '2027-03-01T09:00:00Z' }).select('id').single()
  examId = exam.data?.id as string
  assignmentId = other.data?.id as string
  if (!examId || !assignmentId) throw new Error(`Could not create the examination: ${exam.error?.message ?? other.error?.message}`)
})

afterAll(async () => {
  await deleteUser(a)
  await deleteUser(b)
})

describe('examination revision sessions', () => {
  it('are one-off revision blocks tied to the student’s own examination', async () => {
    expect((await block(a, { exam_id: examId })).error).toBeNull()
    const weekly = await block(a, { exam_id: examId, recurrence: 'weekly', day_of_week: 5, event_date: null })
    expect(weekly.error?.message).toBe('An examination revision session must be a one-off revision block')
    const notAnExam = await block(a, { exam_id: assignmentId })
    expect(notAnExam.error?.message).toBe('Revision can only be planned for one of your own examinations')
    const someoneElses = await block(b, { exam_id: examId })
    expect(someoneElses.error?.message).toBe('Revision can only be planned for one of your own examinations')
    expect((await b.client.from('timetable_events').select('id').eq('exam_id', examId)).data).toEqual([])
  })

  it('disappear with the examination', async () => {
    await a.client.from('assignments').delete().eq('id', examId)
    expect((await a.client.from('timetable_events').select('id').not('exam_id', 'is', null)).data).toEqual([])
  })
})
