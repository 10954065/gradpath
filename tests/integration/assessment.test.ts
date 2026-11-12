import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStudent, deleteUser, serviceClient, type TestUser } from './helpers'

interface ReviewQuestion {
  id: string
  type: string
  options: unknown
  isCorrect: boolean | null
  correct?: Record<string, unknown>
  explanation?: string
}

interface Review {
  attempt: { id: string; status: string; percent: number | null; passed: boolean | null; masteryThreshold: number | null }
  answersRevealed: boolean
  questions: ReviewQuestion[]
}

let student: TestUser
let quizId: string
let lessonId: string

async function keysFor(questionIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const { data } = await serviceClient().from('question_keys').select('question_id, correct').in('question_id', questionIds)
  return new Map((data ?? []).map((k) => [k.question_id as string, k.correct as Record<string, unknown>]))
}

function correctResponse(q: ReviewQuestion, key: Record<string, unknown>): unknown {
  switch (q.type) {
    case 'mcq':
    case 'scenario':
      return { option: key.option }
    case 'true_false':
      return { value: key.value }
    case 'short_answer':
      return { text: (key.answers as string[])[0]?.toUpperCase() }
    case 'matching':
      return { pairs: key.pairs }
    default:
      return { text: 'An extended answer' }
  }
}

function wrongResponse(q: ReviewQuestion, key: Record<string, unknown>): unknown {
  switch (q.type) {
    case 'mcq':
    case 'scenario':
      return { option: key.option === 'a' ? 'b' : 'a' }
    case 'true_false':
      return { value: !key.value }
    case 'short_answer':
      return { text: 'definitely wrong' }
    default:
      return {}
  }
}

beforeAll(async () => {
  student = await createStudent('assessor')
  const { data } = await student.client.from('quizzes').select('id, lesson_id').eq('kind', 'lesson_quiz').limit(1).single()
  quizId = data?.id as string
  lessonId = data?.lesson_id as string
})

afterAll(async () => {
  await deleteUser(student)
})

describe('assessment engine', () => {
  it('starts an attempt without revealing answer keys', async () => {
    const { data, error } = await student.client.rpc('start_attempt', { p_quiz_id: quizId })
    expect(error).toBeNull()
    const review = data as Review
    expect(review.attempt.status).toBe('in_progress')
    expect(review.answersRevealed).toBe(false)
    expect(review.questions.length).toBeGreaterThanOrEqual(6)
    for (const q of review.questions) {
      expect(q.correct).toBeUndefined()
      expect(q.explanation).toBeUndefined()
    }
    const { data: resumed } = await student.client.rpc('start_attempt', { p_quiz_id: quizId })
    expect((resumed as Review).attempt.id).toBe(review.attempt.id)
  })

  it('scores below the mastery threshold, queues revision and notifies', async () => {
    const { data } = await student.client.rpc('start_attempt', { p_quiz_id: quizId })
    const review = data as Review
    const keys = await keysFor(review.questions.map((q) => q.id))
    const answers = Object.fromEntries(review.questions.map((q) => [q.id, wrongResponse(q, keys.get(q.id) ?? {})]))

    const { data: result, error } = await student.client.rpc('submit_attempt', { p_attempt_id: review.attempt.id, p_answers: answers })
    expect(error).toBeNull()
    const scored = result as Review
    expect(scored.attempt.status).toBe('submitted')
    expect(scored.attempt.passed).toBe(false)
    expect(scored.attempt.masteryThreshold).toBe(80)
    expect(scored.answersRevealed).toBe(true)
    expect(scored.questions.every((q) => q.explanation !== undefined)).toBe(true)

    const { data: revision } = await student.client.from('revision_items').select('lesson_id, reason').eq('lesson_id', lessonId)
    expect(revision).toHaveLength(1)
    const { data: notes } = await student.client.from('notifications').select('kind').eq('kind', 'assessment_result')
    expect(notes?.length).toBeGreaterThanOrEqual(1)
  })

  it('records mastery for a perfect retake and updates lesson progress', async () => {
    const { data } = await student.client.rpc('start_attempt', { p_quiz_id: quizId })
    const review = data as Review
    const keys = await keysFor(review.questions.map((q) => q.id))
    const answers = Object.fromEntries(review.questions.map((q) => [q.id, correctResponse(q, keys.get(q.id) ?? {})]))

    const { data: result } = await student.client.rpc('submit_attempt', { p_attempt_id: review.attempt.id, p_answers: answers })
    const scored = result as Review
    expect(Number(scored.attempt.percent)).toBe(100)
    expect(scored.attempt.passed).toBe(true)

    const { data: progress } = await student.client
      .from('lesson_progress')
      .select('quiz_best_percent, mastered_at')
      .eq('lesson_id', lessonId)
      .single()
    expect(Number(progress?.quiz_best_percent)).toBe(100)
    expect(progress?.mastered_at).not.toBeNull()

    // Re-submitting is idempotent and cannot change the stored score.
    const { data: again } = await student.client.rpc('submit_attempt', { p_attempt_id: review.attempt.id, p_answers: {} })
    expect(Number((again as Review).attempt.percent)).toBe(100)
  })

  it('another student cannot see or submit someone else\'s attempt', async () => {
    const other = await createStudent('intruder')
    try {
      const { data: attempts } = await student.client.from('quiz_attempts').select('id').limit(1)
      const attemptId = attempts?.[0]?.id as string
      const { data: seen } = await other.client.from('quiz_attempts').select('id').eq('id', attemptId)
      expect(seen).toEqual([])
      const { error } = await other.client.rpc('submit_attempt', { p_attempt_id: attemptId, p_answers: {} })
      expect(error).not.toBeNull()
      const { error: reviewError } = await other.client.rpc('attempt_review', { p_attempt_id: attemptId })
      expect(reviewError).not.toBeNull()
    } finally {
      await deleteUser(other)
    }
  })
})

describe('lesson completion rules', () => {
  it('refuses completion until the reading requirement is met and ignores forged quiz scores', async () => {
    const { data: other } = await student.client.from('lessons').select('id').neq('id', lessonId).limit(1).single()
    const id = other?.id as string

    const { error: early } = await student.client
      .from('lesson_progress')
      .upsert({ user_id: student.id, lesson_id: id, status: 'completed', reading_percent: 10, quiz_best_percent: 100 })
    expect(early?.message).toMatch(/Read at least 80 percent/)

    await student.client.from('lesson_progress').upsert({ user_id: student.id, lesson_id: id, reading_percent: 90, quiz_best_percent: 100 })
    const { data: row } = await student.client.from('lesson_progress').select('status, quiz_best_percent').eq('lesson_id', id).single()
    expect(row?.status).toBe('in_progress')
    expect(row?.quiz_best_percent).toBeNull()

    const { error: done } = await student.client.from('lesson_progress').update({ status: 'completed' }).eq('lesson_id', id)
    expect(done).toBeNull()
    const { data: completed } = await student.client.from('lesson_progress').select('status, completed_at').eq('lesson_id', id).single()
    expect(completed?.status).toBe('completed')
    expect(completed?.completed_at).not.toBeNull()
  })
})

describe('student productivity functions', () => {
  it('seeds the provisional timetable once and enrols in courses', async () => {
    const { data: first } = await student.client.rpc('seed_default_timetable')
    const { data: second } = await student.client.rpc('seed_default_timetable')
    expect(first).toBe(8)
    expect(second).toBe(0)
    const { data: enrolled } = await student.client.rpc('enrol_default_courses')
    expect(enrolled).toBe(7)
    const { data: elective } = await student.client
      .from('course_enrolments')
      .select('status, courses!inner(code)')
      .eq('courses.code', 'CSIT 613')
      .single()
    expect(elective?.status).toBe('pending_confirmation')
  })

  it('prevents duplicate occurrence sessions for the same timetable event', async () => {
    const { data: event } = await student.client.from('timetable_events').select('id').limit(1).single()
    const row = {
      timetable_event_id: event?.id,
      occurrence_date: '2026-11-16',
      title: 'Occurrence',
      planned_start: '2026-11-16T14:00:00Z',
      planned_end: '2026-11-16T16:00:00Z',
    }
    const { error: firstError } = await student.client.from('study_sessions').insert(row)
    const { error: duplicate } = await student.client.from('study_sessions').insert(row)
    expect(firstError).toBeNull()
    expect(duplicate).not.toBeNull()
  })
})
