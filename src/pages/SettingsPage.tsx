import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, RefreshCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { Field, Input, Switch } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { toUserMessage } from '@/lib/errors'
import { updatePassword } from '@/services/auth'
import { ClassificationBadge } from '@/components/courses/badges'
import { TimetableReminderSettings } from '@/components/timetable/TimetableReminderSettings'
import { ENROLMENTS_KEY, useMyCourses } from '@/hooks/useMyCourses'
import { setEnrolmentStatus } from '@/services/courses'
import { conflictRemove, conflictsAll, outboxPut, type ConflictEntry } from '@/services/offline/db'
import { disablePush, enablePush, pushSupported } from '@/services/notifications/push'
import { flushOutbox } from '@/services/offline/sync'
import { avatarUrl, getPreferences, profileSchema, updatePreferences, updateProfile, uploadAvatar, type ProfileInput } from '@/services/profile'
import type { CourseEnrolment } from '@/types/database'
import { formatDateTime } from '@/utils/dates'

const STUDY_TIMES = ['Early morning', 'Morning', 'Lunchtime', 'Afternoon', 'Evening', 'Late night']
const TIME_ZONES = ['Africa/Accra', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London', 'America/New_York', 'Asia/Dubai']

function ProfileTab() {
  const { user, profile, refreshProfile } = useAuth()
  const [photo, setPhoto] = useState<string | null>(null)
  const { register, handleSubmit, formState, reset, watch, setValue } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema) })

  useEffect(() => {
    if (!profile) return
    reset({
      full_name: profile.full_name,
      academic_year: profile.academic_year,
      semester: profile.semester,
      programme: profile.programme,
      institution: profile.institution,
      weekly_study_target_hours: profile.weekly_study_target_hours,
      preferred_study_times: profile.preferred_study_times,
      time_zone: profile.time_zone,
    })
    void avatarUrl(profile.avatar_path).then(setPhoto)
  }, [profile, reset])

  const times = watch('preferred_study_times') ?? []
  const onSubmit = handleSubmit(async (values) => {
    if (!user) return
    try {
      await updateProfile(user.id, values)
      await refreshProfile()
      toast.success('Profile saved')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  })

  const onPhoto = async (file: File | undefined) => {
    if (!file || !user) return
    try {
      await uploadAvatar(user.id, file)
      await refreshProfile()
      toast.success('Photo updated')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  if (!profile) return <Skeleton className="h-96" />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Student profile</CardTitle>
        <CardDescription>
          {profile.email} · joined {formatDateTime(profile.created_at)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex items-center gap-4">
          <div className="grid size-16 place-items-center overflow-hidden rounded-full bg-accent text-lg font-semibold text-accent-foreground">
            {photo ? <img src={photo} alt="Your profile" className="size-full object-cover" /> : profile.full_name.slice(0, 1) || 'G'}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Camera className="size-4" aria-hidden /> Change photo
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
        </div>
        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name" error={formState.errors.full_name?.message} className="sm:col-span-2">
            <Input id="full_name" {...register('full_name')} />
          </Field>
          <Field label="Programme" htmlFor="programme" error={formState.errors.programme?.message}>
            <Input id="programme" {...register('programme')} />
          </Field>
          <Field label="Institution" htmlFor="institution" error={formState.errors.institution?.message}>
            <Input id="institution" {...register('institution')} />
          </Field>
          <Field label="Academic year" htmlFor="academic_year" hint="For example 2026/2027" error={formState.errors.academic_year?.message}>
            <Input id="academic_year" {...register('academic_year')} />
          </Field>
          <Field label="Semester" htmlFor="semester" error={formState.errors.semester?.message}>
            <Input id="semester" {...register('semester')} />
          </Field>
          <Field
            label="Weekly study target (hours)"
            htmlFor="weekly_study_target_hours"
            hint="Recommended 15 to 20 hours"
            error={formState.errors.weekly_study_target_hours?.message}
          >
            <Input id="weekly_study_target_hours" type="number" min={1} max={80} step={0.5} {...register('weekly_study_target_hours')} />
          </Field>
          <Field label="Time zone" htmlFor="time_zone">
            <Select id="time_zone" value={watch('time_zone') ?? ''} onValueChange={(next) => setValue('time_zone', next, { shouldDirty: true })}>
              {TIME_ZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">Preferred study times</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {STUDY_TIMES.map((t) => {
                const active = times.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setValue('preferred_study_times', active ? times.filter((x) => x !== t) : [...times, t], { shouldDirty: true })}
                    className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PreferencesTab() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const prefs = useQuery({ queryKey: ['preferences', user?.id], queryFn: () => getPreferences(user?.id as string), enabled: Boolean(user) })
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updatePreferences>[1]) => updatePreferences(user?.id as string, patch),
    onSuccess: (data) => queryClient.setQueryData(['preferences', user?.id], data),
    onError: (e) => toast.error(toUserMessage(e)),
  })
  const permission = pushSupported() ? Notification.permission : 'unsupported'
  const [pushBusy, setPushBusy] = useState(false)

  const toggleBrowserNotifications = async (enabled: boolean) => {
    setPushBusy(true)
    try {
      if (enabled) await enablePush()
      else await disablePush()
      save.mutate({ browser_notifications: enabled })
      if (enabled) toast.success('Notifications are on for this device.')
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setPushBusy(false)
    }
  }

  if (!prefs.data) return <Skeleton className="h-64" />
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Appearance and reading</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Theme" htmlFor="theme">
            <Select
              id="theme"
              value={theme}
              onValueChange={(value) => {
                const next = value as ThemePreference
                setTheme(next)
                save.mutate({ theme: next })
              }}
            >
              <SelectItem value="system">Match my device</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </Select>
          </Field>
          <Field label={`Lesson text size (${Math.round(prefs.data.reader_font_scale * 100)}%)`} htmlFor="scale">
            <input
              id="scale"
              type="range"
              min={0.8}
              max={1.6}
              step={0.05}
              defaultValue={prefs.data.reader_font_scale}
              onChange={(e) => save.mutate({ reader_font_scale: Number(e.target.value) })}
              className="accent-[var(--color-primary)]"
            />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications and revision</CardTitle>
          <CardDescription>In-app notifications are always on. Email and SMS notifications are not configured for this platform.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">
              <span className="font-medium" id="browser-notifications-label">
                Browser notifications
              </span>
              <span className="block text-muted-foreground">
                Reminders on this device even when GradPath is closed: when your streak flame is fading in the evening, and before lectures you have confirmed.{' '}
                {permission === 'unsupported'
                  ? 'Not supported in this browser. On an iPhone or iPad, add GradPath to your Home Screen first.'
                  : `Browser permission: ${permission}.`}
              </span>
            </span>
            <Switch
              aria-labelledby="browser-notifications-label"
              checked={prefs.data.browser_notifications}
              disabled={permission === 'unsupported' || pushBusy}
              onCheckedChange={(v) => void toggleBrowserNotifications(v)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Remind me before study sessions" htmlFor="lead">
              <Select id="lead" value={String(prefs.data.reminder_lead_minutes)} onValueChange={(next) => save.mutate({ reminder_lead_minutes: Number(next) })}>
                {[0, 10, 15, 30, 60, 120].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m === 0 ? 'No reminder' : `${m} minutes before`}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Daily revision limit" htmlFor="limit">
              <Select id="limit" value={String(prefs.data.daily_review_limit)} onValueChange={(next) => save.mutate({ daily_review_limit: Number(next) })}>
                {[10, 20, 30, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} reviews per day
                  </SelectItem>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>
      <TimetableReminderSettings />
    </div>
  )
}

function CoursesTab() {
  const queryClient = useQueryClient()
  const my = useMyCourses()
  const update = useMutation({
    mutationFn: ({ courseId, status }: { courseId: string; status: CourseEnrolment['status'] }) => setEnrolmentStatus(courseId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENROLMENTS_KEY }),
    onError: (e) => toast.error(toUserMessage(e)),
  })
  if (my.isPending) return <Skeleton className="h-64" />
  const { summary } = my
  return (
    <Card>
      <CardHeader>
        <CardTitle>My course registration</CardTitle>
        <CardDescription>
          Core, required and special-topic courses are part of the programme; choose your elective here. This only affects your own
          dashboard, planner, progress and assessments, never a classmate's.
        </CardDescription>
        <p className="mt-2 text-sm font-semibold tabular-nums" data-testid="registration-total">
          {summary.enrolled.length} enrolled course{summary.enrolled.length === 1 ? '' : 's'} · {summary.creditSlots} credit slots
          {summary.pending.length ? (
            <span className="font-normal text-muted-foreground"> · {summary.pendingCreditSlots} more awaiting your confirmation</span>
          ) : null}
        </p>
      </CardHeader>
      <CardContent className="divide-y">
        {my.all.map((c) => {
          const status = my.statusOf(c)
          const elective = c.classification === 'elective'
          return (
            <div key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {c.code} {c.title}
                </p>
                <div className="mt-1">
                  <ClassificationBadge course={c} selection={status} />
                </div>
              </div>
              <Select
                aria-label={`Registration status for ${c.code}`}
                className="sm:w-56"
                value={status === 'not_selected' ? 'dropped' : status}
                onValueChange={(next) => update.mutate({ courseId: c.id, status: next as CourseEnrolment['status'] })}
              >
                <SelectItem value="enrolled">{elective ? 'Selected (my elective)' : 'Registered'}</SelectItem>
                <SelectItem value="pending_confirmation">To confirm</SelectItem>
                <SelectItem value="dropped">Not taking</SelectItem>
              </Select>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

const passwordForm = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

function SecurityTab() {
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof passwordForm>>({ resolver: zodResolver(passwordForm) })
  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await updatePassword(password)
      reset()
      toast.success('Password updated')
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="grid max-w-sm gap-4">
          <Field label="New password" htmlFor="new-password" error={formState.errors.password?.message}>
            <Input id="new-password" type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password" error={formState.errors.confirm?.message}>
            <Input id="confirm-password" type="password" autoComplete="new-password" {...register('confirm')} />
          </Field>
          <Button type="submit" disabled={formState.isSubmitting} className="justify-self-start">
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

const KEY_COLUMNS = ['id', 'user_id', 'lesson_id']

function OfflineTab() {
  const { user } = useAuth()
  const status = useSyncStatus()
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([])
  const load = useCallback(() => {
    if (user) void conflictsAll(user.id).then(setConflicts)
  }, [user])
  useEffect(load, [load, status.conflicts])

  const keepMine = async (c: ConflictEntry) => {
    if (!user) return
    const { _error: _ignored, ...local } = c.local
    const match = Object.fromEntries(
      Object.entries(local).filter(([k, v]) => KEY_COLUMNS.includes(k) && typeof v === 'string' && (k !== 'user_id' || c.table === 'lesson_progress')),
    ) as Record<string, string>
    await outboxPut(user.id, { table: c.table, op: 'upsert', rowId: c.rowId, match, payload: local, baseUpdatedAt: null })
    await conflictRemove(user.id, c.key)
    await flushOutbox(user.id)
    load()
  }
  const keepServer = async (c: ConflictEntry) => {
    if (!user) return
    await conflictRemove(user.id, c.key)
    load()
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Offline and sync</CardTitle>
          <CardDescription>
            Lessons you open are saved on this device. Notes, study sessions, assignments, lesson progress and revision reviews made offline
            are queued and synchronised automatically when you reconnect. Signing in, assessments (scored on the server), external
            resources and videos need a connection. Offline data is removed from this device when you sign out.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone={status.pending ? 'warning' : 'success'}>
            {status.pending} pending change{status.pending === 1 ? '' : 's'}
          </Badge>
          <Badge tone={conflicts.length ? 'danger' : 'neutral'}>
            {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
          </Badge>
          <span className="text-muted-foreground">Last synced: {status.lastSyncedAt ? formatDateTime(status.lastSyncedAt) : 'not yet this session'}</span>
          <Button size="sm" variant="secondary" disabled={!user || status.syncing} onClick={() => user && void flushOutbox(user.id)}>
            <RefreshCcw /> Sync now
          </Button>
        </CardContent>
      </Card>
      {conflicts.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Changes that need your decision</CardTitle>
            <CardDescription>
              The server copy changed while you were offline, so the server version was kept. Choose which version you want.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {conflicts.map((c) => (
              <div key={c.key} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {c.table.replace(/_/g, ' ')} · {String(c.local.title ?? c.rowId)}
                </p>
                {typeof c.local._error === 'string' ? (
                  <Alert tone="danger" className="mt-2">
                    {c.local._error}
                  </Alert>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void keepServer(c)}>
                    Keep server version
                  </Button>
                  <Button size="sm" onClick={() => void keepMine(c)}>
                    Keep my offline version
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'profile'
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, preferences, course registration and offline data." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="offline">Offline &amp; sync</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="courses">
          <CoursesTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="offline">
          <OfflineTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
