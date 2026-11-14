import { CalendarCheck2, CircleDashed, CircleSlash, MapPin } from 'lucide-react'
import { Link } from 'react-router'
import { accentClass, accentSurfaceClass, ClassificationBadge } from '@/components/courses/badges'
import { Badge } from '@/components/ui/badge'
import { Select, SelectItem } from '@/components/ui/select'
import type { SelectionStatus } from '@/lib/curriculum'
import {
  allocationLabel,
  coursePath,
  ATTENDANCE_LABEL,
  ATTENDANCE_STATUSES,
  DAY_NAMES,
  ENTRY_STATUS_LABEL,
  ghanaRange,
  sessionLabel,
  type AttendanceStatus,
  type OfficialSession,
} from '@/lib/officialTimetable'
import { cn } from '@/lib/utils'
import type { CourseClassification } from '@/types/database'

interface AttendanceSelectProps {
  session: OfficialSession
  value: AttendanceStatus
  onChange: (status: AttendanceStatus) => void
  className?: string
}

export function AttendanceSelect({ session, value, onChange, className }: AttendanceSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as AttendanceStatus)}
      aria-label={`My attendance for ${sessionLabel(session)}`}
      className={cn('h-8 text-xs', className)}
    >
      {ATTENDANCE_STATUSES.map((s) => (
        <SelectItem key={s} value={s}>
          {ATTENDANCE_LABEL[s]}
        </SelectItem>
      ))}
    </Select>
  )
}

/** The student's own attendance choice, shown on every block so confirmed sessions stand out from the rest. */
export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  if (status === 'confirmed')
    return (
      <Badge tone="success">
        <CalendarCheck2 aria-hidden /> {ATTENDANCE_LABEL.confirmed}
      </Badge>
    )
  if (status === 'not_assigned' || status === 'cancelled')
    return (
      <Badge>
        <CircleSlash aria-hidden /> {ATTENDANCE_LABEL[status]}
      </Badge>
    )
  return (
    <Badge tone="warning">
      <CircleDashed aria-hidden /> {ATTENDANCE_LABEL.awaiting}
    </Badge>
  )
}

export function CourseDot({ accent, className }: { accent: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', accentClass(accent), className)} />
}

interface SessionCardProps {
  session: OfficialSession
  attendance: AttendanceStatus
  onAttendance: (status: AttendanceStatus) => void
  /** How many active sessions this course has in the published week. */
  repeatCount: number
  selection: SelectionStatus
  showDay?: boolean
}

/** A published session with everything the student needs to decide whether it is theirs. */
export function SessionCard({ session: s, attendance, onAttendance, repeatCount, selection, showDay }: SessionCardProps) {
  const dimmed = attendance === 'not_assigned' || attendance === 'cancelled' || s.status === 'cancelled'
  return (
    <article
      aria-label={sessionLabel(s)}
      className={cn('rounded-lg border border-l-4 p-3 shadow-card', accentSurfaceClass(s.accent), dimmed && 'opacity-60', attendance === 'awaiting' && 'border-dashed')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tabular-nums">
            {showDay ? `${DAY_NAMES[s.dayOfWeek]} · ` : null}
            {ghanaRange(s.start, s.end)} <span className="font-normal text-muted-foreground">Ghana time</span>
          </p>
          <Link to={coursePath(s)} className="mt-0.5 block font-semibold hover:underline">
            {s.code} <span className="font-normal">{s.title}</span>
          </Link>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {s.venue || 'Venue not given'}
          </p>
        </div>
        <AttendanceSelect session={s} value={attendance} onChange={onAttendance} className="w-full sm:w-56" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <AttendanceBadge status={attendance} />
        <ClassificationBadge course={{ classification: s.classification as CourseClassification, credit_slots: s.creditSlots }} selection={selection} />
        <Badge tone={s.allocation === 'pending_confirmation' ? 'warning' : 'primary'}>{allocationLabel(s)}</Badge>
        {repeatCount > 1 ? <Badge>Published {repeatCount} times a week</Badge> : <Badge>Single published session</Badge>}
        {s.status !== 'scheduled' ? <Badge tone={s.status === 'cancelled' ? 'danger' : 'primary'}>{ENTRY_STATUS_LABEL[s.status]}</Badge> : null}
      </div>
      {s.allocationNote || s.notes ? <p className="mt-2 text-xs text-muted-foreground">{[s.allocationNote, s.notes].filter(Boolean).join(' ')}</p> : null}
    </article>
  )
}
