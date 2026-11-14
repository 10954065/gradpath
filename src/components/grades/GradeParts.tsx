import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { useCourseMarks } from '@/hooks/useCourseMarks'
import { COMPONENT_LABEL, formatMark, type CourseStanding, type MarkComponent } from '@/lib/grades'
import { markSchema, type CourseMark } from '@/services/study/marks'
import type { Course } from '@/types/database'

interface Draft {
  title: string
  component: MarkComponent
  weight_percent: string
  score: string
  max_score: string
  recorded_on: string
  note: string
}

const toDraft = (m?: CourseMark): Draft => ({
  title: m?.title ?? '',
  component: m?.component ?? 'coursework',
  weight_percent: m ? String(m.weight_percent) : '',
  score: m?.score === null || m?.score === undefined ? '' : String(m.score),
  max_score: m ? String(m.max_score) : '100',
  recorded_on: m?.recorded_on ?? '',
  note: m?.note ?? '',
})

/** Add or edit one assessed component of a course. */
function MarkDialog({ course, editing, onClose }: { course: Pick<Course, 'id' | 'code'>; editing: CourseMark | 'new' | null; onClose: () => void }) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {editing ? (
        <DialogContent title={`${editing === 'new' ? 'Add a mark' : 'Edit mark'} · ${course.code}`} description="Use the weighting in your course outline. Leave the mark empty until it is released.">
          <MarkForm key={editing === 'new' ? 'new' : editing.id} course={course} existing={editing === 'new' ? undefined : editing} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function MarkForm({ course, existing, onClose }: { course: Pick<Course, 'id'>; existing: CourseMark | undefined; onClose: () => void }) {
  const grades = useCourseMarks()
  const [draft, setDraft] = useState<Draft>(() => toDraft(existing))
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = () => {
    const input = { ...draft, course_id: course.id }
    const parsed = markSchema.safeParse(input)
    if (!parsed.success) {
      const next: Partial<Record<keyof Draft, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Draft
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    grades.save(input, existing?.id, onClose)
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Field label="Assessment" htmlFor="mark-title" error={errors.title} hint='For example "Mid-semester test", "Group project" or "End-of-semester examination".'>
        <Input id="mark-title" value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} aria-invalid={Boolean(errors.title)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Part of" htmlFor="mark-component">
          <Select id="mark-component" value={draft.component} onValueChange={(next) => set({ component: next as MarkComponent })}>
            <SelectItem value="coursework">Coursework</SelectItem>
            <SelectItem value="examination">Examination</SelectItem>
          </Select>
        </Field>
        <Field label="Weight in the course (%)" htmlFor="mark-weight" error={errors.weight_percent}>
          <Input id="mark-weight" inputMode="decimal" value={draft.weight_percent} onChange={(e) => set({ weight_percent: e.target.value })} aria-invalid={Boolean(errors.weight_percent)} />
        </Field>
        <Field label="Your mark" htmlFor="mark-score" error={errors.score} hint="Empty until released">
          <Input id="mark-score" inputMode="decimal" value={draft.score} onChange={(e) => set({ score: e.target.value })} aria-invalid={Boolean(errors.score)} />
        </Field>
        <Field label="Out of" htmlFor="mark-max" error={errors.max_score}>
          <Input id="mark-max" inputMode="decimal" value={draft.max_score} onChange={(e) => set({ max_score: e.target.value })} aria-invalid={Boolean(errors.max_score)} />
        </Field>
        <Field label="Date" htmlFor="mark-date" error={errors.recorded_on}>
          <Input id="mark-date" type="date" value={draft.recorded_on} onChange={(e) => set({ recorded_on: e.target.value })} />
        </Field>
      </div>
      <Field label="Note" htmlFor="mark-note" error={errors.note}>
        <Textarea id="mark-note" className="min-h-16" value={draft.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={grades.saving}>
          {grades.saving ? 'Saving…' : 'Save mark'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function standingBadge(s: CourseStanding): { text: string; tone: 'success' | 'warning' | 'neutral' } {
  if (s.final !== null && s.grade) return { text: `Final ${formatMark(s.final)} · ${s.grade.grade}`, tone: s.grade.pass ? 'success' : 'warning' }
  if (s.average !== null && s.grade) return { text: `So far ${formatMark(s.average)} · ${s.grade.grade}`, tone: s.grade.pass ? 'success' : 'warning' }
  return { text: 'No marks yet', tone: 'neutral' }
}

/** One course: its assessed components, the standing so far and what the rest needs for each grade. */
export function CourseGradeCard({ course, items, standing }: { course: Course; items: readonly CourseMark[]; standing: CourseStanding }) {
  const grades = useCourseMarks()
  const [editing, setEditing] = useState<CourseMark | 'new' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const badge = standingBadge(standing)
  const showTargets = standing.weightMarked > 0 && standing.remaining > 0
  return (
    <Card data-testid="course-grade">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="min-w-0">
          <span className="block text-xs font-semibold text-primary">{course.code}</span>
          <span className="block truncate text-sm">{course.title}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {course.credit_slots} credit{course.credit_slots === 1 ? '' : 's'}
          </span>
        </CardTitle>
        <Badge tone={badge.tone} data-testid="course-grade-status">
          {badge.text}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {items.length ? (
          <ul className="flex flex-col gap-1.5" aria-label={`${course.code} marks`}>
            {items.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {COMPONENT_LABEL[m.component]} · {formatMark(m.weight_percent)}% of the course
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="tabular-nums">{m.score === null ? <span className="text-xs text-muted-foreground">Awaiting mark</span> : `${formatMark(m.score)}/${formatMark(m.max_score)}`}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${m.title}`} onClick={() => setEditing(m)}>
                    <Pencil />
                  </Button>
                  {deleting === m.id ? (
                    <Button variant="danger" size="sm" onClick={() => grades.remove(m.id)}>
                      Confirm
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${m.title}`} onClick={() => setDeleting(m.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Add each test, assignment and the examination with its weight from the course outline.</p>
        )}
        {items.length && standing.weightTotal < 100 ? (
          <p className="text-xs text-warning">
            The weights entered add up to {formatMark(standing.weightTotal)}%. Add the rest ({formatMark(100 - standing.weightTotal)}%) from the course outline.
          </p>
        ) : null}
        {showTargets ? (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              To finish with each grade, the remaining {formatMark(standing.remaining)}% needs on average:
            </p>
            <ul className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label={`${course.code} marks needed`}>
              {standing.targets.map((t) => (
                <li key={t.band.grade} className="rounded-md bg-surface-2 px-2 py-1 text-xs">
                  <span className="font-semibold">{t.band.grade}</span>{' '}
                  {t.status === 'secured' ? 'secured' : t.status === 'out-of-reach' ? 'out of reach' : `${formatMark(t.needed as number)}%`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setEditing('new')}>
          <Plus /> Add a mark
        </Button>
      </CardContent>
      <MarkDialog course={course} editing={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}
