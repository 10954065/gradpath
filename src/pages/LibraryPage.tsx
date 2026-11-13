import { useQuery } from '@tanstack/react-query'
import { BookmarkCheck, CheckCircle2, Library, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form-controls'
import { Select, SelectItem } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page'
import { toUserMessage } from '@/lib/errors'
import { getCatalogue } from '@/services/courses'
import { listBookmarks, listMyProgress } from '@/services/progress'

export default function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const course = params.get('course') ?? ''
  const difficulty = params.get('difficulty') ?? ''
  const status = params.get('status') ?? ''
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: getCatalogue })
  const progress = useQuery({ queryKey: ['progress'], queryFn: listMyProgress })
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: listBookmarks })

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const lessons = useMemo(() => {
    const rows = new Map((progress.data ?? []).map((p) => [p.lesson_id, p]))
    const marked = new Set((bookmarks.data ?? []).map((b) => b.lesson_id))
    const needle = q.trim().toLowerCase()
    return (catalogue.data ?? []).flatMap((c) =>
      c.modules.flatMap((m) =>
        m.lessons
          .map((l) => ({ ...l, course: c, module: m, progress: rows.get(l.id), bookmarked: marked.has(l.id) }))
          .filter((l) => {
            if (course && l.course.id !== course) return false
            if (difficulty && l.difficulty !== difficulty) return false
            const state = l.progress?.status === 'completed' ? 'completed' : l.progress ? 'in_progress' : 'not_started'
            if (status === 'bookmarked' ? !l.bookmarked : status && state !== status) return false
            if (!needle) return true
            return [l.title, l.summary, l.module.title, ...l.topics].some((t) => t.toLowerCase().includes(needle))
          }),
      ),
    )
  }, [catalogue.data, progress.data, bookmarks.data, q, course, difficulty, status])

  return (
    <>
      <PageHeader title="Learning Library" description="Every published lesson across all seven courses. Search by title, topic or module." />
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search lessons" placeholder="Search lessons and topics…" value={q} onChange={(e) => set('q', e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Course" value={course} onValueChange={(next) => set('course', next)}>
          <SelectItem value="">All courses</SelectItem>
          {(catalogue.data ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.code} {c.title}
            </SelectItem>
          ))}
        </Select>
        <Select aria-label="Difficulty" value={difficulty} onValueChange={(next) => set('difficulty', next)}>
          <SelectItem value="">Any difficulty</SelectItem>
          <SelectItem value="introductory">Introductory</SelectItem>
          <SelectItem value="intermediate">Intermediate</SelectItem>
          <SelectItem value="advanced">Advanced</SelectItem>
        </Select>
        <Select aria-label="Status" value={status} onValueChange={(next) => set('status', next)}>
          <SelectItem value="">Any status</SelectItem>
          <SelectItem value="not_started">Not started</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="bookmarked">Bookmarked</SelectItem>
        </Select>
      </div>
      {catalogue.isError ? <ErrorState message={toUserMessage(catalogue.error)} onRetry={() => void catalogue.refetch()} /> : null}
      {catalogue.isPending ? (
        <Skeleton className="h-96" />
      ) : lessons.length === 0 ? (
        <EmptyState icon={Library} title="No lessons match" description="Try a different search term or clear the filters." />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
            {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
          </p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {lessons.map((l) => (
              <li key={l.id}>
                <Link to={`/courses/${l.course.slug}/lessons/${l.slug}`} className="flex h-full flex-col rounded-xl border bg-surface p-4 shadow-card hover:border-primary/40">
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      <span className="font-semibold text-primary">{l.course.code}</span> · {l.module.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {l.bookmarked ? <BookmarkCheck className="size-3.5 text-primary" aria-label="Bookmarked" /> : null}
                      {l.progress?.status === 'completed' ? <CheckCircle2 className="size-3.5 text-success" aria-label="Completed" /> : null}
                    </span>
                  </span>
                  <span className="mt-1.5 font-medium">{l.title}</span>
                  <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.summary}</span>
                  <span className="mt-3 flex flex-wrap gap-1">
                    <Badge className="capitalize">{l.difficulty}</Badge>
                    <Badge>{l.estimated_minutes} min</Badge>
                    {l.progress && l.progress.status !== 'completed' ? <Badge tone="primary">{l.progress.reading_percent}% read</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
