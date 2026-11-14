/** Shared content model produced by the content parser and consumed by the seed builder and admin importer. */

export const CONTENT_SOURCES = [
  'lecturer',
  'institutional',
  'supplementary',
  'ai_practice',
  'student',
] as const
export type ContentSource = (typeof CONTENT_SOURCES)[number]

export const QUESTION_TYPES = [
  'mcq',
  'true_false',
  'short_answer',
  'scenario',
  'matching',
  'essay',
  'case_analysis',
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const OBJECTIVE_TYPES: readonly QuestionType[] = ['mcq', 'true_false', 'short_answer', 'scenario', 'matching']

export const BLOOM_LEVELS = ['recall', 'understand', 'apply', 'analyse', 'evaluate'] as const
export type BloomLevel = (typeof BLOOM_LEVELS)[number]

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type QuestionDifficulty = (typeof DIFFICULTIES)[number]

export const LESSON_DIFFICULTIES = ['introductory', 'intermediate', 'advanced'] as const
export type LessonDifficulty = (typeof LESSON_DIFFICULTIES)[number]

export interface KeyTerm {
  term: string
  definition: string
}

export interface LinkItem {
  text: string
  url: string | null
}

export interface VideoItem {
  title: string
  url: string
  description: string
}

export interface BodySection {
  heading: string
  markdown: string
}

export interface ParsedLesson {
  title: string
  summary: string
  estimatedMinutes: number
  difficulty: LessonDifficulty
  source: ContentSource
  introduction: string
  objectives: string[]
  prerequisites: string[]
  keyTerms: KeyTerm[]
  body: BodySection[]
  misconceptions: string[]
  examMistakes: string[]
  criticalQuestions: string[]
  exercises: string[]
  takeaways: string[]
  furtherReading: LinkItem[]
  videos: VideoItem[]
  revisionSummary: string
  wordCount: number
  bodyWordCount: number
}

export interface RubricCriterion {
  criterion: string
  marks: number
  descriptor: string
}

export interface MatchingPair {
  left: string
  right: string
}

export interface ParsedQuestion {
  id: string
  lesson: string | null
  type: QuestionType
  bloom: BloomLevel
  difficulty: QuestionDifficulty
  objective: string
  prompt: string
  scenario: string | null
  caseText: string | null
  options: string[] | null
  answerIndex: number | null
  answerBoolean: boolean | null
  acceptedAnswers: string[] | null
  pairs: MatchingPair[] | null
  explanation: string
  marks: number
  structure: string[] | null
  rubric: RubricCriterion[] | null
  modelAnswer: string | null
}

export interface ParsedFlashcard {
  lesson: string | null
  front: string
  back: string
}

export const RESOURCE_CATEGORIES = [
  'database',
  'course',
  'documentation',
  'tool',
  'guide',
  'standard',
  'organisation',
  'video',
  'reference',
] as const
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

export const LEARNING_STAGES = ['foundation', 'core', 'advanced', 'revision'] as const
export type LearningStage = (typeof LEARNING_STAGES)[number]

export const ACCESS_TYPES = ['free', 'freemium', 'paid', 'registration', 'unknown'] as const
export type AccessType = (typeof ACCESS_TYPES)[number]

export interface ParsedResource {
  title: string
  description: string
  provider: string
  url: string
  category: ResourceCategory
  module: string | null
  difficulty: LessonDifficulty
  stage: LearningStage
  accessType: AccessType
}

export interface CourseOutlineLesson {
  slug: string
  title: string
  topics: string[]
}

export interface CourseOutlineModule {
  slug: string
  title: string
  description: string
  lessons: CourseOutlineLesson[]
}

/** How a course sits in the programme. Electives are chosen by each student; the others apply to everyone. */
export const COURSE_CLASSIFICATIONS = ['core', 'required', 'special_topic', 'elective'] as const
export type CourseClassification = (typeof COURSE_CLASSIFICATIONS)[number]

export interface CourseOutline {
  code: string
  slug: string
  title: string
  status: 'listed' | 'recommended_elective'
  statusNote: string
  classification: CourseClassification
  creditSlots: number
  accent: string
  description: string
  outcomes: string[]
  modules: CourseOutlineModule[]
}

export interface ValidationIssue {
  file: string
  message: string
  severity: 'error' | 'warning'
}
