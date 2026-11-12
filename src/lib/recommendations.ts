import type { Assignment, LessonProgress, Quiz, QuizAttemptRow, RevisionItem } from '@/types/database'

/**
 * Rule-based, explainable study recommendations computed from the student's own records.
 * Every recommendation states the reason it was generated. No AI service is involved.
 */
export interface Recommendation {
  id: string
  kind: 'revision' | 'deadline' | 'weak-topic' | 'continue' | 'assessment' | 'mock-exam' | 'insight' | 'start' | 'pace'
  title: string
  reason: string
  href: string
  priority: number
}

export interface LessonRef {
  id: string
  title: string
  courseCode: string
  moduleId: string
  moduleTitle: string
  href: string
}

export interface RecommendationInput {
  now: Date
  masteryThreshold: number
  lessons: LessonRef[]
  progress: LessonProgress[]
  attempts: QuizAttemptRow[]
  quizzes: Quiz[]
  revision: RevisionItem[]
  assignments: Assignment[]
  studiedMinutesThisWeek: number
  weeklyTargetHours: number
}

export function recommend(input: RecommendationInput): Recommendation[] {
  const out: Recommendation[] = []
  const { now, masteryThreshold } = input
  const lessonById = new Map(input.lessons.map((l) => [l.id, l]))
  const progress = new Map(input.progress.map((p) => [p.lesson_id, p]))
  const quizById = new Map(input.quizzes.map((q) => [q.id, q]))
  const submitted = input.attempts.filter((a) => a.status === 'submitted').sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))

  // 1. Revision due
  const due = input.revision.filter((r) => r.status !== 'suspended' && r.status !== 'mastered' && new Date(r.due_at) <= now)
  if (due.length) {
    out.push({
      id: 'revision-due',
      kind: 'revision',
      title: `You have ${due.length} revision item${due.length === 1 ? '' : 's'} due today`,
      reason: 'Reviewing items when they are due strengthens long-term memory (spaced repetition).',
      href: '/revision',
      priority: 1,
    })
  }

  // 2. Deadlines
  for (const a of input.assignments) {
    if (a.status === 'completed' || a.status === 'submitted' || !a.due_at) continue
    const hours = (new Date(a.due_at).getTime() - now.getTime()) / 3_600_000
    if (hours < 0) out.push({ id: `overdue-${a.id}`, kind: 'deadline', title: `Overdue: ${a.title}`, reason: 'This assignment is past its due date and not marked as submitted.', href: '/assignments', priority: 1 })
    else if (hours <= 72)
      out.push({
        id: `due-${a.id}`,
        kind: 'deadline',
        title: `Complete “${a.title}”`,
        reason: `Due in ${hours < 24 ? `${Math.max(1, Math.round(hours))} hours` : `${Math.round(hours / 24)} days`}.`,
        href: '/assignments',
        priority: 2,
      })
  }

  // 3. Weak topics: latest result per lesson below the mastery threshold
  const latestByLesson = new Map<string, number>()
  for (const a of submitted) for (const l of a.lesson_breakdown ?? []) if (l.percent !== null) latestByLesson.set(l.lessonId, Number(l.percent))
  const weak = [...latestByLesson.entries()].filter(([, pct]) => pct < masteryThreshold).sort((a, b) => a[1] - b[1])
  for (const [lessonId, pct] of weak.slice(0, 3)) {
    const lesson = lessonById.get(lessonId)
    if (!lesson) continue
    out.push({
      id: `weak-${lessonId}`,
      kind: 'weak-topic',
      title: `Revisit “${lesson.title}”`,
      reason: `Your latest score on this lesson was ${Math.round(pct)}%, below the ${masteryThreshold}% mastery target.`,
      href: lesson.href,
      priority: 2,
    })
  }

  // 4. Continue an unfinished lesson (most recently touched)
  const inProgress = input.progress
    .filter((p) => p.status !== 'completed' && p.reading_percent > 0 && lessonById.has(p.lesson_id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  if (inProgress) {
    const lesson = lessonById.get(inProgress.lesson_id) as LessonRef
    out.push({
      id: `continue-${lesson.id}`,
      kind: 'continue',
      title: `Continue “${lesson.title}”`,
      reason: `You have read ${inProgress.reading_percent}% of this ${lesson.courseCode} lesson.`,
      href: lesson.href,
      priority: 3,
    })
  }

  // 5. Module complete but its assessment not yet mastered
  const modules = new Map<string, LessonRef[]>()
  for (const l of input.lessons) modules.set(l.moduleId, [...(modules.get(l.moduleId) ?? []), l])
  for (const [moduleId, lessons] of modules) {
    if (!lessons.every((l) => progress.get(l.id)?.status === 'completed')) continue
    const assessment = input.quizzes.find((q) => q.kind === 'module_assessment' && q.module_id === moduleId)
    if (!assessment || submitted.some((a) => a.quiz_id === assessment.id && a.passed)) continue
    out.push({
      id: `assessment-${moduleId}`,
      kind: 'assessment',
      title: `Take the module assessment for ${lessons[0]?.moduleTitle}`,
      reason: 'You have completed every lesson in this module but have not yet recorded mastery on its assessment.',
      href: `/assessments/${assessment.id}`,
      priority: 3,
    })
  }

  // 6. Mock exam once most of a course is complete
  const byCourse = new Map<string, LessonRef[]>()
  for (const l of input.lessons) byCourse.set(l.courseCode, [...(byCourse.get(l.courseCode) ?? []), l])
  for (const [code, lessons] of byCourse) {
    const done = lessons.filter((l) => progress.get(l.id)?.status === 'completed').length
    if (lessons.length === 0 || done / lessons.length < 0.7) continue
    const mock = input.quizzes.find((q) => q.kind === 'mock_exam' && q.title.startsWith(code))
    if (!mock || submitted.some((a) => a.quiz_id === mock.id)) continue
    out.push({
      id: `mock-${code}`,
      kind: 'mock-exam',
      title: `Attempt the ${code} mock examination`,
      reason: `You have completed ${Math.round((done / lessons.length) * 100)}% of ${code}; a timed mock exam will test cumulative recall.`,
      href: `/assessments/${mock.id}`,
      priority: 4,
    })
  }

  // 7. Improvement insight
  const byQuiz = new Map<string, QuizAttemptRow[]>()
  for (const a of submitted) if (a.percent !== null) byQuiz.set(a.quiz_id, [...(byQuiz.get(a.quiz_id) ?? []), a])
  for (const [quizId, list] of byQuiz) {
    if (list.length < 2) continue
    const prev = Number(list[list.length - 2]?.percent)
    const last = Number(list[list.length - 1]?.percent)
    if (last > prev) {
      out.push({
        id: `improved-${quizId}`,
        kind: 'insight',
        title: `You improved on ${quizById.get(quizId)?.title ?? 'an assessment'}`,
        reason: `From ${Math.round(prev)}% to ${Math.round(last)}% on your latest attempt.`,
        href: `/assessments/${quizId}`,
        priority: 5,
      })
      break
    }
  }

  // 8. Weekly pace
  const day = (now.getDay() + 6) % 7 // Monday = 0
  const expected = ((input.weeklyTargetHours * 60) / 7) * (day + 1)
  if (input.studiedMinutesThisWeek < expected * 0.5 && day >= 2) {
    out.push({
      id: 'pace',
      kind: 'pace',
      title: 'Plan a study session today',
      reason: `You have recorded ${Math.round(input.studiedMinutesThisWeek / 60)} h this week against a ${input.weeklyTargetHours} h target.`,
      href: '/planner',
      priority: 4,
    })
  }

  // 9. Brand new student
  if (input.progress.length === 0 && input.lessons[0]) {
    out.push({
      id: 'start',
      kind: 'start',
      title: `Start with “${input.lessons[0].title}”`,
      reason: 'You have not opened any lessons yet. Begin with the first lesson of your first course.',
      href: input.lessons[0].href,
      priority: 3,
    })
  }

  return out.sort((a, b) => a.priority - b.priority)
}
