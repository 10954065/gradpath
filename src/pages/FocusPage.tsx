import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Coffee, Pause, Play, Square, Timer } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/form-controls'
import { ProgressBar } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { Select, SelectItem } from '@/components/ui/select'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useMyCourses } from '@/hooks/useMyCourses'
import { elapsedMs, FOCUS_PRESETS, focusedMinutes, formatClock, isPaused, remainingMs, type FocusTarget } from '@/lib/focusTimer'
import { buildPlanner, type PlannerEntry } from '@/lib/timetable'
import { listEvents, listSessions } from '@/services/study/planner'
import { isoDate } from '@/utils/dates'

const NONE = ''

/** Today's planned study and revision blocks that are not done yet: focus minutes can count toward one of them. */
function useTodaysBlocks(): PlannerEntry[] {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(start.getTime() + 86_399_999)
  const events = useQuery({ queryKey: ['timetable'], queryFn: listEvents })
  const sessions = useQuery({ queryKey: ['sessions', isoDate(start), isoDate(end)], queryFn: () => listSessions(start.toISOString(), end.toISOString()) })
  return buildPlanner(events.data ?? [], sessions.data ?? [], start, end).filter(
    (e) => e.event && (e.kind === 'study' || e.kind === 'revision') && e.status === 'planned',
  )
}

function FocusSetup() {
  const focus = useFocusTimer()
  const my = useMyCourses()
  const blocks = useTodaysBlocks()
  const [courseId, setCourseId] = useState(NONE)
  const [blockKey, setBlockKey] = useState(NONE)
  const [preset, setPreset] = useState(0)

  const block = blocks.find((b) => b.key === blockKey) ?? null
  const course = my.taking.find((c) => c.id === (block?.courseId ?? courseId)) ?? null

  const begin = () => {
    const chosen = FOCUS_PRESETS[preset] ?? FOCUS_PRESETS[0]
    if (!chosen) return
    const target: FocusTarget | null =
      block?.event ? { eventId: block.event.id, date: block.date, title: block.title, start: block.start.toISOString(), end: block.end.toISOString() } : null
    focus.start({
      focusMinutes: chosen.focus,
      breakMinutes: chosen.rest,
      courseId: course?.id ?? null,
      title: block ? block.title : course ? `Focus: ${course.code}` : 'Focus session',
      target,
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <Field label="Count toward a planned session today" htmlFor="focus-block" hint="Optional. The minutes complete that session in your planner.">
          <Select id="focus-block" value={blockKey} onValueChange={setBlockKey}>
            <SelectItem value={NONE}>None: log a separate study session</SelectItem>
            {blocks.map((b) => (
              <SelectItem key={b.key} value={b.key}>
                {format(b.start, 'HH:mm')} {b.title}
              </SelectItem>
            ))}
          </Select>
        </Field>
        {block ? null : (
          <Field label="Course" htmlFor="focus-course">
            <Select id="focus-course" value={courseId} onValueChange={setCourseId}>
              <SelectItem value={NONE}>No particular course</SelectItem>
              {my.taking.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} {c.title}
                </SelectItem>
              ))}
            </Select>
          </Field>
        )}
        <fieldset>
          <legend className="text-sm font-medium">Length</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {FOCUS_PRESETS.map((p, i) => (
              <label key={p.label} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40">
                <input type="radio" name="focus-length" checked={preset === i} onChange={() => setPreset(i)} className="size-4 accent-primary" />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Button size="lg" className="self-start" onClick={begin}>
          <Play /> Start focusing
        </Button>
      </CardContent>
    </Card>
  )
}

function RunningTimer() {
  const focus = useFocusTimer()
  const timer = focus.timer
  if (!timer) return null
  const left = remainingMs(timer, focus.now)
  const done = Math.round((elapsedMs(timer, focus.now) / timer.lengthMs) * 100)
  const minutes = focusedMinutes(timer, focus.now)
  const paused = isPaused(timer)
  const onBreak = timer.phase === 'break'
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {onBreak ? <Coffee className="size-4" aria-hidden /> : <Timer className="size-4" aria-hidden />}
          {onBreak ? 'Break' : timer.title}
          {paused ? ' · paused' : ''}
        </p>
        <p className="text-6xl font-semibold tabular-nums" role="timer" aria-live="off" data-testid="focus-clock">
          {formatClock(left)}
        </p>
        <ProgressBar value={done} label={onBreak ? 'Break progress' : 'Focus progress'} className="w-full max-w-sm" />
        {timer.target && !onBreak ? <p className="text-xs text-muted-foreground">Counts toward your planned session “{timer.target.title}”.</p> : null}
        <div className="flex flex-wrap justify-center gap-2">
          {paused ? (
            <Button onClick={focus.resume}>
              <Play /> Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={focus.pause}>
              <Pause /> Pause
            </Button>
          )}
          {onBreak ? (
            <Button variant="secondary" onClick={focus.endBreak}>
              End break
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => void focus.stop(true)} disabled={minutes < 1}>
                <Square /> Stop and log {minutes} min
              </Button>
              <Button variant="ghost" onClick={() => void focus.stop(false)}>
                Discard
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function FocusPage() {
  const focus = useFocusTimer()
  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="Focus Timer"
        description="Focus for a set time, then take a break. The minutes you focus (pauses left out) go into your planner as completed study, so you never type them in afterwards. The timer keeps running if you leave this page."
      />
      <div className="mx-auto flex max-w-2xl flex-col gap-4">{focus.timer ? <RunningTimer /> : <FocusSetup />}</div>
    </>
  )
}
