import { CalendarX2 } from 'lucide-react'
import { Link } from 'react-router'
import { accentSurfaceClass } from '@/components/courses/badges'
import { EmptyState } from '@/components/ui/feedback'
import { Select, SelectItem } from '@/components/ui/select'
import type { SelectionStatus } from '@/lib/curriculum'
import {
  allocationLabel,
  coursePath,
  ATTENDANCE_LABEL,
  ATTENDANCE_STATUSES,
  attendanceOf,
  DAY_NAMES,
  ENTRY_STATUS_LABEL,
  filterSessions,
  ghanaClock,
  ghanaRange,
  layoutDay,
  sessionLabel,
  toMinutes,
  WEEK_ORDER,
  type AttendanceMap,
  type AttendanceStatus,
  type OfficialSession,
  type SessionFilters,
} from '@/lib/officialTimetable'
import { cn } from '@/lib/utils'
import { AttendanceSelect, CourseDot, SessionCard } from './SessionParts'

export interface ViewProps {
  sessions: readonly OfficialSession[]
  attendance: AttendanceMap
  onAttendance: (session: OfficialSession, status: AttendanceStatus) => void
  repeats: ReadonlyMap<string, number>
  selectionOf: (session: OfficialSession) => SelectionStatus
}

const HOUR_PX = 60

// ---------------------------------------------------------------------------
// Week: Monday to Sunday on a time axis; overlapping sessions sit side by side
// ---------------------------------------------------------------------------
export function WeekGrid({ sessions, attendance }: Pick<ViewProps, 'sessions' | 'attendance'>) {
  if (!sessions.length) return <NoSessions />
  const first = Math.floor(Math.min(...sessions.map((s) => toMinutes(s.start))) / 60)
  const last = Math.ceil(Math.max(...sessions.map((s) => toMinutes(s.end))) / 60)
  const hours = Array.from({ length: last - first }, (_, i) => first + i)
  const height = (last - first) * HOUR_PX

  return (
    <div className="overflow-x-auto rounded-xl border bg-surface shadow-card">
      <section className="grid min-w-[56rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" aria-label="Official weekly timetable">
        <div className="border-b" />
        {WEEK_ORDER.map((d) => (
          <div key={d} aria-hidden className="border-b border-l px-2 py-2 text-center text-xs font-semibold">
            {DAY_NAMES[d]}
          </div>
        ))}
        <div className="relative" style={{ height }} aria-hidden>
          {hours.map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ top: (h - first) * HOUR_PX }}>
              {h === first ? '' : ghanaClock(`${h}:00`)}
            </span>
          ))}
        </div>
        {WEEK_ORDER.map((d) => (
          <section key={d} aria-label={DAY_NAMES[d]} className="relative border-l" style={{ height }}>
            {hours.map((h) => (
              <div key={h} aria-hidden className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ top: (h - first) * HOUR_PX }} />
            ))}
            {layoutDay(sessions.filter((s) => s.dayOfWeek === d)).map(({ session: s, lane, lanes }) => {
              const mine = attendanceOf(attendance, s.id)
              const top = ((toMinutes(s.start) - first * 60) / 60) * HOUR_PX
              const blockHeight = ((toMinutes(s.end) - toMinutes(s.start)) / 60) * HOUR_PX
              const off = mine === 'not_assigned' || mine === 'cancelled' || s.status === 'cancelled'
              return (
                <Link
                  key={s.id}
                  to={coursePath(s)}
                  aria-label={`${sessionLabel(s)}, ${s.venue || 'venue not given'}, ${ATTENDANCE_LABEL[mine]}`}
                  data-testid="week-session"
                  className={cn(
                    'absolute overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-[11px] leading-tight shadow-xs transition-shadow hover:z-10 hover:shadow-raised focus-visible:z-10',
                    accentSurfaceClass(s.accent),
                    mine === 'awaiting' && 'border-dashed',
                    mine === 'confirmed' && 'ring-2 ring-success/60',
                    off && 'opacity-50',
                  )}
                  style={{ top: top + 1, height: blockHeight - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                >
                  <span className="block font-semibold">{s.code}</span>
                  <span className="line-clamp-2 block">{s.title}</span>
                  <span className="block tabular-nums">{ghanaRange(s.start, s.end)}</span>
                  <span className="block truncate text-muted-foreground">{s.venue}</span>
                  <span className={cn('block truncate font-medium', mine === 'confirmed' ? 'text-success' : mine === 'awaiting' ? 'text-warning' : 'text-muted-foreground')}>
                    {s.status === 'cancelled' ? 'Cancelled' : ATTENDANCE_LABEL[mine]}
                  </span>
                </Link>
              )
            })}
          </section>
        ))}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day: one day's sessions in order (also the phone layout of the week)
// ---------------------------------------------------------------------------
export function DayPicker({ value, onChange, sessions }: { value: number; onChange: (day: number) => void; sessions: readonly OfficialSession[] }) {
  return (
    <div role="tablist" aria-label="Day" className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
      {WEEK_ORDER.map((d) => {
        const count = sessions.filter((s) => s.dayOfWeek === d).length
        const active = d === value
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(d)}
            className={cn(
              'flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 text-xs transition-colors',
              active ? 'border-primary bg-primary text-primary-foreground' : 'bg-surface hover:bg-muted',
            )}
          >
            <span className="font-semibold">{DAY_NAMES[d].slice(0, 3)}</span>
            <span className={active ? 'opacity-90' : 'text-muted-foreground'}>{count === 1 ? '1 session' : `${count} sessions`}</span>
          </button>
        )
      })}
    </div>
  )
}

export function DayAgenda({ day, ...props }: ViewProps & { day: number }) {
  const items = props.sessions.filter((s) => s.dayOfWeek === day)
  if (!items.length) return <NoSessions day={DAY_NAMES[day]} />
  return (
    <ol className="flex flex-col gap-3" aria-label={`${DAY_NAMES[day]} sessions`}>
      {items.map((s) => (
        <li key={s.id}>
          <SessionCard
            session={s}
            attendance={attendanceOf(props.attendance, s.id)}
            onAttendance={(status) => props.onAttendance(s, status)}
            repeatCount={props.repeats.get(s.courseId) ?? 1}
            selection={props.selectionOf(s)}
          />
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// List: every session in a table, filterable by course, day, venue and attendance
// ---------------------------------------------------------------------------
interface ListProps extends ViewProps {
  filters: SessionFilters
  onFilters: (next: SessionFilters) => void
  courses: readonly { id: string; code: string }[]
}

export function SessionTable({ filters, onFilters, courses, ...props }: ListProps) {
  const venues = [...new Set(props.sessions.map((s) => s.venue).filter(Boolean))].sort()
  const rows = filterSessions(props.sessions, filters, props.attendance)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Filter sessions">
        <Select aria-label="Filter by course" value={filters.courseId ?? ''} onValueChange={(v) => onFilters({ ...filters, courseId: v || undefined })}>
          <SelectItem value="">All my courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.code}
            </SelectItem>
          ))}
        </Select>
        <Select
          aria-label="Filter by day"
          value={filters.dayOfWeek === undefined ? '' : String(filters.dayOfWeek)}
          onValueChange={(v) => onFilters({ ...filters, dayOfWeek: v === '' ? undefined : Number(v) })}
        >
          <SelectItem value="">Every day</SelectItem>
          {WEEK_ORDER.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {DAY_NAMES[d]}
            </SelectItem>
          ))}
        </Select>
        <Select aria-label="Filter by venue" value={filters.venue ?? ''} onValueChange={(v) => onFilters({ ...filters, venue: v || undefined })}>
          <SelectItem value="">All venues</SelectItem>
          {venues.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </Select>
        <Select
          aria-label="Filter by attendance"
          value={filters.attendance ?? ''}
          onValueChange={(v) => onFilters({ ...filters, attendance: (v || undefined) as AttendanceStatus | undefined })}
        >
          <SelectItem value="">Any attendance status</SelectItem>
          {ATTENDANCE_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {ATTENDANCE_LABEL[s]}
            </SelectItem>
          ))}
        </Select>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {rows.length === props.sessions.length ? `${rows.length} published sessions` : `${rows.length} of ${props.sessions.length} published sessions`}
      </p>
      {rows.length === 0 ? (
        <NoSessions />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-surface shadow-card">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">Published sessions, Ghana time</caption>
            <thead className="border-b bg-surface-2 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Day</th>
                <th scope="col" className="px-3 py-2 font-medium">Time (Ghana)</th>
                <th scope="col" className="px-3 py-2 font-medium">Course</th>
                <th scope="col" className="px-3 py-2 font-medium">Venue</th>
                <th scope="col" className="px-3 py-2 font-medium">Allocation</th>
                <th scope="col" className="px-3 py-2 font-medium">My attendance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} data-testid="session-row" className={cn('border-b last:border-0', s.status === 'cancelled' && 'opacity-60')}>
                  <td className="px-3 py-2 font-medium">{DAY_NAMES[s.dayOfWeek]}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{ghanaRange(s.start, s.end)}</td>
                  <td className="px-3 py-2">
                    <Link to={coursePath(s)} className="flex items-center gap-2 hover:underline">
                      <CourseDot accent={s.accent} />
                      <span>
                        <span className="font-semibold">{s.code}</span> <span className="text-muted-foreground">{s.title}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">{s.venue || 'Not given'}</td>
                  <td className="px-3 py-2 text-xs">
                    {allocationLabel(s)}
                    {(props.repeats.get(s.courseId) ?? 1) > 1 ? <span className="block text-muted-foreground">Repeated: {props.repeats.get(s.courseId)} sessions a week</span> : null}
                    {s.status !== 'scheduled' ? <span className="block font-medium">{ENTRY_STATUS_LABEL[s.status]}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <AttendanceSelect session={s} value={attendanceOf(props.attendance, s.id)} onChange={(status) => props.onAttendance(s, status)} className="w-52" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NoSessions({ day }: { day?: string }) {
  return (
    <EmptyState
      icon={CalendarX2}
      title={day ? `No sessions on ${day}` : 'No sessions to show'}
      description={day ? 'Nothing is published for your courses on this day.' : 'Change the filters, or turn off “Only my confirmed sessions”.'}
    />
  )
}
