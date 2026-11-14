import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/form-controls'
import { useLectureLogs } from '@/hooks/useLectureLogs'
import { LECTURE_ATTENDANCE_LABEL, lectureDateLabel, type LectureAttendance, type LectureLog } from '@/lib/lectureLog'
import { ghanaRange, type OfficialSession } from '@/lib/officialTimetable'

export interface CheckInTarget {
  session: OfficialSession
  /** yyyy-mm-dd, Ghana date. */
  date: string
  existing?: LectureLog | undefined
}

const ATTENDANCE_OPTIONS: { value: LectureAttendance; hint: string }[] = [
  { value: 'attended', hint: 'You were in the lecture' },
  { value: 'missed', hint: 'You can still record what it covered' },
  { value: 'cancelled', hint: 'The lecture did not take place' },
]

/** After a lecture: did the student attend, which lessons did it cover, and which of them need another look. */
export function CheckInDialog({ target, onClose }: { target: CheckInTarget | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {target ? (
        <DialogContent
          size="lg"
          title={`${target.session.code} check-in`}
          description={`${lectureDateLabel(target.date)} · ${ghanaRange(target.session.start, target.session.end)} · ${target.session.title}`}
        >
          <CheckInForm key={`${target.session.id}|${target.date}`} target={target} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function CheckInForm({ target, onClose }: { target: CheckInTarget; onClose: () => void }) {
  const lectures = useLectureLogs()
  const { session, date, existing } = target
  const [attendance, setAttendance] = useState<LectureAttendance>(existing?.attendance ?? 'attended')
  const [covered, setCovered] = useState<ReadonlySet<string>>(new Set(existing?.covered_lesson_ids ?? []))
  const [review, setReview] = useState<ReadonlySet<string>>(new Set(existing?.review_lesson_ids ?? []))
  const [note, setNote] = useState(existing?.note ?? '')

  const course = lectures.courses.find((c) => c.id === session.courseId)
  const reach = lectures.paces.get(session.courseId)?.lectureReach ?? 0
  const ordered = course?.modules.flatMap((m) => m.lessons) ?? []
  const nextInOrder = ordered[reach]?.id

  const toggle = (set: ReadonlySet<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }
  const setCoveredLesson = (id: string, on: boolean) => {
    setCovered((s) => toggle(s, id, on))
    if (!on) setReview((s) => toggle(s, id, false))
  }

  const submit = () => {
    const keepLessons = attendance !== 'cancelled'
    lectures.save(
      {
        courseId: session.courseId,
        courseCode: session.code,
        input: {
          entry_id: session.id,
          held_on: date,
          attendance,
          covered_lesson_ids: keepLessons ? [...covered] : [],
          review_lesson_ids: keepLessons ? [...review].filter((id) => covered.has(id)) : [],
          note,
        },
      },
      onClose,
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">Did the lecture happen, and were you there?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {ATTENDANCE_OPTIONS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
              <input
                type="radio"
                name="lecture-attendance"
                value={o.value}
                checked={attendance === o.value}
                onChange={() => setAttendance(o.value)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">{LECTURE_ATTENDANCE_LABEL[o.value]}</span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {attendance !== 'cancelled' ? (
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">What did it cover?</legend>
          <p className="text-xs text-muted-foreground">
            Tick the lessons the lecture covered, and mark any you found unclear: they go to your Revision Centre.
          </p>
          {course ? (
            <div className="mt-2 flex flex-col gap-3" aria-label="Lessons in this course">
              {course.modules.map((m) => (
                <div key={m.id}>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{m.title}</p>
                  <ul className="flex flex-col gap-1">
                    {m.lessons.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 has-[:checked]:border-primary/50">
                        <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-primary"
                            checked={covered.has(l.id)}
                            onChange={(e) => setCoveredLesson(l.id, e.target.checked)}
                          />
                          <span className="min-w-0">{l.title}</span>
                          {l.id === nextInOrder ? <Badge tone="primary">Next in order</Badge> : null}
                        </label>
                        {covered.has(l.id) ? (
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-primary"
                              checked={review.has(l.id)}
                              onChange={(e) => setReview((s) => toggle(s, l.id, e.target.checked))}
                              aria-label={`Review ${l.title} later`}
                            />
                            Review later
                          </label>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Loading the course lessons…</p>
          )}
        </fieldset>
      ) : null}

      <Field label="Notes from the lecture" htmlFor="checkin-note" hint="Private to you: what the lecturer stressed, readings, announcements." className="mt-5">
        <Textarea id="checkin-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={lectures.saving}>
          {lectures.saving ? 'Saving…' : 'Save check-in'}
        </Button>
      </DialogFooter>
    </form>
  )
}
