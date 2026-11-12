import { useQuery } from '@tanstack/react-query'
import { Megaphone, Pin } from 'lucide-react'
import { RichText } from '@/components/lessons/RichText'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { toUserMessage } from '@/lib/errors'
import { listCourses } from '@/services/courses'
import { listAnnouncements } from '@/services/study/overview'
import { formatDateTime } from '@/utils/dates'

export default function AnnouncementsPage() {
  const announcements = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements })
  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses })
  const codeOf = (id: string | null) => courses.data?.find((c) => c.id === id)?.code

  return (
    <>
      <PageHeader title="Announcements" description="Platform and course announcements from GradPath administrators. Always confirm official dates with your department." />
      {announcements.isError ? <ErrorState message={toUserMessage(announcements.error)} onRetry={() => void announcements.refetch()} /> : null}
      {announcements.isPending ? (
        <Skeleton className="h-64" />
      ) : (announcements.data ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements" description="Announcements from administrators will appear here." />
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {(announcements.data ?? []).map((a) => (
            <li key={a.id} className="rounded-xl border bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                {a.is_pinned ? (
                  <Badge tone="primary">
                    <Pin aria-hidden /> Pinned
                  </Badge>
                ) : null}
                <Badge>{codeOf(a.course_id) ?? 'All students'}</Badge>
                <span className="text-xs text-muted-foreground">{a.published_at ? formatDateTime(a.published_at) : ''}</span>
              </div>
              <h2 className="mt-2 font-semibold">{a.title}</h2>
              <RichText markdown={a.body} className="mt-1 font-sans text-sm" />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
