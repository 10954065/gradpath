import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookMarked, Bookmark, BookmarkCheck, ExternalLink, Search } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { VerificationBadge } from '@/components/courses/badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form-controls'
import { PageHeader } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { toUserMessage } from '@/lib/errors'
import { safeExternalUrl } from '@/lib/utils'
import { listCourses, listResources } from '@/services/courses'
import { addBookmark, listBookmarks, removeBookmark } from '@/services/progress'
import { formatDate } from '@/utils/dates'

const CATEGORY_LABEL: Record<string, string> = {
  database: 'Database',
  course: 'Course',
  documentation: 'Documentation',
  tool: 'Tool',
  guide: 'Guide',
  standard: 'Standard',
  organisation: 'Organisation',
  video: 'Video',
  reference: 'Reference',
}
const ACCESS_LABEL: Record<string, string> = {
  free: 'Free',
  freemium: 'Free tier available',
  paid: 'Paid',
  registration: 'Registration required',
  unknown: 'Access terms not verified',
}

export default function ResourcesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const course = params.get('course') ?? ''
  const category = params.get('category') ?? ''
  const saved = params.get('saved') === '1'
  const resources = useQuery({ queryKey: ['resources'], queryFn: listResources })
  const courses = useQuery({ queryKey: ['courses'], queryFn: listCourses })
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: listBookmarks })

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const toggle = useMutation({
    mutationFn: async (resourceId: string) => {
      if (!user) return
      const existing = bookmarks.data?.find((b) => b.resource_id === resourceId)
      if (existing) await removeBookmark(user.id, existing.id)
      else await addBookmark(user.id, { resourceId })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const filtered = useMemo(() => {
    const marked = new Set((bookmarks.data ?? []).map((b) => b.resource_id))
    const needle = q.trim().toLowerCase()
    return (resources.data ?? []).filter((r) => {
      if (course && r.course_id !== course) return false
      if (category && r.category !== category) return false
      if (saved && !marked.has(r.id)) return false
      if (!needle) return true
      return [r.title, r.description, r.provider].some((t) => t.toLowerCase().includes(needle))
    })
  }, [resources.data, bookmarks.data, q, course, category, saved])

  return (
    <>
      <PageHeader
        title="Resources"
        description="Curated external learning resources. Links are checked automatically; access terms are shown only when confirmed."
      />
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search resources" placeholder="Search resources…" value={q} onChange={(e) => set('q', e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Course" value={course} onChange={(e) => set('course', e.target.value)}>
          <option value="">All courses</option>
          {(courses.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} {c.title}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={category} onChange={(e) => set('category', e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label="Saved" value={saved ? '1' : ''} onChange={(e) => set('saved', e.target.value)}>
          <option value="">All resources</option>
          <option value="1">Bookmarked only</option>
        </Select>
      </div>
      {resources.isError ? <ErrorState message={toUserMessage(resources.error)} onRetry={() => void resources.refetch()} /> : null}
      {resources.isPending ? (
        <Skeleton className="h-96" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookMarked} title="No resources match" description="Try another search or clear the filters." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const isSaved = Boolean(bookmarks.data?.some((b) => b.resource_id === r.id))
            return (
              <li key={r.id} className="flex flex-col rounded-xl border bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-primary">{r.course.code}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-pressed={isSaved}
                    aria-label={isSaved ? `Remove bookmark for ${r.title}` : `Bookmark ${r.title}`}
                    onClick={() => toggle.mutate(r.id)}
                  >
                    {isSaved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                  </Button>
                </div>
                <h2 className="font-medium">{r.title}</h2>
                <p className="text-xs text-muted-foreground">{r.provider}</p>
                <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge>{CATEGORY_LABEL[r.category] ?? r.category}</Badge>
                  <Badge className="capitalize">{r.difficulty}</Badge>
                  <Badge className="capitalize">{r.stage} stage</Badge>
                  <Badge>{ACCESS_LABEL[r.access_type]}</Badge>
                  <VerificationBadge status={r.verification_status} />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {r.last_verified_at ? `Last checked ${formatDate(r.last_verified_at)}. ` : ''}
                  {r.verification_note}
                </p>
                <div className="mt-auto pt-3">
                  <Button asChild size="sm" variant="secondary">
                    <a href={safeExternalUrl(r.url)} target="_blank" rel="noopener noreferrer">
                      Open resource <ExternalLink />
                    </a>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
