// Administrator content management. Every operation is enforced by RLS (is_admin()) on the server.
import { parseQuestionBank } from '@/lib/content/bankParser'
import { parseLesson } from '@/lib/content/lessonParser'
import { AppError, ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Announcement, Course, CourseModule, Lesson, LessonResource, PlatformSettings, Quiz, UploadedMaterial } from '@/types/database'

export interface AdminCourse extends Course {
  modules: (CourseModule & { lessons: Pick<Lesson, 'id' | 'slug' | 'title' | 'is_published' | 'sort_order' | 'min_reading_percent' | 'requires_quiz_pass' | 'word_count'>[] })[]
}

export async function adminCatalogue(): Promise<AdminCourse[]> {
  const result = await supabase
    .from('courses')
    .select('*, modules:course_modules(*, lessons(id, slug, title, is_published, sort_order, min_reading_percent, requires_quiz_pass, word_count))')
    .order('sort_order')
  const courses = ensureOk(result, 'We could not load the content.') as AdminCourse[]
  return courses.map((c) => ({
    ...c,
    modules: [...c.modules].sort((a, b) => a.sort_order - b.sort_order).map((m) => ({ ...m, lessons: [...m.lessons].sort((a, b) => a.sort_order - b.sort_order) })),
  }))
}

type Table = 'courses' | 'course_modules' | 'lessons' | 'lesson_resources' | 'quizzes' | 'announcements' | 'uploaded_course_materials'

export async function setPublished(table: Table, id: string, published: boolean): Promise<void> {
  ensureOk(await supabase.from(table).update({ is_published: published }).eq('id', id), 'We could not change the publication status.')
}

export async function updateRow(table: Table, id: string, patch: Record<string, unknown>): Promise<void> {
  ensureOk(await supabase.from(table).update(patch).eq('id', id), 'We could not save the changes.')
}

export async function insertRow(table: Table, row: Record<string, unknown>): Promise<void> {
  ensureOk(await supabase.from(table).insert(row), 'We could not create the item.')
}

export async function deleteRow(table: Table, id: string): Promise<void> {
  ensureOk(await supabase.from(table).delete().eq('id', id), 'We could not delete the item.')
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

/**
 * Import or replace a lesson from a Markdown file in the GradPath authoring format (docs/CONTENT_AUTHORING.md).
 * New lessons are created unpublished so that an administrator reviews them before students see them.
 */
export async function importLessonMarkdown(moduleId: string, fileName: string, text: string, existingId?: string): Promise<{ title: string; warnings: string[] }> {
  const { lesson, issues } = parseLesson(fileName, text)
  const errors = issues.filter((i) => i.severity === 'error')
  if (!lesson) throw new AppError(`The file is not a valid lesson: ${errors.map((e) => e.message).slice(0, 3).join('; ')}`)
  const row = {
    module_id: moduleId,
    title: lesson.title,
    summary: lesson.summary,
    estimated_minutes: lesson.estimatedMinutes,
    difficulty: lesson.difficulty,
    source: lesson.source,
    word_count: lesson.wordCount,
    content: {
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
      furtherReading: lesson.furtherReading.map((r) => ({ ...r, verification: r.url ? 'unverified' : 'citation' })),
      videos: lesson.videos.map((v) => ({ ...v, verification: 'unverified' })),
      revisionSummary: lesson.revisionSummary,
    },
  }
  if (existingId) {
    await updateRow('lessons', existingId, row)
  } else {
    const { count } = await supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('module_id', moduleId)
    await insertRow('lessons', { ...row, slug: slugify(fileName.replace(/\.md$/i, '')) || slugify(lesson.title), sort_order: (count ?? 0) + 1, is_published: false })
  }
  return { title: lesson.title, warnings: issues.filter((i) => i.severity === 'warning').map((i) => i.message) }
}

const LETTERS = 'abcdefgh'

/** Import a module question bank (YAML authoring format). Questions are linked to lessons by slug. */
export async function importQuestionBank(course: AdminCourse, moduleId: string, fileName: string, text: string): Promise<number> {
  const module = course.modules.find((m) => m.id === moduleId)
  if (!module) throw new AppError('Choose a module first.')
  const lessonBySlug = new Map(module.lessons.map((l) => [l.slug, l.id]))
  const { items, issues } = parseQuestionBank(fileName, text, new Set(module.lessons.map((l) => l.slug)))
  const fatal = issues.filter((i) => i.severity === 'error' && !/objective questions \(minimum|needs at least one essay/.test(i.message))
  if (fatal.length) throw new AppError(`The question bank has problems: ${fatal.map((i) => i.message).slice(0, 3).join('; ')}`)
  let imported = 0
  for (const q of items) {
    const ref = `${course.slug}/${module.slug}/${q.id}`
    let options: unknown = null
    let correct: Record<string, unknown> = {}
    if (q.type === 'mcq' || q.type === 'scenario') {
      options = (q.options ?? []).map((text, i) => ({ id: LETTERS[i], text }))
      correct = { option: LETTERS[q.answerIndex ?? 0] }
    } else if (q.type === 'true_false') correct = { value: q.answerBoolean }
    else if (q.type === 'short_answer') correct = { answers: q.acceptedAnswers ?? [] }
    else if (q.type === 'matching') {
      const pairs = q.pairs ?? []
      options = { left: pairs.map((p, i) => ({ id: `l${i + 1}`, text: p.left })), right: [...pairs.map((p, i) => ({ id: `r${i + 1}`, text: p.right }))].sort(() => Math.random() - 0.5) }
      correct = { pairs: Object.fromEntries(pairs.map((_, i) => [`l${i + 1}`, `r${i + 1}`])) }
    }
    const { data, error } = await supabase
      .from('quiz_questions')
      .upsert(
        {
          external_ref: ref,
          course_id: course.id,
          module_id: moduleId,
          lesson_id: q.lesson ? (lessonBySlug.get(q.lesson) ?? null) : null,
          type: q.type,
          bloom: q.bloom,
          difficulty: q.difficulty,
          objective: q.objective,
          prompt: q.prompt,
          scenario: q.scenario,
          case_text: q.caseText,
          options,
          marks: q.marks,
          answer_structure: q.structure ?? [],
          rubric: q.rubric ?? [],
          source: 'ai_practice',
          is_published: true,
        },
        { onConflict: 'external_ref' },
      )
      .select('id')
      .single()
    if (error || !data) throw new AppError(`Question ${q.id} could not be saved.`, { cause: error })
    ensureOk(
      await supabase.from('question_keys').upsert({ question_id: data.id, correct, explanation: q.explanation, model_answer: q.modelAnswer }, { onConflict: 'question_id' }),
    )
    imported += 1
  }
  return imported
}

export async function listAllQuizzes(): Promise<Quiz[]> {
  return ensureOk(await supabase.from('quizzes').select('*').order('kind').order('sort_order'), 'We could not load the quizzes.') as Quiz[]
}

export async function listAllResources(): Promise<LessonResource[]> {
  return ensureOk(await supabase.from('lesson_resources').select('*').order('course_id').order('sort_order')) as LessonResource[]
}

export async function listAllAnnouncements(): Promise<Announcement[]> {
  return ensureOk(await supabase.from('announcements').select('*').order('created_at', { ascending: false })) as Announcement[]
}

export async function updateSettings(patch: Partial<Pick<PlatformSettings, 'mastery_threshold' | 'default_mock_exam_minutes' | 'attempt_grace_seconds'>>): Promise<void> {
  ensureOk(await supabase.from('platform_settings').update(patch).eq('id', true), 'We could not save the settings.')
}

// --- uploaded course materials -------------------------------------------------------------------
export const MATERIAL_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'text/plain': 'TXT',
}
const MAX_MATERIAL_BYTES = 25 * 1024 * 1024

/** Upload lecturer or institutional material. It stays private (unpublished) until an administrator publishes it. */
export async function uploadMaterial(input: {
  course: Course
  moduleId: string | null
  lessonId: string | null
  title: string
  description: string
  source: UploadedMaterial['source']
  file: File
}): Promise<void> {
  if (!MATERIAL_TYPES[input.file.type]) throw new AppError('Upload a PDF, DOCX, PPTX or TXT file.')
  if (input.file.size > MAX_MATERIAL_BYTES) throw new AppError('Files must be 25 MB or smaller.')
  const safe = input.file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100)
  const path = `${input.course.slug}/${Date.now()}-${safe}`
  const { error } = await supabase.storage.from('course-materials').upload(path, input.file, { contentType: input.file.type })
  if (error) throw new AppError('The upload failed.', { cause: error })
  const { data: auth } = await supabase.auth.getUser()
  await insertRow('uploaded_course_materials', {
    course_id: input.course.id,
    module_id: input.moduleId,
    lesson_id: input.lessonId,
    title: (input.title || input.file.name).slice(0, 200),
    description: input.description,
    storage_path: path,
    file_name: input.file.name.slice(0, 200),
    mime_type: input.file.type,
    size_bytes: input.file.size,
    source: input.source,
    is_published: false,
    uploaded_by: auth.user?.id ?? null,
  })
}

export async function listMaterials(courseId?: string): Promise<UploadedMaterial[]> {
  let query = supabase.from('uploaded_course_materials').select('*').order('created_at', { ascending: false })
  if (courseId) query = query.eq('course_id', courseId)
  return ensureOk(await query, 'We could not load course materials.') as UploadedMaterial[]
}

export async function deleteMaterial(material: UploadedMaterial): Promise<void> {
  const { error } = await supabase.storage.from('course-materials').remove([material.storage_path])
  if (error) throw new AppError('The file could not be deleted.', { cause: error })
  await deleteRow('uploaded_course_materials', material.id)
}

/** Ask the server-side link checker (Netlify Function) to verify a resource URL. */
export async function verifyResource(resource: LessonResource): Promise<'verified' | 'unverified' | 'unreachable'> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('Please sign in again.')
  const response = await fetch('/api/verify-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: resource.url }),
  })
  if (!response.ok) throw new AppError(response.status === 404 ? 'The link checker runs only on the deployed site (Netlify Functions).' : 'The link check failed.')
  const result = (await response.json()) as { status: 'verified' | 'unverified' | 'unreachable'; httpStatus?: number }
  await updateRow('lesson_resources', resource.id, {
    verification_status: result.status,
    last_verified_at: new Date().toISOString(),
    verification_note: result.status === 'verified' ? `Reachable (HTTP ${result.httpStatus}) when checked` : `HTTP ${result.httpStatus ?? 'error'} when checked`,
  })
  return result.status
}
