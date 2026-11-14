import { useQuery } from '@tanstack/react-query'
import { FileUp, Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ErrorState, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Switch } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { toUserMessage } from '@/lib/errors'
import { importQuestionBank, listAllQuizzes, setPublished, updateRow } from '@/services/admin'
import type { Quiz, QuizKind } from '@/types/database'
import { useAdminAction, useAdminCatalogue } from './hooks'
import { PublishSwitch } from './shared'

const QUIZZES_KEY = ['admin', 'quizzes']
const KIND_LABEL: Record<QuizKind, string> = { lesson_quiz: 'Lesson quizzes', module_assessment: 'Module assessments', mock_exam: 'Mock exams', revision_test: 'Revision tests' }

export function AssessmentAdmin() {
  const quizzes = useQuery({ queryKey: QUIZZES_KEY, queryFn: listAllQuizzes })
  const catalogue = useAdminCatalogue()
  const [kind, setKind] = useState<QuizKind>('module_assessment')
  const [courseId, setCourseId] = useState('')
  const [editing, setEditing] = useState<Quiz | null>(null)
  const publish = useAdminAction((input: { id: string; value: boolean }) => setPublished('quizzes', input.id, input.value), {
    success: 'Publication status updated',
    invalidate: [QUIZZES_KEY, ['quizzes']],
  })

  if (quizzes.isError) return <ErrorState message={toUserMessage(quizzes.error)} onRetry={() => void quizzes.refetch()} />
  if (quizzes.isPending) return <Skeleton className="h-96" />

  const courseCode = (id: string | null) => catalogue.data?.find((c) => c.id === id)?.code ?? 'All courses'
  const visible = quizzes.data.filter((q) => q.kind === kind && (!courseId || q.course_id === courseId || q.scope_course_ids.includes(courseId)))

  return (
    <div className="flex flex-col gap-6">
      <QuestionBankImport />
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Assessment type" value={kind} onValueChange={(next) => setKind(next as QuizKind)} className="w-auto">
            {Object.entries(KIND_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </Select>
          <Select aria-label="Course" value={courseId} onValueChange={(next) => setCourseId(next)} className="w-auto">
            <SelectItem value="">All courses</SelectItem>
            {(catalogue.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Assessment</th>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Questions</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Pass mark</th>
                <th className="px-3 py-2 font-medium">Attempts</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((q) => (
                <tr key={q.id}>
                  <td className="px-3 py-2">{q.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{courseCode(q.course_id)}</td>
                  <td className="px-3 py-2">{q.question_count ?? 'All'}</td>
                  <td className="px-3 py-2">{q.time_limit_minutes ? `${q.time_limit_minutes} min` : 'Untimed'}</td>
                  <td className="px-3 py-2">{q.pass_mark ? `${q.pass_mark}%` : 'Platform default'}</td>
                  <td className="px-3 py-2">{q.max_attempts ?? 'Unlimited'}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(q)} aria-label={`Edit ${q.title}`}>
                        <Pencil />
                      </Button>
                      <PublishSwitch label={q.title} checked={q.is_published} onChange={(value) => publish.mutate({ id: q.id, value })} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing ? <QuizDialog quiz={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

const optionalNumber = (value: string) => (value.trim() === '' ? null : Math.max(0, Math.round(Number(value))))

function QuizDialog({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const [questionCount, setQuestionCount] = useState(quiz.question_count?.toString() ?? '')
  const [openEnded, setOpenEnded] = useState(quiz.open_ended_count.toString())
  const [timeLimit, setTimeLimit] = useState(quiz.time_limit_minutes?.toString() ?? '')
  const [maxAttempts, setMaxAttempts] = useState(quiz.max_attempts?.toString() ?? '')
  const [passMark, setPassMark] = useState(quiz.pass_mark?.toString() ?? '')
  const [randomize, setRandomize] = useState(quiz.randomize)
  const save = useAdminAction(
    () =>
      updateRow('quizzes', quiz.id, {
        question_count: optionalNumber(questionCount),
        open_ended_count: optionalNumber(openEnded) ?? 0,
        time_limit_minutes: optionalNumber(timeLimit),
        max_attempts: optionalNumber(maxAttempts),
        pass_mark: passMark.trim() === '' ? null : Math.min(100, optionalNumber(passMark) ?? 0),
        randomize,
      }),
    { success: 'Assessment saved', invalidate: [QUIZZES_KEY, ['quizzes']] },
  )
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Assessment settings" description={quiz.title}>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Questions drawn" htmlFor="q-count" hint="Blank = every eligible question.">
            <Input id="q-count" type="number" min={1} value={questionCount} onChange={(e) => setQuestionCount(e.target.value)} />
          </Field>
          <Field label="Open-ended questions" htmlFor="q-open" hint="Essay / case questions (self-assessed).">
            <Input id="q-open" type="number" min={0} value={openEnded} onChange={(e) => setOpenEnded(e.target.value)} />
          </Field>
          <Field label="Time limit (minutes)" htmlFor="q-time" hint="Blank = untimed.">
            <Input id="q-time" type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
          </Field>
          <Field label="Maximum attempts" htmlFor="q-attempts" hint="Blank = unlimited.">
            <Input id="q-attempts" type="number" min={1} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
          </Field>
          <Field label="Pass mark (%)" htmlFor="q-pass" hint="Blank = platform mastery threshold.">
            <Input id="q-pass" type="number" min={0} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} />
          </Field>
          <label className="flex items-center gap-3 self-center text-sm">
            <Switch checked={randomize} onCheckedChange={setRandomize} aria-label="Randomise question order" />
            Randomise questions
          </label>
          <DialogFooter className="sm:col-span-2">
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

function QuestionBankImport() {
  const catalogue = useAdminCatalogue()
  const [courseId, setCourseId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const course = catalogue.data?.find((c) => c.id === courseId)
  const importer = useAdminAction(
    async () => {
      if (!course || !file) return
      await importQuestionBank(course, moduleId, file.name, await file.text())
    },
    { success: 'Question bank imported', invalidate: [QUIZZES_KEY] },
  )
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    importer.mutate(undefined, { onSuccess: () => setFile(null) })
  }
  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-surface p-4 shadow-card">
      <h3 className="font-semibold">Import a question bank</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        YAML in the GradPath authoring format. Questions are matched to lessons by slug and stored as supplementary practice; answer keys stay server-side.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Course" htmlFor="bank-course">
          <Select id="bank-course" value={courseId} onValueChange={(next) => {
              setCourseId(next)
              setModuleId('')
            }} required>
            <SelectItem value="">Choose…</SelectItem>
            {(catalogue.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Module" htmlFor="bank-module">
          <Select id="bank-module" value={moduleId} onValueChange={(next) => setModuleId(next)} required disabled={!course}>
            <SelectItem value="">Choose…</SelectItem>
            {(course?.modules ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.title}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="YAML file" htmlFor="bank-file">
          <Input id="bank-file" type="file" accept=".yaml,.yml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </Field>
        <Button type="submit" disabled={!course || !moduleId || !file || importer.isPending}>
          <FileUp /> {importer.isPending ? 'Importing…' : 'Import'}
        </Button>
      </div>
    </form>
  )
}
