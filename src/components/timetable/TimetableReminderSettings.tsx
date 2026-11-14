import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/feedback'
import { Field, Switch } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { getTimetablePreferences, saveTimetablePreferences, type TimetablePreferences } from '@/services/timetable/official'

const KEY = ['timetable-preferences'] as const
const LEAD_TIMES = [15, 30, 60, 90, 120, 180]

const TOGGLES: { key: 'lecture_reminders' | 'same_day_summary' | 'change_alerts'; label: string; hint: string }[] = [
  { key: 'lecture_reminders', label: 'Upcoming lecture reminders', hint: 'Before each session you have confirmed, with the venue.' },
  { key: 'same_day_summary', label: 'Morning summary of the day’s lectures', hint: 'One notification listing your confirmed lectures for the day.' },
  { key: 'change_alerts', label: 'Official timetable changes', hint: 'When an administrator publishes a change to a course you take.' },
]

/** Lecture reminder preferences. Reminders go to the notification centre, and to this device only if browser notifications are on. */
export function TimetableReminderSettings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const prefs = useQuery({ queryKey: KEY, queryFn: getTimetablePreferences })
  const save = useMutation({
    mutationFn: (patch: Partial<TimetablePreferences>) => saveTimetablePreferences(user?.id as string, patch),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
    onError: (e) => toast.error(toUserMessage(e)),
  })
  if (!prefs.data) return <Skeleton className="h-48" />
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lecture reminders</CardTitle>
        <CardDescription>
          Reminders are only sent for official sessions you have marked “Confirmed for my class”, in Ghana time. GradPath never asks for browser permission
          on its own; turn on browser notifications above to also receive them on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-4">
            <span className="text-sm">
              <span className="font-medium" id={`tt-${t.key}`}>
                {t.label}
              </span>
              <span className="block text-muted-foreground">{t.hint}</span>
            </span>
            <Switch aria-labelledby={`tt-${t.key}`} checked={prefs.data[t.key]} onCheckedChange={(v) => save.mutate({ [t.key]: v })} />
          </div>
        ))}
        <Field label="Remind me before a lecture" htmlFor="tt-lead" className="sm:max-w-xs">
          <Select
            id="tt-lead"
            value={String(prefs.data.reminder_lead_minutes)}
            disabled={!prefs.data.lecture_reminders}
            onValueChange={(next) => save.mutate({ reminder_lead_minutes: Number(next) })}
          >
            {LEAD_TIMES.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m < 60 ? `${m} minutes before` : `${m / 60} hour${m === 60 ? '' : 's'} before`}
              </SelectItem>
            ))}
          </Select>
        </Field>
      </CardContent>
    </Card>
  )
}
