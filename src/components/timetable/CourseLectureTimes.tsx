import { CalendarDays, MapPin } from 'lucide-react'
import { Link } from 'react-router'
import { AttendanceBadge } from '@/components/timetable/SessionParts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOfficialTimetable } from '@/hooks/useOfficialTimetable'
import { attendanceOf, DAY_NAMES, ghanaRange, nextSession } from '@/lib/officialTimetable'

/** The course's published lecture sessions, with the student's own attendance choice for each. */
export function CourseLectureTimes({ courseId }: { courseId: string }) {
  const tt = useOfficialTimetable()
  const sessions = tt.sessions.filter((s) => s.courseId === courseId)
  if (tt.isPending || !tt.source || !sessions.length) return null
  const next = nextSession(sessions, tt.attendance)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" aria-hidden /> Lecture times
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm" aria-label="Published lecture sessions">
          {sessions.map((s) => (
            <li key={s.id} className="rounded-md border p-2">
              <span className="block font-medium">
                {DAY_NAMES[s.dayOfWeek]} · {ghanaRange(s.start, s.end)}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden /> {s.venue || 'Venue not given'}
              </span>
              <span className="mt-1 block">
                <AttendanceBadge status={attendanceOf(tt.attendance, s.id)} />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {next ? `Next: ${next.label}, Ghana time. ` : ''}
          {sessions.length > 1 ? 'Published more than once a week; attendance allocation is pending confirmation. ' : ''}
          <Link to="/timetable/official" className="font-medium text-primary hover:underline">
            Official timetable
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
