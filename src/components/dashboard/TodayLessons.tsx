import { format } from 'date-fns'
import { CalendarDays, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router'
import { StreakFlame } from '@/components/dashboard/StreakFlame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FlameState } from '@/lib/analytics'
import type { DailyLesson } from '@/lib/dailyPlan'

/** Today's lessons from the timetable. Taking any of them keeps the streak flame lit. */
export function TodayLessons({ plan, flame, startedLessonIds }: { plan: DailyLesson[]; flame: FlameState; startedLessonIds: ReadonlySet<string> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <StreakFlame state={flame} decorative className="size-5" /> Today’s lessons
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{format(new Date(), 'EEEE')}, guided by your timetable. Take at least one lesson every day to keep your flame lit.</p>
        </div>
        <Button asChild variant="link" size="sm" className="shrink-0">
          <Link to="/timetable">
            <CalendarDays /> Timetable
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {plan.length ? (
          <ul className="flex flex-col gap-2">
            {plan.map((item) => (
              <TodayLessonRow key={item.courseId} item={item} started={item.next ? startedLessonIds.has(item.next.id) : false} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Every lesson is complete. Keep your knowledge fresh in the Revision Centre.</p>
        )}
      </CardContent>
    </Card>
  )
}

function TodayLessonRow({ item, started }: { item: DailyLesson; started: boolean }) {
  const slot = item.slot ? `${format(item.slot.start, 'HH:mm')} to ${format(item.slot.end, 'HH:mm')}` : 'Rotation'
  const action = item.doneToday ? 'Next lesson' : started ? 'Continue' : 'Start lesson'
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-surface p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-primary">{item.courseCode}</span>
          <span className="text-muted-foreground">{slot}</span>
          {item.doneToday ? (
            <Badge tone="success">
              <CheckCircle2 aria-hidden /> Done today
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm font-medium">{item.next ? item.next.title : `Every ${item.courseCode} lesson is complete`}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.doneToday ? `You studied “${item.doneToday.title}” today.` : item.reason}
        </p>
      </div>
      <Button asChild size="sm" variant={item.doneToday ? 'secondary' : 'primary'} className="shrink-0">
        {item.next ? <Link to={item.next.href}>{action}</Link> : <Link to="/revision">Revise</Link>}
      </Button>
    </li>
  )
}
