import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { OBJECTIVE_TYPES, type ParsedLesson, type ParsedQuestion } from '../../src/lib/content/types'
import type { LoadedCourse } from './loadContent'

/** Fixed namespace so the same content always maps to the same UUIDs (idempotent re-seeding). */
const NAMESPACE = '6f1c2b0e-8a4d-5e3f-9b7a-1c2d3e4f5a6b'

export function uuidv5(name: string, namespace = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest()
  const bytes = hash.subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface LinkStatus {
  status: 'verified' | 'unverified' | 'unreachable'
  checkedAt: string
  httpStatus?: number
}

export function loadLinkVerification(): Record<string, LinkStatus> {
  const file = join(process.cwd(), 'content', 'link-verification.json')
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, LinkStatus>
}

const q = (value: string | null | undefined): string => (value == null ? 'null' : `'${value.replace(/'/g, "''")}'`)
const json = (value: unknown): string => `${q(JSON.stringify(value))}::jsonb`
const textArray = (values: readonly string[]): string =>
  values.length ? `array[${values.map((v) => q(v)).join(', ')}]::text[]` : `'{}'::text[]`
const uuidArray = (values: readonly string[]): string =>
  values.length ? `array[${values.map((v) => q(v)).join(', ')}]::uuid[]` : `'{}'::uuid[]`

function upsert(table: string, row: Record<string, string>, conflict = 'id'): string {
  const cols = Object.keys(row)
  const updates = cols.filter((c) => c !== conflict).map((c) => `${c} = excluded.${c}`)
  return `insert into public.${table} (${cols.join(', ')}) values (${cols.map((c) => row[c]).join(', ')})\n  on conflict (${conflict}) do update set ${updates.join(', ')};`
}

/** Deterministic shuffle (mulberry32 seeded from the question reference). */
function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = createHash('md5').update(seed).digest().readUInt32LE(0)
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
  }
  return copy
}

function lessonContentJson(lesson: ParsedLesson, links: Record<string, LinkStatus>) {
  const verify = (url: string | null) => (url ? (links[url]?.status ?? 'unverified') : 'citation')
  return {
    introduction: lesson.introduction,
    objectives: lesson.objectives,
    prerequisites: lesson.prerequisites,
    keyTerms: lesson.keyTerms,
    body: lesson.body,
    misconceptions: lesson.misconceptions,
    examMistakes: lesson.examMistakes,
    criticalQuestions: lesson.criticalQuestions,
    exercises: lesson.exercises,
    takeaways: lesson.takeaways,
    furtherReading: lesson.furtherReading.map((r) => ({ ...r, verification: verify(r.url) })),
    videos: lesson.videos.map((v) => ({ ...v, verification: verify(v.url) })),
    revisionSummary: lesson.revisionSummary,
  }
}

const LETTERS = 'abcdefgh'

function questionRows(
  question: ParsedQuestion,
  ref: string,
  ids: { course: string; module: string; lesson: string | null },
): { question: string; key: string } {
  const id = uuidv5(`question:${ref}`)
  let options: unknown = null
  let correct: Record<string, unknown> = {}
  switch (question.type) {
    case 'mcq':
    case 'scenario':
      options = (question.options ?? []).map((text, i) => ({ id: LETTERS[i], text }))
      correct = { option: LETTERS[question.answerIndex ?? 0] }
      break
    case 'true_false':
      correct = { value: question.answerBoolean }
      break
    case 'short_answer':
      correct = { answers: question.acceptedAnswers ?? [] }
      break
    case 'matching': {
      const pairs = question.pairs ?? []
      const left = pairs.map((p, i) => ({ id: `l${i + 1}`, text: p.left }))
      const right = seededShuffle(
        pairs.map((p, i) => ({ id: `r${i + 1}`, text: p.right })),
        ref,
      )
      options = { left, right }
      correct = { pairs: Object.fromEntries(pairs.map((_, i) => [`l${i + 1}`, `r${i + 1}`])) }
      break
    }
    default:
      break
  }
  return {
    question: upsert('quiz_questions', {
      id: q(id),
      course_id: q(ids.course),
      module_id: q(ids.module),
      lesson_id: q(ids.lesson),
      external_ref: q(ref),
      type: q(question.type),
      bloom: q(question.bloom),
      difficulty: q(question.difficulty),
      objective: q(question.objective),
      prompt: q(question.prompt),
      scenario: q(question.scenario),
      case_text: q(question.caseText),
      options: options === null ? 'null' : json(options),
      marks: String(question.marks),
      answer_structure: textArray(question.structure ?? []),
      rubric: json(question.rubric ?? []),
      source: q('ai_practice'),
      is_published: 'true',
    }),
    key: upsert(
      'question_keys',
      {
        question_id: q(id),
        correct: json(correct),
        explanation: q(question.explanation),
        model_answer: q(question.modelAnswer),
      },
      'question_id',
    ),
  }
}

interface QuizSpec {
  ref: string
  kind: 'lesson_quiz' | 'module_assessment' | 'mock_exam'
  title: string
  description: string
  instructions: string
  courseId?: string | null
  moduleId?: string | null
  lessonId?: string | null
  scopeCourseIds?: string[]
  questionCount: number | null
  openEndedCount: number
  timeLimit: number | null
  sortOrder: number
}

function quizRow(row: QuizSpec): string {
  return upsert('quizzes', {
    id: q(uuidv5(`quiz:${row.ref}`)),
    external_ref: q(row.ref),
    kind: q(row.kind),
    title: q(row.title),
    description: q(row.description),
    instructions: q(row.instructions),
    course_id: q(row.courseId ?? null),
    module_id: q(row.moduleId ?? null),
    lesson_id: q(row.lessonId ?? null),
    scope_course_ids: uuidArray(row.scopeCourseIds ?? []),
    question_count: row.questionCount === null ? 'null' : String(row.questionCount),
    open_ended_count: String(row.openEndedCount),
    time_limit_minutes: row.timeLimit === null ? 'null' : String(row.timeLimit),
    randomize: 'true',
    reveal_answers: q('after_submit'),
    is_published: 'true',
    sort_order: String(row.sortOrder),
  })
}

const PRACTICE_NOTE =
  'All questions are supplementary practice questions generated for GradPath. They are not official University of Ghana examination questions, and results are not official grades.'

export function buildSeedSql(courses: LoadedCourse[], links: Record<string, LinkStatus> = {}): string {
  const flashcardRefs: string[] = []
  const out: string[] = [
    '-- GradPath curriculum seed. GENERATED by `npm run content:build` from content/ — do not edit by hand.',
    '-- Idempotent: every row has a deterministic UUID and is upserted.',
    'begin;',
    '',
  ]
  const courseIdsWithQuestions: string[] = []

  for (const course of courses) {
    const c = course.outline
    const courseId = uuidv5(`course:${c.slug}`)
    out.push(`-- ${c.code} ${c.title}`)
    out.push(
      upsert('courses', {
        id: q(courseId),
        code: q(c.code),
        slug: q(c.slug),
        title: q(c.title),
        description: q(c.description),
        status: q(c.status),
        status_note: q(c.statusNote),
        accent: q(c.accent),
        outcomes: textArray(c.outcomes),
        sort_order: String(course.order),
        source: q('supplementary'),
        is_published: 'true',
      }),
    )

    let courseObjective = 0
    let courseOpenEnded = 0
    for (const m of course.modules) {
      const moduleId = uuidv5(`module:${c.slug}/${m.slug}`)
      out.push(
        upsert('course_modules', {
          id: q(moduleId),
          course_id: q(courseId),
          slug: q(m.slug),
          title: q(m.title),
          description: q(m.description),
          sort_order: String(m.order),
          is_published: 'true',
        }),
      )

      const lessonIds = new Map<string, string>()
      for (const l of m.lessons) {
        if (!l.parsed) continue
        const lessonId = uuidv5(`lesson:${c.slug}/${l.slug}`)
        lessonIds.set(l.slug, lessonId)
        out.push(
          upsert('lessons', {
            id: q(lessonId),
            module_id: q(moduleId),
            slug: q(l.slug),
            title: q(l.parsed.title || l.title),
            summary: q(l.parsed.summary),
            topics: textArray(l.topics),
            estimated_minutes: String(l.parsed.estimatedMinutes),
            difficulty: q(l.parsed.difficulty),
            source: q(l.parsed.source),
            content: json(lessonContentJson(l.parsed, links)),
            word_count: String(l.parsed.wordCount),
            sort_order: String(l.order),
            is_published: 'true',
          }),
        )
      }

      const usable = m.questions.filter((qq) => !qq.lesson || lessonIds.has(qq.lesson))
      for (const question of usable) {
        const rows = questionRows(question, `${c.slug}/${m.slug}/${question.id}`, {
          course: courseId,
          module: moduleId,
          lesson: question.lesson ? (lessonIds.get(question.lesson) ?? null) : null,
        })
        out.push(rows.question, rows.key)
      }

      for (const card of m.flashcards) {
        if (card.lesson && !lessonIds.has(card.lesson)) continue
        const ref = `${c.slug}/${m.slug}/${createHash('sha1').update(card.front).digest('hex').slice(0, 12)}`
        flashcardRefs.push(ref)
        out.push(
          upsert('flashcards', {
            id: q(uuidv5(`flashcard:${ref}`)),
            user_id: 'null',
            course_id: q(courseId),
            module_id: q(moduleId),
            lesson_id: q(card.lesson ? (lessonIds.get(card.lesson) ?? null) : null),
            front: q(card.front),
            back: q(card.back),
            source: q('supplementary'),
            external_ref: q(ref),
            is_published: 'true',
          }),
        )
      }

      // One practice quiz per lesson that has objective questions.
      for (const l of m.lessons) {
        const lessonId = lessonIds.get(l.slug)
        const count = usable.filter((qq) => qq.lesson === l.slug && OBJECTIVE_TYPES.includes(qq.type)).length
        if (!lessonId || count === 0) continue
        const title = l.parsed?.title ?? l.title
        out.push(
          quizRow({
            ref: `${c.slug}/${m.slug}/${l.slug}/quiz`,
            kind: 'lesson_quiz',
            title: `Lesson quiz: ${title}`,
            description: `Check your understanding of "${title}".`,
            instructions: `Answer every question, then submit to see explanations. ${PRACTICE_NOTE}`,
            courseId,
            moduleId,
            lessonId,
            questionCount: null,
            openEndedCount: 0,
            timeLimit: null,
            sortOrder: l.order,
          }),
        )
      }

      const objective = usable.filter((qq) => OBJECTIVE_TYPES.includes(qq.type)).length
      const openEnded = usable.length - objective
      courseObjective += objective
      courseOpenEnded += openEnded
      if (objective > 0) {
        const questionCount = Math.min(20, objective)
        out.push(
          quizRow({
            ref: `${c.slug}/${m.slug}/assessment`,
            kind: 'module_assessment',
            title: `Module assessment: ${m.title}`,
            description: `A timed assessment covering every lesson in "${m.title}".`,
            instructions: `${questionCount} objective questions${openEnded ? ' and one extended-response question' : ''}. You have 35 minutes. The objective section is scored automatically; the extended response is self-assessed against a rubric. ${PRACTICE_NOTE}`,
            courseId,
            moduleId,
            questionCount,
            openEndedCount: openEnded ? 1 : 0,
            timeLimit: 35,
            sortOrder: m.order,
          }),
        )
      }
    }

    if (courseObjective > 0) {
      courseIdsWithQuestions.push(courseId)
      const questionCount = Math.min(40, courseObjective)
      const openEnded = Math.min(2, courseOpenEnded)
      out.push(
        quizRow({
          ref: `${c.slug}/mock-exam`,
          kind: 'mock_exam',
          title: `${c.code} mock examination`,
          description: `A randomised, timed mock examination drawing on the whole ${c.code} question bank.`,
          instructions: `${questionCount} objective questions${openEnded ? ` and ${openEnded} extended-response question(s)` : ''} in 90 minutes. Questions are drawn at random, so every attempt differs. ${PRACTICE_NOTE}`,
          courseId,
          questionCount,
          openEndedCount: openEnded,
          timeLimit: 90,
          sortOrder: course.order,
        }),
      )
    }

    for (const [i, r] of course.resources.entries()) {
      const link = links[r.url]
      out.push(
        upsert('lesson_resources', {
          id: q(uuidv5(`resource:${c.slug}/${r.url}`)),
          course_id: q(courseId),
          module_id: q(r.module ? uuidv5(`module:${c.slug}/${r.module}`) : null),
          title: q(r.title),
          description: q(r.description),
          provider: q(r.provider),
          url: q(r.url),
          category: q(r.category),
          difficulty: q(r.difficulty),
          stage: q(r.stage),
          access_type: q(r.accessType),
          verification_status: q(link?.status ?? 'unverified'),
          last_verified_at: q(link?.checkedAt ?? null),
          verification_note: q(
            !link
              ? 'Not yet checked'
              : link.status === 'verified'
                ? `Reachable (HTTP ${link.httpStatus ?? 'n/a'}) when checked`
                : link.status === 'unverified'
                  ? `The site blocked the automated check (HTTP ${link.httpStatus ?? 'n/a'}); open it to confirm`
                  : 'Could not be reached when checked',
          ),
          sort_order: String(i + 1),
          is_published: 'true',
        }),
      )
    }
    out.push('')
  }

  if (courseIdsWithQuestions.length > 1) {
    out.push(
      quizRow({
        ref: 'mixed/mock-exam',
        kind: 'mock_exam',
        title: 'Mixed-course mock examination',
        description: 'Interleaved practice across every course: questions are drawn at random from all course banks.',
        instructions: `50 objective questions and 2 extended-response questions in 120 minutes. ${PRACTICE_NOTE}`,
        scopeCourseIds: courseIdsWithQuestions,
        questionCount: 50,
        openEndedCount: 2,
        timeLimit: 120,
        sortOrder: 100,
      }),
    )
  }

  // A flashcard's id is derived from its front text, so editing the front creates a new row. Remove curriculum
  // cards (no owner) that are no longer in the content; students' own cards are never touched.
  out.push(
    '',
    `delete from public.flashcards where user_id is null and external_ref is not null and external_ref <> all (array[${flashcardRefs.map(q).join(', ')}]::text[]);`,
  )

  out.push('', 'commit;', '')
  return out.join('\n')
}

export function writeSeed(courses: LoadedCourse[]): void {
  const sql = buildSeedSql(courses, loadLinkVerification())
  writeFileSync(join(process.cwd(), 'supabase', 'seed.sql'), sql)
  console.log(`Wrote supabase/seed.sql (${(sql.length / 1024).toFixed(0)} KB)`)
}
