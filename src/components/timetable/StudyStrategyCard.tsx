import { useMutation } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { useAuth } from '@/contexts/AuthContext'
import { useOfficialTimetable } from '@/hooks/useOfficialTimetable'
import { toUserMessage } from '@/lib/errors'
import { attendanceOf, DAY_NAMES, ghanaRange, WEEK_ORDER } from '@/lib/officialTimetable'
import { buildStudyStrategy, lectureClashes, type StudyStrategy } from '@/lib/studyStrategy'
import { replaceStudyPlan } from '@/services/timetable/official'
import type { TimetableEvent } from '@/types/database'
import { minutesToHours } from '@/utils/dates'

const PURPOSE_LABEL = { preview: 'Preview', review: 'Review', deep: 'Deep study', revision: 'Mixed revision' } as const

const weekly = (e: TimetableEvent) => e.recurrence === 'weekly' && e.day_of_week !== null
const asBlock = (e: TimetableEvent) => ({ dayOfWeek: e.day_of_week as number, start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5) })

/**
 * Builds the student's study plan around the official lectures: a preview before and a review after each course's
 * lecture, deep study to reach the weekly target, and one mixed revision block, never overlapping a lecture.
 */
export function StudyStrategyCard({ events, onApplied }: { events: readonly TimetableEvent[]; onApplied: () => void }) {
  const { user, profile } = useAuth()
  const tt = useOfficialTimetable()
  const [preview, setPreview] = useState<StudyStrategy | null>(null)
  const apply = useMutation({
    mutationFn: (plan: StudyStrategy) => replaceStudyPlan(user?.id as string, plan.blocks),
    onSuccess: () => {
      toast.success('Your study plan now fits around your lectures.')
      setPreview(null)
      onApplied()
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const study = events.filter((e) => e.kind !== 'lecture' && weekly(e))
  const clashes = lectureClashes(study.map((e) => ({ ...asBlock(e), event: e })), tt.sessions, tt.attendance)
  const confirmed = tt.sessions.filter((s) => attendanceOf(tt.attendance, s.id) === 'confirmed').length
  const target = profile?.weekly_study_target_hours ?? 15

  const build = () =>
    setPreview(
      buildStudyStrategy({
        courses: tt.taking.map((c) => ({ id: c.id, code: c.code, title: c.title, creditSlots: c.credit_slots })),
        sessions: tt.sessions,
        attendance: tt.attendance,
        keep: study.filter((e) => !e.is_provisional).map(asBlock),
        targetHours: target,
        preferredTimes: profile?.preferred_study_times ?? [],
      }),
    )

  return (
    <>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Plan my study around my lectures</CardTitle>
          <CardDescription>
            GradPath reads the official timetable and places a preview before and a review after each course’s lecture, deep study to reach your{' '}
            {target} hour weekly target, and a mixed revision block. Nothing is placed inside a lecture or the 30 minutes either side of it. Lecture hours stay
            separate and never count towards the target.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {clashes.length ? (
            <Alert tone="warning" title={`${clashes.length} study block${clashes.length === 1 ? '' : 's'} clash with published lectures`}>
              {clashes.map((c) => c.event.title).join(', ')}. Rebuild the plan to move them out of lecture time.
            </Alert>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {confirmed
              ? `${confirmed} confirmed session${confirmed === 1 ? '' : 's'} anchor the plan.`
              : 'No sessions are confirmed yet, so the plan keeps clear of every published session (weekday evenings and weekends).'}{' '}
            <Link to="/timetable/official" className="font-medium text-primary hover:underline">
              Confirm your sessions
            </Link>{' '}
            to free up time you do not need, then rebuild.
          </p>
          <div>
            <Button onClick={build} disabled={tt.isPending || !tt.sessions.length}>
              <Sparkles /> Rebuild my study plan around my lectures
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent
          title="Your lecture-aligned study plan"
          description={
            preview
              ? `${minutesToHours(preview.plannedMinutes)} of independent study a week (target ${minutesToHours(preview.targetMinutes)}), planned around ${minutesToHours(preview.lectureMinutes)} of published lectures.`
              : undefined
          }
        >
          {preview ? (
            <div className="max-h-[55vh] overflow-y-auto pr-1">
              {preview.plannedMinutes < preview.targetMinutes ? (
                <Alert tone="warning" className="mb-3">
                  Not all of your target fits in your preferred study times around the lectures. Add more study times in Settings, or confirm your
                  sessions so the weekend or weekday sessions you do not attend are freed.
                </Alert>
              ) : null}
              <ol className="flex flex-col gap-3" aria-label="Planned study blocks">
                {WEEK_ORDER.map((d) => {
                  const blocks = preview.blocks.filter((b) => b.dayOfWeek === d)
                  if (!blocks.length) return null
                  return (
                    <li key={d}>
                      <h3 className="mb-1 text-xs font-semibold">{DAY_NAMES[d]}</h3>
                      <ul className="flex flex-col gap-1">
                        {blocks.map((b) => (
                          <li key={`${b.start}-${b.title}`} className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                            <span className="w-36 shrink-0 text-xs tabular-nums">{ghanaRange(b.start, b.end)}</span>
                            <span className="min-w-0 flex-1">{b.title}</span>
                            <Badge tone={b.purpose === 'revision' ? 'primary' : 'neutral'}>{PURPOSE_LABEL[b.purpose]}</Badge>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={() => preview && apply.mutate(preview)} disabled={apply.isPending}>
              Replace my provisional blocks
            </Button>
          </DialogFooter>
          <p className="text-xs text-muted-foreground">Blocks you created or edited yourself are kept and planned around; completed sessions are never changed.</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
