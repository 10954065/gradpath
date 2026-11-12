import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { deleteNotification, generateDueNotifications, listNotifications, markAllRead, markRead } from '@/services/notifications'
import { relativeTime } from '@/utils/dates'

const KIND_LABEL = {
  assignment_due: 'Assignment',
  revision_due: 'Revision',
  study_reminder: 'Study reminder',
  assessment_result: 'Assessment result',
  announcement: 'Announcement',
  system: 'GradPath',
} as const

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const notifications = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => listNotifications() })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] })

  useEffect(() => {
    void generateDueNotifications().then((n) => n > 0 && refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, [])

  const readAll = useMutation({ mutationFn: markAllRead, onSuccess: refresh })
  const read = useMutation({ mutationFn: (id: string) => markRead([id]), onSuccess: refresh })
  const remove = useMutation({ mutationFn: deleteNotification, onSuccess: refresh })
  const list = notifications.data ?? []

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Deadlines, revision reminders, assessment results and announcements. Email and SMS notifications are not configured."
        actions={
          <Button variant="secondary" onClick={() => readAll.mutate()} disabled={!list.some((n) => !n.read_at)}>
            <CheckCheck /> Mark all read
          </Button>
        }
      />
      {notifications.isError ? <ErrorState message={toUserMessage(notifications.error)} onRetry={() => void notifications.refetch()} /> : null}
      {notifications.isPending ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="Reminders appear here before deadlines and when revision is due." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((n) => (
            <li key={n.id} className={cn('flex items-start gap-3 rounded-xl border bg-surface p-4', !n.read_at && 'border-primary/40 bg-accent/40')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{KIND_LABEL[n.kind]}</Badge>
                  <span className="text-xs text-muted-foreground">{relativeTime(n.created_at)}</span>
                </div>
                {n.link ? (
                  <Link to={n.link} onClick={() => !n.read_at && read.mutate(n.id)} className="mt-1 block font-medium hover:underline">
                    {n.title}
                  </Link>
                ) : (
                  <p className="mt-1 font-medium">{n.title}</p>
                )}
                {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
              </div>
              <div className="flex shrink-0">
                {!n.read_at ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Mark as read" onClick={() => read.mutate(n.id)}>
                    <CheckCheck />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon-sm" aria-label="Delete notification" onClick={() => remove.mutate(n.id)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
