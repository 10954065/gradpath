import yaml from 'js-yaml'
import {
  ACCESS_TYPES,
  BLOOM_LEVELS,
  COURSE_CLASSIFICATIONS,
  DIFFICULTIES,
  LEARNING_STAGES,
  LESSON_DIFFICULTIES,
  OBJECTIVE_TYPES,
  QUESTION_TYPES,
  RESOURCE_CATEGORIES,
  type AccessType,
  type BloomLevel,
  type CourseClassification,
  type CourseOutline,
  type LearningStage,
  type LessonDifficulty,
  type MatchingPair,
  type ParsedFlashcard,
  type ParsedQuestion,
  type ParsedResource,
  type QuestionDifficulty,
  type QuestionType,
  type ResourceCategory,
  type RubricCriterion,
  type ValidationIssue,
} from './types'

type Obj = Record<string, unknown>

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter(Boolean) : []
}

function loadYaml(file: string, text: string, issues: ValidationIssue[]): unknown {
  try {
    return yaml.load(text.replace(/\r\n?/g, '\n'))
  } catch (e) {
    issues.push({ file, message: `Invalid YAML: ${(e as Error).message}`, severity: 'error' })
    return null
  }
}

export interface BankParseResult<T> {
  module: string | null
  items: T[]
  issues: ValidationIssue[]
}

function parseQuestion(raw: Obj, index: number, file: string, issues: ValidationIssue[]): ParsedQuestion | null {
  const label = `question ${str(raw.id) || `#${index + 1}`}`
  const errors: string[] = []
  const id = str(raw.id)
  const type = str(raw.type) as QuestionType
  const bloom = str(raw.bloom) as BloomLevel
  const difficulty = (str(raw.difficulty) || 'medium') as QuestionDifficulty
  const prompt = str(raw.prompt)
  const explanation = str(raw.explanation)
  if (!id) errors.push('missing id')
  if (!QUESTION_TYPES.includes(type)) errors.push(`unknown type "${type}"`)
  if (!BLOOM_LEVELS.includes(bloom)) errors.push(`unknown bloom level "${bloom}"`)
  if (!DIFFICULTIES.includes(difficulty)) errors.push(`unknown difficulty "${difficulty}"`)
  if (!prompt) errors.push('missing prompt')
  if (!explanation) errors.push('missing explanation')
  if (!str(raw.objective)) errors.push('missing objective')

  const question: ParsedQuestion = {
    id,
    lesson: str(raw.lesson) || null,
    type,
    bloom,
    difficulty,
    objective: str(raw.objective),
    prompt,
    scenario: str(raw.scenario) || null,
    caseText: str(raw.case) || null,
    options: null,
    answerIndex: null,
    answerBoolean: null,
    acceptedAnswers: null,
    pairs: null,
    explanation,
    marks: Number(raw.marks ?? 1) || 1,
    structure: null,
    rubric: null,
    modelAnswer: null,
  }

  switch (type) {
    case 'mcq':
    case 'scenario': {
      const options = strList(raw.options)
      const answer = Number(raw.answer)
      if (options.length < 3 || options.length > 5) errors.push('mcq/scenario needs 3 to 5 options')
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length)
        errors.push('answer must be a zero-based index into options')
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) errors.push('duplicate options')
      if (type === 'scenario' && !question.scenario) errors.push('scenario question needs `scenario`')
      question.options = options
      question.answerIndex = answer
      break
    }
    case 'true_false':
      if (typeof raw.answer !== 'boolean') errors.push('true_false answer must be true or false')
      question.answerBoolean = raw.answer === true
      break
    case 'short_answer': {
      const answers = strList(raw.answers)
      if (answers.length === 0) errors.push('short_answer needs `answers`')
      if (answers.some((a) => a.split(/\s+/).length > 6)) errors.push('short_answer answers must be short (≤6 words)')
      question.acceptedAnswers = answers
      break
    }
    case 'matching': {
      const pairs: MatchingPair[] = Array.isArray(raw.pairs)
        ? raw.pairs.filter(isObj).map((p) => ({ left: str(p.left), right: str(p.right) }))
        : []
      if (pairs.length < 3 || pairs.length > 8) errors.push('matching needs 3 to 8 pairs')
      if (pairs.some((p) => !p.left || !p.right)) errors.push('every pair needs left and right')
      if (new Set(pairs.map((p) => p.right)).size !== pairs.length) errors.push('matching right-hand values must be unique')
      question.pairs = pairs
      break
    }
    case 'essay':
    case 'case_analysis': {
      const rubric: RubricCriterion[] = Array.isArray(raw.rubric)
        ? raw.rubric.filter(isObj).map((r) => ({
            criterion: str(r.criterion),
            marks: Number(r.marks) || 0,
            descriptor: str(r.descriptor),
          }))
        : []
      const marks = Number(raw.marks)
      if (!Number.isFinite(marks) || marks <= 0) errors.push('essay/case_analysis needs positive `marks`')
      if (rubric.length === 0) errors.push('essay/case_analysis needs a `rubric`')
      const total = rubric.reduce((s, r) => s + r.marks, 0)
      if (rubric.length > 0 && total !== marks) errors.push(`rubric marks sum to ${total}, expected ${marks}`)
      if (!str(raw.modelAnswer)) errors.push('essay/case_analysis needs `modelAnswer`')
      if (type === 'case_analysis' && !question.caseText) errors.push('case_analysis needs `case`')
      question.marks = marks
      question.rubric = rubric
      question.structure = strList(raw.structure)
      question.modelAnswer = str(raw.modelAnswer)
      break
    }
    default:
      break
  }

  if (errors.length) {
    for (const message of errors) issues.push({ file, message: `${label}: ${message}`, severity: 'error' })
    return null
  }
  return question
}

export function parseQuestionBank(file: string, text: string, lessonSlugs: ReadonlySet<string>): BankParseResult<ParsedQuestion> {
  const issues: ValidationIssue[] = []
  const data = loadYaml(file, text, issues)
  if (!isObj(data) || !Array.isArray(data.questions)) {
    if (!issues.length) issues.push({ file, message: 'Expected `module` and a `questions` list', severity: 'error' })
    return { module: null, items: [], issues }
  }
  const items: ParsedQuestion[] = []
  const ids = new Set<string>()
  data.questions.forEach((raw, i) => {
    if (!isObj(raw)) {
      issues.push({ file, message: `question #${i + 1} is not an object`, severity: 'error' })
      return
    }
    const q = parseQuestion(raw, i, file, issues)
    if (!q) return
    if (ids.has(q.id)) issues.push({ file, message: `duplicate question id ${q.id}`, severity: 'error' })
    ids.add(q.id)
    if (q.lesson && !lessonSlugs.has(q.lesson))
      issues.push({ file, message: `question ${q.id}: unknown lesson "${q.lesson}"`, severity: 'error' })
    items.push(q)
  })

  for (const slug of lessonSlugs) {
    const forLesson = items.filter((q) => q.lesson === slug && OBJECTIVE_TYPES.includes(q.type))
    if (forLesson.length < 6)
      issues.push({ file, message: `lesson ${slug} has ${forLesson.length} objective questions (minimum 6)`, severity: 'error' })
    const levels = new Set(forLesson.map((q) => q.bloom))
    if (forLesson.length >= 6 && levels.size < 3)
      issues.push({ file, message: `lesson ${slug} questions span only ${levels.size} Bloom levels (minimum 3)`, severity: 'warning' })
  }
  if (!items.some((q) => q.type === 'essay' || q.type === 'case_analysis'))
    issues.push({ file, message: 'module needs at least one essay or case_analysis question', severity: 'error' })

  return { module: str(data.module) || null, items, issues }
}

export function parseFlashcards(file: string, text: string, lessonSlugs: ReadonlySet<string>): BankParseResult<ParsedFlashcard> {
  const issues: ValidationIssue[] = []
  const data = loadYaml(file, text, issues)
  if (!isObj(data) || !Array.isArray(data.cards)) {
    if (!issues.length) issues.push({ file, message: 'Expected `module` and a `cards` list', severity: 'error' })
    return { module: null, items: [], issues }
  }
  const items: ParsedFlashcard[] = []
  data.cards.forEach((raw, i) => {
    if (!isObj(raw) || !str(raw.front) || !str(raw.back)) {
      issues.push({ file, message: `card #${i + 1} needs front and back`, severity: 'error' })
      return
    }
    const lesson = str(raw.lesson) || null
    if (lesson && !lessonSlugs.has(lesson))
      issues.push({ file, message: `card #${i + 1}: unknown lesson "${lesson}"`, severity: 'error' })
    items.push({ lesson, front: str(raw.front), back: str(raw.back) })
  })
  for (const slug of lessonSlugs) {
    const count = items.filter((c) => c.lesson === slug).length
    if (count < 5) issues.push({ file, message: `lesson ${slug} has ${count} flashcards (minimum 5)`, severity: 'error' })
  }
  return { module: str(data.module) || null, items, issues }
}

export function parseResources(file: string, text: string, moduleSlugs: ReadonlySet<string>): BankParseResult<ParsedResource> {
  const issues: ValidationIssue[] = []
  const data = loadYaml(file, text, issues)
  if (!isObj(data) || !Array.isArray(data.resources)) {
    if (!issues.length) issues.push({ file, message: 'Expected a `resources` list', severity: 'error' })
    return { module: null, items: [], issues }
  }
  const items: ParsedResource[] = []
  const urls = new Set<string>()
  data.resources.forEach((raw, i) => {
    if (!isObj(raw)) return
    const label = `resource "${str(raw.title) || `#${i + 1}`}"`
    const resource: ParsedResource = {
      title: str(raw.title),
      description: str(raw.description),
      provider: str(raw.provider),
      url: str(raw.url),
      category: str(raw.category) as ResourceCategory,
      module: str(raw.module) || null,
      difficulty: (str(raw.difficulty) || 'introductory') as LessonDifficulty,
      stage: (str(raw.stage) || 'core') as LearningStage,
      accessType: (str(raw.accessType) || 'unknown') as AccessType,
    }
    const errors: string[] = []
    if (!resource.title || !resource.description || !resource.provider) errors.push('needs title, description and provider')
    if (!/^https:\/\//.test(resource.url)) errors.push('url must start with https://')
    if (!RESOURCE_CATEGORIES.includes(resource.category)) errors.push(`unknown category "${resource.category}"`)
    if (!LESSON_DIFFICULTIES.includes(resource.difficulty)) errors.push(`unknown difficulty "${resource.difficulty}"`)
    if (!LEARNING_STAGES.includes(resource.stage)) errors.push(`unknown stage "${resource.stage}"`)
    if (!ACCESS_TYPES.includes(resource.accessType)) errors.push(`unknown accessType "${resource.accessType}"`)
    if (resource.module && !moduleSlugs.has(resource.module)) errors.push(`unknown module "${resource.module}"`)
    if (urls.has(resource.url)) errors.push('duplicate url')
    urls.add(resource.url)
    if (errors.length) {
      for (const message of errors) issues.push({ file, message: `${label}: ${message}`, severity: 'error' })
      return
    }
    items.push(resource)
  })
  return { module: null, items, issues }
}

export function parseCourseOutline(file: string, text: string): { course: CourseOutline | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const data = loadYaml(file, text, issues)
  if (!isObj(data)) return { course: null, issues }
  const modules = Array.isArray(data.modules) ? data.modules.filter(isObj) : []
  const course: CourseOutline = {
    code: str(data.code),
    slug: str(data.slug),
    title: str(data.title),
    status: str(data.status) === 'recommended_elective' ? 'recommended_elective' : 'listed',
    statusNote: str(data.statusNote),
    classification: (COURSE_CLASSIFICATIONS as readonly string[]).includes(str(data.classification))
      ? (str(data.classification) as CourseClassification)
      : 'core',
    creditSlots: typeof data.creditSlots === 'number' ? data.creditSlots : 0,
    accent: str(data.accent) || 'indigo',
    description: str(data.description),
    outcomes: strList(data.outcomes),
    modules: modules.map((m) => ({
      slug: str(m.slug),
      title: str(m.title),
      description: str(m.description),
      lessons: (Array.isArray(m.lessons) ? m.lessons.filter(isObj) : []).map((l) => ({
        slug: str(l.slug),
        title: str(l.title),
        topics: strList(l.topics),
      })),
    })),
  }
  const fail = (message: string) => issues.push({ file, message, severity: 'error' })
  if (!/^[A-Z]{3,5} \d{3}$/.test(course.code)) fail(`invalid course code "${course.code}"`)
  if (!SLUG.test(course.slug)) fail(`invalid course slug "${course.slug}"`)
  if (!course.title || !course.description) fail('course needs title and description')
  if (course.outcomes.length < 3) fail('course needs at least 3 learning outcomes')
  if (!(COURSE_CLASSIFICATIONS as readonly string[]).includes(str(data.classification))) {
    fail(`classification must be one of ${COURSE_CLASSIFICATIONS.join(', ')}`)
  }
  if (!Number.isInteger(course.creditSlots) || course.creditSlots < 1 || course.creditSlots > 12) fail('creditSlots must be a whole number from 1 to 12')
  if (course.modules.length === 0) fail('course needs modules')
  const seen = new Set<string>()
  for (const m of course.modules) {
    if (!SLUG.test(m.slug)) fail(`invalid module slug "${m.slug}"`)
    if (m.lessons.length < 2) fail(`module ${m.slug} needs at least 2 lessons`)
    for (const l of m.lessons) {
      if (!SLUG.test(l.slug)) fail(`invalid lesson slug "${l.slug}"`)
      if (seen.has(l.slug)) fail(`duplicate lesson slug "${l.slug}"`)
      seen.add(l.slug)
    }
  }
  return { course, issues }
}
