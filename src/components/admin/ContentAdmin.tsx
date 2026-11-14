import { ChevronDown, FileUp, Pencil } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { COURSE_CLASSIFICATIONS } from '@/lib/content/types'
import { CLASSIFICATION_LABEL } from '@/lib/curriculum'
import { toUserMessage } from '@/lib/errors'
import { importLessonMarkdown, setPublished, updateRow, type AdminCourse } from '@/services/admin'
import { CATALOGUE_KEY, useAdminAction, useAdminCatalogue } from './hooks'
import { PublishSwitch } from './shared'

type AdminLesson = AdminCourse['modules'][number]['lessons'][number]

const INVALIDATE = [CATALOGUE_KEY, ['courses']]

export function ContentAdmin() {
  const catalogue = useAdminCatalogue()
  const [openCourse, setOpenCourse] = useState<string | null>(null)
  const [editingCourse, setEditingCourse] = useState<AdminCourse | null>(null)
  const [editingLesson, setEditingLesson] = useState<AdminLesson | null>(null)
  const publish = useAdminAction(
    (input: { table: 'courses' | 'course_modules' | 'lessons'; id: string; value: boolean }) => setPublished(input.table, input.id, input.value),
    { success: 'Publication status updated', invalidate: INVALIDATE },
  )

  if (catalogue.isError) return <ErrorState message={toUserMessage(catalogue.error)} onRetry={() => void catalogue.refetch()} />
  if (catalogue.isPending) return <Skeleton className="h-96" />

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Hidden items are invisible to students. Imported lessons start hidden so you can review them before publishing.
      </p>
      {catalogue.data.map((course) => {
        const isOpen = openCourse === course.id
        return (
          <section key={course.id} className="rounded-xl border bg-surface shadow-card">
            <header className="flex flex-wrap items-center gap-3 p-4">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpenCourse(isOpen ? null : course.id)}
              >
                <ChevronDown className={`size-4 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden />
                <span className="text-xs font-semibold text-muted-foreground">{course.code}</span>
                <span className="truncate font-medium">{course.title}</span>
                {course.status === 'recommended_elective' ? <Badge tone="warning">Recommended elective</Badge> : null}
              </button>
              <Button size="sm" variant="ghost" onClick={() => setEditingCourse(course)}>
                <Pencil /> Edit
              </Button>
              <PublishSwitch label={course.code} checked={course.is_published} onChange={(value) => publish.mutate({ table: 'courses', id: course.id, value })} />
            </header>
            {isOpen ? (
              <div className="flex flex-col gap-3 border-t p-4">
                {course.modules.map((module) => (
                  <div key={module.id} className="rounded-lg border">
                    <div className="flex flex-wrap items-center gap-3 bg-surface-2 px-3 py-2">
                      <span className="flex-1 text-sm font-medium">{module.title}</span>
                      <ImportLessonButton moduleId={module.id} label="Import lesson" />
                      <PublishSwitch label={module.title} checked={module.is_published} onChange={(value) => publish.mutate({ table: 'course_modules', id: module.id, value })} />
                    </div>
                    <ul className="divide-y">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                          <span className="text-xs text-muted-foreground">{lesson.word_count.toLocaleString()} words</span>
                          <Button size="sm" variant="ghost" onClick={() => setEditingLesson(lesson)}>
                            <Pencil /> Rules
                          </Button>
                          <ImportLessonButton moduleId={module.id} existingId={lesson.id} label="Replace" />
                          <PublishSwitch label={lesson.title} checked={lesson.is_published} onChange={(value) => publish.mutate({ table: 'lessons', id: lesson.id, value })} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
      {editingCourse ? <CourseDialog course={editingCourse} onClose={() => setEditingCourse(null)} /> : null}
      {editingLesson ? <LessonRulesDialog lesson={editingLesson} onClose={() => setEditingLesson(null)} /> : null}
    </div>
  )
}

function ImportLessonButton({ moduleId, existingId, label }: { moduleId: string; existingId?: string; label: string }) {
  const importer = useAdminAction(
    async (file: File) => {
      const result = await importLessonMarkdown(moduleId, file.name, await file.text(), existingId)
      toast.success(`Imported “${result.title}”${existingId ? '' : ' (hidden until published)'}`)
      if (result.warnings.length) toast.warning(`${result.warnings.length} authoring warning(s): ${result.warnings.slice(0, 2).join('; ')}`)
    },
    { invalidate: INVALIDATE },
  )
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) importer.mutate(file)
  }
  return (
    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium hover:bg-muted [&_svg]:size-4">
      <FileUp aria-hidden /> {importer.isPending ? 'Importing…' : label}
      <input type="file" accept=".md,text/markdown" className="sr-only" onChange={handleChange} disabled={importer.isPending} />
    </label>
  )
}

function CourseDialog({ course, onClose }: { course: AdminCourse; onClose: () => void }) {
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description)
  const [statusNote, setStatusNote] = useState(course.status_note)
  const [classification, setClassification] = useState(course.classification)
  const [creditSlots, setCreditSlots] = useState(course.credit_slots)
  const save = useAdminAction(
    () =>
      updateRow('courses', course.id, {
        title: title.trim(),
        description: description.trim(),
        status_note: statusNote.trim(),
        classification,
        credit_slots: Math.min(12, Math.max(1, Math.round(creditSlots))),
      }),
    {
      success: 'Course saved',
      invalidate: INVALIDATE,
    },
  )
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    save.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Edit ${course.code}`} size="lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Title" htmlFor="course-title">
            <Input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </Field>
          <Field label="Description" htmlFor="course-description">
            <Textarea id="course-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Classification" htmlFor="course-classification" hint="Electives are chosen by each student; the others apply to everyone.">
              <Select id="course-classification" value={classification} onValueChange={(next) => setClassification(next as typeof classification)}>
                {COURSE_CLASSIFICATIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {CLASSIFICATION_LABEL[k]}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Credit slots" htmlFor="course-slots">
              <Input id="course-slots" type="number" min={1} max={12} value={creditSlots} onChange={(e) => setCreditSlots(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Status note" htmlFor="course-status" hint="Shown to students, e.g. that an elective is pending confirmation.">
            <Textarea id="course-status" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} maxLength={1000} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LessonRulesDialog({ lesson, onClose }: { lesson: AdminLesson; onClose: () => void }) {
  const [minReading, setMinReading] = useState(lesson.min_reading_percent)
  const [requiresQuiz, setRequiresQuiz] = useState(lesson.requires_quiz_pass)
  const save = useAdminAction(() => updateRow('lessons', lesson.id, { min_reading_percent: minReading, requires_quiz_pass: requiresQuiz }), {
    success: 'Completion rules saved',
    invalidate: INVALIDATE,
  })
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Completion rules" description={lesson.title}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Minimum reading (%)" htmlFor="min-reading" hint="Students must scroll through at least this much before marking the lesson complete.">
            <Input id="min-reading" type="number" min={0} max={100} value={minReading} onChange={(e) => setMinReading(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={requiresQuiz} onCheckedChange={setRequiresQuiz} aria-label="Require a quiz pass for mastery" />
            Require a lesson quiz pass at the mastery threshold
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
