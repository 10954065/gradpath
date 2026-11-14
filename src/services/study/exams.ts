// Revision sessions planned back from an examination: one-off revision blocks in the planner tagged with the exam.
import { ensureOk } from '@/lib/errors'
import type { RevisionBlock } from '@/lib/examPlan'
import { supabase } from '@/lib/supabase'

/** Replaces the exam's revision plan with these sessions. Time already logged against old sessions is kept. */
export async function saveExamPlan(userId: string, exam: { id: string; course_id: string | null }, blocks: readonly RevisionBlock[]): Promise<number> {
  await deleteExamPlan(exam.id)
  if (!blocks.length) return 0
  const rows = blocks.map((b) => ({
    user_id: userId,
    exam_id: exam.id,
    course_id: exam.course_id,
    title: b.title.slice(0, 200),
    kind: 'revision',
    recurrence: 'once',
    event_date: b.date,
    start_time: b.start,
    end_time: b.end,
    notes: b.notes.slice(0, 2000),
    is_provisional: false,
  }))
  ensureOk(await supabase.from('timetable_events').insert(rows), 'We could not add the revision sessions to your planner.')
  return rows.length
}

export async function deleteExamPlan(examId: string): Promise<void> {
  ensureOk(await supabase.from('timetable_events').delete().eq('exam_id', examId), 'We could not remove the earlier revision plan.')
}
