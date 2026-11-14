// Records focused minutes in the planner as completed study sessions.
import { ensureOk } from '@/lib/errors'
import type { FocusTarget } from '@/lib/focusTimer'
import { supabase } from '@/lib/supabase'
import { saveSession } from '@/services/study/planner'
import type { StudySession } from '@/types/database'

const MINUTE = 60_000

/**
 * Logs focused minutes. Counted toward a planned block, they complete that occurrence (adding to any minutes already
 * logged for it); otherwise they become a one-off completed study session starting when the focus began.
 */
export async function logFocusMinutes(
  userId: string,
  focus: { title: string; courseId: string | null; startedAt: number; minutes: number; target: FocusTarget | null },
): Promise<void> {
  if (focus.minutes < 1) return
  const { target } = focus
  if (target) {
    const result = await supabase
      .from('study_sessions')
      .select('*')
      .eq('timetable_event_id', target.eventId)
      .eq('occurrence_date', target.date)
      .maybeSingle()
    const existing = ensureOk(result, 'We could not find the planned session.') as StudySession | null
    await saveSession(
      userId,
      {
        title: existing?.title ?? target.title,
        courseId: existing?.course_id ?? focus.courseId,
        start: new Date(existing?.planned_start ?? target.start),
        end: new Date(existing?.planned_end ?? target.end),
        status: 'completed',
        actualMinutes: Math.min(1440, (existing?.status === 'completed' ? (existing.actual_minutes ?? 0) : 0) + focus.minutes),
        timetableEventId: target.eventId,
        occurrenceDate: target.date,
      },
      existing,
    )
    return
  }
  await saveSession(userId, {
    title: focus.title,
    courseId: focus.courseId,
    start: new Date(focus.startedAt),
    end: new Date(focus.startedAt + focus.minutes * MINUTE),
    status: 'completed',
    actualMinutes: focus.minutes,
  })
}
