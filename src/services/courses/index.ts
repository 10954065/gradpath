import { AppError, ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { withOfflineCache } from '@/services/offline/cache'
import type { Course, CourseEnrolment, CourseModule, Lesson, LessonResource, LessonSummary, UploadedMaterial } from '@/types/database'

const LESSON_SUMMARY_COLUMNS =
  'id, module_id, slug, title, summary, topics, estimated_minutes, difficulty, source, word_count, min_reading_percent, requires_quiz_pass, sort_order, is_published'

export interface ModuleWithLessons extends CourseModule {
  lessons: LessonSummary[]
}

export interface CourseDetail extends Course {
  modules: ModuleWithLessons[]
}

export interface LessonWithContext {
  lesson: Lesson
  module: CourseModule
  course: Course
  previous: Pick<LessonSummary, 'slug' | 'title'> | null
  next: Pick<LessonSummary, 'slug' | 'title'> | null
  position: { index: number; total: number }
}

export type ResourceWithCourse = LessonResource & { course: Pick<Course, 'code' | 'slug' | 'title'> }

function sortCourse(course: CourseDetail): CourseDetail {
  return {
    ...course,
    modules: [...course.modules]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({ ...m, lessons: [...m.lessons].sort((a, b) => a.sort_order - b.sort_order) })),
  }
}

export function listCourses(): Promise<Course[]> {
  return withOfflineCache('courses', async () => {
    const result = await supabase.from('courses').select('*').order('sort_order')
    return ensureOk(result, 'We could not load the courses.') as Course[]
  })
}

/** Course with ordered modules and lesson summaries (no lesson bodies). */
export function getCourse(slug: string): Promise<CourseDetail> {
  return withOfflineCache(`course:${slug}`, async () => {
    const result = await supabase
      .from('courses')
      .select(`*, modules:course_modules(*, lessons(${LESSON_SUMMARY_COLUMNS}))`)
      .eq('slug', slug)
      .maybeSingle()
    const course = ensureOk(result, 'We could not load this course.') as CourseDetail | null
    if (!course) throw new AppError('This course does not exist or is not published yet.')
    return sortCourse(course)
  })
}

/** Every course with its modules and lessons, for the library and planners. */
export function getCatalogue(): Promise<CourseDetail[]> {
  return withOfflineCache('catalogue', async () => {
    const result = await supabase
      .from('courses')
      .select(`*, modules:course_modules(*, lessons(${LESSON_SUMMARY_COLUMNS}))`)
      .order('sort_order')
    const courses = ensureOk(result, 'We could not load the library.') as CourseDetail[]
    return courses.map(sortCourse)
  })
}

export function getLesson(courseSlug: string, lessonSlug: string): Promise<LessonWithContext> {
  return withOfflineCache(`lesson:${courseSlug}/${lessonSlug}`, async () => {
    const course = await getCourse(courseSlug)
    const ordered = course.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m })))
    const index = ordered.findIndex((l) => l.slug === lessonSlug)
    const summary = ordered[index]
    if (!summary) throw new AppError('This lesson does not exist or is not published yet.')
    const result = await supabase.from('lessons').select('*').eq('id', summary.id).single()
    const lesson = ensureOk(result, 'We could not load this lesson.') as Lesson
    const prev = ordered[index - 1]
    const next = ordered[index + 1]
    const { modules: _modules, ...courseOnly } = course
    const { lessons: _lessons, ...moduleOnly } = summary.module
    return {
      lesson,
      module: moduleOnly,
      course: courseOnly,
      previous: prev ? { slug: prev.slug, title: prev.title } : null,
      next: next ? { slug: next.slug, title: next.title } : null,
      position: { index: index + 1, total: ordered.length },
    }
  })
}

export function listResources(): Promise<ResourceWithCourse[]> {
  return withOfflineCache('resources', async () => {
    const result = await supabase.from('lesson_resources').select('*, course:courses(code, slug, title)').order('sort_order')
    return ensureOk(result, 'We could not load the resources.') as ResourceWithCourse[]
  })
}

export async function listEnrolments(): Promise<CourseEnrolment[]> {
  const result = await supabase.from('course_enrolments').select('*')
  return ensureOk(result) as CourseEnrolment[]
}

export async function setEnrolmentStatus(courseId: string, status: CourseEnrolment['status']): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new AppError('Please sign in again.')
  ensureOk(
    await supabase.from('course_enrolments').upsert({ user_id: auth.user.id, course_id: courseId, status }, { onConflict: 'user_id,course_id' }),
    'We could not update your course registration.',
  )
}

/** Download every lesson of a course into the offline store so it can be read without a connection. */
export async function saveCourseForOffline(courseSlug: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const course = await getCourse(courseSlug)
  const lessons = course.modules.flatMap((m) => m.lessons)
  let done = 0
  for (const l of lessons) {
    await getLesson(courseSlug, l.slug)
    done += 1
    onProgress?.(done, lessons.length)
  }
  return lessons.length
}

/** Published lecturer/institutional materials for a course (RLS hides unpublished ones from students). */
export async function listCourseMaterials(courseId: string): Promise<UploadedMaterial[]> {
  const result = await supabase
    .from('uploaded_course_materials')
    .select('*')
    .eq('course_id', courseId)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
  return ensureOk(result, 'We could not load course materials.') as UploadedMaterial[]
}

/** Short-lived signed link to a private course material file. */
export async function materialUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('course-materials').createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}

/**
 * Open a private material in a new tab. The tab is opened synchronously (inside the click) so pop-up blockers
 * allow it, then pointed at a short-lived signed link once that has been created.
 */
export async function openMaterial(material: Pick<UploadedMaterial, 'storage_path'>): Promise<void> {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  const url = await materialUrl(material.storage_path)
  if (!url) {
    tab?.close()
    throw new AppError('The file link could not be created. Please try again.')
  }
  if (tab) tab.location.href = url
  else window.location.assign(url)
}
