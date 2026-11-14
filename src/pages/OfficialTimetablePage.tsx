import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CalendarClock, CalendarDays, ExternalLink, ListChecks } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ClassificationBadge } from '@/components/courses/badges'
import { DayAgenda, DayPicker, SessionTable, WeekGrid, type ViewProps } from '@/components/timetable/OfficialViews'
import { CourseDot } from '@/components/timetable/SessionParts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Switch } from '@/components/ui/form-controls'
import { PageHeader } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useMyCourses } from '@/hooks/useMyCourses'
import { useOfficialTimetable } from '@/hooks/useOfficialTimetable'
import { useSemesterCalendar } from '@/hooks/useSemesterCalendar'
import { toUserMessage } from '@/lib/errors'
import {
  attendanceOf,
  ghanaNow,
  lectureMinutes,
  nextSession,
  sessionsPerCourse,
  type OfficialSession,
  type SessionFilters,
} from '@/lib/officialTimetable'
import { safeExternalUrl } from '@/lib/utils'
import {
  DEFAULT_TIMETABLE_PREFERENCES,
  getTimetablePreferences,
  listPublications,
  saveTimetablePreferences,
  type TimetablePreferences,
} from '@/services/timetable/official'
import { minutesToHours } from '@/utils/dates'

const PREFS_KEY = ['timetable-preferences'] as const

export default function OfficialTimetablePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const my = useMyCourses()
  const tt = useOfficialTimetable()
  const calendar = useSemesterCalendar()
  const prefs = useQuery({ queryKey: PREFS_KEY, queryFn: getTimetablePreferences })
  const publications = useQuery({
    queryKey: ['timetable-publications', tt.source?.id],
    queryFn: () => listPublications(tt.source?.id as string),
    enabled: Boolean(tt.source),
  })
  const savePrefs = useMutation({
    mutationFn: (patch: Partial<TimetablePreferences>) => saveTimetablePreferences(user?.id as string, patch),
    onSuccess: (data) => queryClient.setQueryData(PREFS_KEY, data),
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const [day, setDay] = useState(() => ghanaNow().dayOfWeek)
  const [filters, setFilters] = useState<SessionFilters>({})

  if (tt.error) return <ErrorState message={toUserMessage(tt.error)} onRetry={tt.refetch} />
  if (tt.isPending) return <Skeleton className="h-[32rem]" />
  if (!tt.source) {
    return (
      <>
        <PageHeader title="Official University Timetable" />
        <EmptyState icon={CalendarDays} title="No official timetable yet" description="An administrator has not published the University timetable for your programme." />
      </>
    )
  }

  const source = tt.source
  const onlyConfirmed = (prefs.data ?? DEFAULT_TIMETABLE_PREFERENCES).show_only_confirmed
  const visible = onlyConfirmed ? tt.sessions.filter((s) => attendanceOf(tt.attendance, s.id) === 'confirmed') : tt.sessions
  const repeats = sessionsPerCourse(tt.sessions)
  const confirmed = tt.sessions.filter((s) => attendanceOf(tt.attendance, s.id) === 'confirmed').length
  const awaiting = tt.sessions.filter((s) => attendanceOf(tt.attendance, s.id) === 'awaiting').length
  const pending = tt.sessions.some((s) => s.allocation === 'pending_confirmation')
  const courseOf = (s: OfficialSession) => my.all.find((c) => c.id === s.courseId)
  const view: ViewProps = {
    sessions: visible,
    attendance: tt.attendance,
    onAttendance: (s, status) => tt.setAttendance([s.id], status),
    repeats,
    selectionOf: (s) => {
      const course = courseOf(s)
      return course ? my.statusOf(course) : 'enrolled'
    },
  }
  const sourceUrl = safeExternalUrl(source.source_url)

  return (
    <>
      <PageHeader
        eyebrow={`${source.institution} · ${source.department}`}
        title="Official University Timetable"
        description={`${source.programme} · ${source.academic_year} · ${source.semester}. Published lecture times, shown in Ghana time (Africa/Accra) on every device.`}
        actions={
          <Button asChild variant="secondary">
            <Link to="/timetable">
              <CalendarClock /> My study plan
            </Link>
          </Button>
        }
      />

      <Card className="mb-5">
        <CardContent className="pt-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4" aria-label="Timetable source">
            <Fact label="Programme" value={`${source.programme} (${source.programme_code})`} />
            <Fact label="Academic year" value={source.academic_year} />
            <Fact label="Semester" value={source.semester} />
            <Fact label="Time zone" value="Africa/Accra (Ghana time, GMT)" />
            <Fact label="Institution" value={source.institution} />
            <Fact label="Department" value={source.department} />
            <Fact
              label="Last updated"
              value={`${format(new Date(source.last_updated_at), 'd MMM yyyy')}${source.revision ? ` · update ${source.revision}` : ''}${source.version > 1 ? ` · version ${source.version}` : ''}`}
            />
            {calendar.lecturesStartOn ? (
              <Fact label="Lectures begin" value={<span data-testid="lectures-begin">{format(calendar.lecturesStartOn, 'EEEE d MMMM yyyy')}</span>} />
            ) : null}
            <Fact
              label="My attendance"
              value={<span data-testid="attendance-status">{`${confirmed} confirmed · ${awaiting} awaiting confirmation`}</span>}
            />
          </dl>
          <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Source: </span>
              {source.title}, {source.institution}, {source.department}. Official published timetable.{' '}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                  Official timetable page <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </p>
            {source.source_note ? <p className="mt-1">{source.source_note}</p> : null}
          </div>
        </CardContent>
      </Card>

      {pending ? (
        <Alert tone="warning" className="mb-5" title="Attendance allocation pending confirmation">
          Several courses appear more than once in the published week (weekday evening and weekend). The timetable does not say whether these are
          alternative groups, extra sessions or classes for different students, so no session is marked compulsory. Mark the sessions you attend as
          “Confirmed for my class” once the department confirms your allocation; reminders are only sent for confirmed sessions.
        </Alert>
      ) : null}

      <section aria-label="My courses on the timetable" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tt.taking.map((c) => {
          const own = tt.sessions.filter((s) => s.courseId === c.id)
          const next = nextSession(own, tt.attendance, new Date(), calendar.lecturesStartOn)
          return (
            <Link key={c.id} to={`/courses/${c.slug}`} className="rounded-xl border bg-surface p-3 shadow-card transition-shadow hover:shadow-raised" data-testid="course-timetable-card">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CourseDot accent={c.accent} /> {c.code}
              </span>
              <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{c.title}</span>
              <span className="mt-2 flex flex-wrap gap-1">
                <ClassificationBadge course={c} selection={my.statusOf(c)} />
              </span>
              <span className="mt-2 block text-xs">
                {own.length === 0 ? 'No published session' : `${own.length} published session${own.length === 1 ? '' : 's'} a week`}
                {next ? <span className="block text-muted-foreground">Next: {next.label}</span> : null}
              </span>
            </Link>
          )
        })}
      </section>

      <Tabs defaultValue="week">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Timetable view">
            <TabsTrigger value="week">
              <CalendarDays /> Week
            </TabsTrigger>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="list">
              <ListChecks /> List
            </TabsTrigger>
          </TabsList>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={onlyConfirmed} onCheckedChange={(v) => savePrefs.mutate({ show_only_confirmed: v })} aria-label="Only my confirmed sessions" />
            Only my confirmed sessions
          </label>
        </div>
        <TabsContent value="week">
          <div className="hidden md:block">
            <WeekGrid sessions={visible} attendance={tt.attendance} />
          </div>
          <div className="md:hidden">
            <DayPicker value={day} onChange={setDay} sessions={visible} />
            <DayAgenda day={day} {...view} />
          </div>
        </TabsContent>
        <TabsContent value="day">
          <DayPicker value={day} onChange={setDay} sessions={visible} />
          <DayAgenda day={day} {...view} />
        </TabsContent>
        <TabsContent value="list">
          <SessionTable {...view} filters={filters} onFilters={setFilters} courses={tt.taking} />
        </TabsContent>
      </Tabs>

      <p className="mt-3 text-xs text-muted-foreground">
        {tt.sessions.length} published sessions for your {tt.taking.length} courses · {minutesToHours(lectureMinutes(tt.sessions, tt.attendance))} of lectures a week
        {awaiting ? ' before you confirm your allocation' : ''}. Lecture hours are never counted towards your independent study target.
        {tt.hiddenCount > 0 ? ` ${tt.hiddenCount} published session${tt.hiddenCount === 1 ? '' : 's'} for courses you do not take ${tt.hiddenCount === 1 ? 'is' : 'are'} not shown.` : ''}
      </p>

      {publications.data?.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Official changes</CardTitle>
            <CardDescription>Updates published by the administrators. The original timetable is kept in the history.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {publications.data.map((p) => (
                <li key={p.id} className="rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">
                    Update {p.revision} · {format(new Date(p.published_at), 'd MMM yyyy, HH:mm')}
                  </span>
                  <span className="block">{p.summary}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
