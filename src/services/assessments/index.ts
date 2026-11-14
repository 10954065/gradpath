import { AppError, ensureOk, toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'
import type { AnswerResponse, AttemptReview, Quiz, QuizAttemptRow, QuizKind } from '@/types/database'

export interface QuizFilter {
  kind?: QuizKind
  courseId?: string
  moduleId?: string
  lessonId?: string
}

export function listQuizzes(filter: QuizFilter = {}): Promise<Quiz[]> {
  const key = `quizzes:${filter.kind ?? '*'}:${filter.courseId ?? '*'}:${filter.moduleId ?? '*'}:${filter.lessonId ?? '*'}`
  return withOfflineCache(key, async () => {
    let query = supabase.from('quizzes').select('*').order('sort_order')
    if (filter.kind) query = query.eq('kind', filter.kind)
    if (filter.courseId) query = query.eq('course_id', filter.courseId)
    if (filter.moduleId) query = query.eq('module_id', filter.moduleId)
    if (filter.lessonId) query = query.eq('lesson_id', filter.lessonId)
    const result = await query
    return ensureOk(result, 'We could not load the assessments.') as Quiz[]
  })
}

export async function getQuiz(quizId: string): Promise<Quiz> {
  const result = await supabase.from('quizzes').select('*').eq('id', quizId).maybeSingle()
  const quiz = ensureOk(result, 'We could not load this assessment.') as Quiz | null
  if (!quiz) throw new AppError('This assessment does not exist or is not available.')
  return quiz
}

export function listMyAttempts(): Promise<QuizAttemptRow[]> {
  return withOfflineCache('attempts', async () => {
    const result = await supabase.from('quiz_attempts').select('*').order('started_at', { ascending: false }).limit(500)
    return ensureOk(result, 'We could not load your assessment history.') as QuizAttemptRow[]
  })
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new AppError(toUserMessage(error, fallback), { cause: error })
  return data as T
}

/** Start (or resume) an attempt. Questions arrive without answer keys. Requires a connection. */
export function startAttempt(quizId: string): Promise<AttemptReview> {
  return rpc<AttemptReview>('start_attempt', { p_quiz_id: quizId }, 'We could not start this assessment.')
}

/** Submit answers for server-side scoring. Safe to retry: a submitted attempt returns its stored result. */
export function submitAttempt(attemptId: string, answers: Record<string, AnswerResponse>): Promise<AttemptReview> {
  return rpc<AttemptReview>('submit_attempt', { p_attempt_id: attemptId, p_answers: answers }, 'We could not submit your answers.')
}

export function getAttemptReview(attemptId: string): Promise<AttemptReview> {
  return withOfflineCache(`attempt:${attemptId}`, () =>
    rpc<AttemptReview>('attempt_review', { p_attempt_id: attemptId }, 'We could not load this result.'),
  )
}

export function recordSelfAssessment(attemptId: string, questionId: string, marks: number): Promise<void> {
  return rpc<void>(
    'record_self_assessment',
    { p_attempt_id: attemptId, p_question_id: questionId, p_marks: marks },
    'We could not save your self-assessment.',
  )
}

// Draft answers are kept on this device while an attempt is in progress so a reload or lost
// connection never loses work. They are removed once the attempt is submitted.
const draftKey = (attemptId: string) => `gradpath-attempt-draft:${attemptId}`

export function loadDraft(attemptId: string): Record<string, AnswerResponse> {
  try {
    const raw = localStorage.getItem(draftKey(attemptId))
    return raw ? (JSON.parse(raw) as Record<string, AnswerResponse>) : {}
  } catch {
    return {}
  }
}

export function saveDraft(attemptId: string, answers: Record<string, AnswerResponse>): void {
  try {
    localStorage.setItem(draftKey(attemptId), JSON.stringify(answers))
  } catch {
    /* storage full or unavailable */
  }
}

export function clearDraft(attemptId: string): void {
  try {
    localStorage.removeItem(draftKey(attemptId))
  } catch {
    /* ignore */
  }
}

export const QUIZ_KIND_LABEL: Record<QuizKind, string> = {
  lesson_quiz: 'Lesson quiz',
  module_assessment: 'Module assessment',
  mock_exam: 'Mock examination',
  revision_test: 'Mixed revision test',
}
