import { format } from 'date-fns'
import { ClipboardCheck } from 'lucide-react'
import { LectureChanges } from '@/components/lectures/LectureChanges'
import { CheckInHistory, CoursePaceCard, DueCheckInList } from '@/components/lectures/LectureParts'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { PageHeader, Section } from '@/components/ui/page'
import { useLectureLogs } from '@/hooks/useLectureLogs'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { toUserMessage } from '@/lib/errors'

export default function LecturesPage() {
  const lectures = useLectureLogs()
  const { lecturesStartOn } = useSemesterCalendar()

  if (lectures.error) return <ErrorState message={toUserMessage(lectures.error)} />

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="Lecture Check-ins"
        description="After each lecture, record whether you attended, what it covered and what you want to review. GradPath compares that with the lessons you have completed to show whether you are ahead of the lectures or behind."
      />
      {lectures.isPending ? (
        <Skeleton className="h-[50vh]" />
      ) : (
        <div className="flex flex-col gap-8">
          <Section title="Waiting for a check-in">
            {lectures.due.length ? (
              <DueCheckInList due={lectures.due} />
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title={lectures.begun ? 'You are up to date' : 'Lectures have not begun yet'}
                description={
                  lectures.begun
                    ? 'Lectures that have ended in the last two weeks appear here until you check in.'
                    : `Official lectures begin ${lecturesStartOn ? format(lecturesStartOn, 'EEEE d MMMM yyyy') : 'soon'}. After each one ends you will be asked what it covered.`
                }
                className="py-8"
              />
            )}
          </Section>

          <Section title="Changes to single lectures">
            <LectureChanges />
          </Section>

          <Section title={lectures.begun ? 'Ahead or behind the lectures' : 'Your head start'}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lectures.courses
                .filter((c) => lectures.sessions.some((s) => s.courseId === c.id))
                .map((c) => {
                  const pace = lectures.paces.get(c.id)
                  return pace ? <CoursePaceCard key={c.id} course={c} pace={pace} /> : null
                })}
            </div>
          </Section>

          <Section title="Your check-ins">
            {lectures.logs.length ? (
              <CheckInHistory logs={lectures.logs} />
            ) : (
              <p className="text-sm text-muted-foreground">No check-ins yet.</p>
            )}
          </Section>
        </div>
      )}
    </>
  )
}
