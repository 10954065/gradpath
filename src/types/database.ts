/** Row types mirroring supabase/migrations. Keep in sync when the schema changes. */
import type { CourseClassification } from '@/lib/content/types'

export type { CourseClassification }

export type ContentSource = 'lecturer' | 'institutional' | 'supplementary' | 'ai_practice' | 'student'
export type CourseStatus = 'listed' | 'recommended_elective'
export type Difficulty = 'introductory' | 'intermediate' | 'advanced'

export interface Profile {
  id: string
  full_name: string
  email: string
  avatar_path: string | null
  programme: string
  institution: string
  academic_year: string
  semester: string
  weekly_study_target_hours: number
  preferred_study_times: string[]
  time_zone: string
  /** yyyy-mm-dd: the day the student's studies started; their study weeks start on its weekday. */
  study_started_on: string | null
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}

export interface StudentPreferences {
  user_id: string
  theme: 'light' | 'dark' | 'system'
  reader_font_scale: number
  reader_dark_mode: boolean
  browser_notifications: boolean
  reminder_lead_minutes: number
  daily_review_limit: number
  offline_courses: string[]
  updated_at: string
}

export interface PlatformSettings {
  id: boolean
  mastery_threshold: number
  default_mock_exam_minutes: number
  attempt_grace_seconds: number
  updated_at: string
}

export interface Course {
  id: string
  code: string
  slug: string
  title: string
  description: string
  status: CourseStatus
  status_note: string
  classification: CourseClassification
  credit_slots: number
  accent: string
  outcomes: string[]
  sort_order: number
  source: ContentSource
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface CourseModule {
  id: string
  course_id: string
  slug: string
  title: string
  description: string
  sort_order: number
  is_published: boolean
}

export interface KeyTerm {
  term: string
  definition: string
}

export type LinkVerification = 'verified' | 'unverified' | 'unreachable' | 'citation'

export interface LessonContent {
  introduction?: string
  objectives?: string[]
  prerequisites?: string[]
  keyTerms?: KeyTerm[]
  body?: { heading: string; markdown: string }[]
  misconceptions?: string[]
  examMistakes?: string[]
  criticalQuestions?: string[]
  exercises?: string[]
  takeaways?: string[]
  furtherReading?: { text: string; url: string | null; verification?: LinkVerification }[]
  videos?: { title: string; url: string; description: string; verification?: LinkVerification }[]
  revisionSummary?: string
}

export interface LessonSummary {
  id: string
  module_id: string
  slug: string
  title: string
  summary: string
  topics: string[]
  estimated_minutes: number
  difficulty: Difficulty
  source: ContentSource
  word_count: number
  min_reading_percent: number
  requires_quiz_pass: boolean
  sort_order: number
  is_published: boolean
}

export interface Lesson extends LessonSummary {
  content: LessonContent
  updated_at: string
}

export type ResourceCategory =
  | 'database'
  | 'course'
  | 'documentation'
  | 'tool'
  | 'guide'
  | 'standard'
  | 'organisation'
  | 'video'
  | 'reference'

export interface LessonResource {
  id: string
  course_id: string
  module_id: string | null
  lesson_id: string | null
  title: string
  description: string
  provider: string
  url: string
  category: ResourceCategory
  difficulty: Difficulty
  stage: 'foundation' | 'core' | 'advanced' | 'revision'
  access_type: 'free' | 'freemium' | 'paid' | 'registration' | 'unknown'
  verification_status: 'verified' | 'unverified' | 'unreachable'
  last_verified_at: string | null
  verification_note: string
  sort_order: number
  is_published: boolean
}

export interface CourseEnrolment {
  id: string
  user_id: string
  course_id: string
  status: 'enrolled' | 'pending_confirmation' | 'dropped'
}

export interface Announcement {
  id: string
  course_id: string | null
  title: string
  body: string
  is_pinned: boolean
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface UploadedMaterial {
  id: string
  course_id: string
  module_id: string | null
  lesson_id: string | null
  title: string
  description: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  source: 'lecturer' | 'institutional' | 'supplementary'
  is_published: boolean
  created_at: string
}

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'

export interface LessonProgress {
  user_id: string
  lesson_id: string
  status: ProgressStatus
  reading_percent: number
  time_spent_seconds: number
  last_section: string | null
  last_read_at?: string | null
  quiz_best_percent: number | null
  mastered_at: string | null
  started_at: string
  completed_at: string | null
  updated_at: string
}

export interface StudentNote {
  id: string
  user_id: string
  course_id: string | null
  module_id: string | null
  lesson_id: string | null
  title: string
  body: string
  tags: string[]
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export interface Bookmark {
  id: string
  user_id: string
  lesson_id: string | null
  resource_id: string | null
  note: string
  created_at: string
}

export type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'completed'
export type Priority = 'low' | 'medium' | 'high'

export type AssignmentKind = 'assignment' | 'test' | 'examination' | 'presentation' | 'project' | 'other'

export interface Assignment {
  id: string
  user_id: string
  course_id: string | null
  kind: AssignmentKind
  title: string
  description: string
  due_at: string | null
  priority: Priority
  status: AssignmentStatus
  notes: string
  attachment_paths: string[]
  submitted_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TimetableEvent {
  id: string
  user_id: string
  course_id: string | null
  title: string
  kind: 'study' | 'lecture' | 'revision' | 'other'
  recurrence: 'weekly' | 'once'
  day_of_week: number | null
  event_date: string | null
  start_time: string
  end_time: string
  starts_on: string | null
  ends_on: string | null
  location: string
  notes: string
  is_provisional: boolean
  time_zone: string
  created_at: string
  updated_at: string
}

export type SessionStatus = 'planned' | 'completed' | 'skipped' | 'cancelled'

export interface StudySession {
  id: string
  user_id: string
  course_id: string | null
  timetable_event_id: string | null
  occurrence_date: string | null
  title: string
  planned_start: string
  planned_end: string
  status: SessionStatus
  actual_minutes: number | null
  completed_at: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface Flashcard {
  id: string
  user_id: string | null
  course_id: string | null
  module_id: string | null
  lesson_id: string | null
  front: string
  back: string
  source: ContentSource
  is_published: boolean
  created_at: string
  updated_at: string
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface RevisionItem {
  id: string
  user_id: string
  item_type: 'lesson' | 'flashcard' | 'topic'
  course_id: string | null
  lesson_id: string | null
  flashcard_id: string | null
  topic: string | null
  reason: string
  ease_factor: number
  interval_days: number
  repetitions: number
  lapses: number
  due_at: string
  last_reviewed_at: string | null
  status: 'learning' | 'review' | 'mastered' | 'suspended'
  created_at: string
  updated_at: string
}

export interface RevisionReview {
  id: string
  user_id: string
  revision_item_id: string
  rating: ReviewRating
  previous_interval: number
  new_interval: number
  ease_factor: number
  reviewed_at: string
}

export type NotificationKind =
  | 'assignment_due'
  | 'revision_due'
  | 'study_reminder'
  | 'assessment_result'
  | 'announcement'
  | 'system'
  | 'lecture_reminder'
  | 'timetable_change'

export interface AppNotification {
  id: string
  user_id: string
  kind: NotificationKind
  title: string
  body: string
  link: string | null
  dedupe_key: string | null
  read_at: string | null
  created_at: string
}

export type QuizKind = 'lesson_quiz' | 'module_assessment' | 'mock_exam' | 'revision_test'
export type QuestionType = 'mcq' | 'true_false' | 'short_answer' | 'scenario' | 'matching' | 'essay' | 'case_analysis'

export interface Quiz {
  id: string
  kind: QuizKind
  title: string
  description: string
  instructions: string
  course_id: string | null
  module_id: string | null
  lesson_id: string | null
  scope_course_ids: string[]
  question_count: number | null
  open_ended_count: number
  time_limit_minutes: number | null
  randomize: boolean
  max_attempts: number | null
  pass_mark: number | null
  reveal_answers: 'after_submit' | 'never'
  is_published: boolean
  sort_order: number
}

export interface ObjectiveResult {
  objective: string
  lessonId: string | null
  earned: number
  possible: number
  percent: number | null
}

export interface LessonResult {
  lessonId: string
  lessonTitle: string
  earned: number
  possible: number
  percent: number | null
}

export interface QuizAttemptRow {
  id: string
  user_id: string
  quiz_id: string
  status: 'in_progress' | 'submitted'
  question_ids: string[]
  started_at: string
  deadline_at: string | null
  submitted_at: string | null
  score: number | null
  max_score: number | null
  percent: number | null
  mastery_threshold: number | null
  passed: boolean | null
  is_late: boolean
  objective_breakdown: ObjectiveResult[]
  lesson_breakdown: LessonResult[]
}

export interface OptionItem {
  id: string
  text: string
}

export interface RubricCriterion {
  criterion: string
  marks: number
  descriptor: string
}

export type AnswerResponse =
  | { option: string }
  | { value: boolean }
  | { text: string; selfMarks?: number }
  | { pairs: Record<string, string> }

/** Question as returned by start_attempt / attempt_review (keys only after submission). */
export interface AttemptQuestion {
  id: string
  type: QuestionType
  bloom: string
  difficulty: string
  objective: string
  prompt: string
  scenario: string | null
  case: string | null
  options: OptionItem[] | { left: OptionItem[]; right: OptionItem[] } | null
  marks: number
  structure: string[]
  rubric: RubricCriterion[]
  lessonId: string | null
  moduleId: string | null
  courseId: string | null
  source: ContentSource
  response?: AnswerResponse | null
  isCorrect?: boolean | null
  points?: number
  maxPoints?: number
  selfMarks?: number | null
  correct?: Record<string, unknown>
  explanation?: string
  modelAnswer?: string | null
}

export interface AttemptReview {
  attempt: {
    id: string
    quizId: string
    status: 'in_progress' | 'submitted'
    startedAt: string
    deadlineAt: string | null
    submittedAt: string | null
    score: number | null
    maxScore: number | null
    percent: number | null
    masteryThreshold: number | null
    passed: boolean | null
    isLate: boolean
    objectiveBreakdown: ObjectiveResult[]
    lessonBreakdown: LessonResult[]
  }
  quiz: {
    id: string
    kind: QuizKind
    title: string
    description: string
    instructions: string
    courseId: string | null
    moduleId: string | null
    lessonId: string | null
    timeLimitMinutes: number | null
    maxAttempts: number | null
    passMark: number
    revealAnswers: 'after_submit' | 'never'
  }
  answersRevealed: boolean
  questions: AttemptQuestion[]
  resumed?: boolean
}

export interface SearchResult {
  kind: 'course' | 'module' | 'lesson' | 'resource' | 'note' | 'assignment'
  item_id: string
  title: string
  snippet: string | null
  course_code: string | null
  url: string
  rank: number
}

export type SeminarStatus = 'exploring' | 'researching' | 'drafting' | 'rehearsing' | 'presented'

export interface SeminarPresentation {
  id: string
  user_id: string
  course_id: string | null
  topic: string
  status: SeminarStatus
  presentation_date: string | null
  date_confirmed: boolean
  checklist: string[]
  feedback: string
  notes: string
  created_at: string
  updated_at: string
}
