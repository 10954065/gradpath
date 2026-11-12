import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseCourseOutline, parseFlashcards, parseQuestionBank, parseResources } from '../../src/lib/content/bankParser'
import { parseLesson } from '../../src/lib/content/lessonParser'
import type {
  CourseOutline,
  ParsedFlashcard,
  ParsedLesson,
  ParsedQuestion,
  ParsedResource,
  ValidationIssue,
} from '../../src/lib/content/types'

export const CONTENT_ROOT = join(process.cwd(), 'content', 'courses')

export interface LoadedModule {
  slug: string
  title: string
  description: string
  order: number
  lessons: { slug: string; title: string; topics: string[]; order: number; parsed: ParsedLesson | null }[]
  questions: ParsedQuestion[]
  flashcards: ParsedFlashcard[]
  hasQuestionFile: boolean
  hasFlashcardFile: boolean
}

export interface LoadedCourse {
  outline: CourseOutline
  order: number
  modules: LoadedModule[]
  resources: ParsedResource[]
  hasResourceFile: boolean
}

export interface LoadResult {
  courses: LoadedCourse[]
  issues: ValidationIssue[]
}

const COURSE_ORDER = ['csit-601', 'csit-603', 'csit-605', 'csit-607', 'csit-613', 'csit-617', 'csit-621']

function rel(path: string): string {
  return relative(process.cwd(), path).replace(/\\/g, '/')
}

export function loadContent(options: { course?: string; requireComplete?: boolean } = {}): LoadResult {
  const issues: ValidationIssue[] = []
  const courses: LoadedCourse[] = []
  const missing = (file: string, what: string) =>
    issues.push({ file, message: `${what} not written yet`, severity: options.requireComplete ? 'error' : 'warning' })

  const slugs = readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((s) => !options.course || s === options.course)
    .sort((a, b) => (COURSE_ORDER.indexOf(a) + 1 || 99) - (COURSE_ORDER.indexOf(b) + 1 || 99))

  slugs.forEach((slug, courseIndex) => {
    const dir = join(CONTENT_ROOT, slug)
    const outlineFile = join(dir, 'course.yaml')
    if (!existsSync(outlineFile)) {
      issues.push({ file: rel(outlineFile), message: 'course.yaml missing', severity: 'error' })
      return
    }
    const { course: outline, issues: outlineIssues } = parseCourseOutline(rel(outlineFile), readFileSync(outlineFile, 'utf8'))
    issues.push(...outlineIssues)
    if (!outline) return
    if (outline.slug !== slug) issues.push({ file: rel(outlineFile), message: `slug must equal folder name "${slug}"`, severity: 'error' })

    const modules: LoadedModule[] = outline.modules.map((m, moduleIndex) => {
      const lessonSlugs = new Set(m.lessons.map((l) => l.slug))
      const lessonDir = join(dir, 'lessons', m.slug)
      const lessons = m.lessons.map((l, lessonIndex) => {
        const file = join(lessonDir, `${l.slug}.md`)
        let parsed: ParsedLesson | null = null
        if (existsSync(file)) {
          const result = parseLesson(rel(file), readFileSync(file, 'utf8'))
          issues.push(...result.issues)
          parsed = result.lesson
        } else missing(rel(file), 'lesson')
        return { ...l, order: lessonIndex + 1, parsed }
      })
      if (existsSync(lessonDir)) {
        for (const f of readdirSync(lessonDir)) {
          if (f.endsWith('.md') && !lessonSlugs.has(f.replace(/\.md$/, '')))
            issues.push({ file: rel(join(lessonDir, f)), message: 'lesson file is not listed in course.yaml', severity: 'error' })
        }
      }

      const qFile = join(dir, 'questions', `${m.slug}.yaml`)
      const fFile = join(dir, 'flashcards', `${m.slug}.yaml`)
      let questions: ParsedQuestion[] = []
      let flashcards: ParsedFlashcard[] = []
      if (existsSync(qFile)) {
        const r = parseQuestionBank(rel(qFile), readFileSync(qFile, 'utf8'), lessonSlugs)
        issues.push(...r.issues)
        if (r.module && r.module !== m.slug) issues.push({ file: rel(qFile), message: `module must be "${m.slug}"`, severity: 'error' })
        questions = r.items
      } else missing(rel(qFile), 'question bank')
      if (existsSync(fFile)) {
        const r = parseFlashcards(rel(fFile), readFileSync(fFile, 'utf8'), lessonSlugs)
        issues.push(...r.issues)
        flashcards = r.items
      } else missing(rel(fFile), 'flashcards')

      return {
        slug: m.slug,
        title: m.title,
        description: m.description,
        order: moduleIndex + 1,
        lessons,
        questions,
        flashcards,
        hasQuestionFile: existsSync(qFile),
        hasFlashcardFile: existsSync(fFile),
      }
    })

    const rFile = join(dir, 'resources.yaml')
    let resources: ParsedResource[] = []
    if (existsSync(rFile)) {
      const r = parseResources(rel(rFile), readFileSync(rFile, 'utf8'), new Set(outline.modules.map((m) => m.slug)))
      issues.push(...r.issues)
      resources = r.items
    } else missing(rel(rFile), 'resources.yaml')

    courses.push({ outline, order: COURSE_ORDER.indexOf(slug) + 1 || courseIndex + 1, modules, resources, hasResourceFile: existsSync(rFile) })
  })

  return { courses, issues }
}
