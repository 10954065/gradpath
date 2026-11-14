import { BookMarked } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/feedback'
import { CLASSIFICATION_LABEL, type SelectionSummary as Summary } from '@/lib/curriculum'
import type { Course, CourseClassification } from '@/types/database'

const ORDER: CourseClassification[] = ['core', 'required', 'special_topic', 'elective']

/** The student's own Semester 1 selection: course count, credit slots and classification, from their enrolments. */
export function SelectionSummary({ summary }: { summary: Summary<Pick<Course, 'id' | 'code' | 'title' | 'classification' | 'credit_slots'>> }) {
  const count = summary.enrolled.length
  const electives = summary.selectedElectives.map((c) => c.code).join(', ')
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <BookMarked className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">My Semester 1 courses</p>
            <p className="text-xl font-semibold tracking-tight tabular-nums" data-testid="selection-headline">
              {count} enrolled course{count === 1 ? '' : 's'} · {summary.creditSlots} credit slots
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Courses by classification">
              {ORDER.filter((k) => summary.byClassification[k] > 0).map((k) => (
                <li key={k}>
                  <Badge>
                    {summary.byClassification[k]} {CLASSIFICATION_LABEL[k].toLowerCase()}
                    {k === 'elective' && electives ? ` (${electives})` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Button asChild variant="secondary" size="sm" className="self-start lg:self-center">
          <Link to="/settings?tab=courses">Manage my courses</Link>
        </Button>
      </CardContent>
      {summary.pending.length ? (
        <CardContent className="pt-0">
          <Alert tone="warning" title="Confirm your elective">
            {summary.pending.map((c) => `${c.code} ${c.title}`).join(', ')} {summary.pending.length === 1 ? 'is' : 'are'} waiting for your confirmation (
            {summary.pendingCreditSlots} credit slots). With {summary.pending.length === 1 ? 'it' : 'them'}, your selection would be{' '}
            {count + summary.pending.length} courses and {summary.creditSlots + summary.pendingCreditSlots} credit slots.{' '}
            <Link to="/settings?tab=courses" className="font-medium underline underline-offset-2">
              Confirm in Settings
            </Link>
          </Alert>
        </CardContent>
      ) : null}
    </Card>
  )
}
