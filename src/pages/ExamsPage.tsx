import { CalendarClock, Plus } from 'lucide-react'
import { useState } from 'react'
import { AddExamDialog, ExamCard } from '@/components/exams/ExamParts'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { useExams } from '@/hooks/useExams'
import { toUserMessage } from '@/lib/errors'

export default function ExamsPage() {
  const exams = useExams()
  const [adding, setAdding] = useState(false)

  if (exams.error) return <ErrorState message={toUserMessage(exams.error)} />

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="Exam Countdown"
        description="Your examinations with the days left, how much of each course you have finished, and revision sessions planned back from each exam into your planner."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add an examination
          </Button>
        }
      />
      {exams.isPending ? (
        <Skeleton className="h-[40vh]" />
      ) : exams.exams.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {exams.exams.map((view) => (
            <ExamCard key={view.exam.id} view={view} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="No examination dates yet"
          description="The examination timetable is not in GradPath. When the University publishes it, add each examination here; examinations you add under Assignments appear here too."
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add an examination
            </Button>
          }
        />
      )}
      <AddExamDialog open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
